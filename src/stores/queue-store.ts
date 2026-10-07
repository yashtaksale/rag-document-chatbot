// =============================================================================
// Zustand Store — Prompt Queue
// =============================================================================

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { QueueItem, Attachment } from '../lib/types';
import * as db from '../lib/db';

interface QueueState {
  items: QueueItem[];
  isPaused: boolean;

  // Actions
  load: (conversationId: string) => void;
  enqueue: (conversationId: string, content: string, attachments?: Attachment[], isIncognito?: boolean) => void;
  dequeue: () => QueueItem | undefined;
  reorder: (conversationId: string, orderedIds: string[]) => void;
  moveItem: (conversationId: string, fromIndex: number, toIndex: number) => void;
  editItem: (id: string, newContent: string) => void;
  cancel: (id: string) => void;
  pullToEditor: (id: string) => { content: string; attachments?: Attachment[] } | null;
  clear: (conversationId: string) => void;
  pause: () => void;
  resume: () => void;
}

export const useQueueStore = create<QueueState>((set, get) => ({
  items: [],
  isPaused: false,

  load: (conversationId) => {
    const items = db.getQueueItems(conversationId);
    set({ items });
  },

  enqueue: (conversationId, content, attachments, isIncognito = false) => {
    const { items } = get();
    const item: QueueItem = {
      id: uuidv4(),
      conversationId,
      content,
      attachments: attachments || [],
      attachmentIds: attachments?.map(a => a.id) || [],
      status: 'pending',
      position: items.length,
      createdAt: new Date().toISOString(),
    };
    db.addQueueItem(item, isIncognito);
    set({ items: [...items, item] });
  },

  dequeue: () => {
    const { items, isPaused } = get();
    if (isPaused || items.length === 0) return undefined;

    const next = items[0];
    db.updateQueueItem(next.id, { status: 'processing' });
    set({ items: items.slice(1) });
    return next;
  },

  reorder: (conversationId, orderedIds) => {
    db.reorderQueue(conversationId, orderedIds);
    const items = db.getQueueItems(conversationId);
    set({ items });
  },

  moveItem: (conversationId, fromIndex, toIndex) => {
    const { items } = get();
    if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) return;

    const reordered = [...items];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    const orderedIds = reordered.map(i => i.id);
    db.reorderQueue(conversationId, orderedIds);
    set({ items: reordered });
  },

  editItem: (id, newContent) => {
    db.updateQueueItem(id, { content: newContent });
    set(state => ({
      items: state.items.map(item =>
        item.id === id ? { ...item, content: newContent } : item
      ),
    }));
  },

  cancel: (id) => {
    db.removeQueueItem(id);
    set(state => ({
      items: state.items.filter(item => item.id !== id),
    }));
  },

  pullToEditor: (id) => {
    const { items } = get();
    const item = items.find(i => i.id === id);
    if (!item) return null;
    db.removeQueueItem(id);
    set({ items: items.filter(i => i.id !== id) });
    return {
      content: item.content,
      attachments: item.attachments,
    };
  },

  clear: (conversationId) => {
    db.clearQueue(conversationId);
    set({ items: [] });
  },

  pause: () => set({ isPaused: true }),

  resume: () => set({ isPaused: false }),
}));
