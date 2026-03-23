import { useQuery } from "@tanstack/react-query";
import api from "../services/api";

interface EmbassyFilters {
  page?: number;
  limit?: number;
  region?: string;
  threatLevel?: string;
  search?: string;
}

export interface Embassy {
  id: string;
  name: string;
  city: string;
  country: string;
  region: string;
  latitude: number;
  longitude: number;
  address: string;
  currentThreatLevel: string;
  lastAssessedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ThreatAssessment {
  id: string;
  embassyId: string;
  threatLevel: string;
  confidence: number;
  summary: string;
  keyFactors: string[];
  recommendations: string[];
  aiModelUsed: string;
  rawAiResponse: string;
  assessedAt: string;
  createdAt: string;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

interface EmbassyDetail extends Embassy {
  latestAssessment: ThreatAssessment | null;
}

interface EmbassyStats {
  byRegion: Record<string, number>;
  byThreatLevel: Record<string, number>;
  total: number;
}

export function useEmbassies(filters: EmbassyFilters = {}) {
  return useQuery({
    queryKey: ["embassies", filters],
    queryFn: () =>
      api
        .get<PaginatedResponse<Embassy>>("/api/embassies", { params: filters })
        .then((r) => r.data),
  });
}

export function useEmbassy(id: string | undefined) {
  return useQuery({
    queryKey: ["embassy", id],
    queryFn: () =>
      api.get<EmbassyDetail>(`/api/embassies/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useEmbassyStats() {
  return useQuery({
    queryKey: ["embassyStats"],
    queryFn: () =>
      api.get<EmbassyStats>("/api/embassies/stats").then((r) => r.data),
  });
}

export function useEmbassyAssessments(
  id: string | undefined,
  page: number = 1,
) {
  return useQuery({
    queryKey: ["embassyAssessments", id, page],
    queryFn: () =>
      api
        .get<PaginatedResponse<ThreatAssessment>>(
          `/api/embassies/${id}/assessments`,
          { params: { page } },
        )
        .then((r) => r.data),
    enabled: !!id,
  });
}
