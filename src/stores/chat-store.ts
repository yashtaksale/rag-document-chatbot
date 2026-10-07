// =============================================================================
// Zustand Store — Message Tree + Streaming + Extended Thinking & Tools
// =============================================================================

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Message, Feedback, ToolCall, Attachment } from '../lib/types';
import * as db from '../lib/db';

interface ChatState {
  // Normalized message map for active conversation
  messages: Record<string, Message>;
  activeLeafId: string | null;
  rootId: string | null;

  // Streaming state
  isStreaming: boolean;
  streamingMessageId: string | null;
  abortController: AbortController | null;

  // Actions
  loadMessages: (conversationId: string) => void;
  getLinearThread: () => Message[];
  addUserMessage: (
    conversationId: string,
    content: string,
    parentId: string | null,
    attachments?: Attachment[],
    isIncognito?: boolean
  ) => Message;
  startAssistantMessage: (
    conversationId: string,
    parentId: string,
    isIncognito?: boolean
  ) => Message;
  appendToStream: (messageId: string, delta: string) => void;
  appendReasoning: (messageId: string, delta: string) => void;
  addToolCall: (messageId: string, tool: ToolCall) => void;
  updateToolCall: (messageId: string, toolId: string, updates: Partial<ToolCall>) => void;
  finishStream: (messageId: string, tokens?: number) => void;
  updateMessage: (messageId: string, updates: Partial<Message>) => void;
  stopStream: () => void;
  switchBranch: (messageId: string) => void;
  editUserMessage: (messageId: string, newContent: string) => Message | null;
  regenerate: (assistantMessageId: string) => string | null;
  setFeedback: (messageId: string, feedback: Feedback) => void;
  revertUserMessage: (messageId: string) => { content: string; attachments?: Attachment[] } | null;
  revertLastUserMessage: () => { content: string; attachments?: Attachment[] } | null;
  getSiblings: (messageId: string) => Message[];
  getSiblingIndex: (messageId: string) => { current: number; total: number };
  clear: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: {},
  activeLeafId: null,
  rootId: null,
  isStreaming: false,
  streamingMessageId: null,
  abortController: null,

  loadMessages: (conversationId) => {
    const msgs = db.getMessages(conversationId);
    const map: Record<string, Message> = {};
    let rootId: string | null = null;

    for (const msg of msgs) {
      map[msg.id] = msg;
      if (!msg.parentId) rootId = msg.id;
    }

    // Find active leaf: walk down branch
    let leafId: string | null = rootId;
    if (leafId) {
      let current = map[leafId];
      while (current && current.childrenIds.length > 0) {
        const activeChild = current.childrenIds.find(cid => map[cid]?.isActive);
        const nextId = activeChild || current.childrenIds[current.childrenIds.length - 1];
        current = map[nextId];
        leafId = nextId;
      }
    }

    set({ messages: map, activeLeafId: leafId, rootId });
  },

  getLinearThread: () => {
    const { messages, activeLeafId } = get();
    if (!activeLeafId) return [];

    const path: Message[] = [];
    let currentId: string | null = activeLeafId;
    while (currentId) {
      const msg: Message | undefined = messages[currentId];
      if (!msg) break;
      path.unshift(msg);
      currentId = msg.parentId;
    }
    return path;
  },

  addUserMessage: (conversationId, content, parentId, attachments, isIncognito = false) => {
    const msg: Message = {
      id: uuidv4(),
      conversationId,
      parentId,
      role: 'user',
      content,
      attachments: attachments || [],
      attachmentIds: attachments?.map(a => a.id) || [],
      isActive: true,
      childrenIds: [],
      createdAt: new Date().toISOString(),
    };
    db.addMessage(msg, isIncognito);

    set(state => {
      const newMessages = { ...state.messages, [msg.id]: msg };
      if (parentId && newMessages[parentId]) {
        newMessages[parentId] = {
          ...newMessages[parentId],
          childrenIds: [...newMessages[parentId].childrenIds, msg.id],
        };
      }
      return { messages: newMessages, activeLeafId: msg.id };
    });

    return msg;
  },

  startAssistantMessage: (conversationId, parentId, isIncognito = false) => {
    const msg: Message = {
      id: uuidv4(),
      conversationId,
      parentId,
      role: 'assistant',
      content: '',
      reasoningContent: '',
      toolCalls: [],
      isActive: true,
      childrenIds: [],
      createdAt: new Date().toISOString(),
    };
    db.addMessage(msg, isIncognito);
    const controller = new AbortController();

    set(state => {
      const newMessages = { ...state.messages, [msg.id]: msg };
      if (parentId && newMessages[parentId]) {
        newMessages[parentId] = {
          ...newMessages[parentId],
          childrenIds: [...newMessages[parentId].childrenIds, msg.id],
        };
      }
      return {
        messages: newMessages,
        activeLeafId: msg.id,
        isStreaming: true,
        streamingMessageId: msg.id,
        abortController: controller,
      };
    });

    return msg;
  },

  appendToStream: (messageId, delta) => {
    set(state => {
      const msg = state.messages[messageId];
      if (!msg) return state;
      return {
        messages: {
          ...state.messages,
          [messageId]: { ...msg, content: msg.content + delta },
        },
      };
    });
  },

  appendReasoning: (messageId, delta) => {
    set(state => {
      const msg = state.messages[messageId];
      if (!msg) return state;
      return {
        messages: {
          ...state.messages,
          [messageId]: {
            ...msg,
            reasoningContent: (msg.reasoningContent || '') + delta,
          },
        },
      };
    });
  },

  addToolCall: (messageId, tool) => {
    set(state => {
      const msg = state.messages[messageId];
      if (!msg) return state;
      const existing = msg.toolCalls || [];
      return {
        messages: {
          ...state.messages,
          [messageId]: { ...msg, toolCalls: [...existing, tool] },
        },
      };
    });
  },

  updateToolCall: (messageId, toolId, updates) => {
    set(state => {
      const msg = state.messages[messageId];
      if (!msg) return state;
      const updatedTools = (msg.toolCalls || []).map(t =>
        t.id === toolId ? { ...t, ...updates } : t
      );
      return {
        messages: {
          ...state.messages,
          [messageId]: { ...msg, toolCalls: updatedTools },
        },
      };
    });
  },

  finishStream: (messageId, tokens) => {
    const { messages } = get();
    const msg = messages[messageId];
    if (msg) {
      db.updateMessage(messageId, {
        content: msg.content,
        reasoningContent: msg.reasoningContent,
        toolCalls: msg.toolCalls,
        tokens,
      });
    }
    set({
      isStreaming: false,
      streamingMessageId: null,
      abortController: null,
    });
  },

  updateMessage: (messageId, updates) => {
    set(state => {
      const msg = state.messages[messageId];
      if (!msg) return state;
      const updated = { ...msg, ...updates };
      db.updateMessage(messageId, updates);
      return {
        messages: {
          ...state.messages,
          [messageId]: updated,
        },
      };
    });
  },

  stopStream: () => {
    const { abortController, streamingMessageId, messages } = get();
    if (abortController) {
      abortController.abort();
    }
    if (streamingMessageId) {
      const msg = messages[streamingMessageId];
      if (msg) {
        db.updateMessage(streamingMessageId, {
          content: msg.content,
          reasoningContent: msg.reasoningContent,
        });
      }
    }
    set({
      isStreaming: false,
      streamingMessageId: null,
      abortController: null,
    });
  },

  switchBranch: (messageId) => {
    const { messages } = get();
    const msg = messages[messageId];
    if (!msg || !msg.parentId) return;

    const parent = messages[msg.parentId];
    if (!parent) return;

    const updatedMessages = { ...messages };
    for (const sibId of parent.childrenIds) {
      if (updatedMessages[sibId]) {
        const isActive = sibId === messageId;
        updatedMessages[sibId] = { ...updatedMessages[sibId], isActive };
        db.updateMessage(sibId, { isActive });
      }
    }

    let leafId = messageId;
    let current = updatedMessages[leafId];
    while (current && current.childrenIds.length > 0) {
      const activeChild = current.childrenIds.find(cid => updatedMessages[cid]?.isActive);
      const nextId = activeChild || current.childrenIds[current.childrenIds.length - 1];
      current = updatedMessages[nextId];
      leafId = nextId;
    }

    set({ messages: updatedMessages, activeLeafId: leafId });
  },

  editUserMessage: (messageId, newContent) => {
    const { messages } = get();
    const original = messages[messageId];
    if (!original || original.role !== 'user') return null;

    const newMsg: Message = {
      id: uuidv4(),
      conversationId: original.conversationId,
      parentId: original.parentId,
      role: 'user',
      content: newContent,
      isActive: true,
      childrenIds: [],
      createdAt: new Date().toISOString(),
    };
    db.addMessage(newMsg);
    db.updateMessage(messageId, { isActive: false });

    set(state => {
      const updatedMessages = { ...state.messages };
      updatedMessages[messageId] = { ...updatedMessages[messageId], isActive: false };
      updatedMessages[newMsg.id] = newMsg;

      if (newMsg.parentId && updatedMessages[newMsg.parentId]) {
        updatedMessages[newMsg.parentId] = {
          ...updatedMessages[newMsg.parentId],
          childrenIds: [...updatedMessages[newMsg.parentId].childrenIds, newMsg.id],
        };
      }
      return { messages: updatedMessages, activeLeafId: newMsg.id };
    });

    return newMsg;
  },

  regenerate: (assistantMessageId) => {
    const { messages } = get();
    const msg = messages[assistantMessageId];
    if (!msg || msg.role !== 'assistant') return null;

    db.updateMessage(assistantMessageId, { isActive: false });

    set(state => ({
      messages: {
        ...state.messages,
        [assistantMessageId]: { ...state.messages[assistantMessageId], isActive: false },
      },
    }));

    return msg.parentId;
  },

  setFeedback: (messageId, feedback) => {
    db.updateMessage(messageId, { feedback } as Partial<Message>);
    set(state => {
      const msg = state.messages[messageId];
      if (!msg) return state;
      return {
        messages: {
          ...state.messages,
          [messageId]: { ...msg, feedback },
        },
      };
    });
  },

  revertUserMessage: (messageId) => {
    const { messages } = get();
    const msg = messages[messageId];
    if (!msg || msg.role !== 'user') return null;

    const parentId = msg.parentId;

    // Deactivate this message and all its descendant messages
    const updatedMessages = { ...messages };
    const deactivateNode = (id: string) => {
      const node = updatedMessages[id];
      if (node) {
        updatedMessages[id] = { ...node, isActive: false };
        db.updateMessage(id, { isActive: false });
        for (const childId of node.childrenIds) {
          deactivateNode(childId);
        }
      }
    };
    deactivateNode(messageId);

    // If there is a parent, ensure it is active
    if (parentId && updatedMessages[parentId]) {
      updatedMessages[parentId] = { ...updatedMessages[parentId], isActive: true };
      db.updateMessage(parentId, { isActive: true });
    }

    set({ messages: updatedMessages, activeLeafId: parentId });

    return {
      content: msg.content,
      attachments: msg.attachments,
    };
  },

  revertLastUserMessage: () => {
    const thread = get().getLinearThread();
    const lastUserMsg = [...thread].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return null;
    return get().revertUserMessage(lastUserMsg.id);
  },

  getSiblings: (messageId) => {
    const { messages } = get();
    const msg = messages[messageId];
    if (!msg || !msg.parentId) return [msg].filter(Boolean);
    const parent = messages[msg.parentId];
    if (!parent) return [msg];
    return parent.childrenIds
      .map(id => messages[id])
      .filter((m): m is Message => m !== undefined);
  },

  getSiblingIndex: (messageId) => {
    const siblings = get().getSiblings(messageId);
    const idx = siblings.findIndex(s => s.id === messageId);
    return { current: idx + 1, total: siblings.length };
  },

  clear: () => {
    set({
      messages: {},
      activeLeafId: null,
      rootId: null,
      isStreaming: false,
      streamingMessageId: null,
      abortController: null,
    });
  },
}));
