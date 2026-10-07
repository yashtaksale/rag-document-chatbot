// =============================================================================
// Share View Page (Read-only conversation snapshot)
// Styled to match the warm Anthropic/Claude aesthetic with export capabilities
// =============================================================================

'use client';

import { use, useEffect, useState } from 'react';
import type { Message, ShareSnapshot } from '../../../lib/types';
import * as db from '../../../lib/db';
import { MarkdownRenderer } from '../../../components/chat/MarkdownRenderer';

export default function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const [snapshot, setSnapshot] = useState<ShareSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Try localStorage first
    const local = db.getShareSnapshot(id);
    if (local) {
      setSnapshot(local);
      setLoading(false);
      return;
    }

    // Otherwise fetch from server
    fetch(`/api/share?id=${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) setSnapshot(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const handlePrintPDF = () => {
    window.print();
  };

  const handleDownloadMD = () => {
    if (!snapshot) return;
    const lines = [
      `# ${snapshot.title}`,
      `*Shared Snapshot created on ${new Date(snapshot.createdAt).toLocaleString()}*`,
      `*Model: ${snapshot.model}*`,
      '',
      '---',
      '',
    ];
    for (const msg of snapshot.messages) {
      lines.push(`### ${msg.role === 'user' ? 'User' : 'Assistant'}`);
      lines.push('');
      lines.push(msg.content);
      lines.push('');
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${snapshot.title.replace(/\s+/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)' }}>
        Loading shared snapshot...
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#dc2626' }}>
        <h3>Shared conversation not found or expired.</h3>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 760,
        margin: '40px auto',
        padding: '0 24px 60px',
        color: 'var(--text-primary)',
      }}
    >
      {/* Header */}
      <div
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: 20,
          marginBottom: 32,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <span
            style={{
              fontSize: 11,
              backgroundColor: 'var(--accent-subtle)',
              color: 'var(--accent-primary)',
              border: '1px solid var(--accent-border)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-xs)',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            Read-Only Snapshot
          </span>
          <h1
            style={{
              fontFamily: 'var(--font-serif)',
              margin: '10px 0 6px',
              fontSize: 26,
              fontWeight: 500,
              color: 'var(--text-primary)',
            }}
          >
            {snapshot.title}
          </h1>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
            Model: {snapshot.model} · Snapshot created: {new Date(snapshot.createdAt).toLocaleDateString()}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleDownloadMD}
            style={{
              padding: '6px 12px',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontSize: 12.5,
            }}
          >
            Download Markdown
          </button>
          <button
            onClick={handlePrintPDF}
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
            Print / PDF
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {snapshot.messages.map((msg: Message) => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              {msg.role === 'user' ? 'User' : 'Assistant'}
            </div>

            {msg.role === 'user' ? (
              <div
                style={{
                  backgroundColor: 'var(--user-bubble-bg)',
                  border: '1px solid var(--user-bubble-border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '12px 18px',
                  maxWidth: '85%',
                  fontSize: 15,
                  lineHeight: 1.6,
                }}
              >
                {msg.content}
              </div>
            ) : (
              <div
                style={{
                  width: '100%',
                  fontFamily: 'var(--font-serif)',
                  fontSize: 17,
                  lineHeight: 1.7,
                }}
              >
                <MarkdownRenderer content={msg.content} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
