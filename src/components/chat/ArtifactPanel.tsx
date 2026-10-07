// =============================================================================
// ArtifactPanel — Canvas side panel with version history, live editor & preview
// Supports HTML, SVG, Markdown, and Code artifacts with sandboxed preview
// =============================================================================

'use client';

import { useState } from 'react';
import { useArtifactStore } from '../../stores/artifact-store';
import { useChat } from '../../hooks/use-chat';
import { MarkdownRenderer } from './MarkdownRenderer';

export function ArtifactPanel() {
  const { activeArtifact, isOpen, versions, closePanel, updateContent, selectVersion, downloadArtifact, copyArtifact } = useArtifactStore();
  const { sendMessage } = useChat();

  const [isEditing, setIsEditing] = useState(false);
  const [editorContent, setEditorContent] = useState('');
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'code' | 'preview'>('preview');
  const [iterationPrompt, setIterationPrompt] = useState('');

  if (!isOpen || !activeArtifact) return null;

  const handleStartEdit = () => {
    setEditorContent(activeArtifact.content);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    updateContent(editorContent);
    setIsEditing(false);
  };

  const handleCopy = async () => {
    const success = await copyArtifact();
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleIterate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!iterationPrompt.trim()) return;

    sendMessage(
      `Please iterate on the current artifact "${activeArtifact.title}" (version ${activeArtifact.version}):\n${iterationPrompt.trim()}`
    );
    setIterationPrompt('');
  };

  const canPreview = ['html', 'svg', 'markdown'].includes(activeArtifact.type);

  return (
    <div
      style={{
        width: 480,
        maxWidth: '48vw',
        borderLeft: '1px solid var(--border-medium)',
        backgroundColor: 'var(--bg-card)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        zIndex: 50,
        boxShadow: 'var(--shadow-card)',
        transition: 'width var(--transition-smooth)',
      }}
      className="animate-fade-in"
    >
      {/* ── Panel Header ── */}
      <div
        style={{
          padding: '12px 18px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              fontSize: 11,
              backgroundColor: 'var(--accent-subtle)',
              color: 'var(--accent-primary)',
              border: '1px solid var(--accent-border)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-xs)',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            {activeArtifact.type}
          </span>
          <span
            style={{
              fontWeight: 600,
              fontSize: 14.5,
              color: 'var(--text-primary)',
              maxWidth: 220,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {activeArtifact.title}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Version Selector */}
          {versions.length > 1 && (
            <select
              value={activeArtifact.id}
              onChange={(e) => {
                const found = versions.find((v) => v.id === e.target.value);
                if (found) selectVersion(found);
              }}
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-xs)',
                padding: '3px 8px',
                fontSize: 12,
              }}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version} {v.id === activeArtifact.id ? '(current)' : ''}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={closePanel}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              fontSize: 16,
              padding: '2px 4px',
            }}
            title="Close canvas panel"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--bg-primary)',
        }}
      >
        <div style={{ display: 'flex', gap: 6 }}>
          {canPreview && (
            <>
              <button
                onClick={() => setViewMode('preview')}
                style={{
                  padding: '4px 10px',
                  fontSize: 12,
                  backgroundColor: viewMode === 'preview' ? 'var(--bg-secondary)' : 'transparent',
                  color: viewMode === 'preview' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-xs)',
                  cursor: 'pointer',
                  fontWeight: viewMode === 'preview' ? 600 : 400,
                }}
              >
                Preview
              </button>
              <button
                onClick={() => setViewMode('code')}
                style={{
                  padding: '4px 10px',
                  fontSize: 12,
                  backgroundColor: viewMode === 'code' ? 'var(--bg-secondary)' : 'transparent',
                  color: viewMode === 'code' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-xs)',
                  cursor: 'pointer',
                  fontWeight: viewMode === 'code' ? 600 : 400,
                }}
              >
                Source Code
              </button>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {!isEditing ? (
            <button
              onClick={handleStartEdit}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-xs)',
                cursor: 'pointer',
              }}
            >
              ✏️ Edit
            </button>
          ) : (
            <button
              onClick={handleSaveEdit}
              style={{
                padding: '4px 12px',
                fontSize: 12,
                backgroundColor: '#16a34a',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-xs)',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Save v{activeArtifact.version + 1}
            </button>
          )}

          <button
            onClick={handleCopy}
            style={{
              padding: '4px 10px',
              fontSize: 12,
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-xs)',
              cursor: 'pointer',
            }}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>

          <button
            onClick={downloadArtifact}
            style={{
              padding: '4px 10px',
              fontSize: 12,
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-xs)',
              cursor: 'pointer',
            }}
          >
            ⬇ Download
          </button>
        </div>
      </div>

      {/* ── Main Content / Editor / Preview ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12, backgroundColor: 'var(--bg-primary)' }}>
        {isEditing ? (
          <textarea
            value={editorContent}
            onChange={(e) => setEditorContent(e.target.value)}
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: 'var(--code-bg)',
              color: 'var(--code-text)',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              lineHeight: 1.55,
              padding: 14,
              border: '1px solid var(--code-border)',
              borderRadius: 'var(--radius-sm)',
              outline: 'none',
              resize: 'none',
            }}
          />
        ) : viewMode === 'preview' && canPreview ? (
          activeArtifact.type === 'html' || activeArtifact.type === 'svg' ? (
            <div
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: '#fff',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
                border: '1px solid var(--border-medium)',
              }}
            >
              <iframe
                srcDoc={activeArtifact.content}
                title={activeArtifact.title}
                sandbox="allow-scripts"
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
            </div>
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: 'var(--bg-card)',
                borderRadius: 'var(--radius-sm)',
                padding: 16,
                overflowY: 'auto',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <MarkdownRenderer content={activeArtifact.content} />
            </div>
          )
        ) : (
          <pre
            style={{
              margin: 0,
              padding: 14,
              backgroundColor: 'var(--code-bg)',
              border: '1px solid var(--code-border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--code-text)',
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.55,
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            <code>{activeArtifact.content}</code>
          </pre>
        )}
      </div>

      {/* ── Iterate Prompt Bar ── */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <form onSubmit={handleIterate} style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="Ask AI to iterate on this canvas..."
            value={iterationPrompt}
            onChange={(e) => setIterationPrompt(e.target.value)}
            style={{
              flex: 1,
              padding: '8px 12px',
              backgroundColor: 'var(--bg-input)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={!iterationPrompt.trim()}
            style={{
              padding: '8px 14px',
              backgroundColor: iterationPrompt.trim() ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
              color: iterationPrompt.trim() ? '#fff' : 'var(--text-muted)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: iterationPrompt.trim() ? 'pointer' : 'default',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Iterate
          </button>
        </form>
      </div>
    </div>
  );
}
