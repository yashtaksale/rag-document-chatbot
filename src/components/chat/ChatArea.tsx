// =============================================================================
// ChatArea Component — Calm, Minimal, Warm Aesthetic (Anthropic / Claude Inspired)
// Features: Centered greeting with suggestion chips on new chat,
// Auto-growing input with "+" action menu, stacked Prompt Queue cards,
// Context token meter, floating scroll-to-bottom button, Rate-limit banner,
// Drag-and-drop file uploader, and Share/Export capabilities.
// =============================================================================

'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat } from '../../hooks/use-chat';
import { useChatStore } from '../../stores/chat-store';
import { useQueueStore } from '../../stores/queue-store';
import { useConversationStore } from '../../stores/conversation-store';
import { useArtifactStore } from '../../stores/artifact-store';
import { useUserStore } from '../../stores/user-store';
import { useUIStore } from '../../stores/ui-store';
import { useDocChatStore } from '../../stores/docchat-store';
import { MessageBubble } from './MessageBubble';
import { PromptQueue } from './PromptQueue';
import { AVAILABLE_MODELS, type Attachment } from '../../lib/types';
import * as db from '../../lib/db';

export function ChatArea() {
  const docchatStore = useDocChatStore();
  const {
    sendMessage,
    stopGeneration,
    regenerate,
    editMessage,
    isStreaming,
    thread,
    queueItems,
    isQueuePaused,
    resumeQueue,
    clearQueue,
    contextTokens,
  } = useChat();

  const convStore = useConversationStore();
  const chatStore = useChatStore();
  const queueStore = useQueueStore();
  const artifactStore = useArtifactStore();
  const userStore = useUserStore();
  const uiStore = useUIStore();

  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showSystemPromptModal, setShowSystemPromptModal] = useState(false);
  const [systemPromptDraft, setSystemPromptDraft] = useState('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);

  const activeConv = convStore.conversations.find((c) => c.id === convStore.activeConversationId);

  // Auto-scroll on thread change or while streaming
  useEffect(() => {
    if (!showScrollBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [thread, isStreaming, showScrollBottom]);

  // Detect if user has scrolled up to show the "Scroll to bottom" button
  const handleScroll = () => {
    if (!messagesScrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesScrollRef.current;
    const isUp = scrollHeight - scrollTop - clientHeight > 140;
    setShowScrollBottom(isUp);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollBottom(false);
  };

  // Close plus menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setShowPlusMenu(false);
      }
    };
    if (showPlusMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPlusMenu]);

  // Dynamic time-of-day greeting
  const greetingText = () => {
    const hour = new Date().getHours();
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    return `${timeGreeting}, ${userStore.user.name || 'there'}`;
  };

  // Revert handlers
  const handleRevertAndEdit = (messageId: string) => {
    const result = chatStore.revertUserMessage(messageId);
    if (result) {
      setInput(result.content);
      if (result.attachments) setAttachments(result.attachments);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const handlePullFromQueue = (item: import('../../lib/types').QueueItem) => {
    const result = queueStore.pullToEditor(item.id);
    if (result) {
      setInput(result.content);
      if (result.attachments) setAttachments(result.attachments);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  // Handle Send / Enqueue
  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() && attachments.length === 0) return;

    if (!convStore.activeConversationId) {
      const conv = convStore.create();
      chatStore.loadMessages(conv.id);
    }

    const messageText = input.trim()
      ? input.trim()
      : `Please analyze and summarize the attached document(s): ${attachments.map((a) => a.fileName).join(', ')}`;

    sendMessage(messageText, attachments);
    setInput('');
    setAttachments([]);
    setAttachmentError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // File Upload Processing
  const processFiles = async (files: FileList | File[]) => {
    setAttachmentError(null);
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const newAttachments: Attachment[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadingFileName(file.name);

      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: 'Upload failed' }));
          setAttachmentError(errData.error || `Failed to process ${file.name}`);
          continue;
        }

        const data: Attachment = await res.json();
        newAttachments.push(data);
      } catch (err) {
        console.error('File upload failed:', err);
        setAttachmentError(`Failed to upload ${file.name}`);
      }
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
    setIsUploading(false);
    setUploadingFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files);
    }
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  // Share Snapshot
  const handleShare = async () => {
    if (!activeConv) return;
    const linearThread = chatStore.getLinearThread();
    const snapshot = db.createShareSnapshot(activeConv, linearThread);

    try {
      await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: activeConv.title,
          model: activeConv.model,
          messages: linearThread,
        }),
      });
    } catch {
      // Local fallback in db already stored
    }

    const url = `${window.location.origin}/share/${snapshot.id}`;
    setShareUrl(url);
    setShowShareModal(true);
  };

  // Export handlers
  const handleExportMarkdown = () => {
    if (!activeConv) return;
    const md = convStore.exportConversationMarkdown(activeConv.id, chatStore.getLinearThread());
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeConv.title.replace(/\s+/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    if (!activeConv) return;
    const json = convStore.exportConversationJSON(activeConv.id, chatStore.getLinearThread());
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeConv.title.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    window.print();
  };

  const suggestionChips = [
    { label: 'Summarize', text: 'Summarize the core findings, methodology, and key takeaways from the attached document' },
    { label: 'Extract Data', text: 'Extract all metrics, dates, financial statistics, and action items with source references' },
    { label: 'Verify Claims', text: 'Cross-reference clauses and verify claims against the document with exact citations' },
    { label: 'Executive Brief', text: 'Synthesize a structured executive briefing memo highlighting critical insights' },
  ];

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: 'var(--bg-primary)',
        position: 'relative',
        minWidth: 0,
      }}
    >
      {/* ── Drag & Drop Overlay ── */}
      {isDragging && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'var(--accent-subtle)',
            backdropFilter: 'blur(4px)',
            border: '2px dashed var(--accent-primary)',
            zIndex: 60,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-primary)',
            gap: 12,
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontSize: 44 }}>📁</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Drop files here to analyze</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            PDF, TXT, DOCX, Code, or Images supported
          </div>
        </div>
      )}

      {/* ── Top Bar ── */}
      <header
        style={{
          padding: '10px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--bg-primary)',
          fontSize: 13,
          minHeight: 52,
          zIndex: 30,
        }}
      >
        {/* Left: Sidebar toggle, Title, Model selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {!uiStore.isSidebarOpen && (
            <button
              onClick={uiStore.toggleSidebar}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 16,
                padding: '4px',
              }}
              title="Open sidebar"
            >
              ☰
            </button>
          )}

          {/* Model Selector Dropdown */}
          <select
            value={activeConv?.model || 'qwen/qwen3.8-27b'}
            onChange={(e) => {
              if (activeConv) convStore.setModel(activeConv.id, e.target.value);
            }}
            style={{
              padding: '5px 10px',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {AVAILABLE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          {/* DocChat RAG Mode Toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: 2,
              gap: 2,
            }}
          >
            <button
              onClick={() => docchatStore.setRagMode('Simple')}
              style={{
                border: 'none',
                padding: '3px 8px',
                borderRadius: 'var(--radius-xs)',
                fontSize: 11.5,
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: docchatStore.ragMode === 'Simple' ? 'var(--accent-primary)' : 'transparent',
                color: docchatStore.ragMode === 'Simple' ? '#fff' : 'var(--text-secondary)',
                transition: 'all 0.15s ease',
              }}
              title="Simple RAG: Fast ChromaDB retrieval with strict grounding"
            >
              ⚡ Simple
            </button>
            <button
              onClick={() => docchatStore.setRagMode('Thinking')}
              style={{
                border: 'none',
                padding: '3px 8px',
                borderRadius: 'var(--radius-xs)',
                fontSize: 11.5,
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: docchatStore.ragMode === 'Thinking' ? 'var(--accent-primary)' : 'transparent',
                color: docchatStore.ragMode === 'Thinking' ? '#fff' : 'var(--text-secondary)',
                transition: 'all 0.15s ease',
              }}
              title="Thinking RAG: Agentic router + chunk grading + OKF knowledge fusion"
            >
              🧠 Thinking
            </button>
          </div>

          {/* DocChat Vault Button */}
          <button
            onClick={() => docchatStore.setIsVaultOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              fontSize: 12,
              cursor: 'pointer',
              fontWeight: 500,
              transition: 'border-color 0.15s ease',
            }}
            title="Open Document Intelligence Vault"
          >
            <span>📁</span>
            <span>Vault ({docchatStore.documentCount})</span>
          </button>

          {/* Incognito Pill */}
          {activeConv?.incognito && (
            <span
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                color: '#dc2626',
                padding: '3px 8px',
                borderRadius: 'var(--radius-xs)',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              🕶️ Incognito (not saved)
            </span>
          )}

          {/* Extended Thinking Active Pill */}
          {activeConv?.extendedThinking && (
            <span
              style={{
                backgroundColor: 'var(--accent-subtle)',
                color: 'var(--accent-primary)',
                padding: '3px 8px',
                borderRadius: 'var(--radius-xs)',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              🧠 Extended Thinking
            </span>
          )}
        </div>

        {/* Right: Context Usage, System Prompt, Export, Share */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Context Meter */}
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            title={`Context Tokens: ${contextTokens.used.toLocaleString()} / ${contextTokens.max.toLocaleString()} (${contextTokens.percent}%)`}
            suppressHydrationWarning
          >
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }} suppressHydrationWarning>
              {Math.round(contextTokens.used / 1000)}k/{Math.round(contextTokens.max / 1000)}k tokens
            </span>
            <div style={{ width: 36, height: 5, backgroundColor: 'var(--border-subtle)', borderRadius: 3, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${contextTokens.percent}%`,
                  height: '100%',
                  backgroundColor: contextTokens.percent > 80 ? '#dc2626' : 'var(--accent-primary)',
                }}
              />
            </div>
          </div>

          {/* System Prompt Modal Trigger */}
          <button
            onClick={() => {
              setSystemPromptDraft(activeConv?.systemPrompt || '');
              setShowSystemPromptModal(true);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 12.5,
              padding: '4px 6px',
            }}
            title="Edit conversation system instructions"
          >
            ⚙️ System
          </button>

          {/* Export Dropdown */}
          <select
            onChange={(e) => {
              if (e.target.value === 'md') handleExportMarkdown();
              if (e.target.value === 'json') handleExportJSON();
              if (e.target.value === 'pdf') handleExportPDF();
              e.target.value = '';
            }}
            defaultValue=""
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-xs)',
              padding: '4px 8px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <option value="" disabled>Export ▾</option>
            <option value="md">Markdown (.md)</option>
            <option value="json">JSON (.json)</option>
            <option value="pdf">Print / PDF</option>
          </select>

          {/* Share Button */}
          <button
            onClick={handleShare}
            style={{
              padding: '5px 12px',
              backgroundColor: 'var(--accent-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontSize: 12.5,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>🔗</span>
            <span>Share</span>
          </button>
        </div>
      </header>

      {/* ── Messages Scroll Area / Home Screen ── */}
      <div
        ref={messagesScrollRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: 'auto', padding: '24px 0', position: 'relative' }}
      >
        {/* ── NEW CHAT / HOME SCREEN (Centered Greeting & Chips) ── */}
        {thread.length === 0 ? (
          <div
            style={{
              maxWidth: 720,
              margin: '0 auto',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '0 24px',
            }}
            className="animate-fade-in"
          >
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              {/* Minimalist Logo Mark */}
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--accent-primary)',
                  color: '#fff',
                  fontSize: 26,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                  boxShadow: 'var(--shadow-card)',
                }}
              >
                ✦
              </div>

              {/* Serif Greeting */}
              <h1
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 32,
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.02em',
                  margin: '0 0 8px',
                }}
              >
                {greetingText()}
              </h1>
              <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>
                DocChat — Hallucination-Resistant RAG Document Intelligence
              </p>
            </div>

            {/* Suggestion Chips */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 10,
                marginTop: 8,
              }}
            >
              {suggestionChips.map((chip) => (
                <div
                  key={chip.label}
                  onClick={() => {
                    setInput(chip.text);
                    setTimeout(() => textareaRef.current?.focus(), 50);
                  }}
                  style={{
                    padding: '12px 14px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--accent-primary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {chip.label}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                    {chip.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Active Chat Thread */
          <div style={{ maxWidth: 740, margin: '0 auto', padding: '0 24px' }}>
            {thread.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isStreaming={isStreaming && msg.id === chatStore.streamingMessageId}
                onRegenerate={() => regenerate(msg.id)}
                onEdit={(newContent) => editMessage(msg.id, newContent)}
                onRevertAndEdit={handleRevertAndEdit}
                onSendFollowup={(q) => sendMessage(q)}
                onSwitchBranch={(targetId) => chatStore.switchBranch(targetId)}
                onFeedback={(rating, comment) => chatStore.setFeedback(msg.id, { rating, comment })}
                siblings={chatStore.getSiblings(msg.id)}
                siblingIndex={chatStore.getSiblingIndex(msg.id)}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Floating "Scroll to bottom" button */}
        {showScrollBottom && (
          <button
            onClick={scrollToBottom}
            style={{
              position: 'fixed',
              bottom: 110,
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '6px 14px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-full)',
              color: 'var(--text-primary)',
              boxShadow: 'var(--shadow-elevated)',
              cursor: 'pointer',
              fontSize: 12.5,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              zIndex: 35,
            }}
            className="animate-slide-down"
          >
            <span>↓</span>
            <span>Scroll to bottom</span>
          </button>
        )}
      </div>

      {/* ── Prompt Queue (Stacked Directly Above Input) ── */}
      {queueItems.length > 0 && (
        <PromptQueue
          items={queueItems}
          isPaused={isQueuePaused}
          onResume={resumeQueue}
          onClear={clearQueue}
          onPullToEditor={handlePullFromQueue}
        />
      )}

      {/* ── Input Box Container ── */}
      <div
        style={{
          padding: '12px 24px 20px',
          backgroundColor: 'var(--bg-primary)',
        }}
      >
        <div
          style={{
            maxWidth: 740,
            margin: '0 auto',
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-card)',
            padding: '10px 14px 8px',
            position: 'relative',
          }}
        >
          {/* Rate Limit Banner (if active) */}
          {userStore.usage.isRateLimited && (
            <div
              style={{
                marginBottom: 8,
                padding: '8px 12px',
                backgroundColor: 'rgba(239, 68, 68, 0.10)',
                color: '#dc2626',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>⚠️ Daily request limit reached. Resets at {new Date(userStore.usage.resetAt).toLocaleTimeString()}</span>
              <button
                onClick={userStore.resetRateLimit}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-primary)',
                  cursor: 'pointer',
                  fontSize: 11.5,
                  fontWeight: 600,
                  textDecoration: 'underline',
                }}
              >
                Reset Quota (Test)
              </button>
            </div>
          )}

          {/* Uploading progress indicator */}
          {isUploading && (
            <div
              style={{
                marginBottom: 8,
                padding: '6px 12px',
                backgroundColor: 'var(--accent-subtle)',
                color: 'var(--accent-primary)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>⏳</span>
              <span>Uploading &amp; extracting text from <strong>{uploadingFileName}</strong>...</span>
            </div>
          )}

          {/* Attachment Chips */}
          {attachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {attachments.map((att, idx) => (
                <div
                  key={att.id}
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <span>📄 {att.fileName}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                    ({Math.round(att.fileSize / 1024)} KB)
                  </span>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-tertiary)',
                      cursor: 'pointer',
                      padding: '0 2px',
                    }}
                    title="Remove attachment"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {attachmentError && (
            <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 6 }}>
              ⚠️ {attachmentError}
            </div>
          )}

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          {/* Auto-growing Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? 'Message will be queued automatically...' : 'Ask anything, explore ideas, or paste files...'}
            rows={2}
            style={{
              width: '100%',
              backgroundColor: 'transparent',
              color: 'var(--text-primary)',
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontSize: 15,
              lineHeight: 1.5,
              fontFamily: 'inherit',
              maxHeight: 180,
            }}
          />

          {/* ── Input Bottom Action Bar ── */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 6,
              paddingTop: 6,
            }}
          >
            {/* Bottom-left: "+" Button and Quick Tools */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }} ref={plusMenuRef}>
              <button
                type="button"
                onClick={() => setShowPlusMenu(!showPlusMenu)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                  fontWeight: 600,
                }}
                title="Add attachment or toggle tools"
              >
                +
              </button>

              {/* Quick toggle pill badges */}
              <button
                type="button"
                onClick={() => activeConv && convStore.toggleTool(activeConv.id, 'web_search')}
                style={{
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: activeConv?.toolsEnabled?.includes('web_search') ? 'var(--accent-subtle)' : 'transparent',
                  color: activeConv?.toolsEnabled?.includes('web_search') ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  fontSize: 11.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
                title="Toggle Web Search citations"
              >
                <span>🌐</span>
                <span>Search</span>
              </button>

              <button
                type="button"
                onClick={() => activeConv && convStore.toggleExtendedThinking(activeConv.id)}
                style={{
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: activeConv?.extendedThinking ? 'var(--accent-subtle)' : 'transparent',
                  color: activeConv?.extendedThinking ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  fontSize: 11.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
                title="Toggle Extended Reasoning Thinking"
              >
                <span>🧠</span>
                <span>Think</span>
              </button>

              {/* "+" Dropdown Popover */}
              {showPlusMenu && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 40,
                    left: 0,
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-elevated)',
                    width: 220,
                    padding: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                    zIndex: 60,
                  }}
                  className="animate-slide-down"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowPlusMenu(false);
                      fileInputRef.current?.click();
                    }}
                    style={{
                      padding: '8px 10px',
                      background: 'none',
                      border: 'none',
                      textAlign: 'left',
                      fontSize: 13,
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-xs)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span>📎</span>
                    <span>Upload Documents &amp; Files</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowPlusMenu(false);
                      docchatStore.setIsVaultOpen(true);
                    }}
                    style={{
                      padding: '8px 10px',
                      background: 'none',
                      border: 'none',
                      textAlign: 'left',
                      fontSize: 13,
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-xs)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span>📁</span>
                    <span>DocChat Document Vault</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (activeConv) convStore.toggleTool(activeConv.id, 'web_search');
                      setShowPlusMenu(false);
                    }}
                    style={{
                      padding: '8px 10px',
                      background: 'none',
                      border: 'none',
                      textAlign: 'left',
                      fontSize: 13,
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-xs)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span>🌐</span>
                    <span>Web Search: {activeConv?.toolsEnabled?.includes('web_search') ? 'Enabled' : 'Disabled'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (activeConv) convStore.toggleExtendedThinking(activeConv.id);
                      setShowPlusMenu(false);
                    }}
                    style={{
                      padding: '8px 10px',
                      background: 'none',
                      border: 'none',
                      textAlign: 'left',
                      fontSize: 13,
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-xs)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span>🧠</span>
                    <span>Thinking: {activeConv?.extendedThinking ? 'ON' : 'OFF'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowPlusMenu(false);
                      setSystemPromptDraft(activeConv?.systemPrompt || '');
                      setShowSystemPromptModal(true);
                    }}
                    style={{
                      padding: '8px 10px',
                      background: 'none',
                      border: 'none',
                      textAlign: 'left',
                      fontSize: 13,
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-xs)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span>⚙️</span>
                    <span>System Prompt</span>
                  </button>
                </div>
              )}
            </div>

            {/* Bottom-right: Model Selector & Terracotta Send/Stop Button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {isStreaming ? (
                <button
                  type="button"
                  onClick={stopGeneration}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: '#dc2626',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    boxShadow: 'var(--shadow-subtle)',
                  }}
                  title="Stop generation (keeps partial output)"
                >
                  ■
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={!input.trim() && attachments.length === 0}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: input.trim() || attachments.length > 0 ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                    color: input.trim() || attachments.length > 0 ? '#fff' : 'var(--text-muted)',
                    border: 'none',
                    cursor: input.trim() || attachments.length > 0 ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    transition: 'all var(--transition-fast)',
                    boxShadow: input.trim() || attachments.length > 0 ? 'var(--shadow-subtle)' : 'none',
                  }}
                  title="Send prompt (Enter)"
                >
                  ↑
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── System Prompt Modal ── */}
      {showSystemPromptModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'var(--bg-overlay)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110,
          }}
          onClick={() => setShowSystemPromptModal(false)}
        >
          <div
            style={{
              width: 480,
              backgroundColor: 'var(--bg-card)',
              padding: 22,
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-medium)',
              boxShadow: 'var(--shadow-modal)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: 16, color: 'var(--text-primary)' }}>
              Conversation System Instructions
            </h3>
            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
              Set specific system instructions and personas for this conversation only.
            </p>
            <textarea
              rows={5}
              placeholder="e.g. You are an expert TypeScript architect. Respond with clean, idiomatic code examples..."
              value={systemPromptDraft}
              onChange={(e) => setSystemPromptDraft(e.target.value)}
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
                onClick={() => setShowSystemPromptModal(false)}
                style={{
                  padding: '6px 14px',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (activeConv) {
                    convStore.updateConv(activeConv.id, { systemPrompt: systemPromptDraft.trim() || undefined });
                  }
                  setShowSystemPromptModal(false);
                }}
                style={{
                  padding: '6px 16px',
                  backgroundColor: 'var(--accent-primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Share Snapshot Modal ── */}
      {showShareModal && shareUrl && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'var(--bg-overlay)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110,
          }}
          onClick={() => setShowShareModal(false)}
        >
          <div
            style={{
              width: 460,
              backgroundColor: 'var(--bg-card)',
              padding: 22,
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-medium)',
              boxShadow: 'var(--shadow-modal)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: 16, color: 'var(--text-primary)' }}>
              Share Conversation Snapshot
            </h3>
            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 14px' }}>
              Anyone with this link can view a read-only snapshot of this chat up to this moment.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                readOnly
                value={shareUrl}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--accent-primary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 12.5,
                }}
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                  setShareCopied(true);
                  setTimeout(() => setShareCopied(false), 2000);
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'var(--accent-primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                {shareCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                onClick={() => setShowShareModal(false)}
                style={{
                  padding: '6px 14px',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
