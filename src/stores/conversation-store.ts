// =============================================================================
// Zustand Store — Conversations
// =============================================================================

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Conversation, GroupedConversations } from '../lib/types';
import * as db from '../lib/db';

interface ConversationState {
  conversations: Conversation[];
  activeConversationId: string | null;
  searchQuery: string;
  selectedProjectId: string | null; // Filter conversations by project

  // Computed
  grouped: GroupedConversations[];

  // Actions
  load: () => void;
  create: (partial?: Partial<Conversation>) => Conversation;
  createIncognito: () => Conversation;
  select: (id: string) => void;
  rename: (id: string, title: string) => void;
  remove: (id: string) => void;
  archive: (id: string) => void;
  pin: (id: string) => void;
  search: (query: string) => void;
  filterByProject: (projectId: string | null) => void;
  updateConv: (id: string, updates: Partial<Conversation>) => void;
  setModel: (id: string, model: string) => void;
  toggleTool: (id: string, toolName: string) => void;
  toggleExtendedThinking: (id: string) => void;
  exportConversationMarkdown: (id: string, linearMessages: any[]) => string;
  exportConversationJSON: (id: string, messages: unknown[]) => string;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  searchQuery: '',
  selectedProjectId: null,
  grouped: [],

  load: () => {
    let convs = db.getAllConversations();
    const { selectedProjectId } = get();

    if (selectedProjectId) {
      convs = convs.filter(c => c.projectId === selectedProjectId);
    }

    set({
      conversations: convs,
      grouped: db.groupConversations(convs.filter(c => !c.isArchived)),
    });
  },

  create: (partial) => {
    const { selectedProjectId } = get();
    const conv = db.createConversation({
      id: uuidv4(),
      projectId: selectedProjectId || undefined,
      ...partial,
    });
    const convs = db.getAllConversations();
    set({
      conversations: convs,
      activeConversationId: conv.id,
      grouped: db.groupConversations(convs.filter(c => !c.isArchived)),
    });
    return conv;
  },

  createIncognito: () => {
    const conv = db.createConversation({
      id: uuidv4(),
      title: 'Incognito Chat',
      incognito: true,
    });
    set(state => ({
      conversations: [conv, ...state.conversations],
      activeConversationId: conv.id,
    }));
    return conv;
  },

  select: (id) => {
    set({ activeConversationId: id });
  },

  rename: (id, title) => {
    db.updateConversation(id, { title });
    get().load();
  },

  remove: (id) => {
    db.deleteConversation(id);
    const state = get();
    const newActive = state.activeConversationId === id ? null : state.activeConversationId;
    set({ activeConversationId: newActive });
    get().load();
  },

  archive: (id) => {
    const conv = db.getConversation(id);
    if (conv) {
      db.updateConversation(id, { isArchived: !conv.isArchived });
      get().load();
    }
  },

  pin: (id) => {
    const conv = db.getConversation(id);
    if (conv) {
      db.updateConversation(id, { isPinned: !conv.isPinned });
      get().load();
    }
  },

  search: (query) => {
    set({ searchQuery: query });
    if (!query.trim()) {
      get().load();
      return;
    }
    const results = db.searchConversations(query);
    set({
      conversations: results,
      grouped: db.groupConversations(results.filter(c => !c.isArchived)),
    });
  },

  filterByProject: (projectId) => {
    set({ selectedProjectId: projectId });
    get().load();
  },

  updateConv: (id, updates) => {
    db.updateConversation(id, updates);
    get().load();
  },

  setModel: (id, model) => {
    db.updateConversation(id, { model });
    get().load();
  },

  toggleTool: (id, toolName) => {
    const conv = db.getConversation(id) || get().conversations.find(c => c.id === id);
    if (!conv) return;
    const tools = conv.toolsEnabled || ['web_search', 'code_execution', 'file_creation'];
    const updatedTools = tools.includes(toolName)
      ? tools.filter(t => t !== toolName)
      : [...tools, toolName];

    db.updateConversation(id, { toolsEnabled: updatedTools });
    get().load();
  },

  toggleExtendedThinking: (id) => {
    const conv = db.getConversation(id) || get().conversations.find(c => c.id === id);
    if (!conv) return;
    const current = conv.extendedThinking || false;
    db.updateConversation(id, { extendedThinking: !current });
    get().load();
  },

  exportConversationMarkdown: (id, linearMessages) => {
    const conv = db.getConversation(id) || get().conversations.find(c => c.id === id);
    const title = conv?.title || 'DocChat Conversation';
    const lines = [
      `# ${title}`,
      `*Exported on ${new Date().toLocaleString()}*`,
      `*Model: ${conv?.model || 'default'}*`,
      '',
      '---',
      '',
    ];
    for (const msg of linearMessages) {
      lines.push(`### ${msg.role === 'user' ? 'User' : 'DocChat Assistant'}`);
      lines.push('');
      lines.push(msg.content);
      lines.push('');
      if (msg.sources && msg.sources.length > 0) {
        lines.push(`**Sources:** ${msg.sources.join(', ')}`);
        lines.push('');
      }
      if (msg.hallucinationScore !== undefined) {
        lines.push(`- **Hallucination Risk:** ${msg.hallucinationScore}%`);
        if (msg.evalReason) {
          lines.push(`- **Critique:** ${msg.evalReason}`);
        }
        if (msg.unsupportedClaims && msg.unsupportedClaims.length > 0) {
          lines.push(`- **Unverified Claims:** ${msg.unsupportedClaims.join('; ')}`);
        }
        lines.push('');
      }
      lines.push('---');
      lines.push('');
    }
    return lines.join('\n');
  },

  exportConversationJSON: (id, messages) => {
    const conv = db.getConversation(id) || get().conversations.find(c => c.id === id);
    return JSON.stringify(
      {
        conversation: conv,
        messages,
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    );
  },
}));
