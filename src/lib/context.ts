// =============================================================================
// Context Management & Tokenization Utilities
// =============================================================================

import type { Message, ModelOption } from './types';
import { AVAILABLE_MODELS } from './types';

/**
 * Heuristic token estimation: ~4 chars or ~0.75 words per token.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Standard token count approximation: roughly 1 token per 4 characters in English
  return Math.ceil(text.length / 4);
}

/**
 * Formats a message including any attached document contents for the model.
 */
export function formatMessageForModel(m: Message): { role: string; content: string } {
  let content = m.content || '';
  if (m.attachments && m.attachments.length > 0) {
    const docSections = m.attachments
      .filter((att) => att.extractedText && att.extractedText.trim().length > 0)
      .map((att) => {
        // Bound individual document text to ~3000 tokens (approx 12,000 chars) to prevent context blowout
        const trimmedText = att.extractedText!.length > 12000
          ? att.extractedText!.slice(0, 12000) + '\n... [Document text truncated for context limit] ...'
          : att.extractedText!;
        return `--- DOCUMENT ATTACHMENT: ${att.fileName} (${att.wordCount || Math.round(att.fileSize / 1024)} KB) ---\n${trimmedText}\n--- END OF ${att.fileName} ---`;
      })
      .join('\n\n');

    if (docSections) {
      content = content
        ? `${docSections}\n\nUser Question/Instruction:\n${content}`
        : `${docSections}\n\nPlease analyze and summarize this attached document.`;
    }
  }
  return { role: m.role, content };
}

/**
 * Calculates total tokens in a linear thread of messages.
 */
export function calculateThreadTokens(messages: Message[], systemPrompt?: string): number {
  let count = 0;
  if (systemPrompt) {
    count += estimateTokens(systemPrompt) + 4; // role overhead
  }
  for (const msg of messages) {
    const formatted = formatMessageForModel(msg);
    count += estimateTokens(formatted.content) + 4; // role + metadata overhead
    if (msg.reasoningContent) {
      count += estimateTokens(msg.reasoningContent);
    }
  }
  return count;
}

/**
 * Get model context limit.
 */
export function getModelContextLimit(modelId: string): number {
  const model = AVAILABLE_MODELS.find(m => m.id === modelId);
  return model ? model.contextWindow : 128000;
}

/**
 * Truncates / summarizes conversation history when nearing token limit.
 * Keeps recent messages intact and creates an inline summary for earlier ones.
 */
export function pruneThreadForContext(
  messages: Message[],
  maxTokens: number = 4000
): { prunedMessages: { role: string; content: string }[]; truncated: boolean; summary?: string } {
  let totalTokens = 0;
  const reversed = [...messages].reverse();
  const kept: Message[] = [];
  const dropped: Message[] = [];

  for (const msg of reversed) {
    const formatted = formatMessageForModel(msg);
    const tokens = estimateTokens(formatted.content) + 4;
    if (totalTokens + tokens <= maxTokens) {
      kept.push(msg);
      totalTokens += tokens;
    } else {
      dropped.push(msg);
    }
  }

  // Restore chronological order
  kept.reverse();
  dropped.reverse();

  if (dropped.length === 0) {
    return {
      prunedMessages: kept.map((m) => formatMessageForModel(m)),
      truncated: false,
    };
  }

  // Create a summary of dropped older messages
  const summarySnippet = dropped
    .slice(0, 5)
    .map(m => `${m.role}: ${m.content.slice(0, 100)}...`)
    .join(' | ');

  const summary = `[Summary of earlier ${dropped.length} messages: ${summarySnippet}]`;

  const finalMessages = [
    { role: 'system', content: `Earlier conversation context: ${summary}` },
    ...kept.map((m) => formatMessageForModel(m)),
  ];

  return {
    prunedMessages: finalMessages,
    truncated: true,
    summary,
  };
}
