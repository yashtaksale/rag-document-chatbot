// =============================================================================
// Zustand Store — Memory (Durable User Facts)
// =============================================================================

import { create } from 'zustand';
import type { Memory } from '../lib/types';
import * as db from '../lib/db';

interface MemoryState {
  memories: Memory[];
  isEnabled: boolean;

  load: () => void;
  add: (fact: string, sourceMessageId?: string) => Memory;
  edit: (id: string, fact: string) => void;
  remove: (id: string) => void;
  toggleEnabled: () => void;
  getInjectedFacts: () => string[];
  extractFactFromMessage: (userMessage: string) => void;
}

export const useMemoryStore = create<MemoryState>((set, get) => ({
  memories: [],
  isEnabled: true,

  load: () => {
    const list = db.getAllMemories();
    const user = db.getUser();
    set({ memories: list, isEnabled: user.memoryEnabled });
  },

  add: (fact, sourceMessageId) => {
    const m = db.addMemory(fact, sourceMessageId);
    get().load();
    return m;
  },

  edit: (id, fact) => {
    db.updateMemory(id, fact);
    get().load();
  },

  remove: (id) => {
    db.deleteMemory(id);
    get().load();
  },

  toggleEnabled: () => {
    const current = get().isEnabled;
    const next = !current;
    db.updateUser({ memoryEnabled: next });
    set({ isEnabled: next });
  },

  getInjectedFacts: () => {
    const { isEnabled, memories } = get();
    if (!isEnabled) return [];
    return memories.map(m => m.fact);
  },

  /**
   * Simple heuristic rule to automatically capture durable facts
   * like "My name is...", "I prefer...", "I work as...", "I live in..."
   */
  extractFactFromMessage: (userMessage: string) => {
    const { isEnabled } = get();
    if (!isEnabled) return;

    const lower = userMessage.trim().toLowerCase();
    const patterns = [
      /(?:i am|i'm|my name is)\s+([a-zA-Z\s]+)/i,
      /(?:i work as|i am a|i'm a)\s+([a-zA-Z\s]+)/i,
      /(?:i prefer|i like)\s+([^.]+)/i,
      /(?:i live in|i am based in)\s+([a-zA-Z\s]+)/i,
    ];

    for (const pattern of patterns) {
      const match = userMessage.match(pattern);
      if (match && match[0].length < 100) {
        db.addMemory(match[0].trim());
        get().load();
        break;
      }
    }
  },
}));
