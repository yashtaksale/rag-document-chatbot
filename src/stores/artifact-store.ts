// =============================================================================
// Zustand Store — Artifacts / Canvas
// =============================================================================

import { create } from 'zustand';
import type { Artifact } from '../lib/types';
import * as db from '../lib/db';

interface ArtifactState {
  activeArtifact: Artifact | null;
  isOpen: boolean;
  versions: Artifact[];

  openArtifact: (artifact: Artifact) => void;
  closePanel: () => void;
  updateContent: (newContent: string) => void;
  selectVersion: (versionArtifact: Artifact) => void;
  downloadArtifact: () => void;
  copyArtifact: () => Promise<boolean>;
}

export const useArtifactStore = create<ArtifactState>((set, get) => ({
  activeArtifact: null,
  isOpen: false,
  versions: [],

  openArtifact: (artifact) => {
    const versions = db.getArtifactVersions(artifact.id);
    set({
      activeArtifact: artifact,
      versions: versions.length > 0 ? versions : [artifact],
      isOpen: true,
    });
  },

  closePanel: () => {
    set({ isOpen: false });
  },

  updateContent: (newContent) => {
    const { activeArtifact } = get();
    if (!activeArtifact) return;

    const newVersion = db.updateArtifactContent(activeArtifact.id, newContent);
    if (newVersion) {
      const versions = db.getArtifactVersions(newVersion.id);
      set({
        activeArtifact: newVersion,
        versions: versions.length > 0 ? versions : [newVersion],
      });
    }
  },

  selectVersion: (versionArtifact) => {
    set({ activeArtifact: versionArtifact });
  },

  downloadArtifact: () => {
    const { activeArtifact } = get();
    if (!activeArtifact) return;

    const ext = activeArtifact.language || (activeArtifact.type === 'html' ? 'html' : 'txt');
    const fileName = activeArtifact.title.includes('.')
      ? activeArtifact.title
      : `${activeArtifact.title.replace(/\s+/g, '_').toLowerCase()}.${ext}`;

    const blob = new Blob([activeArtifact.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  copyArtifact: async () => {
    const { activeArtifact } = get();
    if (!activeArtifact) return false;
    try {
      await navigator.clipboard.writeText(activeArtifact.content);
      return true;
    } catch {
      return false;
    }
  },
}));
