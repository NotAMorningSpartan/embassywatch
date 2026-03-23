import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";

interface LoginRequest {
  email: string;
  password: string;
}

interface LoginResponse {
  token: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
  };
}

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (data: LoginRequest) =>
      api.post<LoginResponse>("/api/auth/login", data).then((r) => r.data),
    onSuccess: (data) => {
      setAuth(data.token, data.refreshToken, data.user);
      navigate("/dashboard");
    },
  });
}

export function useLogout() {
  const { refreshToken, clearAuth } = useAuthStore.getState();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: () =>
      api.post("/api/auth/logout", { refreshToken }).catch(() => {
        // Logout even if the API call fails
      }),
    onSettled: () => {
      clearAuth();
      navigate("/login");
    },
  });
}
