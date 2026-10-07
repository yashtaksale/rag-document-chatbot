// =============================================================================
// UI Store — Sidebar collapse, command palette modal, and responsive drawer
// =============================================================================

import { create } from 'zustand';

interface UIState {
  isSidebarOpen: boolean;
  isCommandPaletteOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isSidebarOpen: true,
  isCommandPaletteOpen: false,

  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSidebarOpen: (open: boolean) => set({ isSidebarOpen: open }),
  openCommandPalette: () => set({ isCommandPaletteOpen: true }),
  closeCommandPalette: () => set({ isCommandPaletteOpen: false }),
}));
