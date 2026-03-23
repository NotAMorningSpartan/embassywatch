import { create } from "zustand";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  setAuth: (token: string, refreshToken: string, user: AuthUser) => void;
  setToken: (token: string) => void;
  clearAuth: () => void;
  updateUser: (partial: Partial<AuthUser>) => void;
}

function loadFromStorage<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function saveToStorage(key: string, value: unknown) {
  try {
    if (value == null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // localStorage unavailable
  }
}

const storedToken = loadFromStorage<string>("ew-auth-token");
const storedRefresh = loadFromStorage<string>("ew-auth-refresh");
const storedUser = loadFromStorage<AuthUser>("ew-auth-user");

export const useAuthStore = create<AuthState>((set) => ({
  token: storedToken,
  refreshToken: storedRefresh,
  user: storedUser,
  isAuthenticated: !!storedToken && !!storedUser,

  setAuth: (token, refreshToken, user) => {
    saveToStorage("ew-auth-token", token);
    saveToStorage("ew-auth-refresh", refreshToken);
    saveToStorage("ew-auth-user", user);
    set({ token, refreshToken, user, isAuthenticated: true });
  },

  setToken: (token) => {
    saveToStorage("ew-auth-token", token);
    set({ token });
  },

  clearAuth: () => {
    saveToStorage("ew-auth-token", null);
    saveToStorage("ew-auth-refresh", null);
    saveToStorage("ew-auth-user", null);
    set({ token: null, refreshToken: null, user: null, isAuthenticated: false });
  },

  updateUser: (partial) =>
    set((state) => {
      if (!state.user) return state;
      const user = { ...state.user, ...partial };
      saveToStorage("ew-auth-user", user);
      return { user };
    }),
}));
