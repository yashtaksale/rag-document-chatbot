// =============================================================================
// Sidebar Component — Warm minimal aesthetic, date-grouped conversations,
// inline rename, delete confirmation, pin/star, search palette trigger, & theme switcher
// =============================================================================

'use client';

import { useEffect, useState, useRef } from 'react';
import { useConversationStore } from '../../stores/conversation-store';
import { useChatStore } from '../../stores/chat-store';
import { useQueueStore } from '../../stores/queue-store';
import { useProjectStore } from '../../stores/project-store';
import { useUserStore } from '../../stores/user-store';
import { useThemeStore } from '../../stores/theme-store';
import { useUIStore } from '../../stores/ui-store';
import { SettingsModal } from './SettingsModal';
import { DocumentVaultModal } from './DocumentVaultModal';
import { SearchCommandPalette } from '../chat/SearchCommandPalette';
import { AuthModal } from '../auth/AuthModal';
import { DEMO_ACCOUNTS } from '../../lib/db';
import { useDocChatStore } from '../../stores/docchat-store';
import type { Conversation } from '../../lib/types';

export function Sidebar() {
  const convStore = useConversationStore();
  const chatStore = useChatStore();
  const queueStore = useQueueStore();
  const projectStore = useProjectStore();
  const userStore = useUserStore();
  const themeStore = useThemeStore();
  const uiStore = useUIStore();
  const docchatStore = useDocChatStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    if (isUserMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isUserMenuOpen]);

  useEffect(() => {
    setIsMounted(true);
    convStore.load();
    projectStore.load();
    userStore.load();
    themeStore.initTheme();
    docchatStore.fetchVault();

    // Global keyboard shortcut for search palette (Ctrl+K or Cmd+K)
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        uiStore.openCommandPalette();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNewChat = () => {
    const conv = convStore.create();
    chatStore.clear();
    chatStore.loadMessages(conv.id);
    queueStore.load(conv.id);
  };

  const handleNewIncognitoChat = () => {
    const conv = convStore.createIncognito();
    chatStore.clear();
    chatStore.loadMessages(conv.id);
    queueStore.load(conv.id);
  };

  const handleSelect = (id: string) => {
    convStore.select(id);
    chatStore.clear();
    chatStore.loadMessages(id);
    queueStore.load(id);
  };

  const handleRename = (id: string) => {
    if (editTitle.trim()) {
      convStore.rename(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const confirmDelete = (id: string) => {
    convStore.remove(id);
    setDeleteConfirmId(null);
    if (convStore.activeConversationId === id) {
      chatStore.clear();
    }
  };

  if (!uiStore.isSidebarOpen) {
    return null;
  }

  return (
    <>
      <aside
        style={{
          width: 280,
          minWidth: 280,
          borderRight: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          backgroundColor: 'var(--bg-sidebar)',
          userSelect: 'none',
          position: 'relative',
          zIndex: 40,
          transition: 'transform var(--transition-normal), width var(--transition-normal)',
        }}
      >
        {/* ── Brand Logo & New Chat Header ── */}
        <div style={{ padding: '16px 16px 10px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Logo Title Row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Terracotta minimalist starburst/gem logo */}
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--accent-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 16,
                  boxShadow: 'var(--shadow-subtle)',
                }}
              >
                ✦
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 18,
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  color: 'var(--text-primary)',
                }}
              >
                DocChat
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  backgroundColor: 'var(--accent-subtle)',
                  color: 'var(--accent-primary)',
                  border: '1px solid var(--accent-border)',
                  padding: '1px 5px',
                  borderRadius: 'var(--radius-xs)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                RAG
              </span>
            </div>

            {/* Collapse Sidebar Button */}
            <button
              onClick={uiStore.toggleSidebar}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
                padding: '4px 6px',
                borderRadius: 'var(--radius-xs)',
                fontSize: 14,
              }}
              title="Close sidebar"
            >
              ⇤
            </button>
          </div>

          {/* New Chat & Incognito Buttons */}
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button
              onClick={handleNewChat}
              style={{
                flex: 1,
                padding: '9px 14px',
                cursor: 'pointer',
                backgroundColor: 'var(--accent-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontWeight: 600,
                fontSize: 13.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                boxShadow: 'var(--shadow-subtle)',
                transition: 'background-color var(--transition-fast)',
              }}
            >
              <span>+</span>
              <span>New chat</span>
            </button>

            <button
              onClick={handleNewIncognitoChat}
              title="Incognito chat: private session not saved to history or memory"
              style={{
                padding: '9px 12px',
                cursor: 'pointer',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              🕶️
            </button>
          </div>

          {/* Search Trigger Button (Command Palette) */}
          <button
            onClick={uiStore.openCommandPalette}
            style={{
              padding: '8px 12px',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-tertiary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 13,
              marginTop: 2,
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🔍</span>
              <span>Search chats...</span>
            </div>
            <kbd
              style={{
                fontSize: 10.5,
                padding: '1px 5px',
                borderRadius: 'var(--radius-xs)',
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-tertiary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              Ctrl K
            </kbd>
          </button>

          {/* Document Vault Button */}
          <button
            onClick={() => docchatStore.setIsVaultOpen(true)}
            style={{
              padding: '8px 12px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 13,
              marginTop: 2,
              textAlign: 'left',
              transition: 'all var(--transition-fast)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent-primary)';
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-subtle)';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📁</span>
              <span style={{ fontWeight: 500 }}>Document Vault</span>
            </div>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                backgroundColor: 'rgba(217, 107, 67, 0.15)',
                color: 'var(--accent-primary)',
                padding: '1px 6px',
                borderRadius: '8px',
              }}
            >
              {docchatStore.documentCount} docs
            </span>
          </button>
        </div>

        {/* ── Conversation Groups List ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }} suppressHydrationWarning>
          {!isMounted ? null : (
            <>
              {/* Pinned conversations */}
              {convStore.conversations.filter((c) => c.isPinned && !c.isArchived).length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      padding: '6px 10px',
                      fontSize: 11,
                      color: 'var(--text-tertiary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontWeight: 700,
                    }}
                  >
                    Pinned
                  </div>
                  {convStore.conversations
                    .filter((c) => c.isPinned && !c.isArchived)
                    .map((conv) => (
                      <ConversationItemRow
                        key={conv.id}
                        conv={conv}
                        isActive={conv.id === convStore.activeConversationId}
                        isEditing={editingId === conv.id}
                        editTitle={editTitle}
                        onSelect={() => handleSelect(conv.id)}
                        onStartEdit={() => {
                          setEditingId(conv.id);
                          setEditTitle(conv.title);
                        }}
                        onEditChange={setEditTitle}
                        onEditSubmit={() => handleRename(conv.id)}
                        onEditCancel={() => setEditingId(null)}
                        onDelete={() => setDeleteConfirmId(conv.id)}
                        onPin={() => convStore.pin(conv.id)}
                        onArchive={() => convStore.archive(conv.id)}
                      />
                    ))}
                </div>
              )}

              {/* Date-grouped conversations */}
              {convStore.grouped.map((group) => (
                <div key={group.group} style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      padding: '6px 10px',
                      fontSize: 11,
                      color: 'var(--text-tertiary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontWeight: 700,
                    }}
                  >
                    {group.group}
                  </div>
                  {group.conversations
                    .filter((c) => !c.isPinned)
                    .map((conv) => (
                      <ConversationItemRow
                        key={conv.id}
                        conv={conv}
                        isActive={conv.id === convStore.activeConversationId}
                        isEditing={editingId === conv.id}
                        editTitle={editTitle}
                        onSelect={() => handleSelect(conv.id)}
                        onStartEdit={() => {
                          setEditingId(conv.id);
                          setEditTitle(conv.title);
                        }}
                        onEditChange={setEditTitle}
                        onEditSubmit={() => handleRename(conv.id)}
                        onEditCancel={() => setEditingId(null)}
                        onDelete={() => setDeleteConfirmId(conv.id)}
                        onPin={() => convStore.pin(conv.id)}
                        onArchive={() => convStore.archive(conv.id)}
                      />
                    ))}
                </div>
              ))}

              {convStore.conversations.length === 0 && (
                <div style={{ padding: '32px 16px', color: 'var(--text-tertiary)', textAlign: 'center', fontSize: 13 }}>
                  No chats yet. Start a new conversation!
                </div>
              )}
            </>
          )}
        </div>

        {/* ── User Profile & Settings Footer ── */}
        <div
          style={{
            borderTop: '1px solid var(--border-subtle)',
            padding: '10px 14px',
            position: 'relative',
            backgroundColor: 'var(--bg-secondary)',
          }}
          suppressHydrationWarning
        >
          {/* User Popover Menu */}
          {isUserMenuOpen && (
            <div
              ref={userMenuRef}
              style={{
                position: 'absolute',
                bottom: '100%',
                left: '10px',
                right: '10px',
                marginBottom: '8px',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-md, 10px)',
                boxShadow: 'var(--shadow-modal, 0 12px 30px rgba(0,0,0,0.35))',
                zIndex: 90,
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                animation: 'fadeIn 0.15s ease-out',
              }}
            >
              {/* User details header */}
              <div
                style={{
                  padding: '8px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  borderBottom: '1px solid var(--border-subtle)',
                  marginBottom: '4px',
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    backgroundColor: 'var(--accent-primary)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 14,
                    flexShrink: 0,
                  }}
                >
                  {userStore.user.name?.[0] || 'U'}
                </div>
                <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {userStore.user.name}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-tertiary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {userStore.user.email || 'No email attached'}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--accent-subtle)',
                    color: 'var(--accent-primary)',
                    border: '1px solid var(--accent-border)',
                  }}
                >
                  {userStore.user.role || userStore.user.planTier}
                </span>
              </div>

              {/* Fast Account Switcher */}
              <div style={{ padding: '4px 8px 2px' }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                  Switch Account
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {DEMO_ACCOUNTS.map((acc) => {
                    const isCurrent = userStore.user.id === acc.id;
                    return (
                      <button
                        key={acc.id}
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          userStore.switchUser(acc);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '5px 8px',
                          borderRadius: 'var(--radius-xs, 4px)',
                          border: 'none',
                          backgroundColor: isCurrent ? 'var(--accent-subtle)' : 'transparent',
                          color: isCurrent ? 'var(--accent-primary)' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          fontSize: 12,
                          textAlign: 'left',
                          transition: 'background 0.12s ease',
                        }}
                        onMouseEnter={(e) => {
                          if (!isCurrent) e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isCurrent) e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                          <span style={{ fontSize: 11 }}>👤</span>
                          <span style={{ fontWeight: isCurrent ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {acc.name}
                          </span>
                        </div>
                        {isCurrent && <span style={{ fontSize: 12 }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '4px 0' }} />

              {/* Log in with another account */}
              <button
                onClick={() => {
                  setIsUserMenuOpen(false);
                  userStore.openAuthModal('signin');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 10px',
                  borderRadius: 'var(--radius-xs, 4px)',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: 'var(--text-primary)',
                  fontSize: 12.5,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <span>➕</span>
                <span>Add / Log into Another Account</span>
              </button>

              {/* Settings Action */}
              <button
                onClick={() => {
                  setIsUserMenuOpen(false);
                  userStore.openSettings();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 10px',
                  borderRadius: 'var(--radius-xs, 4px)',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: 'var(--text-primary)',
                  fontSize: 12.5,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <span>⚙️</span>
                <span>Settings</span>
              </button>

              <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '4px 0' }} />

              {/* ── SIGN OUT ACTION ── */}
              <button
                onClick={async () => {
                  setIsUserMenuOpen(false);
                  await userStore.signOut();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-xs, 4px)',
                  border: 'none',
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  color: '#ef4444',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.18)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.08)'; }}
              >
                <span>🚪</span>
                <span>Sign Out</span>
              </button>
            </div>
          )}

          {/* Footer Bar Content: Logged in profile or Sign In button */}
          {userStore.user.isAuthenticated ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {/* User badge row */}
              <div
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  flex: 1,
                  minWidth: 0,
                  padding: '4px 6px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                title="Account menu & Sign Out"
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: 'var(--accent-subtle)',
                    color: 'var(--accent-primary)',
                    border: '1px solid var(--accent-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {isMounted ? userStore.user.name?.[0] || 'U' : 'U'}
                </div>
                <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--text-primary)',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {isMounted ? userStore.user.name : 'User'}
                  </div>
                  <div
                    style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}
                    suppressHydrationWarning
                  >
                    {isMounted ? `${userStore.user.planTier} Plan` : 'Free Plan'}
                  </div>
                </div>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 12, marginRight: 2 }}>
                  {isUserMenuOpen ? '▲' : '▼'}
                </span>
              </div>

              {/* Quick Theme Toggle & Settings icon */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <button
                  onClick={themeStore.toggleTheme}
                  title={`Switch to ${themeStore.resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: '6px',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {themeStore.resolvedTheme === 'dark' ? '☀️' : '🌙'}
                </button>

                <button
                  onClick={userStore.openSettings}
                  title="Open Settings"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: '6px',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ⚙️
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => userStore.openAuthModal('signin')}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  backgroundColor: 'var(--accent-primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm, 6px)',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  transition: 'opacity 0.15s ease',
                }}
              >
                <span>🔑</span>
                <span>Sign In to DocChat</span>
              </button>
              <button
                onClick={themeStore.toggleTheme}
                title={`Switch theme`}
                style={{
                  background: 'none',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '7px 8px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  fontSize: 14,
                }}
              >
                {themeStore.resolvedTheme === 'dark' ? '☀️' : '🌙'}
              </button>
            </div>
          )}
        </div>

        {/* Delete Confirmation Modal */}
        {deleteConfirmId && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'var(--bg-overlay)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 150,
            }}
            onClick={() => setDeleteConfirmId(null)}
          >
            <div
              style={{
                width: 340,
                backgroundColor: 'var(--bg-card)',
                padding: 20,
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-medium)',
                boxShadow: 'var(--shadow-modal)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h4 style={{ margin: '0 0 8px', color: 'var(--text-primary)', fontSize: 16 }}>Delete conversation?</h4>
              <p style={{ margin: '0 0 16px', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>
                This will permanently delete this conversation and all its branched messages. This action cannot be undone.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  onClick={() => setDeleteConfirmId(null)}
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
                <button
                  onClick={() => confirmDelete(deleteConfirmId)}
                  style={{
                    padding: '6px 14px',
                    backgroundColor: '#dc2626',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 12.5,
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Global Command Palette Search Modal */}
      <SearchCommandPalette
        isOpen={uiStore.isCommandPaletteOpen}
        onClose={uiStore.closeCommandPalette}
      />

      {/* Settings Modal */}
      <SettingsModal />

      {/* DocChat Document Vault Modal */}
      <DocumentVaultModal
        isOpen={docchatStore.isVaultOpen}
        onClose={() => docchatStore.setIsVaultOpen(false)}
      />

      {/* Auth Modal */}
      <AuthModal />
    </>
  );
}

// ── Individual Conversation Row Item ─────────────────────────────────────────

interface ConversationItemRowProps {
  conv: Conversation;
  isActive: boolean;
  isEditing: boolean;
  editTitle: string;
  onSelect: () => void;
  onStartEdit: () => void;
  onEditChange: (v: string) => void;
  onEditSubmit: () => void;
  onEditCancel: () => void;
  onDelete: () => void;
  onPin: () => void;
  onArchive: () => void;
}

function ConversationItemRow({
  conv,
  isActive,
  isEditing,
  editTitle,
  onSelect,
  onStartEdit,
  onEditChange,
  onEditSubmit,
  onEditCancel,
  onDelete,
  onPin,
  onArchive,
}: ConversationItemRowProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  return (
    <div
      onClick={onSelect}
      style={{
        padding: '7px 10px',
        cursor: 'pointer',
        backgroundColor: isActive ? 'var(--bg-secondary)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'relative',
        borderRadius: 'var(--radius-sm)',
        marginBottom: 2,
        transition: 'background-color var(--transition-fast)',
      }}
      onMouseEnter={() => setShowMenu(true)}
      onMouseLeave={() => setShowMenu(false)}
    >
      {isEditing ? (
        <input
          value={editTitle}
          onChange={(e) => onEditChange(e.target.value)}
          onBlur={onEditSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEditSubmit();
            if (e.key === 'Escape') onEditCancel();
          }}
          autoFocus
          style={{
            flex: 1,
            backgroundColor: 'var(--bg-input)',
            color: 'var(--text-primary)',
            border: '1px solid var(--accent-primary)',
            borderRadius: 'var(--radius-xs)',
            padding: '2px 6px',
            outline: 'none',
            fontSize: 13,
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 13,
            color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: isActive ? 500 : 400,
          }}
        >
          {conv.isPinned && '📌 '}
          {conv.incognito && '🕶️ '}
          {conv.title}
        </span>
      )}

      {/* "..." More actions menu button */}
      {(showMenu || menuOpen) && !isEditing && (
        <div style={{ position: 'relative' }} ref={menuRef} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: 13,
              padding: '2px 6px',
              borderRadius: 'var(--radius-xs)',
            }}
            title="Options"
          >
            ···
          </button>

          {/* Dropdown Menu */}
          {menuOpen && (
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: 24,
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                boxShadow: 'var(--shadow-elevated)',
                width: 140,
                zIndex: 60,
                padding: '4px',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onStartEdit();
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  textAlign: 'left',
                  padding: '6px 8px',
                  fontSize: 12,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-xs)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>✏️</span>
                <span>Rename</span>
              </button>

              <button
                onClick={() => {
                  setMenuOpen(false);
                  onPin();
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  textAlign: 'left',
                  padding: '6px 8px',
                  fontSize: 12,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-xs)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>📌</span>
                <span>{conv.isPinned ? 'Unpin' : 'Pin'}</span>
              </button>

              <button
                onClick={() => {
                  setMenuOpen(false);
                  onArchive();
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  textAlign: 'left',
                  padding: '6px 8px',
                  fontSize: 12,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-xs)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>📦</span>
                <span>{conv.isArchived ? 'Unarchive' : 'Archive'}</span>
              </button>

              <button
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  textAlign: 'left',
                  padding: '6px 8px',
                  fontSize: 12,
                  color: '#dc2626',
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-xs)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>🗑️</span>
                <span>Delete</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
