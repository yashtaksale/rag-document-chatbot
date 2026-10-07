// =============================================================================
// Zustand Store — Projects
// =============================================================================

import { create } from 'zustand';
import type { Project, Attachment } from '../lib/types';
import * as db from '../lib/db';

interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;

  load: () => void;
  create: (name: string, instructions?: string) => Project;
  update: (id: string, updates: Partial<Project>) => void;
  remove: (id: string) => void;
  select: (id: string | null) => void;
  addKnowledgeFile: (projectId: string, file: Attachment) => void;
  removeKnowledgeFile: (projectId: string, fileId: string) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProjectId: null,

  load: () => {
    const list = db.getAllProjects();
    set({ projects: list });
  },

  create: (name, instructions) => {
    const p = db.createProject(name, instructions);
    get().load();
    return p;
  },

  update: (id, updates) => {
    db.updateProject(id, updates);
    get().load();
  },

  remove: (id) => {
    db.deleteProject(id);
    if (get().activeProjectId === id) {
      set({ activeProjectId: null });
    }
    get().load();
  },

  select: (id) => {
    set({ activeProjectId: id });
  },

  addKnowledgeFile: (projectId, file) => {
    const p = db.getProject(projectId);
    if (!p) return;
    const existing = p.knowledgeFiles || [];
    const updatedFiles = [...existing, file];
    db.updateProject(projectId, {
      knowledgeFiles: updatedFiles,
      knowledgeFileIds: updatedFiles.map(f => f.id),
    });
    get().load();
  },

  removeKnowledgeFile: (projectId, fileId) => {
    const p = db.getProject(projectId);
    if (!p) return;
    const updatedFiles = (p.knowledgeFiles || []).filter(f => f.id !== fileId);
    db.updateProject(projectId, {
      knowledgeFiles: updatedFiles,
      knowledgeFileIds: updatedFiles.map(f => f.id),
    });
    get().load();
  },
}));
