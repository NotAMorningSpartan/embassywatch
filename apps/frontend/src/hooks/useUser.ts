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

export interface WatchlistEmbassy extends Embassy {
  trend: "improving" | "worsening" | "stable";
  previousThreatLevel: string | null;
}

export interface WatchlistChange {
  embassyId: string;
  embassyName: string;
  fromLevel: string;
  toLevel: string;
  changedAt: string;
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

export function useWatchlist(params?: { sort?: string; search?: string }) {
  return useQuery({
    queryKey: ["watchlist", params],
    queryFn: () =>
      api
        .get<WatchlistEmbassy[]>("/api/users/me/watchlist", { params })
        .then((r) => r.data),
  });
}

export function useWatchlistChanges(days: number = 7) {
  return useQuery({
    queryKey: ["watchlistChanges", days],
    queryFn: () =>
      api
        .get<WatchlistChange[]>("/api/users/me/watchlist/changes", {
          params: { days },
        })
        .then((r) => r.data),
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
      queryClient.invalidateQueries({ queryKey: ["watchlistChanges"] });
    },
  });
}

export function useRemoveFromWatchlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (embassyId: string) =>
      api
        .delete(`/api/users/me/watchlist/${embassyId}`)
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      queryClient.invalidateQueries({ queryKey: ["watchlistChanges"] });
    },
  });
}
