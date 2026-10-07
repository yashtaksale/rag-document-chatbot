// =============================================================================
// Component — Document Vault Modal / Drawer
// Connects directly to DocChat's local ChromaDB vector store
// =============================================================================

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useDocChatStore } from '../../stores/docchat-store';
import { useConversationStore } from '../../stores/conversation-store';
import { useChat } from '../../hooks/use-chat';

interface DocumentVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DocumentVaultModal({ isOpen, onClose }: DocumentVaultModalProps) {
  const docchat = useDocChatStore();
  const convStore = useConversationStore();
  const { sendMessage } = useChat();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (isOpen) {
      docchat.fetchVault();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileUpload = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      await docchat.uploadDocument(files[i]);
    }
  };

  const handleQuickPrompt = (promptText: string) => {
    if (!convStore.activeConversationId) {
      convStore.create();
    }
    sendMessage(promptText);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '640px',
          maxHeight: '88vh',
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-card)',
          borderRadius: '16px',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.45)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* ── Modal Header ── */}
        <div
          style={{
            padding: '20px 24px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--bg-secondary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                backgroundColor: 'rgba(217, 107, 67, 0.12)',
                border: '1px solid rgba(217, 107, 67, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
                fontSize: '18px',
              }}
            >
              📁
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '16px',
                    fontWeight: 600,
                    fontFamily: 'var(--font-sans)',
                    color: 'var(--text-primary)',
                  }}
                >
                  Document Intelligence Vault
                </h3>
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 7px',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(217, 107, 67, 0.15)',
                    color: 'var(--accent)',
                    fontWeight: 600,
                  }}
                >
                  ChromaDB
                </span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                Vault 1 &middot; {docchat.documentCount} Document(s) &middot; {docchat.totalVaultChunks} Vector Chunks
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              fontSize: '18px',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        {/* ── Modal Body ── */}
        <div
          style={{
            padding: '20px 24px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          {/* Status / Error Alert */}
          {docchat.error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(240, 112, 112, 0.12)',
                border: '1px solid rgba(240, 112, 112, 0.3)',
                color: '#F07070',
                fontSize: '12px',
              }}
            >
              ⚠️ {docchat.error}
            </div>
          )}

          {/* Upload Progress banner */}
          {docchat.isUploading && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '10px',
                backgroundColor: 'rgba(217, 107, 67, 0.1)',
                border: '1px solid rgba(217, 107, 67, 0.3)',
                color: 'var(--accent)',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <div
                style={{
                  width: '14px',
                  height: '14px',
                  border: '2px solid var(--accent)',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              <span>{docchat.uploadProgress || 'Processing document chunks...'}</span>
            </div>
          )}

          {/* ── Drag & Drop Zone ── */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              if (e.dataTransfer.files) handleFileUpload(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${isDragOver ? 'var(--accent)' : 'var(--border-hover)'}`,
              borderRadius: '12px',
              padding: '24px 16px',
              textAlign: 'center',
              backgroundColor: isDragOver ? 'rgba(217, 107, 67, 0.05)' : 'var(--bg-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files) handleFileUpload(e.target.files);
              }}
            />
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>📄</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Click to browse or drop reference documents here
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
              Supports PDF, DOCX, and TXT &middot; Automatically chunked and embedded in ChromaDB
            </div>
          </div>

          {/* ── Document List ── */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px',
              }}
            >
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-tertiary)',
                }}
              >
                Indexed Reference Files ({docchat.documents.length})
              </span>
              {docchat.documents.length > 0 && !confirmClear && (
                <button
                  onClick={() => setConfirmClear(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-tertiary)',
                    fontSize: '11px',
                    cursor: 'pointer',
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#F07070')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                >
                  Clear Vault
                </button>
              )}
              {confirmClear && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: '#F07070' }}>Confirm clear?</span>
                  <button
                    onClick={async () => {
                      await docchat.clearVault();
                      setConfirmClear(false);
                    }}
                    style={{
                      background: '#F07070',
                      border: 'none',
                      color: '#fff',
                      fontSize: '10px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      fontSize: '10px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    No
                  </button>
                </div>
              )}
            </div>

            {docchat.documents.length === 0 ? (
              <div
                style={{
                  padding: '24px',
                  textAlign: 'center',
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: '10px',
                  color: 'var(--text-tertiary)',
                  fontSize: '13px',
                }}
              >
                No documents in vault yet. Upload files above to ask grounded questions.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {docchat.documents.map((fname) => (
                  <div
                    key={fname}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      transition: 'border-color 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <span style={{ fontSize: '14px' }}>📄</span>
                      <span
                        style={{
                          fontSize: '13px',
                          color: 'var(--text-primary)',
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={fname}
                      >
                        {fname}
                      </span>
                    </div>

                    <button
                      onClick={() => docchat.deleteDocument(fname)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-tertiary)',
                        cursor: 'pointer',
                        padding: '4px 6px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        lineHeight: 1,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#F07070';
                        e.currentTarget.style.backgroundColor = 'rgba(240, 112, 112, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--text-tertiary)';
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                      title={`Delete ${fname}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Quick Starter Actions ── */}
          <div>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-tertiary)',
                marginBottom: '8px',
              }}
            >
              Grounded Analysis Shortcuts
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              {[
                { label: '📋 Executive Summary', prompt: 'Provide a structured executive briefing summarizing all uploaded documents in the vault.' },
                { label: '🔍 Key Metrics & Data', prompt: 'Extract all factual metrics, dates, and quantitative data points from the vault.' },
                { label: '🛡️ Verify Primary Claims', prompt: 'Audit the core factual claims across the documents and cite direct supporting evidence.' },
                { label: '💡 Action Items & Next Steps', prompt: 'Synthesize all action items, recommendations, and next steps documented in the files.' },
              ].map((action) => (
                <button
                  key={action.label}
                  onClick={() => handleQuickPrompt(action.prompt)}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-secondary)',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-subtle)';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Modal Footer ── */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>RAG Engine:</span>
            <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--bg-tertiary)', padding: '2px', borderRadius: '6px' }}>
              <button
                onClick={() => docchat.setRagMode('Simple')}
                style={{
                  padding: '3px 8px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  backgroundColor: docchat.ragMode === 'Simple' ? 'var(--accent)' : 'transparent',
                  color: docchat.ragMode === 'Simple' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                ⚡ Simple
              </button>
              <button
                onClick={() => docchat.setRagMode('Thinking')}
                style={{
                  padding: '3px 8px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  backgroundColor: docchat.ragMode === 'Thinking' ? 'var(--accent)' : 'transparent',
                  color: docchat.ragMode === 'Thinking' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                🧠 Thinking
              </button>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: 'var(--accent)',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
