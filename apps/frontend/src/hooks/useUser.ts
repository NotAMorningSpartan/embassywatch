import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../services/api";
import type { Embassy } from "./useEmbassies";

interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: string;
  preferences: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ["currentUser"],
    queryFn: () =>
      api.get<UserProfile>("/api/users/me").then((r) => r.data),
  });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (preferences: Record<string, unknown>) =>
      api
        .patch<UserProfile>("/api/users/me/preferences", preferences)
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["currentUser"] });
    },
  });
}

export function useWatchlist() {
  return useQuery({
    queryKey: ["watchlist"],
    queryFn: () =>
      api.get<Embassy[]>("/api/users/me/watchlist").then((r) => r.data),
  });
}

export function useAddToWatchlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (embassyId: string) =>
      api
        .post<Embassy[]>(`/api/users/me/watchlist/${embassyId}`)
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });
}

export function useRemoveFromWatchlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (embassyId: string) =>
      api
        .delete<Embassy[]>(`/api/users/me/watchlist/${embassyId}`)
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });
}
