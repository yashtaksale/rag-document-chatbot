// =============================================================================
// Zustand Store — DocChat Document Vault & RAG State
// =============================================================================

import { create } from 'zustand';

export interface DocChatState {
  documents: string[];
  documentCount: number;
  totalVaultChunks: number;
  ragMode: 'Simple' | 'Thinking';
  isVaultOpen: boolean;
  isLoading: boolean;
  isUploading: boolean;
  uploadProgress: string | null;
  error: string | null;
  activeUserId: number;

  // Actions
  fetchVault: () => Promise<void>;
  uploadDocument: (file: File) => Promise<boolean>;
  deleteDocument: (filename: string) => Promise<boolean>;
  clearVault: () => Promise<boolean>;
  setRagMode: (mode: 'Simple' | 'Thinking') => void;
  setIsVaultOpen: (open: boolean) => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8001';

export const useDocChatStore = create<DocChatState>((set, get) => ({
  documents: [],
  documentCount: 0,
  totalVaultChunks: 0,
  ragMode: 'Thinking',
  isVaultOpen: false,
  isLoading: false,
  isUploading: false,
  uploadProgress: null,
  error: null,
  activeUserId: 1,

  fetchVault: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/api/health?user_id=${get().activeUserId}`);
      if (!res.ok) throw new Error('DocChat backend unreachable');
      const data = await res.json();
      set({
        documents: data.user_documents || [],
        documentCount: data.user_document_count || 0,
        totalVaultChunks: data.total_chunks_in_vault || 0,
        isLoading: false,
      });
    } catch (err: any) {
      console.warn('DocChat backend health check:', err.message);
      set({ isLoading: false, error: err.message });
    }
  },

  uploadDocument: async (file: File) => {
    set({ isUploading: true, uploadProgress: `Uploading & parsing ${file.name}...`, error: null });
    try {
      const formData = new FormData();
      formData.append('file', file);

      set({ uploadProgress: `Extracting text & generating vector embeddings...` });
      const res = await fetch(`${API_BASE}/api/documents/upload?user_id=${get().activeUserId}`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Upload failed with status ${res.status}`);
      }

      set({ uploadProgress: `Indexing complete!` });
      await get().fetchVault();
      set({ isUploading: false, uploadProgress: null });
      return true;
    } catch (err: any) {
      set({ isUploading: false, uploadProgress: null, error: err.message });
      return false;
    }
  },

  deleteDocument: async (filename: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/api/documents/${encodeURIComponent(filename)}?user_id=${get().activeUserId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete document');
      await get().fetchVault();
      return true;
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      return false;
    }
  },

  clearVault: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/api/documents/clear?user_id=${get().activeUserId}`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to clear vault');
      await get().fetchVault();
      return true;
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      return false;
    }
  },

  setRagMode: (mode) => set({ ragMode: mode }),
  setIsVaultOpen: (open) => set({ isVaultOpen: open }),
}));
