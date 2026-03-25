import { create } from "zustand";

export interface FeedEvent {
  id: string;
  type: "NEW_EVENT" | "THREAT_CHANGE" | "THREAT_ASSESSED" | "SOURCE_STATUS" | "ANALYSIS_STARTED" | "ANALYSIS_COMPLETED";
  source?: string;
  sourceType?: "NEWS" | "WEATHER" | "ADVISORY" | "GEOPOLITICAL";
  title?: string;
  severity?: "INFO" | "WARNING" | "CRITICAL";
  embassyId?: string | null;
  embassyName?: string | null;
  country?: string;
  region?: string;
  previousLevel?: string;
  newLevel?: string;
  summary?: string;
  sourceName?: string;
  status?: string;
  embassyCount?: number;
  duration_ms?: number;
  timestamp: string;
}

interface FeedState {
  events: FeedEvent[];
  unreadCount: number;
  isOpen: boolean;
  isMuted: boolean;
  isConnected: boolean;
  filters: {
    types: string[];
    minSeverity: "ALL" | "WARNING" | "CRITICAL";
  };
  showTicker: boolean;
  addEvent: (event: FeedEvent) => void;
  addEvents: (events: FeedEvent[]) => void;
  markRead: () => void;
  setOpen: (open: boolean) => void;
  setMuted: (muted: boolean) => void;
  setConnected: (connected: boolean) => void;
  setFilters: (filters: Partial<FeedState["filters"]>) => void;
  setShowTicker: (show: boolean) => void;
  clearEvents: () => void;
}

const MAX_EVENTS = 100;

export const useFeedStore = create<FeedState>((set) => ({
  events: [],
  unreadCount: 0,
  isOpen: false,
  isMuted: false,
  isConnected: false,
  filters: {
    types: ["NEW_EVENT", "THREAT_CHANGE", "THREAT_ASSESSED", "SOURCE_STATUS", "ANALYSIS_STARTED", "ANALYSIS_COMPLETED"],
    minSeverity: "ALL",
  },
  showTicker: true,

  addEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events].slice(0, MAX_EVENTS),
      unreadCount: state.isOpen ? 0 : state.unreadCount + 1,
    })),

  addEvents: (events) =>
    set((state) => ({
      events: [...events, ...state.events].slice(0, MAX_EVENTS),
      unreadCount: state.isOpen ? 0 : state.unreadCount + events.length,
    })),

  markRead: () => set({ unreadCount: 0 }),

  setOpen: (open) =>
    set((state) => ({
      isOpen: open,
      unreadCount: open ? 0 : state.unreadCount,
    })),

  setMuted: (muted) => set({ isMuted: muted }),

  setConnected: (connected) => set({ isConnected: connected }),

  setFilters: (filters) =>
    set((state) => ({
      filters: { ...state.filters, ...filters },
    })),

  setShowTicker: (show) => set({ showTicker: show }),

  clearEvents: () => set({ events: [], unreadCount: 0 }),
}));
