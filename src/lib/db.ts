// =============================================================================
// Local Storage Database Layer
// Full client-side persistence for Conversations, Message Tree, Queue,
// Projects, Memories, Artifacts, Snapshots, and User Settings.
// =============================================================================

import { v4 as uuidv4 } from 'uuid';
import type {
  Conversation,
  Message,
  QueueItem,
  Artifact,
  Memory,
  Project,
  ShareSnapshot,
  User,
  UserUsage,
  GroupedConversations,
  ConversationGroup,
} from './types';

// ── Storage Keys ─────────────────────────────────────────────────────────────

const KEYS = {
  CONVERSATIONS: 'chat_conversations',
  MESSAGES: 'chat_messages',
  QUEUE: 'chat_queue',
  ARTIFACTS: 'chat_artifacts',
  MEMORIES: 'chat_memories',
  PROJECTS: 'chat_projects',
  SNAPSHOTS: 'chat_snapshots',
  USER: 'chat_user',
  USAGE: 'chat_usage',
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function getItem<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setItem<T>(key: string, data: T[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn(`LocalStorage quota exceeded while saving ${key}, performing emergency pruning`, e);
    try {
      // First, remove the key to release occupied quota in the browser
      localStorage.removeItem(key);

      if (key === KEYS.MESSAGES && Array.isArray(data)) {
        // Strip heavy attachments and keep only the latest 8 messages
        const lightweight = (data as unknown as Message[]).slice(-8).map((m) => ({
          ...m,
          attachments: m.attachments?.map((att) => ({
            id: att.id,
            fileName: att.fileName,
            fileType: att.fileType,
            fileSize: att.fileSize,
            createdAt: att.createdAt,
            // Keep at most 100 chars for preview
            extractedText: att.extractedText ? att.extractedText.slice(0, 100) + '...' : undefined,
          })),
        }));
        localStorage.setItem(key, JSON.stringify(lightweight));
        console.info('Successfully saved trimmed messages to localStorage');
      } else if (Array.isArray(data)) {
        localStorage.setItem(key, JSON.stringify(data.slice(-5)));
      }
    } catch (innerErr) {
      console.warn('LocalStorage is full, continuing with in-memory state', innerErr);
    }
  }
}

function sanitizeMessageForStorage(msg: Message): Message {
  if (!msg.attachments || msg.attachments.length === 0) return msg;
  return {
    ...msg,
    attachments: msg.attachments.map((att) => ({
      id: att.id,
      fileName: att.fileName,
      fileType: att.fileType,
      fileSize: att.fileSize,
      pageCount: att.pageCount,
      wordCount: att.wordCount,
      createdAt: att.createdAt,
      // Persist only short preview in localStorage; full text is stored in Zustand memory
      extractedText: att.extractedText ? att.extractedText.slice(0, 250) : undefined,
    })),
  };
}

function getObject<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function setObject<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to write object to localStorage', e);
  }
}

// ── Conversations ────────────────────────────────────────────────────────────

export function getAllConversations(): Conversation[] {
  // One-time self-healing cleanup for bloated storage from earlier versions
  if (typeof window !== 'undefined') {
    try {
      const rawMsgs = localStorage.getItem(KEYS.MESSAGES);
      if (rawMsgs && rawMsgs.length > 400000) {
        const msgs = JSON.parse(rawMsgs) as Message[];
        const sanitized = msgs.slice(-8).map((m) => sanitizeMessageForStorage(m));
        localStorage.removeItem(KEYS.MESSAGES);
        localStorage.setItem(KEYS.MESSAGES, JSON.stringify(sanitized));
        console.info('Self-healed bloated chat_messages storage');
      }
    } catch {
      // Ignore
    }
  }

  const convs = getItem<Conversation>(KEYS.CONVERSATIONS);
  // Migrate any conversations using the exhausted gpt-oss-20b model to qwen3.8-27b
  let modified = false;
  const migrated = convs.map((c) => {
    if (c.model === 'openai/gpt-oss-20b') {
      modified = true;
      return { ...c, model: 'qwen/qwen3.8-27b' };
    }
    return c;
  });
  if (modified) {
    setItem(KEYS.CONVERSATIONS, migrated);
  }
  return migrated.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function getConversation(id: string): Conversation | undefined {
  return getAllConversations().find(c => c.id === id);
}

export function createConversation(partial?: Partial<Conversation>): Conversation {
  const now = new Date().toISOString();
  const conv: Conversation = {
    id: uuidv4(),
    title: partial?.title || 'New Chat',
    isPinned: false,
    isArchived: false,
    incognito: false,
    model: 'qwen/qwen3.8-27b',
    toolsEnabled: ['web_search', 'code_execution', 'file_creation'],
    extendedThinking: false,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };

  // Incognito chats are NOT saved to persistent storage
  if (!conv.incognito) {
    const all = getItem<Conversation>(KEYS.CONVERSATIONS);
    all.push(conv);
    setItem(KEYS.CONVERSATIONS, all);
  }

  return conv;
}

export function updateConversation(id: string, updates: Partial<Conversation>): Conversation | null {
  const all = getItem<Conversation>(KEYS.CONVERSATIONS);
  const idx = all.findIndex(c => c.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...updates, updatedAt: new Date().toISOString() };
  setItem(KEYS.CONVERSATIONS, all);
  return all[idx];
}

export function deleteConversation(id: string): void {
  const all = getItem<Conversation>(KEYS.CONVERSATIONS).filter(c => c.id !== id);
  setItem(KEYS.CONVERSATIONS, all);
  // Also delete associated messages and queue items
  const msgs = getItem<Message>(KEYS.MESSAGES).filter(m => m.conversationId !== id);
  setItem(KEYS.MESSAGES, msgs);
  const queue = getItem<QueueItem>(KEYS.QUEUE).filter(q => q.conversationId !== id);
  setItem(KEYS.QUEUE, queue);
}

export function searchConversations(query: string): Conversation[] {
  const q = query.toLowerCase();
  const convs = getAllConversations().filter(c =>
    c.title.toLowerCase().includes(q)
  );
  // Also search message content
  const msgs = getItem<Message>(KEYS.MESSAGES).filter(m =>
    m.content.toLowerCase().includes(q)
  );
  const msgConvIds = new Set(msgs.map(m => m.conversationId));
  const allConvs = getAllConversations();
  const fromMsgs = allConvs.filter(c => msgConvIds.has(c.id));

  const merged = new Map<string, Conversation>();
  [...convs, ...fromMsgs].forEach(c => merged.set(c.id, c));
  return Array.from(merged.values());
}

export function groupConversations(conversations: Conversation[]): GroupedConversations[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: Record<ConversationGroup, Conversation[]> = {
    'Today': [],
    'Yesterday': [],
    'Previous 7 Days': [],
    'Older': [],
  };

  for (const conv of conversations) {
    const d = new Date(conv.updatedAt);
    if (d >= today) groups['Today'].push(conv);
    else if (d >= yesterday) groups['Yesterday'].push(conv);
    else if (d >= weekAgo) groups['Previous 7 Days'].push(conv);
    else groups['Older'].push(conv);
  }

  return (Object.entries(groups) as [ConversationGroup, Conversation[]][])
    .filter(([, convs]) => convs.length > 0)
    .map(([group, conversations]) => ({ group, conversations }));
}

// ── Messages (Tree) ──────────────────────────────────────────────────────────

export function getMessages(conversationId: string): Message[] {
  return getItem<Message>(KEYS.MESSAGES).filter(m => m.conversationId === conversationId);
}

export function getMessage(id: string): Message | undefined {
  return getItem<Message>(KEYS.MESSAGES).find(m => m.id === id);
}

export function addMessage(msg: Message, isIncognito: boolean = false): Message {
  if (isIncognito) return msg;

  const sanitized = sanitizeMessageForStorage(msg);
  const all = getItem<Message>(KEYS.MESSAGES);
  if (sanitized.parentId) {
    const parentIdx = all.findIndex(m => m.id === sanitized.parentId);
    if (parentIdx !== -1) {
      if (!all[parentIdx].childrenIds.includes(sanitized.id)) {
        all[parentIdx].childrenIds.push(sanitized.id);
      }
    }
  }

  all.push(sanitized);
  setItem(KEYS.MESSAGES, all);
  updateConversation(sanitized.conversationId, {});
  return sanitized;
}

export function updateMessage(id: string, updates: Partial<Message>): Message | null {
  const all = getItem<Message>(KEYS.MESSAGES);
  const idx = all.findIndex(m => m.id === id);
  if (idx === -1) return null;
  const merged = sanitizeMessageForStorage({ ...all[idx], ...updates });
  all[idx] = merged;
  setItem(KEYS.MESSAGES, all);
  return all[idx];
}

// ── Prompt Queue ─────────────────────────────────────────────────────────────

export function getQueueItems(conversationId: string): QueueItem[] {
  return getItem<QueueItem>(KEYS.QUEUE)
    .filter(q => q.conversationId === conversationId && q.status === 'pending')
    .sort((a, b) => a.position - b.position);
}

export function addQueueItem(item: QueueItem, isIncognito: boolean = false): QueueItem {
  if (isIncognito) return item;
  const all = getItem<QueueItem>(KEYS.QUEUE);
  all.push(item);
  setItem(KEYS.QUEUE, all);
  return item;
}

export function updateQueueItem(id: string, updates: Partial<QueueItem>): void {
  const all = getItem<QueueItem>(KEYS.QUEUE);
  const idx = all.findIndex(q => q.id === id);
  if (idx !== -1) {
    all[idx] = { ...all[idx], ...updates };
    setItem(KEYS.QUEUE, all);
  }
}

export function removeQueueItem(id: string): void {
  const all = getItem<QueueItem>(KEYS.QUEUE).filter(q => q.id !== id);
  setItem(KEYS.QUEUE, all);
}

export function clearQueue(conversationId: string): void {
  const all = getItem<QueueItem>(KEYS.QUEUE).filter(q => q.conversationId !== conversationId);
  setItem(KEYS.QUEUE, all);
}

export function reorderQueue(conversationId: string, orderedIds: string[]): void {
  const all = getItem<QueueItem>(KEYS.QUEUE);
  orderedIds.forEach((id, i) => {
    const idx = all.findIndex(q => q.id === id && q.conversationId === conversationId);
    if (idx !== -1) all[idx].position = i;
  });
  setItem(KEYS.QUEUE, all);
}

// ── Artifacts (Canvas) ───────────────────────────────────────────────────────

export function getArtifacts(conversationId: string): Artifact[] {
  return getItem<Artifact>(KEYS.ARTIFACTS).filter(a => a.conversationId === conversationId);
}

export function getArtifact(id: string): Artifact | undefined {
  return getItem<Artifact>(KEYS.ARTIFACTS).find(a => a.id === id);
}

export function addArtifact(artifact: Artifact): Artifact {
  const all = getItem<Artifact>(KEYS.ARTIFACTS);
  all.push(artifact);
  setItem(KEYS.ARTIFACTS, all);
  return artifact;
}

export function updateArtifactContent(
  artifactId: string,
  newContent: string
): Artifact | null {
  const all = getItem<Artifact>(KEYS.ARTIFACTS);
  const existing = all.find(a => a.id === artifactId);
  if (!existing) return null;

  // Create a new version for canvas iteration
  const newVersion: Artifact = {
    ...existing,
    id: uuidv4(),
    content: newContent,
    version: existing.version + 1,
    parentArtifactId: existing.id,
    updatedAt: new Date().toISOString(),
  };

  all.push(newVersion);
  setItem(KEYS.ARTIFACTS, all);
  return newVersion;
}

export function getArtifactVersions(artifactId: string): Artifact[] {
  const all = getItem<Artifact>(KEYS.ARTIFACTS);
  const target = all.find(a => a.id === artifactId);
  if (!target) return [];

  // Find all artifacts with same root or title in this conversation
  return all
    .filter(a => a.conversationId === target.conversationId && (a.id === artifactId || a.parentArtifactId === artifactId || a.title === target.title))
    .sort((a, b) => a.version - b.version);
}

// ── Projects ─────────────────────────────────────────────────────────────────

export function getAllProjects(): Project[] {
  return getItem<Project>(KEYS.PROJECTS);
}

export function getProject(id: string): Project | undefined {
  return getAllProjects().find(p => p.id === id);
}

export function createProject(name: string, instructions?: string): Project {
  const project: Project = {
    id: uuidv4(),
    name,
    instructions: instructions || '',
    knowledgeFileIds: [],
    knowledgeFiles: [],
    createdAt: new Date().toISOString(),
  };
  const all = getAllProjects();
  all.push(project);
  setItem(KEYS.PROJECTS, all);
  return project;
}

export function updateProject(id: string, updates: Partial<Project>): Project | null {
  const all = getAllProjects();
  const idx = all.findIndex(p => p.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...updates };
  setItem(KEYS.PROJECTS, all);
  return all[idx];
}

export function deleteProject(id: string): void {
  const all = getAllProjects().filter(p => p.id !== id);
  setItem(KEYS.PROJECTS, all);
  // Unassign from conversations
  const convs = getAllConversations();
  convs.forEach(c => {
    if (c.projectId === id) {
      updateConversation(c.id, { projectId: undefined });
    }
  });
}

// ── Memory (Durable Facts) ───────────────────────────────────────────────────

export function getAllMemories(): Memory[] {
  return getItem<Memory>(KEYS.MEMORIES);
}

export function addMemory(fact: string, sourceMessageId?: string): Memory {
  const memory: Memory = {
    id: uuidv4(),
    fact: fact.trim(),
    sourceMessageId,
    createdAt: new Date().toISOString(),
  };
  const all = getAllMemories();
  // Prevent exact duplicates
  if (!all.some(m => m.fact.toLowerCase() === memory.fact.toLowerCase())) {
    all.push(memory);
    setItem(KEYS.MEMORIES, all);
  }
  return memory;
}

export function updateMemory(id: string, fact: string): Memory | null {
  const all = getAllMemories();
  const idx = all.findIndex(m => m.id === id);
  if (idx === -1) return null;
  all[idx].fact = fact.trim();
  setItem(KEYS.MEMORIES, all);
  return all[idx];
}

export function deleteMemory(id: string): void {
  const all = getItem<Memory>(KEYS.MEMORIES).filter(m => m.id !== id);
  setItem(KEYS.MEMORIES, all);
}

// ── Sharing Snapshots ────────────────────────────────────────────────────────

export function createShareSnapshot(conversation: Conversation, messages: Message[]): ShareSnapshot {
  const snapshot: ShareSnapshot = {
    id: uuidv4(),
    conversationId: conversation.id,
    title: conversation.title,
    model: conversation.model,
    messages,
    createdAt: new Date().toISOString(),
  };
  const all = getItem<ShareSnapshot>(KEYS.SNAPSHOTS);
  all.push(snapshot);
  setItem(KEYS.SNAPSHOTS, all);
  return snapshot;
}

export function getShareSnapshot(id: string): ShareSnapshot | undefined {
  return getItem<ShareSnapshot>(KEYS.SNAPSHOTS).find(s => s.id === id);
}

// ── User Settings & Usage Limits ─────────────────────────────────────────────

const DEFAULT_USER: User = {
  id: '1',
  email: 'demo@docchat.ai',
  name: 'Demo User',
  role: 'member',
  planTier: 'free',
  memoryEnabled: true,
  customInstructions: 'Respond clearly and concisely with well-structured answers.',
  isAuthenticated: true,
};

export const GUEST_USER: User = {
  id: 'guest',
  email: '',
  name: 'Guest User',
  role: 'guest',
  planTier: 'free',
  memoryEnabled: false,
  isAuthenticated: false,
};

export const DEMO_ACCOUNTS: User[] = [
  {
    id: '1',
    name: 'Demo User',
    email: 'demo@docchat.ai',
    role: 'member',
    planTier: 'free',
    memoryEnabled: true,
    isAuthenticated: true,
  },
  {
    id: '4',
    name: 'Primary Researcher',
    email: 'researcher@docchat.ai',
    role: 'user',
    planTier: 'pro',
    memoryEnabled: true,
    isAuthenticated: true,
  },
  {
    id: '2',
    name: 'Admin',
    email: 'admin@docchat.ai',
    role: 'admin',
    planTier: 'team',
    memoryEnabled: true,
    isAuthenticated: true,
  },
];

export function getUser(): User {
  return getObject<User>(KEYS.USER, DEFAULT_USER);
}

export function updateUser(updates: Partial<User>): User {
  const current = getUser();
  const updated = { ...current, ...updates };
  setObject(KEYS.USER, updated);
  return updated;
}

export function signOutUser(): User {
  const signedOut: User = {
    ...GUEST_USER,
    customInstructions: '',
    token: undefined,
  };
  setObject(KEYS.USER, signedOut);
  return signedOut;
}

export function signInUser(userData: Partial<User>, token?: string): User {
  const current = getUser();
  const updated: User = {
    ...DEFAULT_USER,
    ...current,
    ...userData,
    token: token !== undefined ? token : userData.token ?? current.token,
    isAuthenticated: true,
  };
  setObject(KEYS.USER, updated);
  return updated;
}

export function getUserUsage(): UserUsage {
  const user = getUser();
  const defaultUsage: UserUsage = {
    planTier: user.planTier,
    requestCountToday: 0,
    maxRequestsPerDay: user.planTier === 'free' ? 50 : user.planTier === 'pro' ? 500 : 5000,
    tokensUsedToday: 0,
    resetAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    isRateLimited: false,
  };
  return getObject<UserUsage>(KEYS.USAGE, defaultUsage);
}

export function recordUserUsage(tokensUsed: number): UserUsage {
  const usage = getUserUsage();
  const newRequests = usage.requestCountToday + 1;
  const isLimited = newRequests > usage.maxRequestsPerDay;

  const updated: UserUsage = {
    ...usage,
    requestCountToday: newRequests,
    tokensUsedToday: usage.tokensUsedToday + tokensUsed,
    isRateLimited: isLimited,
  };
  setObject(KEYS.USAGE, updated);
  return updated;
}

// ── Auto-Title Generation ────────────────────────────────────────────────────

export function generateTitle(firstMessage: string): string {
  const cleaned = firstMessage.trim().replace(/\n/g, ' ');
  if (cleaned.length <= 40) return cleaned;
  return cleaned.slice(0, 37) + '...';
}
