import { create } from 'zustand';

export const useAuthStore = create((set) => ({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    setLoading: (isLoading) => set({ isLoading }),
    setUser: (user) => set({ user, isAuthenticated: !!user, isLoading: false }),
    logout: () => set({ user: null, isAuthenticated: false, isLoading: false }),
}));
