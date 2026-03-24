import axios from "axios";
import { useAuthStore } from "../stores/useAuthStore";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "",
});

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 — attempt token refresh, then retry
let refreshPromise: Promise<string> | null = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    // Don't retry auth endpoints
    if (original.url?.includes("/api/auth/")) {
      return Promise.reject(error);
    }

    original._retry = true;
    const { refreshToken, setToken, clearAuth } = useAuthStore.getState();

    if (!refreshToken) {
      clearAuth();
      window.location.href = "/login";
      return Promise.reject(error);
    }

    try {
      // Deduplicate concurrent refresh requests
      if (!refreshPromise) {
        refreshPromise = axios
          .post(`${api.defaults.baseURL}/api/auth/refresh`, { refreshToken })
          .then((res) => res.data.token as string)
          .finally(() => {
            refreshPromise = null;
          });
      }

      const newToken = await refreshPromise;
      setToken(newToken);
      original.headers.Authorization = `Bearer ${newToken}`;
      return api(original);
    } catch {
      clearAuth();
      window.location.href = "/login";
      return Promise.reject(error);
    }
  },
);

export default api;
