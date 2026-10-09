// =============================================================================
// useChat Hook — Streaming, Context Management, Queue Processing, Tools & Artifacts
// =============================================================================

'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useChatStore } from '../stores/chat-store';
import { useQueueStore } from '../stores/queue-store';
import { useConversationStore } from '../stores/conversation-store';
import { useProjectStore } from '../stores/project-store';
import { useMemoryStore } from '../stores/memory-store';
import { useUserStore } from '../stores/user-store';
import { useArtifactStore } from '../stores/artifact-store';
import { useDocChatStore } from '../stores/docchat-store';
import { generateTitle } from '../lib/db';
import { pruneThreadForContext, calculateThreadTokens, getModelContextLimit } from '../lib/context';
import { detectArtifactsInContent, executeWebSearch, executeCode } from '../lib/tools';
import type { Attachment } from '../lib/types';
import { v4 as uuidv4 } from 'uuid';

export function useChat() {
  const chat = useChatStore();
  const queue = useQueueStore();
  const convStore = useConversationStore();
  const projectStore = useProjectStore();
  const docchatStore = useDocChatStore();
  const memoryStore = useMemoryStore();
  const userStore = useUserStore();
  const artifactStore = useArtifactStore();

  const isProcessingQueue = useRef(false);

  // ── Send a message (or enqueue if currently streaming) ──────────────────────
  const sendMessage = useCallback(
    (content: string, attachments?: Attachment[]) => {
      const convId = convStore.activeConversationId;
      if (!convId) return;

      const conv = convStore.conversations.find((c) => c.id === convId);
      const isIncognito = conv?.incognito || false;

      // Extract durable memories from user input
      if (!isIncognito) {
        memoryStore.extractFactFromMessage(content);
      }

      if (chat.isStreaming) {
        // Enqueue rather than blocking
        queue.enqueue(convId, content, attachments, isIncognito);
        return;
      }

      processMessage(convId, content, attachments);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [convStore.activeConversationId, chat.isStreaming, convStore.conversations]
  );

  // ── Core message processing pipeline ───────────────────────────────────────
  const processMessage = useCallback(
    async (conversationId: string, content: string, attachments?: Attachment[]) => {
      const conv = convStore.conversations.find((c) => c.id === conversationId);
      const isIncognito = conv?.incognito || false;

      // Check rate limits from UserStore
      const allowed = userStore.checkAndRecordUsage(0);
      if (!allowed) {
        queue.pause();
        return;
      }

      // 1. Add user message to tree
      const userMsg = chat.addUserMessage(conversationId, content, chat.activeLeafId, attachments, isIncognito);

      // 2. Auto-generate title from first message
      const thread = chat.getLinearThread();
      if (thread.filter((m) => m.role === 'user').length <= 1 && !isIncognito) {
        convStore.rename(conversationId, generateTitle(content));
      }

      // 3. Start assistant placeholder message
      const assistantMsg = chat.startAssistantMessage(conversationId, userMsg.id, isIncognito);

      // 4. Gather context
      const fullThread = chat.getLinearThread();
      const project = conv?.projectId ? projectStore.projects.find((p) => p.id === conv.projectId) : undefined;
      const injectedMemories = isIncognito ? [] : memoryStore.getInjectedFacts();
      const customInstructions = userStore.user.customInstructions || '';
      const projectInstructions = project?.instructions || '';

      // Check for web search tool intent if tool enabled
      const toolsEnabled = conv?.toolsEnabled || ['web_search', 'code_execution', 'file_creation'];
      if (toolsEnabled.includes('web_search') && (content.toLowerCase().startsWith('/search ') || content.toLowerCase().includes('search for '))) {
        const query = content.replace(/\/search /i, '').replace(/search for /i, '');
        const toolId = uuidv4();
        chat.addToolCall(assistantMsg.id, {
          id: toolId,
          name: 'web_search',
          input: query,
          status: 'running',
        });
        const result = await executeWebSearch(query);
        chat.updateToolCall(assistantMsg.id, toolId, {
          result,
          status: 'completed',
        });
      }

      // 5. Prune / summarize older messages if nearing model context window
      const modelId = conv?.model || 'qwen/qwen3.8-27b';
      const contextLimit = getModelContextLimit(modelId);
      const { prunedMessages } = pruneThreadForContext(
        fullThread.filter((m) => m.id !== assistantMsg.id),
        Math.min(contextLimit, 4000)
      );

      let completeOutput = '';
      const userToken = userStore.user?.token;
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
          },
          body: JSON.stringify({
            messages: prunedMessages,
            model: modelId,
            systemPrompt: conv?.systemPrompt,
            customInstructions,
            projectInstructions,
            injectedMemories,
            toolsEnabled,
            extendedThinking: conv?.extendedThinking || false,
            ragMode: docchatStore.ragMode,
            userId: docchatStore.activeUserId,
            useDocChat: true,
          }),
          signal: chat.abortController?.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Request failed' }));
          if (response.status === 429) {
            chat.appendToStream(
              assistantMsg.id,
              `⚠️ **Rate Limit Notice:** ${err.error || 'Rate limit exceeded on Groq API. Please wait a few seconds before sending another message.'}`
            );
          } else {
            chat.appendToStream(assistantMsg.id, `Error: ${err.error || 'Request failed'}`);
          }
          chat.finishStream(assistantMsg.id);
          queue.pause();
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          chat.finishStream(assistantMsg.id);
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content' && parsed.content) {
                chat.appendToStream(assistantMsg.id, parsed.content);
                completeOutput += parsed.content;
              } else if (parsed.type === 'reasoning' && parsed.reasoning) {
                chat.appendReasoning(assistantMsg.id, parsed.reasoning);
              } else if (parsed.type === 'docchat_metadata' || parsed.type === 'metadata') {
                chat.updateMessage(assistantMsg.id, {
                  groundednessScore: parsed.groundedness_score,
                  hallucinationScore: parsed.hallucination_score,
                  cosineScore: parsed.cosine_score,
                  evalReason: parsed.eval_reason,
                  sources: parsed.sources,
                  quotes: parsed.quotes,
                  followups: parsed.followups,
                  ragMode: parsed.rag_mode,
                  vaultDocsUsed: parsed.vault_docs_used,
                  hallucinatedSpans: parsed.hallucinated_spans,
                  unsupportedClaims: parsed.unsupported_claims,
                  highlightedAnswer: parsed.highlighted_answer,
                });
              } else if (parsed.type === 'done') {
                chat.finishStream(assistantMsg.id);
              } else if (parsed.type === 'usage' && parsed.usage) {
                userStore.checkAndRecordUsage(parsed.usage.totalTokens || 0);
              } else if (parsed.type === 'error') {
                chat.appendToStream(assistantMsg.id, `\n\nError: ${parsed.error}`);
                chat.finishStream(assistantMsg.id);
                queue.pause();
              }
            } catch {
              // skip parse errors
            }
          }
        }

        if (chat.isStreaming) {
          chat.finishStream(assistantMsg.id);
        }

        // 6. Check if response contains an artifact (HTML, Code, Mermaid, SVG)
        const detectedArtifact = detectArtifactsInContent(conversationId, assistantMsg.id, completeOutput);
        if (detectedArtifact) {
          artifactStore.openArtifact(detectedArtifact);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // User stopped generation — keep partial output
          chat.finishStream(assistantMsg.id);
        } else {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          chat.appendToStream(assistantMsg.id, `\n\nError: ${errorMsg}`);
          chat.finishStream(assistantMsg.id);
          queue.pause();
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [convStore.conversations, projectStore.projects, memoryStore, userStore, artifactStore]
  );

  // ── Queue Auto-drain processing ────────────────────────────────────────────
  useEffect(() => {
    if (chat.isStreaming || queue.isPaused || isProcessingQueue.current) return;
    if (queue.items.length === 0) return;

    const convId = convStore.activeConversationId;
    if (!convId) return;

    isProcessingQueue.current = true;
    const nextItem = queue.dequeue();
    if (nextItem) {
      processMessage(convId, nextItem.content, nextItem.attachments).finally(() => {
        isProcessingQueue.current = false;
      });
    } else {
      isProcessingQueue.current = false;
    }
  }, [chat.isStreaming, queue.items.length, queue.isPaused, convStore.activeConversationId, processMessage, queue]);

  // ── Regenerate response ───────────────────────────────────────────────────
  const regenerate = useCallback(
    (assistantMessageId: string) => {
      const parentId = chat.regenerate(assistantMessageId);
      if (!parentId) return;

      const convId = convStore.activeConversationId;
      if (!convId) return;

      const parent = chat.messages[parentId];
      if (!parent) return;

      processMessage(convId, parent.content, parent.attachments);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [convStore.activeConversationId, processMessage]
  );

  // ── Edit past user message (Branching) ────────────────────────────────────
  const editMessage = useCallback(
    (messageId: string, newContent: string) => {
      const newMsg = chat.editUserMessage(messageId, newContent);
      if (!newMsg) return;

      const convId = convStore.activeConversationId;
      if (!convId) return;

      processMessage(convId, newContent, newMsg.attachments);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [convStore.activeConversationId, processMessage]
  );

  // Current context token metrics
  const activeConv = convStore.conversations.find((c) => c.id === convStore.activeConversationId);
  const thread = chat.getLinearThread();
  const usedTokens = calculateThreadTokens(thread, activeConv?.systemPrompt);
  const maxTokens = getModelContextLimit(activeConv?.model || 'qwen/qwen3.8-27b');

  return {
    sendMessage,
    regenerate,
    editMessage,
    stopGeneration: chat.stopStream,
    isStreaming: chat.isStreaming,
    thread,
    queueItems: queue.items,
    isQueuePaused: queue.isPaused,
    resumeQueue: queue.resume,
    clearQueue: () => {
      const convId = convStore.activeConversationId;
      if (convId) queue.clear(convId);
    },
    contextTokens: {
      used: usedTokens,
      max: maxTokens,
      percent: Math.min(100, Math.round((usedTokens / maxTokens) * 100)),
    },
  };
}
