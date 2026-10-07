// =============================================================================
// SearchCommandPalette — Command-palette modal (Ctrl+K / Cmd+K)
// Live searching across conversation titles and message content
// =============================================================================

'use client';

import { useState, useEffect, useRef } from 'react';
import { useConversationStore } from '../../stores/conversation-store';
import { useChatStore } from '../../stores/chat-store';
import { useQueueStore } from '../../stores/queue-store';
import * as db from '../../lib/db';
import type { Conversation, Message } from '../../lib/types';

interface SearchResult {
  conversation: Conversation;
  matchingSnippet?: string;
  matchType: 'title' | 'content';
}

interface SearchCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchCommandPalette({ isOpen, onClose }: SearchCommandPaletteProps) {
  const convStore = useConversationStore();
  const chatStore = useChatStore();
  const queueStore = useQueueStore();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Live search calculation
  useEffect(() => {
    if (!query.trim()) {
      // Show recents when query is empty
      const recents = convStore.conversations.slice(0, 8).map((c) => ({
        conversation: c,
        matchType: 'title' as const,
      }));
      setResults(recents);
      setSelectedIndex(0);
      return;
    }

    const q = query.toLowerCase();
    const allConvs = convStore.conversations;
    const allMsgs = typeof window !== 'undefined'
      ? (JSON.parse(localStorage.getItem('chat_messages') || '[]') as Message[])
      : [];

    const matchedMap = new Map<string, SearchResult>();

    // 1. Match titles
    for (const conv of allConvs) {
      if (conv.title.toLowerCase().includes(q)) {
        matchedMap.set(conv.id, {
          conversation: conv,
          matchType: 'title',
        });
      }
    }

    // 2. Match message content
    for (const msg of allMsgs) {
      if (msg.content.toLowerCase().includes(q)) {
        const conv = allConvs.find((c) => c.id === msg.conversationId);
        if (conv && !matchedMap.has(conv.id)) {
          // Extract short surrounding snippet
          const idx = msg.content.toLowerCase().indexOf(q);
          const start = Math.max(0, idx - 30);
          const end = Math.min(msg.content.length, idx + q.length + 50);
          const snippet = (start > 0 ? '...' : '') + msg.content.slice(start, end) + (end < msg.content.length ? '...' : '');

          matchedMap.set(conv.id, {
            conversation: conv,
            matchingSnippet: snippet,
            matchType: 'content',
          });
        }
      }
    }

    setResults(Array.from(matchedMap.values()).slice(0, 12));
    setSelectedIndex(0);
  }, [query, convStore.conversations]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        selectConversation(results[selectedIndex].conversation.id);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const selectConversation = (id: string) => {
    convStore.select(id);
    chatStore.clear();
    chatStore.loadMessages(id);
    queueStore.load(id);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--bg-overlay)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
        zIndex: 200,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 580,
          backgroundColor: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-medium)',
          boxShadow: 'var(--shadow-modal)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        className="animate-slide-down"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-subtle)',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 18, color: 'var(--text-tertiary)' }}>🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search conversation titles and message content..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 15,
              color: 'var(--text-primary)',
            }}
          />
          <kbd
            style={{
              fontSize: 11,
              padding: '2px 6px',
              borderRadius: 'var(--radius-xs)',
              background: 'var(--bg-tertiary)',
              color: 'var(--text-tertiary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div
          style={{
            maxHeight: 380,
            overflowY: 'auto',
            padding: '8px',
          }}
        >
          {results.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>💬</div>
              <div style={{ fontSize: 14 }}>No matches found for &quot;{query}&quot;</div>
            </div>
          ) : (
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--text-tertiary)',
                  padding: '6px 10px',
                }}
              >
                {query.trim() ? 'Matching Results' : 'Recent Conversations'}
              </div>

              {results.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={item.conversation.id}
                    onClick={() => selectConversation(item.conversation.id)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? 'var(--bg-secondary)' : 'transparent',
                      border: isSelected ? '1px solid var(--border-subtle)' : '1px solid transparent',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      transition: 'background-color var(--transition-fast)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)',
                        }}
                      >
                        {item.conversation.isPinned && '📌 '}
                        {item.conversation.incognito && '🕶️ '}
                        {item.conversation.title}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        {item.matchType === 'content' ? 'Message content' : 'Title'}
                      </span>
                    </div>

                    {item.matchingSnippet && (
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        &quot;{item.matchingSnippet}&quot;
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 11,
            color: 'var(--text-tertiary)',
          }}
        >
          <div style={{ display: 'flex', gap: 12 }}>
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <span>Search in titles &amp; history</span>
        </div>
      </div>
    </div>
  );
}
