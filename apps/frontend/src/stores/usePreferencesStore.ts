import { create } from "zustand";

type Theme = "light" | "dark";

interface PreferencesState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem("ew-theme");
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // localStorage unavailable
  }
  return "light";
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
  theme: getStoredTheme(),
  toggleTheme: () =>
    set((state) => {
      const next = state.theme === "light" ? "dark" : "light";
      localStorage.setItem("ew-theme", next);
      return { theme: next };
    }),
  setTheme: (theme) => {
    localStorage.setItem("ew-theme", theme);
    set({ theme });
  },
}));
