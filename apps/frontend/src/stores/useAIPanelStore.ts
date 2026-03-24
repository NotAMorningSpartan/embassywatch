import { create } from "zustand";

export interface QAPair {
  id: string;
  question: string;
  answer: string;
  model: string;
  tokensUsed: number;
  processingTimeMs: number;
  timestamp: number;
}

export interface PageContext {
  type: "dashboard" | "embassy-detail" | "watchlist" | "embassies" | "other";
  embassyId?: string;
  embassyName?: string;
  watchlistIds?: string[];
}

interface AIPanelState {
  isOpen: boolean;
  isLoading: boolean;
  history: QAPair[];
  recentQueries: string[];
  pageContext: PageContext;

  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  setLoading: (loading: boolean) => void;
  addQAPair: (pair: QAPair) => void;
  clearHistory: () => void;
  addRecentQuery: (query: string) => void;
  setPageContext: (context: PageContext) => void;
  clearPageContext: () => void;
}

export const useAIPanelStore = create<AIPanelState>((set) => ({
  isOpen: false,
  isLoading: false,
  history: [],
  recentQueries: [],
  pageContext: { type: "dashboard" },

  openPanel: () => set({ isOpen: true }),
  closePanel: () => set({ isOpen: false }),
  togglePanel: () => set((s) => ({ isOpen: !s.isOpen })),
  setLoading: (loading) => set({ isLoading: loading }),

  addQAPair: (pair) =>
    set((s) => ({
      history: [...s.history, pair],
    })),

  clearHistory: () => set({ history: [] }),

  addRecentQuery: (query) =>
    set((s) => {
      const filtered = s.recentQueries.filter((q) => q !== query);
      return { recentQueries: [query, ...filtered].slice(0, 10) };
    }),

  setPageContext: (context) => set({ pageContext: context }),
  clearPageContext: () => set({ pageContext: { type: "dashboard" } }),
}));
