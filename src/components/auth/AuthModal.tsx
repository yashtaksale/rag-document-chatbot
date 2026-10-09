// =============================================================================
// AuthModal Component — Sign In, Registration, & Fast Account Switcher
// =============================================================================

'use client';

import { useState } from 'react';
import { useUserStore } from '../../stores/user-store';
import { DEMO_ACCOUNTS } from '../../lib/db';

export function AuthModal() {
  const {
    isAuthModalOpen,
    authModalMode,
    isLoadingAuth,
    authError,
    closeAuthModal,
    openAuthModal,
    signIn,
    signUp,
    switchUser,
  } = useUserStore();

  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');

  if (!isAuthModalOpen) return null;

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameOrEmail.trim()) return;
    await signIn(usernameOrEmail.trim(), password);
  };

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regUsername.trim() || !regEmail.trim() || !regPassword.trim()) return;
    await signUp(regUsername.trim(), regEmail.trim(), regPassword);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--bg-overlay, rgba(0, 0, 0, 0.65))',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: 16,
      }}
      onClick={closeAuthModal}
    >
      <div
        style={{
          width: 440,
          maxWidth: '100%',
          backgroundColor: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg, 12px)',
          border: '1px solid var(--border-medium)',
          boxShadow: 'var(--shadow-modal, 0 20px 40px rgba(0,0,0,0.4))',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          animation: 'fadeIn 0.2s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
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
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              {authModalMode === 'signin' ? 'Sign in to DocChat' : 'Create an Account'}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>
              {authModalMode === 'signin'
                ? 'Access your private ChromaDB vault and chat history'
                : 'Start organizing your documents with agentic AI'}
            </p>
          </div>
          <button
            onClick={closeAuthModal}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 18,
              cursor: 'pointer',
              color: 'var(--text-tertiary)',
              padding: '4px 8px',
              borderRadius: 'var(--radius-xs, 4px)',
            }}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-secondary)',
          }}
        >
          <button
            onClick={() => openAuthModal('signin')}
            style={{
              flex: 1,
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: authModalMode === 'signin' ? 600 : 400,
              color: authModalMode === 'signin' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              borderBottom: authModalMode === 'signin' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              background: 'none',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Sign In
          </button>
          <button
            onClick={() => openAuthModal('signup')}
            style={{
              flex: 1,
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: authModalMode === 'signup' ? 600 : 400,
              color: authModalMode === 'signup' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              borderBottom: authModalMode === 'signup' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              background: 'none',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Create Account
          </button>
        </div>

        {/* Error Alert */}
        {authError && (
          <div
            style={{
              margin: '16px 24px 0',
              padding: '10px 14px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-sm, 6px)',
              color: '#ef4444',
              fontSize: 12.5,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>⚠️</span>
            <span>{authError}</span>
          </div>
        )}

        {/* Form Body */}
        <div style={{ padding: '20px 24px' }}>
          {authModalMode === 'signin' ? (
            <form onSubmit={handleSignInSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Username or Email
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. demo or demo@docchat.ai"
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    border: '1px solid var(--border-subtle)',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: 13.5,
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Password
                  </label>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    Default password: <code style={{ color: 'var(--accent-primary)' }}>demo123</code>
                  </span>
                </div>
                <input
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    border: '1px solid var(--border-subtle)',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: 13.5,
                    outline: 'none',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={isLoadingAuth}
                style={{
                  marginTop: 6,
                  padding: '10px 16px',
                  backgroundColor: 'var(--accent-primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm, 6px)',
                  fontSize: 13.5,
                  fontWeight: 600,
                  cursor: isLoadingAuth ? 'not-allowed' : 'pointer',
                  opacity: isLoadingAuth ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {isLoadingAuth ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignUpSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Username
                </label>
                <input
                  type="text"
                  required
                  placeholder="Choose a username"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    border: '1px solid var(--border-subtle)',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: 13.5,
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    border: '1px solid var(--border-subtle)',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: 13.5,
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="At least 6 characters"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    border: '1px solid var(--border-subtle)',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: 13.5,
                    outline: 'none',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={isLoadingAuth}
                style={{
                  marginTop: 6,
                  padding: '10px 16px',
                  backgroundColor: 'var(--accent-primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm, 6px)',
                  fontSize: 13.5,
                  fontWeight: 600,
                  cursor: isLoadingAuth ? 'not-allowed' : 'pointer',
                  opacity: isLoadingAuth ? 0.7 : 1,
                }}
              >
                {isLoadingAuth ? 'Creating account...' : 'Create Account'}
              </button>
            </form>
          )}

          {/* Quick Demo Switcher Section */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-tertiary)', marginBottom: 10 }}>
              1-Click Fast Switch (Demo Accounts)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => {
                    switchUser(acc);
                    closeAuthModal();
                  }}
                  style={{
                    padding: '8px 10px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm, 6px)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent-primary)';
                    e.currentTarget.style.backgroundColor = 'var(--accent-subtle)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-subtle)';
                    e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                  }}
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      backgroundColor: 'var(--accent-primary)',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {acc.name[0]}
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {acc.name}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
                      {acc.role}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
