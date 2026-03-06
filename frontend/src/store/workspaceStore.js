import { create } from 'zustand';

export const useWorkspaceStore = create((set) => ({
    workspaces: [],
    currentWorkspace: null,
    isLoading: false,
    setWorkspaces: (workspaces) => set({ workspaces, isLoading: false }),
    setCurrentWorkspace: (workspace) => set({ currentWorkspace: workspace }),
    setLoading: (loading) => set({ isLoading: loading }),
}));
