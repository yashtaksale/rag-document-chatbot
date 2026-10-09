// =============================================================================
// Core Type Definitions for AI Chat Application
// =============================================================================

// ── Message Tree ─────────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  input: string;
  result?: string;
  status: 'running' | 'completed' | 'failed';
}

export interface Message {
  id: string;
  conversationId: string;
  parentId: string | null;
  role: MessageRole;
  content: string;
  reasoningContent?: string;    // Extended thinking
  tokens?: number;
  isActive: boolean;            // Active branch indicator
  childrenIds: string[];
  feedback?: Feedback;
  attachmentIds?: string[];
  attachments?: Attachment[];
  toolCalls?: ToolCall[];
  // DocChat RAG & Groundedness Audit
  groundednessScore?: number;
  hallucinationScore?: number;
  cosineScore?: number;
  evalReason?: string;
  sources?: string[];
  quotes?: string[];
  followups?: string[];
  ragMode?: 'Simple' | 'Thinking';
  vaultDocsUsed?: number;
  hallucinatedSpans?: string[];
  unsupportedClaims?: string[];
  highlightedAnswer?: string;
  createdAt: string;
}

export interface Feedback {
  rating: 'thumbs_up' | 'thumbs_down';
  comment?: string;
}

// ── Conversations ────────────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  title: string;
  isPinned: boolean;
  isArchived: boolean;
  incognito: boolean;
  systemPrompt?: string;
  model: string;
  projectId?: string;
  toolsEnabled?: string[];     // ['web_search', 'code_execution', 'file_creation']
  extendedThinking?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ConversationGroup = 'Today' | 'Yesterday' | 'Previous 7 Days' | 'Older';

export interface GroupedConversations {
  group: ConversationGroup;
  conversations: Conversation[];
}

// ── Prompt Queue ─────────────────────────────────────────────────────────────

export type QueueItemStatus = 'pending' | 'processing' | 'cancelled' | 'failed';

export interface QueueItem {
  id: string;
  conversationId: string;
  content: string;
  attachmentIds?: string[];
  attachments?: Attachment[];
  status: QueueItemStatus;
  position: number;
  createdAt: string;
}

// ── Attachments ──────────────────────────────────────────────────────────────

export interface Attachment {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  storageUrl?: string;
  extractedText?: string;
  dataUrl?: string; // base64 for images
  pageCount?: number;
  wordCount?: number;
  createdAt: string;
}

// ── Artifacts (Canvas) ───────────────────────────────────────────────────────

export type ArtifactType = 'code' | 'html' | 'markdown' | 'mermaid' | 'svg';

export interface Artifact {
  id: string;
  conversationId: string;
  messageId: string;
  type: ArtifactType;
  title: string;
  content: string;
  language?: string;          // For code artifacts
  version: number;
  parentArtifactId?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Projects ─────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  instructions?: string;
  knowledgeFileIds?: string[];
  knowledgeFiles?: Attachment[];
  createdAt: string;
}

// ── Memory ───────────────────────────────────────────────────────────────────

export interface Memory {
  id: string;
  fact: string;
  sourceMessageId?: string;
  createdAt: string;
}

// ── User & Accounts ──────────────────────────────────────────────────────────

export type PlanTier = 'free' | 'pro' | 'team';

export interface User {
  id: string;
  email: string;
  name: string;
  role?: string;
  planTier: PlanTier;
  memoryEnabled: boolean;
  customInstructions?: string;
  token?: string;
  isAuthenticated?: boolean;
}

export interface UserUsage {
  planTier: PlanTier;
  requestCountToday: number;
  maxRequestsPerDay: number;
  tokensUsedToday: number;
  resetAt: string;
  isRateLimited: boolean;
}

// ── Sharing ──────────────────────────────────────────────────────────────────

export interface ShareSnapshot {
  id: string;
  conversationId: string;
  title: string;
  model: string;
  messages: Message[];
  createdAt: string;
}

// ── Model Definition ─────────────────────────────────────────────────────────

export interface ModelOption {
  id: string;
  name: string;
  contextWindow: number;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsReasoning: boolean;
  description: string;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: 'qwen/qwen3.8-27b',
    name: 'Qwen 3.8 27B (Default)',
    contextWindow: 128000,
    supportsVision: false,
    supportsTools: true,
    supportsReasoning: true,
    description: 'High performance advanced reasoning and coding on Groq',
  },
  {
    id: 'claude-3-7-sonnet',
    name: 'Claude 3.7 Sonnet (Hybrid)',
    contextWindow: 200000,
    supportsVision: true,
    supportsTools: true,
    supportsReasoning: true,
    description: 'Anthropic hybrid reasoning model with artifact generation',
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o (Omni)',
    contextWindow: 128000,
    supportsVision: true,
    supportsTools: true,
    supportsReasoning: true,
    description: 'Flagship multimodal intelligence from OpenAI',
  },
  {
    id: 'deepseek-r1',
    name: 'DeepSeek R1 (Reasoning)',
    contextWindow: 128000,
    supportsVision: false,
    supportsTools: true,
    supportsReasoning: true,
    description: 'Open-weights reasoning model with chain-of-thought',
  },
  {
    id: 'openai/gpt-oss-120b',
    name: 'GPT-OSS 120B (High Intelligence)',
    contextWindow: 128000,
    supportsVision: false,
    supportsTools: true,
    supportsReasoning: true,
    description: 'Top-tier complex problem solving on Groq',
  },
  {
    id: 'allam-2-7b',
    name: 'Allam 2 7B (Fast)',
    contextWindow: 32768,
    supportsVision: false,
    supportsTools: true,
    supportsReasoning: false,
    description: 'Fast lightweight responses on Groq',
  },
];

// ── Streaming & DTOs ─────────────────────────────────────────────────────────

export interface StreamDelta {
  type: 'content' | 'reasoning' | 'tool_call' | 'artifact' | 'done' | 'error';
  content?: string;
  reasoning?: string;
  toolCall?: ToolCall;
  artifact?: Artifact;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface SendMessageRequest {
  conversationId: string;
  content: string;
  parentId: string | null;
  attachments?: Attachment[];
  model?: string;
  systemPrompt?: string;
  customInstructions?: string;
  projectInstructions?: string;
  injectedMemories?: string[];
  toolsEnabled?: string[];
  extendedThinking?: boolean;
}
