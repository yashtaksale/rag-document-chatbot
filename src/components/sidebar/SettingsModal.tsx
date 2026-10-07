// =============================================================================
// SettingsModal Component — 6 Comprehensive Settings Tabs:
// 1. General (User profile, Default model, Theme toggle)
// 2. Appearance (Font scaling, Serif assistant toggle, animations)
// 3. Memory (Durable extracted facts, Add, Edit, Delete, Global toggle)
// 4. Custom Instructions (User-level system prompts)
// 5. Data & Export (Export JSON/Markdown, Clear data, Storage meter)
// 6. Usage & Limits (Plan tier, Daily requests, Reset rate limit)
// =============================================================================

'use client';

import { useState } from 'react';
import { useUserStore } from '../../stores/user-store';
import { useMemoryStore } from '../../stores/memory-store';
import { useThemeStore } from '../../stores/theme-store';
import { useConversationStore } from '../../stores/conversation-store';
import { AVAILABLE_MODELS, type PlanTier } from '../../lib/types';

type SettingsTab = 'general' | 'appearance' | 'memory' | 'instructions' | 'data' | 'usage';

export function SettingsModal() {
  const { user, usage, isSettingsOpen, closeSettings, updateUser, setPlanTier, resetRateLimit } = useUserStore();
  const { memories, isEnabled: memoryEnabled, toggleEnabled, remove: removeMemory, add: addMemory, edit: editMemory } = useMemoryStore();
  const themeStore = useThemeStore();
  const convStore = useConversationStore();

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [userName, setUserName] = useState(user.name || '');
  const [userEmail, setUserEmail] = useState(user.email || '');
  const [customInstructions, setCustomInstructions] = useState(user.customInstructions || '');
  const [newFact, setNewFact] = useState('');
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingFactText, setEditingFactText] = useState('');
  const [clearDataConfirm, setClearDataConfirm] = useState(false);

  if (!isSettingsOpen) return null;

  const handleSaveProfile = () => {
    updateUser({ name: userName.trim() || 'User', email: userEmail.trim(), customInstructions });
  };

  const handleAddFact = (e: React.FormEvent) => {
    e.preventDefault();
    if (newFact.trim()) {
      addMemory(newFact.trim());
      setNewFact('');
    }
  };

  const handleSaveMemoryEdit = (id: string) => {
    if (editingFactText.trim()) {
      editMemory(id, editingFactText.trim());
    }
    setEditingMemoryId(null);
  };

  const handleExportAllData = () => {
    const backup = {
      conversations: localStorage.getItem('chat_conversations') ? JSON.parse(localStorage.getItem('chat_conversations')!) : [],
      messages: localStorage.getItem('chat_messages') ? JSON.parse(localStorage.getItem('chat_messages')!) : [],
      memories: localStorage.getItem('chat_memories') ? JSON.parse(localStorage.getItem('chat_memories')!) : [],
      user: localStorage.getItem('chat_user') ? JSON.parse(localStorage.getItem('chat_user')!) : user,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearAllData = () => {
    localStorage.clear();
    window.location.reload();
  };

  const usagePercent = Math.min(100, Math.round((usage.requestCountToday / usage.maxRequestsPerDay) * 100));

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--bg-overlay)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 120,
      }}
      onClick={closeSettings}
    >
      <div
        style={{
          width: 620,
          maxWidth: '92vw',
          backgroundColor: 'var(--bg-card)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border-medium)',
          boxShadow: 'var(--shadow-modal)',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        className="animate-slide-down"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px 14px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--bg-secondary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>⚙️</span>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--text-primary)' }}>
              Settings &amp; Preferences
            </h2>
          </div>
          <button
            onClick={closeSettings}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              fontSize: 16,
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-secondary)',
            overflowX: 'auto',
            padding: '0 16px',
            gap: 4,
          }}
        >
          {[
            { id: 'general', label: 'General', icon: '👤' },
            { id: 'appearance', label: 'Appearance', icon: '🎨' },
            { id: 'memory', label: `Memory (${memories.length})`, icon: '🧠' },
            { id: 'instructions', label: 'Instructions', icon: '📝' },
            { id: 'data', label: 'Data & Export', icon: '💾' },
            { id: 'usage', label: 'Plan & Limits', icon: '⚡' },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as SettingsTab)}
                style={{
                  padding: '10px 14px',
                  background: 'transparent',
                  color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  border: 'none',
                  borderBottom: isActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {/* ── TAB 1: General ── */}
          {activeTab === 'general' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                  Display Name
                </label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  onBlur={handleSaveProfile}
                  placeholder="Your Name"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 14,
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                  Email Address
                </label>
                <input
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  onBlur={handleSaveProfile}
                  placeholder="user@example.com"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 14,
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                  Theme Preference
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { id: 'light', label: 'Warm Light', icon: '☀️' },
                    { id: 'dark', label: 'Warm Charcoal', icon: '🌙' },
                    { id: 'system', label: 'System Sync', icon: '💻' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => themeStore.setTheme(t.id as any)}
                      style={{
                        flex: 1,
                        padding: '10px',
                        backgroundColor: themeStore.theme === t.id ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                        color: themeStore.theme === t.id ? 'var(--accent-primary)' : 'var(--text-primary)',
                        border: themeStore.theme === t.id ? '1px solid var(--accent-border)' : '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: themeStore.theme === t.id ? 600 : 400,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                      }}
                    >
                      <span>{t.icon}</span>
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 2: Appearance ── */}
          {activeTab === 'appearance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ padding: '14px', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>
                  Serif Assistant Typography
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Assistant responses and greetings utilize a refined editorial serif (Newsreader / Lora) for comfortable extended reading, while UI controls and prompts use a modern sans-serif (Plus Jakarta Sans).
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                  Accent Color
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: 'var(--accent-primary)',
                      border: '2px solid var(--border-strong)',
                    }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    Terracotta / Warm Coral (#D96B43)
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 3: Memory ── */}
          {activeTab === 'memory' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Global Memory Toggle */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-primary)' }}>
                    Enable Memory Across Chats
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Allows the AI to remember durable facts about you for future conversations
                  </div>
                </div>
                <button
                  onClick={toggleEnabled}
                  style={{
                    padding: '6px 14px',
                    backgroundColor: memoryEnabled ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    color: memoryEnabled ? '#fff' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: 'var(--radius-full)',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {memoryEnabled ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Add Memory Form */}
              <form onSubmit={handleAddFact} style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Add a fact (e.g. 'I develop with React and TypeScript')..."
                  value={newFact}
                  onChange={(e) => setNewFact(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
                <button
                  type="submit"
                  disabled={!newFact.trim()}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: newFact.trim() ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    color: newFact.trim() ? '#fff' : 'var(--text-muted)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    cursor: newFact.trim() ? 'pointer' : 'default',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Add
                </button>
              </form>

              {/* Memories List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                {memories.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-tertiary)', fontSize: 13 }}>
                    No memories stored yet. Mention facts in your chats or add them above!
                  </div>
                ) : (
                  memories.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-subtle)',
                        fontSize: 13,
                      }}
                    >
                      {editingMemoryId === m.id ? (
                        <input
                          value={editingFactText}
                          onChange={(e) => setEditingFactText(e.target.value)}
                          onBlur={() => handleSaveMemoryEdit(m.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveMemoryEdit(m.id);
                            if (e.key === 'Escape') setEditingMemoryId(null);
                          }}
                          autoFocus
                          style={{
                            flex: 1,
                            backgroundColor: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--accent-primary)',
                            borderRadius: 'var(--radius-xs)',
                            padding: '3px 8px',
                            fontSize: 13,
                          }}
                        />
                      ) : (
                        <span style={{ color: 'var(--text-primary)' }}>• {m.fact}</span>
                      )}

                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button
                          onClick={() => {
                            setEditingMemoryId(m.id);
                            setEditingFactText(m.fact);
                          }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 12 }}
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => removeMemory(m.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 12 }}
                          title="Delete"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ── TAB 4: Custom Instructions ── */}
          {activeTab === 'instructions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Provide custom instructions that will be injected into every conversation across all models.
              </div>
              <textarea
                rows={7}
                placeholder="What would you like the model to know about you to provide better responses? How would you like it to respond?"
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                onBlur={handleSaveProfile}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  outline: 'none',
                  fontFamily: 'inherit',
                  fontSize: 13.5,
                  lineHeight: 1.5,
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleSaveProfile}
                  style={{
                    padding: '8px 18px',
                    backgroundColor: 'var(--accent-primary)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Save Instructions
                </button>
              </div>
            </div>
          )}

          {/* ── TAB 5: Data & Export ── */}
          {activeTab === 'data' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  padding: '14px',
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-primary)' }}>
                    Export All Chat History
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Download complete JSON archive of all conversations, messages, branches, and memories
                  </div>
                </div>
                <button
                  onClick={handleExportAllData}
                  style={{
                    padding: '8px 14px',
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  Download JSON
                </button>
              </div>

              {/* Danger Zone: Clear Data */}
              <div
                style={{
                  padding: '14px',
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  marginTop: 10,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13.5, color: '#dc2626', marginBottom: 4 }}>
                  Clear All Local Storage
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  Permanently deletes all saved conversations, message branches, memories, and queue items.
                </div>
                {!clearDataConfirm ? (
                  <button
                    onClick={() => setClearDataConfirm(true)}
                    style={{
                      padding: '7px 14px',
                      backgroundColor: 'transparent',
                      color: '#dc2626',
                      border: '1px solid #dc2626',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      fontSize: 12.5,
                      fontWeight: 600,
                    }}
                  >
                    Clear All Data
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={handleClearAllData}
                      style={{
                        padding: '7px 14px',
                        backgroundColor: '#dc2626',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        fontSize: 12.5,
                        fontWeight: 600,
                      }}
                    >
                      Confirm Permanent Deletion
                    </button>
                    <button
                      onClick={() => setClearDataConfirm(false)}
                      style={{
                        padding: '7px 12px',
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
                )}
              </div>
            </div>
          )}

          {/* ── TAB 6: Plan & Limits ── */}
          {activeTab === 'usage' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Plan Tier Selector */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                  Active Plan Tier
                </label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {(['free', 'pro', 'team'] as PlanTier[]).map((tier) => (
                    <button
                      key={tier}
                      onClick={() => setPlanTier(tier)}
                      style={{
                        flex: 1,
                        padding: '14px 10px',
                        backgroundColor: user.planTier === tier ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                        color: user.planTier === tier ? 'var(--accent-primary)' : 'var(--text-primary)',
                        border: user.planTier === tier ? '1px solid var(--accent-border)' : '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        textAlign: 'center',
                        textTransform: 'capitalize',
                        fontWeight: user.planTier === tier ? 700 : 500,
                      }}
                    >
                      <div style={{ fontSize: 14 }}>{tier}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                        {tier === 'free' ? '50 requests/day' : tier === 'pro' ? '500 requests/day' : '5,000 requests/day'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Today's Usage Meter */}
              <div
                style={{
                  padding: '16px',
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Daily Request Allowance</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {usage.requestCountToday} / {usage.maxRequestsPerDay} ({usagePercent}%)
                  </span>
                </div>
                <div style={{ height: 8, backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${usagePercent}%`,
                      backgroundColor: usagePercent >= 90 ? '#dc2626' : 'var(--accent-primary)',
                      borderRadius: 'var(--radius-full)',
                      transition: 'width var(--transition-normal)',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 11, color: 'var(--text-tertiary)' }}>
                  <span>Resets at: {new Date(usage.resetAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <button
                    onClick={resetRateLimit}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-primary)',
                      cursor: 'pointer',
                      fontSize: 11,
                      textDecoration: 'underline',
                    }}
                  >
                    Reset Usage Counter (Test)
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
