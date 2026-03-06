import { create } from 'zustand';

export const useChatStore = create((set) => ({
    channels: [],
    currentChannel: null,
    messages: [],
    setChannels: (channels) => set({ channels }),
    setCurrentChannel: (channel) => set({ currentChannel: channel }),
    setMessages: (messages) => set({ messages }),
    prependMessages: (olderMessages) => set((state) => ({ messages: [...olderMessages, ...state.messages] })),
    addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
}));
