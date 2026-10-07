// =============================================================================
// PromptQueue Component — Stacked directly above the input box as compact cards
// Features: Reordering, inline editing, pull to editor, cancel, pause/resume, clear
// =============================================================================

'use client';

import { useState } from 'react';
import type { QueueItem } from '../../lib/types';
import { useQueueStore } from '../../stores/queue-store';
import { useConversationStore } from '../../stores/conversation-store';

interface PromptQueueProps {
  items: QueueItem[];
  isPaused: boolean;
  onResume: () => void;
  onClear: () => void;
  onPullToEditor?: (item: QueueItem) => void;
}

export function PromptQueue({ items, isPaused, onResume, onClear, onPullToEditor }: PromptQueueProps) {
  const queueStore = useQueueStore();
  const convStore = useConversationStore();

  const [expanded, setExpanded] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const convId = convStore.activeConversationId || '';

  const handleEditSave = (id: string) => {
    if (editContent.trim()) {
      queueStore.editItem(id, editContent.trim());
    }
    setEditingId(null);
  };

  const handleMoveUp = (index: number) => {
    if (index > 0 && convId) {
      queueStore.moveItem(convId, index, index - 1);
    }
  };

  const handleMoveDown = (index: number) => {
    if (index < items.length - 1 && convId) {
      queueStore.moveItem(convId, index, index + 1);
    }
  };

  if (items.length === 0) return null;

  return (
    <div
      style={{
        maxWidth: 768,
        margin: '0 auto 10px',
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-medium)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
        userSelect: 'none',
      }}
      className="animate-slide-down"
    >
      {/* ── Queue Header ── */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 14px',
          backgroundColor: 'var(--bg-secondary)',
          cursor: 'pointer',
          borderBottom: expanded ? '1px solid var(--border-subtle)' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--accent-primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>⏳</span>
            <span>Prompt Queue ({items.length} {items.length === 1 ? 'item' : 'items'})</span>
          </span>

          {isPaused ? (
            <span
              style={{
                fontSize: 10.5,
                color: '#dc2626',
                fontWeight: 700,
                padding: '2px 6px',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                borderRadius: 'var(--radius-xs)',
              }}
            >
              PAUSED
            </span>
          ) : (
            <span
              style={{
                fontSize: 10.5,
                color: '#16a34a',
                fontWeight: 700,
                padding: '2px 6px',
                backgroundColor: 'rgba(34, 197, 94, 0.12)',
                borderRadius: 'var(--radius-xs)',
              }}
            >
              RUNNING AUTOMATICALLY
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {isPaused ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onResume();
              }}
              style={{
                padding: '3px 8px',
                backgroundColor: '#16a34a',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-xs)',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              Resume
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                queueStore.pause();
              }}
              style={{
                padding: '3px 8px',
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-xs)',
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              Pause
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            style={{
              padding: '3px 8px',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-tertiary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-xs)',
              cursor: 'pointer',
              fontSize: 11,
            }}
            title="Clear all queued messages"
          >
            Clear
          </button>
          <span style={{ color: 'var(--text-tertiary)', fontSize: 11, marginLeft: 4 }}>
            {expanded ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {/* ── Queued Items Compact Stack ── */}
      {expanded && (
        <div style={{ padding: '8px', maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((item, i) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                fontSize: 13,
              }}
            >
              {/* Position and Reorder Handles */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 12, cursor: 'grab' }} title="Drag handle">
                  ⋮⋮
                </span>
                <span
                  style={{
                    color: 'var(--accent-primary)',
                    minWidth: 20,
                    textAlign: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  #{i + 1}
                </span>
                <button
                  disabled={i === 0}
                  onClick={() => handleMoveUp(i)}
                  title="Move Up"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: i > 0 ? 'pointer' : 'default',
                    color: i > 0 ? 'var(--text-secondary)' : 'var(--text-muted)',
                    fontSize: 10,
                    padding: 0,
                  }}
                >
                  ▲
                </button>
                <button
                  disabled={i === items.length - 1}
                  onClick={() => handleMoveDown(i)}
                  title="Move Down"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: i < items.length - 1 ? 'pointer' : 'default',
                    color: i < items.length - 1 ? 'var(--text-secondary)' : 'var(--text-muted)',
                    fontSize: 10,
                    padding: 0,
                  }}
                >
                  ▼
                </button>
              </div>

              {/* Item Content or Inline Edit */}
              {editingId === item.id ? (
                <input
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onBlur={() => handleEditSave(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleEditSave(item.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  autoFocus
                  style={{
                    flex: 1,
                    backgroundColor: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-xs)',
                    padding: '4px 8px',
                    outline: 'none',
                    fontSize: 13,
                  }}
                />
              ) : (
                <span
                  style={{
                    flex: 1,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    setEditingId(item.id);
                    setEditContent(item.content);
                  }}
                  title={`${item.content} (Click to edit)`}
                >
                  {item.attachments && item.attachments.length > 0 && '📎 '}
                  {item.content}
                </span>
              )}

              {/* Actions: Pull to editor, edit, remove */}
              {onPullToEditor && (
                <button
                  onClick={() => onPullToEditor(item)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--accent-primary)',
                    fontSize: 11,
                    padding: '2px 4px',
                    fontWeight: 500,
                  }}
                  title="Revert prompt back to input editor"
                >
                  ↩ To Editor
                </button>
              )}
              <button
                onClick={() => {
                  setEditingId(item.id);
                  setEditContent(item.content);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-tertiary)',
                  fontSize: 12,
                }}
                title="Edit item"
              >
                ✏️
              </button>
              <button
                onClick={() => queueStore.cancel(item.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-tertiary)',
                  fontSize: 12,
                }}
                title="Cancel prompt"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
