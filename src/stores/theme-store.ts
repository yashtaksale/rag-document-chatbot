// =============================================================================
// Theme Store — Light / Dark / System Theme Management
// =============================================================================

import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  initTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'dark',
  resolvedTheme: 'dark',

  initTheme: () => {
    if (typeof window === 'undefined') return;
    const stored = (localStorage.getItem('chat_theme') as ThemeMode) || 'system';
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolved = stored === 'system' ? (prefersDark ? 'dark' : 'light') : stored;

    document.documentElement.setAttribute('data-theme', resolved);
    set({ theme: stored, resolvedTheme: resolved });

    // Listen for OS theme changes if on system
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (e: MediaQueryListEvent) => {
      if (get().theme === 'system') {
        const nextResolved = e.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', nextResolved);
        set({ resolvedTheme: nextResolved });
      }
    };
    mediaQuery.addEventListener('change', listener);
  },

  setTheme: (theme: ThemeMode) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('chat_theme', theme);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolved = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;
    document.documentElement.setAttribute('data-theme', resolved);
    set({ theme, resolvedTheme: resolved });
  },

  toggleTheme: () => {
    const current = get().resolvedTheme;
    const next = current === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },
}));
