// =============================================================================
// Login & Account Management Page — Route: /login
// =============================================================================

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUserStore } from '../../stores/user-store';
import { DEMO_ACCOUNTS } from '../../lib/db';

export default function LoginPage() {
  const router = useRouter();
  const { user, signIn, signUp, signOut, switchUser, isLoadingAuth, authError } = useUserStore();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');

  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const isAuth = isMounted && user.isAuthenticated;
  const displayName = isMounted && user.isAuthenticated ? (user.name || 'User') : 'Guest (Not Signed In)';
  const displayInitial = isMounted && user.isAuthenticated ? (user.name?.[0] || 'U') : 'G';
  const displaySubtitle = isMounted
    ? user.isAuthenticated
      ? user.email || `${user.planTier} plan`
      : 'Please sign in or select demo user'
    : 'Please sign in or select demo user';

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameOrEmail.trim()) return;
    setActionNotice(null);
    const ok = await signIn(usernameOrEmail.trim(), password);
    if (ok) {
      router.push('/');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regUsername.trim() || !regEmail.trim() || !regPassword.trim()) return;
    setActionNotice(null);
    const ok = await signUp(regUsername.trim(), regEmail.trim(), regPassword);
    if (ok) {
      router.push('/');
    }
  };

  const handleDemoSwitch = (demo: typeof DEMO_ACCOUNTS[0]) => {
    switchUser(demo);
    setActionNotice(`Switched to account: ${demo.name}`);
  };

  const handleSignOut = async () => {
    await signOut();
    setActionNotice('You have been signed out.');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-primary, #0f1117)',
        color: 'var(--text-primary, #f3f4f6)',
        padding: '24px 16px',
        position: 'relative',
        fontFamily: 'var(--font-sans, system-ui, -apple-system, sans-serif)',
      }}
    >
      {/* Background Ambient Glow */}
      <div
        style={{
          position: 'absolute',
          top: '15%',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(217, 107, 67, 0.12) 0%, rgba(0, 0, 0, 0) 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Main Container Card */}
      <div
        style={{
          width: 480,
          maxWidth: '100%',
          backgroundColor: 'var(--bg-card, #161822)',
          borderRadius: 'var(--radius-lg, 16px)',
          border: '1px solid var(--border-medium, #282b3c)',
          boxShadow: 'var(--shadow-modal, 0 25px 50px rgba(0,0,0,0.5))',
          overflow: 'hidden',
          zIndex: 1,
          position: 'relative',
        }}
      >
        {/* Top Header */}
        <div
          style={{
            padding: '28px 28px 20px',
            borderBottom: '1px solid var(--border-subtle, #232635)',
            backgroundColor: 'var(--bg-secondary, #1a1d2b)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: 'var(--accent-primary, #D96B43)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  fontWeight: 800,
                  boxShadow: '0 4px 12px rgba(217, 107, 67, 0.35)',
                }}
              >
                D
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary, #fff)' }}>
                  DocChat Authentication
                </h1>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary, #9ca3af)' }}>
                  Tenant Session & Document Vault Access
                </p>
              </div>
            </div>

            <Link
              href="/"
              style={{
                fontSize: 12.5,
                color: 'var(--accent-primary, #D96B43)',
                textDecoration: 'none',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>← Back to Chat</span>
            </Link>
          </div>

          {/* Current Active Session Status Banner */}
          <div
            suppressHydrationWarning
            style={{
              marginTop: 12,
              padding: '10px 14px',
              backgroundColor: isAuth ? 'rgba(34, 197, 94, 0.08)' : 'rgba(156, 163, 175, 0.08)',
              border: `1px solid ${isAuth ? 'rgba(34, 197, 94, 0.25)' : 'var(--border-subtle, #232635)'}`,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  backgroundColor: isAuth ? 'var(--accent-primary, #D96B43)' : '#4b5563',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {displayInitial}
              </div>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary, #fff)' }}>
                  {displayName}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary, #9ca3af)' }}>
                  {displaySubtitle}
                </div>
              </div>
            </div>

            {isAuth ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Link
                  href="/"
                  style={{
                    padding: '5px 10px',
                    backgroundColor: 'var(--accent-primary, #D96B43)',
                    color: '#fff',
                    borderRadius: 6,
                    fontSize: 11.5,
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  Go to Chat
                </Link>
                <button
                  onClick={handleSignOut}
                  style={{
                    padding: '5px 10px',
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 6,
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--text-tertiary, #9ca3af)', fontWeight: 600 }}>
                Signed Out
              </span>
            )}
          </div>
        </div>

        {/* Tab Selection */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-subtle, #232635)',
            backgroundColor: 'var(--bg-secondary, #1a1d2b)',
          }}
        >
          <button
            onClick={() => setMode('signin')}
            style={{
              flex: 1,
              padding: '12px 16px',
              fontSize: 13,
              fontWeight: mode === 'signin' ? 700 : 400,
              color: mode === 'signin' ? 'var(--accent-primary, #D96B43)' : 'var(--text-secondary, #9ca3af)',
              borderBottom: mode === 'signin' ? '2px solid var(--accent-primary, #D96B43)' : '2px solid transparent',
              background: 'none',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
            }}
          >
            Sign In
          </button>
          <button
            onClick={() => setMode('signup')}
            style={{
              flex: 1,
              padding: '12px 16px',
              fontSize: 13,
              fontWeight: mode === 'signup' ? 700 : 400,
              color: mode === 'signup' ? 'var(--accent-primary, #D96B43)' : 'var(--text-secondary, #9ca3af)',
              borderBottom: mode === 'signup' ? '2px solid var(--accent-primary, #D96B43)' : '2px solid transparent',
              background: 'none',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
            }}
          >
            Create New Account
          </button>
        </div>

        {/* Notices and Alerts */}
        {actionNotice && (
          <div
            style={{
              margin: '16px 24px 0',
              padding: '10px 14px',
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: 6,
              color: '#22c55e',
              fontSize: 12.5,
            }}
          >
            ✓ {actionNotice}
          </div>
        )}

        {authError && (
          <div
            style={{
              margin: '16px 24px 0',
              padding: '10px 14px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 6,
              color: '#ef4444',
              fontSize: 12.5,
            }}
          >
            ⚠️ {authError}
          </div>
        )}

        {/* Form Body */}
        <div style={{ padding: '24px' }}>
          {mode === 'signin' ? (
            <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #9ca3af)', marginBottom: 6 }}>
                  Username or Email
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. demo, admin, or demo@docchat.ai"
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--border-subtle, #282b3c)',
                    backgroundColor: 'var(--bg-secondary, #1a1d2b)',
                    color: 'var(--text-primary, #fff)',
                    fontSize: 13.5,
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #9ca3af)' }}>
                    Password
                  </label>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary, #6b7280)' }}>
                    Default demo password: <code style={{ color: 'var(--accent-primary, #D96B43)' }}>demo123</code>
                  </span>
                </div>
                <input
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--border-subtle, #282b3c)',
                    backgroundColor: 'var(--bg-secondary, #1a1d2b)',
                    color: 'var(--text-primary, #fff)',
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
                  padding: '12px 18px',
                  backgroundColor: 'var(--accent-primary, #D96B43)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
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
            <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #9ca3af)', marginBottom: 6 }}>
                  Username
                </label>
                <input
                  type="text"
                  required
                  placeholder="Choose username"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--border-subtle, #282b3c)',
                    backgroundColor: 'var(--bg-secondary, #1a1d2b)',
                    color: 'var(--text-primary, #fff)',
                    fontSize: 13.5,
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #9ca3af)', marginBottom: 6 }}>
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--border-subtle, #282b3c)',
                    backgroundColor: 'var(--bg-secondary, #1a1d2b)',
                    color: 'var(--text-primary, #fff)',
                    fontSize: 13.5,
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #9ca3af)', marginBottom: 6 }}>
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
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--border-subtle, #282b3c)',
                    backgroundColor: 'var(--bg-secondary, #1a1d2b)',
                    color: 'var(--text-primary, #fff)',
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
                  padding: '12px 18px',
                  backgroundColor: 'var(--accent-primary, #D96B43)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
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
          <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--border-subtle, #232635)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-tertiary, #9ca3af)' }}>
                1-Click Fast Switch Demo Accounts
              </span>
              <span style={{ fontSize: 11, color: 'var(--accent-primary, #D96B43)', fontWeight: 600 }}>
                Instant Login
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {DEMO_ACCOUNTS.map((acc) => {
                const isCurrent = isMounted && user.id === acc.id;
                return (
                  <button
                    key={acc.id}
                    onClick={() => handleDemoSwitch(acc)}
                    suppressHydrationWarning
                    style={{
                      padding: '10px 12px',
                      backgroundColor: isCurrent ? 'var(--accent-subtle, rgba(217, 107, 67, 0.12))' : 'var(--bg-secondary, #1a1d2b)',
                      border: `1px solid ${isCurrent ? 'var(--accent-primary, #D96B43)' : 'var(--border-subtle, #282b3c)'}`,
                      borderRadius: 8,
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        backgroundColor: isCurrent ? 'var(--accent-primary, #D96B43)' : 'rgba(255,255,255,0.1)',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {acc.name[0]}
                    </div>
                    <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: 'var(--text-primary, #fff)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {acc.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary, #9ca3af)' }}>
                        {acc.role} {isCurrent && '· (Active)'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
