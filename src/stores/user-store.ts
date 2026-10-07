// =============================================================================
// Zustand Store — User Profile, Settings, & Usage Limits
// =============================================================================

import { create } from 'zustand';
import type { User, UserUsage, PlanTier } from '../lib/types';
import * as db from '../lib/db';

interface UserState {
  user: User;
  usage: UserUsage;
  isSettingsOpen: boolean;

  load: () => void;
  updateUser: (updates: Partial<User>) => void;
  setPlanTier: (tier: PlanTier) => void;
  checkAndRecordUsage: (tokens: number) => boolean; // returns false if rate-limited
  openSettings: () => void;
  closeSettings: () => void;
  resetRateLimit: () => void;
}

export const useUserStore = create<UserState>((set, get) => ({
  user: db.getUser(),
  usage: db.getUserUsage(),
  isSettingsOpen: false,

  load: () => {
    const user = db.getUser();
    const usage = db.getUserUsage();
    set({ user, usage });
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
}));
