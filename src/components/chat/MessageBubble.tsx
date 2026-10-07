// =============================================================================
// MessageBubble — Branch switcher, Reasoning accordion, Tool calls,
// Inline Citations with Hovercard, Artifact Card, and Feedback dialog
// Assistant messages: No bubble, plain text on background with Serif typography
// User messages: Rounded bubble with soft warm background
// =============================================================================

'use client';

import { useState, useMemo } from 'react';
import type { Message, Feedback, ToolCall } from '../../lib/types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useArtifactStore } from '../../stores/artifact-store';

interface MessageBubbleProps {
  message: Message;
  isStreaming: boolean;
  onRegenerate: () => void;
  onEdit: (newContent: string) => void;
  onSwitchBranch: (messageId: string) => void;
  onFeedback: (rating: 'thumbs_up' | 'thumbs_down', comment?: string) => void;
  onRevertAndEdit?: (messageId: string) => void;
  onSendFollowup?: (text: string) => void;
  siblings: Message[];
  siblingIndex: { current: number; total: number };
}

interface CitationSource {
  id: number;
  title: string;
  snippet: string;
  source: string;
  domain: string;
}

export function MessageBubble({
  message,
  isStreaming,
  onRegenerate,
  onEdit,
  onSwitchBranch,
  onFeedback,
  onRevertAndEdit,
  onSendFollowup,
  siblings,
  siblingIndex,
}: MessageBubbleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState<'thumbs_up' | 'thumbs_down'>('thumbs_up');
  const [feedbackComment, setFeedbackComment] = useState('');
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [hoveredCitation, setHoveredCitation] = useState<number | null>(null);
  const [quotesExpanded, setQuotesExpanded] = useState(false);
  const [showHighlights, setShowHighlights] = useState(false);

  const artifactStore = useArtifactStore();
  const isUser = message.role === 'user';

  // Extract web search sources if this message has tool calls
  const citationSources = useMemo<CitationSource[]>(() => {
    if (isUser || !message.toolCalls) return [];
    const sources: CitationSource[] = [];
    let count = 1;

    for (const tool of message.toolCalls) {
      if (tool.name === 'web_search' && tool.result) {
        try {
          const parsed = JSON.parse(tool.result);
          if (Array.isArray(parsed.results)) {
            for (const r of parsed.results) {
              let domain = 'web';
              try {
                domain = new URL(r.source).hostname.replace('www.', '');
              } catch {
                // Ignore url parse error
              }
              sources.push({
                id: count++,
                title: r.title || 'Web Reference',
                snippet: r.snippet || '',
                source: r.source || '',
                domain,
              });
            }
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
    return sources;
  }, [isUser, message.toolCalls]);

  // Check if message spawned an artifact in the store
  const linkedArtifact = useMemo(() => {
    if (isUser) return null;
    return artifactStore.activeArtifact?.messageId === message.id ? artifactStore.activeArtifact : null;
  }, [isUser, message.id, artifactStore.activeArtifact]);

  // Extract <thinking> tags if present in content
  const { displayContent, reasoningText } = useMemo(() => {
    let content = message.content;
    let reasoning = message.reasoningContent || '';

    if (!isUser && content.includes('<thinking>')) {
      if (content.includes('</thinking>')) {
        const [think, ...rest] = content.split('</thinking>');
        const extracted = think.replace('<thinking>', '').trim();
        if (extracted) {
          reasoning = (reasoning ? reasoning + '\n' : '') + extracted;
        }
        content = rest.join('</thinking>').trim();
      } else if (content.startsWith('<thinking>')) {
        reasoning = (reasoning ? reasoning + '\n' : '') + content.replace('<thinking>', '').trim();
        content = '';
      }
    }
    return { displayContent: content, reasoningText: reasoning };
  }, [isUser, message.content, message.reasoningContent]);

  const handleCopy = () => {
    navigator.clipboard.writeText(displayContent || message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEditSubmit = () => {
    if (editContent.trim() && editContent !== message.content) {
      onEdit(editContent.trim());
    }
    setIsEditing(false);
  };

  const handleFeedbackSubmit = () => {
    onFeedback(feedbackRating, feedbackComment.trim() || undefined);
    setShowFeedbackModal(false);
  };

  return (
    <div
      style={{
        marginBottom: 32,
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        width: '100%',
      }}
      className="animate-fade-in"
    >
      {/* ── Top Meta Header: Role & Branching ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 6,
          paddingLeft: isUser ? 0 : 2,
          paddingRight: isUser ? 4 : 0,
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: 'var(--text-tertiary)',
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {isUser ? 'You' : 'Assistant'}
        </span>

        {/* Branch switcher (message tree navigator) */}
        {siblingIndex.total > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <button
              onClick={() => {
                const idx = siblings.findIndex((s) => s.id === message.id);
                if (idx > 0) onSwitchBranch(siblings[idx - 1].id);
              }}
              disabled={siblingIndex.current <= 1}
              style={{
                background: 'none',
                border: 'none',
                cursor: siblingIndex.current > 1 ? 'pointer' : 'default',
                color: siblingIndex.current > 1 ? 'var(--text-primary)' : 'var(--text-muted)',
                fontSize: 10,
                padding: '0 2px',
              }}
              title="Previous version"
            >
              ◀
            </button>
            <span style={{ fontWeight: 600 }}>
              {siblingIndex.current} / {siblingIndex.total}
            </span>
            <button
              onClick={() => {
                const idx = siblings.findIndex((s) => s.id === message.id);
                if (idx < siblings.length - 1) onSwitchBranch(siblings[idx + 1].id);
              }}
              disabled={siblingIndex.current >= siblingIndex.total}
              style={{
                background: 'none',
                border: 'none',
                cursor: siblingIndex.current < siblingIndex.total ? 'pointer' : 'default',
                color: siblingIndex.current < siblingIndex.total ? 'var(--text-primary)' : 'var(--text-muted)',
                fontSize: 10,
                padding: '0 2px',
              }}
              title="Next version"
            >
              ▶
            </button>
          </div>
        )}
      </div>

      {/* ── Attachments preview on User messages ── */}
      {message.attachments && message.attachments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10, maxWidth: '85%' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
            {message.attachments.map((att) => (
              <div
                key={att.id}
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 12,
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span>📄</span>
                <span style={{ fontWeight: 600 }}>{att.fileName}</span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                  ({Math.round(att.fileSize / 1024)} KB
                  {att.pageCount ? ` · ${att.pageCount} pgs` : ''}
                  {att.wordCount ? ` · ${att.wordCount.toLocaleString()} words` : ''})
                </span>
                {att.extractedText && (
                  <button
                    type="button"
                    onClick={() => setExpandedDocId(expandedDocId === att.id ? null : att.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-primary)',
                      cursor: 'pointer',
                      fontSize: 11,
                      padding: '2px 4px',
                      textDecoration: 'underline',
                    }}
                  >
                    {expandedDocId === att.id ? 'Hide text' : 'View text'}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Expanded text drawer for active document */}
          {expandedDocId && (
            <div
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 14px',
                fontSize: 12,
                color: 'var(--text-secondary)',
                maxHeight: 180,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {message.attachments.find((a) => a.id === expandedDocId)?.extractedText || 'No extracted text available.'}
            </div>
          )}
        </div>
      )}

      {/* ── Extended Thinking Section (Collapsible Reasoning Box) ── */}
      {!isUser && reasoningText && (
        <div style={{ width: '100%', marginBottom: 14 }}>
          <div
            onClick={() => setThinkingExpanded(!thinkingExpanded)}
            className={isStreaming ? 'shimmer-active' : ''}
            style={{
              padding: '8px 14px',
              backgroundColor: 'var(--thinking-bg)',
              border: '1px solid var(--thinking-border)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 13,
              color: 'var(--thinking-text)',
              userSelect: 'none',
              transition: 'all var(--transition-fast)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14 }}>💭</span>
              <span style={{ fontWeight: 500 }}>
                {isStreaming ? 'Thinking...' : `Reasoning (${Math.round(reasoningText.length / 4)} tokens)`}
              </span>
            </div>
            <span style={{ fontSize: 11, opacity: 0.8 }}>
              {thinkingExpanded ? '▲ Collapse' : '▼ Expand'}
            </span>
          </div>

          {thinkingExpanded && (
            <div
              style={{
                marginTop: 6,
                padding: '14px 16px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                fontSize: 13.5,
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
                fontFamily: 'var(--font-sans)',
                whiteSpace: 'pre-wrap',
                maxHeight: 320,
                overflowY: 'auto',
              }}
              className="animate-fade-in"
            >
              {reasoningText}
            </div>
          )}
        </div>
      )}

      {/* ── Tool Calls Display ── */}
      {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
        <div style={{ width: '100%', marginBottom: 12 }}>
          {message.toolCalls.map((t: ToolCall) => (
            <div
              key={t.id}
              style={{
                backgroundColor: 'var(--pill-bg)',
                border: '1px solid var(--pill-border)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 14px',
                fontSize: 12.5,
                marginBottom: 6,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {t.name === 'web_search' && '🌐 Search Web'}
                  {t.name === 'code_execution' && '⚡ Run Code'}
                  {t.name === 'file_creation' && '📄 Create File'}
                  {!['web_search', 'code_execution', 'file_creation'].includes(t.name) && `🛠 ${t.name}`}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor:
                      t.status === 'completed'
                        ? 'rgba(34, 197, 94, 0.15)'
                        : t.status === 'running'
                        ? 'rgba(234, 179, 8, 0.18)'
                        : 'rgba(239, 68, 68, 0.15)',
                    color:
                      t.status === 'completed'
                        ? '#16a34a'
                        : t.status === 'running'
                        ? '#ca8a04'
                        : '#dc2626',
                    fontWeight: 600,
                  }}
                >
                  {t.status === 'completed' ? '✓ done' : t.status === 'running' ? '⏳ running...' : '✕ failed'}
                </span>
              </div>
              <div style={{ color: 'var(--text-secondary)', marginTop: 4, fontSize: 12 }}>
                Query: &quot;{t.input}&quot;
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Main Message Body ── */}
      {isUser ? (
        // USER MESSAGE: Rounded bubble with soft warm background
        <div
          style={{
            backgroundColor: 'var(--user-bubble-bg)',
            border: '1px solid var(--user-bubble-border)',
            padding: '12px 18px',
            borderRadius: 'var(--radius-lg)',
            maxWidth: '85%',
            color: 'var(--user-bubble-text)',
            fontSize: 15,
            lineHeight: 1.6,
            wordBreak: 'break-word',
          }}
        >
          {isEditing ? (
            <div>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: 80,
                  padding: 10,
                  backgroundColor: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  resize: 'vertical',
                  outline: 'none',
                  fontFamily: 'inherit',
                  fontSize: 14.5,
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  onClick={handleEditSubmit}
                  style={{
                    padding: '6px 14px',
                    backgroundColor: 'var(--accent-primary)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    fontSize: 12.5,
                    fontWeight: 600,
                  }}
                >
                  Save &amp; Branch
                </button>
                <button
                  onClick={() => {
                    setEditContent(message.content);
                    setIsEditing(false);
                  }}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    fontSize: 12.5,
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="markdown-content">
              {message.content}
            </div>
          )}
        </div>
      ) : (
        // ASSISTANT MESSAGE: NO bubble, plain text on page background with Serif font
        <div style={{ width: '100%' }}>
          <div className="markdown-content markdown-assistant">
            <MarkdownRenderer content={displayContent} />
            {isStreaming && <span className="streaming-caret" />}
          </div>

          {/* Inline Artifact Card (Canvas shortcut) */}
          {linkedArtifact && (
            <div
              onClick={() => artifactStore.openArtifact(linkedArtifact)}
              style={{
                marginTop: 16,
                padding: '12px 16px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'all var(--transition-fast)',
              }}
              title="Open artifact in side panel canvas"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--accent-subtle)',
                    color: 'var(--accent-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                  }}
                >
                  🎨
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {linkedArtifact.title}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>
                    {linkedArtifact.type} Canvas · v{linkedArtifact.version} · Click to open side panel
                  </div>
                </div>
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--accent-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span>View Canvas</span>
                <span>→</span>
              </div>
            </div>
          )}

          {/* Web Search Sources list at end of message */}
          {citationSources.length > 0 && (
            <div
              style={{
                marginTop: 18,
                paddingTop: 14,
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'var(--text-tertiary)',
                  marginBottom: 8,
                }}
              >
                Sources &amp; Citations ({citationSources.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {citationSources.map((src) => (
                  <a
                    key={src.id}
                    href={src.source}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: 'var(--pill-bg)',
                      border: '1px solid var(--pill-border)',
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      textDecoration: 'none',
                      transition: 'all var(--transition-fast)',
                    }}
                    onMouseEnter={() => setHoveredCitation(src.id)}
                    onMouseLeave={() => setHoveredCitation(null)}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: 'var(--accent-primary)',
                      }}
                    >
                      [{src.id}]
                    </span>
                    <span style={{ fontWeight: 500, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {src.title}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                      ({src.domain})
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* ── DocChat Groundedness & Hallucination Audit Card ── */}
          {(message.groundednessScore !== undefined || (message.sources && message.sources.length > 0)) && (
            <div
              style={{
                marginTop: 18,
                padding: '14px 16px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                fontSize: 13,
              }}
            >
              {/* Header with Risk badge */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>🛡️</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>
                    DocChat Groundedness Audit
                  </span>
                  {message.ragMode && (
                    <span
                      style={{
                        fontSize: 10.5,
                        padding: '1px 6px',
                        borderRadius: 6,
                        backgroundColor: 'var(--bg-tertiary)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                      }}
                    >
                      {message.ragMode === 'Thinking' ? '🧠 Agentic RAG' : '⚡ Simple RAG'}
                    </span>
                  )}
                </div>

                {message.groundednessScore !== undefined && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '3px 9px',
                      borderRadius: 12,
                      backgroundColor:
                        (message.groundednessScore ?? 100) >= 80
                          ? 'rgba(92, 217, 167, 0.15)'
                          : (message.groundednessScore ?? 100) >= 50
                          ? 'rgba(240, 184, 72, 0.15)'
                          : 'rgba(240, 112, 112, 0.15)',
                      border: `1px solid ${
                        (message.groundednessScore ?? 100) >= 80
                          ? 'rgba(92, 217, 167, 0.3)'
                          : (message.groundednessScore ?? 100) >= 50
                          ? 'rgba(240, 184, 72, 0.3)'
                          : 'rgba(240, 112, 112, 0.3)'
                      }`,
                      color:
                        (message.groundednessScore ?? 100) >= 80
                          ? '#5CD9A7'
                          : (message.groundednessScore ?? 100) >= 50
                          ? '#F0B848'
                          : '#F07070',
                      fontSize: 11.5,
                      fontWeight: 600,
                    }}
                  >
                    <span>
                      {(message.groundednessScore ?? 100) >= 80
                        ? '✓ LOW RISK'
                        : (message.groundednessScore ?? 100) >= 50
                        ? '⚡ MEDIUM RISK'
                        : '⚠️ HIGH RISK'}
                    </span>
                    <span>&middot;</span>
                    <span>{message.groundednessScore}% Grounded</span>
                  </div>
                )}
              </div>

              {/* Progress bar */}
              {message.groundednessScore !== undefined && (
                <div
                  style={{
                    width: '100%',
                    height: 6,
                    backgroundColor: 'var(--bg-tertiary)',
                    borderRadius: 3,
                    overflow: 'hidden',
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      width: `${message.groundednessScore}%`,
                      height: '100%',
                      backgroundColor:
                        message.groundednessScore >= 80
                          ? '#5CD9A7'
                          : message.groundednessScore >= 50
                          ? '#F0B848'
                          : '#F07070',
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
              )}

              {/* Evaluator Reason */}
              {message.evalReason && (
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 10 }}>
                  {message.evalReason}
                  {message.cosineScore !== undefined && message.cosineScore > 0 && (
                    <span style={{ color: 'var(--text-tertiary)', marginLeft: 8 }}>
                      (Cosine Match: {message.cosineScore}%)
                    </span>
                  )}
                </div>
              )}

              {/* Sources badges */}
              {message.sources && message.sources.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>
                    VAULT SOURCES:
                  </span>
                  {message.sources.map((src, i) => (
                    <span
                      key={i}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        backgroundColor: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-subtle)',
                        fontSize: 11.5,
                        color: 'var(--text-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <span>📄</span>
                      <span style={{ fontWeight: 500 }}>{src}</span>
                    </span>
                  ))}
                </div>
              )}

              {/* Expandable Supporting Excerpts */}
              {message.quotes && message.quotes.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <button
                    onClick={() => setQuotesExpanded(!quotesExpanded)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-primary)',
                      cursor: 'pointer',
                      fontSize: 11.5,
                      fontWeight: 600,
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <span>{quotesExpanded ? '▾ Hide Supporting Passages' : '▸ View Supporting Passages (' + message.quotes.length + ')'}</span>
                  </button>

                  {quotesExpanded && (
                    <div
                      style={{
                        marginTop: 8,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        padding: '10px 12px',
                        backgroundColor: 'var(--bg-primary)',
                        borderRadius: 8,
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {message.quotes.map((q, idx) => (
                        <blockquote
                          key={idx}
                          style={{
                            margin: 0,
                            paddingLeft: 10,
                            borderLeft: '3px solid var(--accent-primary)',
                            fontSize: 12,
                            color: 'var(--text-secondary)',
                            lineHeight: 1.5,
                            fontStyle: 'italic',
                          }}
                        >
                          &ldquo;{q}&rdquo;
                        </blockquote>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Hallucinated Word Inspector ── */}
              {((message.hallucinatedSpans && message.hallucinatedSpans.length > 0) || (message.hallucinationScore && message.hallucinationScore > 0)) && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <button
                      onClick={() => setShowHighlights(!showHighlights)}
                      style={{
                        background: showHighlights ? 'rgba(240, 112, 112, 0.18)' : 'var(--bg-tertiary)',
                        border: `1px solid ${showHighlights ? '#F07070' : 'var(--border-subtle)'}`,
                        color: showHighlights ? '#F87171' : 'var(--text-secondary)',
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'all 0.2s',
                      }}
                    >
                      <span>🔍</span>
                      <span>{showHighlights ? 'Hide Word Highlights' : 'Highlight Hallucinated Words'}</span>
                    </button>
                    {message.hallucinatedSpans && message.hallucinatedSpans.length > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        {message.hallucinatedSpans.length} unverified phrase{message.hallucinatedSpans.length > 1 ? 's' : ''} detected
                      </span>
                    )}
                  </div>

                  {showHighlights && message.highlightedAnswer && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid rgba(240, 112, 112, 0.3)',
                        fontSize: 13,
                        lineHeight: 1.6,
                      }}
                      dangerouslySetInnerHTML={{ __html: message.highlightedAnswer }}
                    />
                  )}

                  {message.unsupportedClaims && message.unsupportedClaims.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {message.unsupportedClaims.map((claim, idx) => (
                        <div
                          key={idx}
                          style={{
                            fontSize: 11.5,
                            color: '#F87171',
                            backgroundColor: 'rgba(240, 112, 112, 0.1)',
                            padding: '3px 8px',
                            borderRadius: 4,
                            border: '1px solid rgba(240, 112, 112, 0.2)',
                          }}
                        >
                          ⚠️ {claim}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Suggested Follow-ups ── */}
          {message.followups && message.followups.length > 0 && onSendFollowup && (
            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'var(--text-tertiary)',
                  marginBottom: 8,
                }}
              >
                Suggested Follow-ups
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {message.followups.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => onSendFollowup(q)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 16,
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                      fontSize: 12,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent-primary)';
                      e.currentTarget.style.color = 'var(--accent-primary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-subtle)';
                      e.currentTarget.style.color = 'var(--text-primary)';
                    }}
                  >
                    💡 {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Action Row (Copy, Edit, Regenerate, Thumbs Feedback) ── */}
      {!isEditing && !isStreaming && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginTop: 8,
            fontSize: 12.5,
            color: 'var(--text-tertiary)',
          }}
        >
          <button
            onClick={handleCopy}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: copied ? 'var(--accent-primary)' : 'inherit',
              padding: '2px 4px',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
            title="Copy message to clipboard"
          >
            <span>{copied ? '✓' : '📋'}</span>
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          {isUser && (
            <>
              {onRevertAndEdit && (
                <button
                  onClick={() => onRevertAndEdit(message.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--accent-primary)',
                    padding: '2px 4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                  title="Rewind conversation to this message and place prompt into editor"
                >
                  <span>↩</span>
                  <span>Revert &amp; Edit</span>
                </button>
              )}
              <button
                onClick={() => {
                  setEditContent(message.content);
                  setIsEditing(true);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'inherit',
                  padding: '2px 4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
                title="Edit this message (creates a new branch)"
              >
                <span>✏️</span>
                <span>Edit</span>
              </button>
            </>
          )}

          {!isUser && (
            <>
              <button
                onClick={onRegenerate}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'inherit',
                  padding: '2px 4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
                title="Regenerate this response"
              >
                <span>🔄</span>
                <span>Retry</span>
              </button>

              <button
                onClick={() => {
                  setFeedbackRating('thumbs_up');
                  setShowFeedbackModal(true);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: message.feedback?.rating === 'thumbs_up' ? '#16a34a' : 'inherit',
                  padding: '2px 4px',
                }}
                title="Good response"
              >
                👍
              </button>

              <button
                onClick={() => {
                  setFeedbackRating('thumbs_down');
                  setShowFeedbackModal(true);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: message.feedback?.rating === 'thumbs_down' ? '#dc2626' : 'inherit',
                  padding: '2px 4px',
                }}
                title="Poor response"
              >
                👎
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Feedback Comment Modal ── */}
      {showFeedbackModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'var(--bg-overlay)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={() => setShowFeedbackModal(false)}
        >
          <div
            style={{
              width: 380,
              backgroundColor: 'var(--bg-card)',
              padding: 20,
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-medium)',
              boxShadow: 'var(--shadow-modal)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h4 style={{ margin: '0 0 10px', color: 'var(--text-primary)', fontSize: 16 }}>
              {feedbackRating === 'thumbs_up' ? '👍 What did you like?' : '👎 How can this be improved?'}
            </h4>
            <textarea
              rows={3}
              placeholder="Optional comment: Provide feedback to help improve the model..."
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
              style={{
                width: '100%',
                padding: 10,
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                outline: 'none',
                fontFamily: 'inherit',
                fontSize: 13.5,
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button
                onClick={() => setShowFeedbackModal(false)}
                style={{
                  padding: '6px 14px',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleFeedbackSubmit}
                style={{
                  padding: '6px 16px',
                  backgroundColor: 'var(--accent-primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                Submit Feedback
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
