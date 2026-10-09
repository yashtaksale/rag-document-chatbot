// =============================================================================
// Zustand Store — User Profile, Settings, Authentication & Usage Limits
// =============================================================================

import { create } from 'zustand';
import type { User, UserUsage, PlanTier } from '../lib/types';
import * as db from '../lib/db';
import { useDocChatStore } from './docchat-store';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8001';

interface UserState {
  user: User;
  usage: UserUsage;
  isSettingsOpen: boolean;
  isAuthModalOpen: boolean;
  authModalMode: 'signin' | 'signup';
  isLoadingAuth: boolean;
  authError: string | null;

  load: () => void;
  updateUser: (updates: Partial<User>) => void;
  setPlanTier: (tier: PlanTier) => void;
  checkAndRecordUsage: (tokens: number) => boolean;
  openSettings: () => void;
  closeSettings: () => void;
  resetRateLimit: () => void;

  openAuthModal: (mode?: 'signin' | 'signup') => void;
  closeAuthModal: () => void;
  signIn: (usernameOrEmail: string, password?: string) => Promise<boolean>;
  signUp: (username: string, email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  switchUser: (targetUser: Partial<User>) => void;
}

export const useUserStore = create<UserState>((set, get) => ({
  user: db.getUser(),
  usage: db.getUserUsage(),
  isSettingsOpen: false,
  isAuthModalOpen: false,
  authModalMode: 'signin',
  isLoadingAuth: false,
  authError: null,

  load: () => {
    const user = db.getUser();
    const usage = db.getUserUsage();
    set({ user, usage });
    if (user.id && user.id !== 'guest') {
      const numericId = parseInt(user.id, 10);
      if (!isNaN(numericId)) {
        useDocChatStore.setState({ activeUserId: numericId });
      }
    }
  },

  updateUser: (updates) => {
    const updated = db.updateUser(updates);
    set({ user: updated });
  },

  setPlanTier: (tier) => {
    const user = db.updateUser({ planTier: tier });
    const usage = db.getUserUsage();
    const maxReqs = tier === 'free' ? 50 : tier === 'pro' ? 500 : 5000;
    const updatedUsage = {
      ...usage,
      planTier: tier,
      maxRequestsPerDay: maxReqs,
      isRateLimited: usage.requestCountToday > maxReqs,
    };
    db.recordUserUsage(0);
    set({ user, usage: updatedUsage });
  },

  checkAndRecordUsage: (tokens: number) => {
    const { usage } = get();
    if (usage.isRateLimited) {
      return false;
    }
    const updated = db.recordUserUsage(tokens);
    set({ usage: updated });
    return !updated.isRateLimited;
  },

  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),

  resetRateLimit: () => {
    const usage = db.getUserUsage();
    const updated = {
      ...usage,
      requestCountToday: 0,
      isRateLimited: false,
    };
    set({ usage: updated });
  },

  openAuthModal: (mode = 'signin') => set({ isAuthModalOpen: true, authModalMode: mode, authError: null }),
  closeAuthModal: () => set({ isAuthModalOpen: false, authError: null }),

  signIn: async (usernameOrEmail: string, password = '') => {
    set({ isLoadingAuth: true, authError: null });
    const trimmed = usernameOrEmail.trim();

    try {
      // 1. Try backend authentication if available
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username_or_email: trimmed,
          password: password || 'demo123',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const u = data.user;
        const loggedInUser = db.signInUser(
          {
            id: String(u.id),
            name: u.username,
            email: u.email,
            role: u.role || 'user',
            planTier: u.role === 'admin' ? 'team' : 'pro',
            isAuthenticated: true,
          },
          data.token
        );
        set({ user: loggedInUser, isLoadingAuth: false, isAuthModalOpen: false });
        useDocChatStore.setState({ activeUserId: u.id });
        useDocChatStore.getState().fetchVault();
        return true;
      }

      // If backend responded with 401/400 error
      const errJson = await res.json().catch(() => ({ detail: 'Authentication failed' }));
      throw new Error(errJson.detail || 'Invalid username or password');
    } catch (err: any) {
      // 2. Offline / local fallback matching against DEMO_ACCOUNTS
      const matched = db.DEMO_ACCOUNTS.find(
        (a) =>
          a.email.toLowerCase() === trimmed.toLowerCase() ||
          a.name.toLowerCase() === trimmed.toLowerCase() ||
          a.id === trimmed
      );

      if (matched) {
        const localUser = db.signInUser({
          ...matched,
          isAuthenticated: true,
        });
        set({ user: localUser, isLoadingAuth: false, isAuthModalOpen: false });
        const numId = parseInt(localUser.id, 10);
        if (!isNaN(numId)) {
          useDocChatStore.setState({ activeUserId: numId });
          useDocChatStore.getState().fetchVault();
        }
        return true;
      }

      // If it was a network error and user entered an arbitrary username, log in as new local user
      if (err.message.includes('fetch') || err.message.includes('Failed to fetch')) {
        const localUser = db.signInUser({
          id: String(Date.now()).slice(-4),
          name: trimmed,
          email: `${trimmed.toLowerCase().replace(/\s+/g, '')}@example.com`,
          role: 'user',
          planTier: 'free',
          isAuthenticated: true,
        });
        set({ user: localUser, isLoadingAuth: false, isAuthModalOpen: false });
        return true;
      }

      set({ isLoadingAuth: false, authError: err.message || 'Login failed' });
      return false;
    }
  },

  signUp: async (username: string, email: string, password: string) => {
    set({ isLoadingAuth: true, authError: null });
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim(),
          password,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const u = data.user;
        const loggedInUser = db.signInUser(
          {
            id: String(u.id),
            name: u.username,
            email: u.email,
            role: u.role || 'user',
            planTier: 'free',
            isAuthenticated: true,
          },
          data.token
        );
        set({ user: loggedInUser, isLoadingAuth: false, isAuthModalOpen: false });
        useDocChatStore.setState({ activeUserId: u.id });
        useDocChatStore.getState().fetchVault();
        return true;
      }

      const errJson = await res.json().catch(() => ({ detail: 'Registration failed' }));
      throw new Error(errJson.detail || 'Could not create account');
    } catch (err: any) {
      if (err.message.includes('fetch') || err.message.includes('Failed to fetch')) {
        // Offline fallback
        const localUser = db.signInUser({
          id: String(Date.now()).slice(-4),
          name: username.trim(),
          email: email.trim(),
          role: 'user',
          planTier: 'free',
          isAuthenticated: true,
        });
        set({ user: localUser, isLoadingAuth: false, isAuthModalOpen: false });
        return true;
      }
      set({ isLoadingAuth: false, authError: err.message || 'Registration failed' });
      return false;
    }
  },

  signOut: async () => {
    const current = get().user;
    if (current.token) {
      try {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: current.token }),
        });
      } catch {
        // Best effort
      }
    }
    const signedOut = db.signOutUser();
    set({
      user: signedOut,
      isSettingsOpen: false,
    });
    useDocChatStore.setState({
      activeUserId: 0,
      documents: [],
      documentCount: 0,
    });
  },

  switchUser: (targetUser: Partial<User>) => {
    const loggedIn = db.signInUser(
      {
        ...targetUser,
        isAuthenticated: true,
      },
      targetUser.token || ''
    );
    set({ user: loggedIn, isSettingsOpen: false });
    const numId = parseInt(loggedIn.id, 10);
    if (!isNaN(numId)) {
      useDocChatStore.setState({ activeUserId: numId });
      useDocChatStore.getState().fetchVault();
    }
  },
}));
