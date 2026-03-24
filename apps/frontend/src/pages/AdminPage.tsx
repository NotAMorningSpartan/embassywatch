import { Fragment, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";

/* ---- Types ---- */

interface HealthEntry {
  status: string;
  message?: string;
}

interface HealthCheck {
  status: string;
  name: string;
  category: "infrastructure" | "data_source" | "ai";
  message: string;
  details?: Record<string, string | number | boolean | null>;
}

interface HealthResponse {
  checks: HealthCheck[];
  timestamp: string;
}

interface SourceDetailed {
  id: string;
  name: string;
  type: string;
  endpoint: string | null;
  apiKey: string | null;
  enabled: boolean;
  lastFetchedAt: string | null;
  healthStatus: string;
  eventCount: number;
}

interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  createdAt: string;
}

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  source: string;
  severity: string;
  timestamp: string;
  embassyId: string | null;
  embassyName: string | null;
  matchedBy: string | null;
  aiReasoning: string | null;
  aiConfidence: number | null;
  aiRelevanceToEmbassy: string | null;
  aiKeyEntities: string[] | null;
}

/* ---- Hooks ---- */

function useHealth() {
  return useQuery({
    queryKey: ["admin", "health"],
    queryFn: () =>
      api
        .get<HealthResponse>("/api/admin/system/health")
        .then((r) => r.data),
    refetchInterval: 60_000,
  });
}

function useSourcesDetailed() {
  return useQuery({
    queryKey: ["admin", "sources"],
    queryFn: () =>
      api.get<SourceDetailed[]>("/api/admin/sources/detailed").then((r) => r.data),
    staleTime: 0,
    refetchOnMount: "always",
  });
}

function useAdminUsers() {
  return useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api.get<AdminUser[]>("/api/admin/users").then((r) => r.data),
  });
}

function useActivity(page: number) {
  return useQuery({
    queryKey: ["admin", "activity", page],
    queryFn: () =>
      api
        .get<{ data: ActivityItem[]; total: number }>("/api/admin/activity", {
          params: { page, limit: 20 },
        })
        .then((r) => r.data),
  });
}

/* ---- Component ---- */

type Tab = "health" | "sources" | "users" | "config" | "activity";

export default function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>("health");

  if (user?.role !== "ADMIN") {
    return (
      <>
        <h1>Access Denied</h1>
        <div className="ew-card">
          <p>You do not have permission to access the admin panel. This section requires the ADMIN role.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Admin Panel</h1>
      <div className="ew-admin-tabs">
        {(
          [
            ["health", "System Health"],
            ["sources", "Data Sources"],
            ["users", "Users"],
            ["config", "AI Config"],
            ["activity", "Activity Log"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            className={`ew-admin-tab${tab === key ? " ew-admin-tab--active" : ""}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "health" && <HealthSection />}
      {tab === "sources" && <SourcesSection onNavigateToConfig={() => setTab("config")} />}
      {tab === "users" && <UsersSection />}
      {tab === "config" && <ConfigSection />}
      {tab === "activity" && <ActivitySection />}
    </>
  );
}

/* ---- Service Logos ---- */

function ServiceLogo({ name }: { name: string }) {
  const size = 28;
  switch (name) {
    case "PostgreSQL Database":
      // PostgreSQL elephant (simplified)
      return (
        <svg className="ew-admin-service-logo" width={size} height={size} viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="6" fill="#336791" />
          <path d="M22.5 10.5c-.5-2-2.5-3.5-5-3.5-3 0-5.5 2-6 4.5-.5 2.5.5 5 2.5 6.5l-.5 4.5h2.5l.5-3.5c1 .5 2 .5 3 0l.5 3.5h2.5l-.5-4.5c2-1.5 3-4 2.5-6.5z" fill="white" opacity="0.9"/>
          <circle cx="14.5" cy="12" r="1" fill="#336791"/>
        </svg>
      );
    case "Redis Cache":
      // Redis logo (diamond shape)
      return (
        <svg className="ew-admin-service-logo" width={size} height={size} viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="6" fill="#DC382D" />
          <path d="M16 6l10 7-10 7-10-7z" fill="white" opacity="0.3"/>
          <path d="M16 9l10 7-10 7-10-7z" fill="white" opacity="0.5"/>
          <path d="M16 12l10 7-10 7-10-7z" fill="white" opacity="0.9"/>
        </svg>
      );
    case "AI Inference Endpoint":
      // AI brain/chip icon
      return (
        <svg className="ew-admin-service-logo" width={size} height={size} viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="6" fill="#7C3AED" />
          <rect x="10" y="10" width="12" height="12" rx="2" stroke="white" strokeWidth="1.5" fill="none"/>
          <circle cx="16" cy="16" r="2.5" fill="white" opacity="0.9"/>
          <line x1="16" y1="7" x2="16" y2="10" stroke="white" strokeWidth="1.5"/>
          <line x1="16" y1="22" x2="16" y2="25" stroke="white" strokeWidth="1.5"/>
          <line x1="7" y1="16" x2="10" y2="16" stroke="white" strokeWidth="1.5"/>
          <line x1="22" y1="16" x2="25" y2="16" stroke="white" strokeWidth="1.5"/>
          <line x1="11" y1="8.5" x2="12" y2="10.5" stroke="white" strokeWidth="1"/>
          <line x1="21" y1="8.5" x2="20" y2="10.5" stroke="white" strokeWidth="1"/>
          <line x1="11" y1="23.5" x2="12" y2="21.5" stroke="white" strokeWidth="1"/>
          <line x1="21" y1="23.5" x2="20" y2="21.5" stroke="white" strokeWidth="1"/>
        </svg>
      );
    case "NewsAPI":
      // News/newspaper icon
      return (
        <svg className="ew-admin-service-logo" width={size} height={size} viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="6" fill="#1A73E8" />
          <rect x="8" y="8" width="16" height="16" rx="2" fill="white" opacity="0.9"/>
          <rect x="10" y="10" width="8" height="3" rx="0.5" fill="#1A73E8"/>
          <line x1="10" y1="15" x2="22" y2="15" stroke="#1A73E8" strokeWidth="1" opacity="0.4"/>
          <line x1="10" y1="17.5" x2="22" y2="17.5" stroke="#1A73E8" strokeWidth="1" opacity="0.4"/>
          <line x1="10" y1="20" x2="18" y2="20" stroke="#1A73E8" strokeWidth="1" opacity="0.4"/>
          <rect x="19" y="10" width="3" height="5" rx="0.5" fill="#1A73E8" opacity="0.3"/>
        </svg>
      );
    case "OpenWeatherMap":
      // Weather/cloud with sun
      return (
        <svg className="ew-admin-service-logo" width={size} height={size} viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="6" fill="#EB6E4B" />
          <circle cx="20" cy="12" r="4" fill="#FFD43B" opacity="0.9"/>
          <path d="M10 22c-2.2 0-4-1.8-4-4s1.8-4 4-4c.4-2.8 2.8-5 5.8-5 2.5 0 4.6 1.6 5.4 3.8.4-.1.8-.2 1.3-.2 2.2 0 4 1.8 4 4s-1.8 4-4 4H10z" fill="white" opacity="0.9"/>
        </svg>
      );
    case "State Dept Travel Advisories":
      // Government/shield icon
      return (
        <svg className="ew-admin-service-logo" width={size} height={size} viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="6" fill="#1B3A5C" />
          <path d="M16 6l8 4v6c0 5-3.5 9.5-8 11-4.5-1.5-8-6-8-11v-6l8-4z" fill="white" opacity="0.9"/>
          <path d="M14.5 16l2 2 4-4" stroke="#1B3A5C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    default:
      return (
        <svg className="ew-admin-service-logo" width={size} height={size} viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="6" fill="#71767A" />
          <circle cx="16" cy="16" r="6" stroke="white" strokeWidth="1.5" fill="none"/>
          <path d="M16 13v4M16 19v1" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      );
  }
}

/* ---- Health ---- */

function HealthSection() {
  const { data, isLoading, refetch, isFetching } = useHealth();

  const statusColor = (s: string) => {
    const lower = s.toLowerCase();
    return lower === "healthy" ? "#2e8540"
      : lower === "mock" ? "#2e75b6"
      : lower === "degraded" || lower === "not_configured" ? "#e8a820"
      : "#d83933";
  };

  const statusLabel = (s: string) => {
    const lower = s.toLowerCase();
    return lower === "healthy" ? "Healthy"
      : lower === "mock" ? "Mock Data"
      : lower === "degraded" ? "Degraded"
      : lower === "not_configured" ? "Not Configured"
      : "Down";
  };

  if (isLoading) return <p>Loading health data...</p>;

  const checks = data?.checks ?? [];
  const timestamp = data?.timestamp;

  const infraChecks = checks.filter((c) => c.category === "infrastructure");
  const aiChecks = checks.filter((c) => c.category === "ai");
  const sourceChecks = checks.filter((c) => c.category === "data_source");

  const allHealthy = checks.every((c) => c.status === "healthy");
  const anyDown = checks.some((c) => c.status === "down");

  return (
    <div className="ew-admin-section">
      <div className="ew-admin-section__header">
        <h2>System Health</h2>
        <div className="ew-admin-section__actions">
          <span
            className="ew-admin-health-summary"
            style={{ color: allHealthy ? "#2e8540" : anyDown ? "#d83933" : "#e8a820" }}
          >
            {allHealthy ? "All systems operational" : anyDown ? "Issues detected" : "Partially operational"}
          </span>
          <button
            className="ew-admin-btn"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? "Checking..." : "Run Health Check"}
          </button>
        </div>
      </div>
      {timestamp && (
        <p className="ew-admin-timestamp">
          Last checked: {new Date(timestamp).toLocaleString()}
        </p>
      )}

      {[
        { label: "Infrastructure", items: infraChecks },
        { label: "AI Services", items: aiChecks },
        { label: "Data Sources", items: sourceChecks },
      ].map((group) => (
        <div key={group.label}>
          <h3 className="ew-admin-health-category">{group.label}</h3>
          <div className="ew-admin-health-grid">
            {group.items.map((check) => (
              <div key={check.name} className="ew-admin-health-card">
                <div className="ew-admin-health-card__header">
                  <ServiceLogo name={check.name} />
                  <strong className="ew-admin-health-card__name">{check.name}</strong>
                  <span
                    className="ew-admin-health-card__badge"
                    style={{
                      background: statusColor(check.status) + "18",
                      color: statusColor(check.status),
                    }}
                  >
                    {statusLabel(check.status)}
                  </span>
                </div>
                {check.details && (
                  <div className="ew-admin-health-card__metrics">
                    {check.details.latencyMs != null && (
                      <div className="ew-admin-health-metric">
                        <span className="ew-admin-health-metric__label">Latency</span>
                        <span className="ew-admin-health-metric__value">
                          {Number(check.details.latencyMs)}
                          <span className="ew-admin-health-metric__unit">ms</span>
                        </span>
                      </div>
                    )}
                    {check.details.eventCount != null && (
                      <div className="ew-admin-health-metric">
                        <span className="ew-admin-health-metric__label">Events</span>
                        <span className="ew-admin-health-metric__value">
                          {Number(check.details.eventCount).toLocaleString()}
                        </span>
                      </div>
                    )}
                    {check.details.embassyCount != null && (
                      <div className="ew-admin-health-metric">
                        <span className="ew-admin-health-metric__label">Embassies</span>
                        <span className="ew-admin-health-metric__value">
                          {Number(check.details.embassyCount)}
                        </span>
                      </div>
                    )}
                    {check.details.totalArticles != null && (
                      <div className="ew-admin-health-metric">
                        <span className="ew-admin-health-metric__label">Available</span>
                        <span className="ew-admin-health-metric__value">
                          {Number(check.details.totalArticles).toLocaleString()}
                          <span className="ew-admin-health-metric__unit">articles</span>
                        </span>
                      </div>
                    )}
                    {check.details.totalAdvisories != null && (
                      <div className="ew-admin-health-metric">
                        <span className="ew-admin-health-metric__label">Advisories</span>
                        <span className="ew-admin-health-metric__value">
                          {Number(check.details.totalAdvisories)}
                        </span>
                      </div>
                    )}
                    {check.details.model != null && (
                      <div className="ew-admin-health-metric">
                        <span className="ew-admin-health-metric__label">Model</span>
                        <span className="ew-admin-health-metric__value ew-admin-health-metric__value--text">
                          {String(check.details.model)}
                        </span>
                      </div>
                    )}
                    {check.details.lastFetched != null && check.details.lastFetched !== "" && (
                      <div className="ew-admin-health-metric">
                        <span className="ew-admin-health-metric__label">Last Fetch</span>
                        <span className="ew-admin-health-metric__value ew-admin-health-metric__value--text">
                          {new Date(String(check.details.lastFetched)).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {!check.details && check.message && (
                  <span className="ew-admin-health-card__msg">{check.message}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---- Sources ---- */

function SourcesSection({ onNavigateToConfig }: { onNavigateToConfig: () => void }) {
  const { data: sources, isLoading } = useSourcesDetailed();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchNow = useMutation({
    mutationFn: (id: string) =>
      api.post(`/api/admin/sources/${id}/fetch`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "sources"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "health"] });
    },
  });

  const toggleSource = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch(`/api/admin/sources/${id}`, { enabled }).then((r) => r.data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin", "sources"] }),
  });

  const [confirmPurge, setConfirmPurge] = useState(false);
  const purgeEvents = useMutation({
    mutationFn: () =>
      api.delete<{ message: string; count: number }>("/api/admin/events").then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "sources"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "activity"] });
      setConfirmPurge(false);
    },
  });

  if (isLoading) return <p>Loading data sources...</p>;

  return (
    <div className="ew-admin-section">
      <div className="ew-admin-section__header">
        <h2>Data Sources</h2>
        <div className="ew-admin-section__actions">
          {confirmPurge ? (
            <span className="ew-watchlist-confirm-tooltip">
              Purge all events?{" "}
              <button
                className="ew-btn ew-btn--sm ew-btn--danger"
                onClick={() => purgeEvents.mutate()}
                disabled={purgeEvents.isPending}
              >
                {purgeEvents.isPending ? "Purging..." : "Yes, Purge"}
              </button>
              <button
                className="ew-btn ew-btn--sm ew-btn--outline"
                onClick={() => setConfirmPurge(false)}
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              className="ew-admin-btn ew-admin-btn--danger"
              onClick={() => setConfirmPurge(true)}
            >
              Purge All Events
            </button>
          )}
        </div>
      </div>
      <table className="ew-admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Status</th>
            <th>Last Fetched</th>
            <th>Events</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {(sources ?? []).map((src) => (
            <Fragment key={src.id}>
              <tr
                className="ew-admin-table__row"
                onClick={() =>
                  setExpanded(expanded === src.id ? null : src.id)
                }
              >
                <td>{src.name}</td>
                <td>{src.type}</td>
                <td>
                  <button
                    className="ew-admin-status-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigateToConfig();
                    }}
                    title="Go to API configuration"
                  >
                    <span
                      className="ew-admin-status-dot"
                      style={{
                        background:
                          src.healthStatus === "HEALTHY"
                            ? "#2e8540"
                            : src.healthStatus === "MOCK"
                              ? "#2e75b6"
                              : src.healthStatus === "DEGRADED"
                                ? "#e8a820"
                                : "#d83933",
                      }}
                    />
                    {src.healthStatus === "MOCK" ? "Mock Data" : src.healthStatus}
                  </button>
                </td>
                <td>
                  {src.lastFetchedAt
                    ? new Date(src.lastFetchedAt).toLocaleString()
                    : "Never"}
                </td>
                <td>{src.eventCount}</td>
                <td>
                  <button
                    className="ew-admin-btn ew-admin-btn--sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      fetchNow.mutate(src.id);
                    }}
                    disabled={fetchNow.isPending}
                  >
                    Fetch Now
                  </button>
                  <button
                    className={`ew-admin-btn ew-admin-btn--sm ${src.enabled ? "ew-admin-btn--danger" : "ew-admin-btn--success"}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSource.mutate({
                        id: src.id,
                        enabled: !src.enabled,
                      });
                    }}
                  >
                    {src.enabled ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
              {expanded === src.id && (
                <tr key={`${src.id}-detail`} className="ew-admin-table__expanded">
                  <td colSpan={6}>
                    <div className="ew-admin-source-detail">
                      <div>
                        <strong>Endpoint:</strong>{" "}
                        {src.endpoint ?? "Not configured"}
                      </div>
                      <div>
                        <strong>API Key:</strong>{" "}
                        {src.apiKey ? "••••••••" : "Not set"}
                      </div>
                      <div>
                        <strong>Enabled:</strong> {src.enabled ? "Yes" : "No"}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---- Users ---- */

function UsersSection() {
  const { data: users, isLoading } = useAdminUsers();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({
    email: "",
    password: "",
    displayName: "",
    role: "ANALYST",
  });

  const createUser = useMutation({
    mutationFn: (data: typeof newUser) =>
      api.post("/api/admin/users", data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setShowCreate(false);
      setNewUser({ email: "", password: "", displayName: "", role: "ANALYST" });
    },
  });

  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      api.patch(`/api/admin/users/${id}`, { role }).then((r) => r.data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  if (isLoading) return <p>Loading users...</p>;

  return (
    <div className="ew-admin-section">
      <div className="ew-admin-section__header">
        <h2>User Management</h2>
        <button
          className="ew-admin-btn"
          onClick={() => setShowCreate(!showCreate)}
        >
          {showCreate ? "Cancel" : "Create User"}
        </button>
      </div>

      {showCreate && (
        <div className="ew-card ew-admin-create-form">
          <div className="ew-admin-form-row">
            <label>Display Name</label>
            <input
              value={newUser.displayName}
              onChange={(e) =>
                setNewUser({ ...newUser, displayName: e.target.value })
              }
            />
          </div>
          <div className="ew-admin-form-row">
            <label>Email</label>
            <input
              type="email"
              value={newUser.email}
              onChange={(e) =>
                setNewUser({ ...newUser, email: e.target.value })
              }
            />
          </div>
          <div className="ew-admin-form-row">
            <label>Password</label>
            <input
              type="password"
              value={newUser.password}
              onChange={(e) =>
                setNewUser({ ...newUser, password: e.target.value })
              }
            />
          </div>
          <div className="ew-admin-form-row">
            <label>Role</label>
            <select
              value={newUser.role}
              onChange={(e) =>
                setNewUser({ ...newUser, role: e.target.value })
              }
            >
              <option value="ANALYST">Analyst</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <button
            className="ew-admin-btn"
            onClick={() => createUser.mutate(newUser)}
            disabled={createUser.isPending}
          >
            {createUser.isPending ? "Creating..." : "Create"}
          </button>
          {createUser.isError && (
            <p className="ew-admin-error">
              {(createUser.error as { response?: { data?: { error?: string } } })
                ?.response?.data?.error ?? "Failed to create user"}
            </p>
          )}
        </div>
      )}

      <table className="ew-admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {(users ?? []).map((u) => (
            <tr key={u.id}>
              <td>{u.displayName}</td>
              <td>{u.email}</td>
              <td>
                <select
                  value={u.role}
                  onChange={(e) =>
                    updateRole.mutate({ id: u.id, role: e.target.value })
                  }
                  className="ew-admin-role-select"
                >
                  <option value="ANALYST">Analyst</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </td>
              <td>{new Date(u.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---- AI & Data Source Config ---- */

interface RuntimeConfig {
  AI_ENDPOINT_URL: string;
  AI_MODEL_NAME: string;
  AI_API_KEY: string;
  AI_TEMPERATURE: string;
  AI_MAX_TOKENS: string;
  AI_TIMEOUT: string;
  NEWSAPI_KEY: string;
  OPENWEATHER_KEY: string;
  USE_MOCK_DATA: string;
}

function useRuntimeConfig() {
  return useQuery({
    queryKey: ["admin", "config"],
    queryFn: () =>
      api
        .get<{ config: RuntimeConfig; hasKeys: Record<string, boolean> }>(
          "/api/admin/config",
        )
        .then((r) => r.data),
  });
}

function KeyVisibilityIcon({ visible }: { visible?: boolean }) {
  return visible ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ConfigSection() {
  const { data: configData, isLoading } = useRuntimeConfig();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<RuntimeConfig>({
    AI_ENDPOINT_URL: "",
    AI_MODEL_NAME: "",
    AI_API_KEY: "",
    AI_TEMPERATURE: "0.3",
    AI_MAX_TOKENS: "2048",
    AI_TIMEOUT: "60",
    NEWSAPI_KEY: "",
    OPENWEATHER_KEY: "",
    USE_MOCK_DATA: "true",
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string } | null>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [lastLoadedJson, setLastLoadedJson] = useState("");

  // Sync config from server whenever it changes
  const configJson = configData ? JSON.stringify(configData.config) : "";
  if (configJson && configJson !== lastLoadedJson) {
    setConfig(configData!.config);
    setLastLoadedJson(configJson);
  }

  const toggleShowKey = (key: string) => {
    setShowKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await api.put("/api/admin/config", config);
      setSaveMsg({ type: "success", text: "Configuration saved and applied to running services." });
      queryClient.invalidateQueries({ queryKey: ["admin", "config"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "health"] });
      setTimeout(() => setSaveMsg(null), 5000);
    } catch {
      setSaveMsg({ type: "error", text: "Failed to save configuration." });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (service: string) => {
    setTesting((t) => ({ ...t, [service]: true }));
    setTestResults((r) => ({ ...r, [service]: null }));
    try {
      // Send current form values so test works before saving
      let body: Record<string, string> = {};
      if (service === "ai") {
        body = {
          endpointUrl: config.AI_ENDPOINT_URL,
          apiKey: config.AI_API_KEY,
          modelName: config.AI_MODEL_NAME,
        };
      } else if (service === "newsapi") {
        body = { apiKey: config.NEWSAPI_KEY };
      } else if (service === "weather") {
        body = { apiKey: config.OPENWEATHER_KEY };
      }
      const res = await api.post<{ success: boolean; message: string }>(
        `/api/admin/config/test-${service}`,
        body,
      );
      setTestResults((r) => ({ ...r, [service]: res.data }));
    } catch {
      setTestResults((r) => ({
        ...r,
        [service]: { success: false, message: "Request failed" },
      }));
    } finally {
      setTesting((t) => ({ ...t, [service]: false }));
    }
  };

  if (isLoading) return <p>Loading configuration...</p>;

  return (
    <div className="ew-admin-section">
      {saveMsg && (
        <div
          className={`ew-alert ${saveMsg.type === "success" ? "ew-alert--success" : "ew-alert--warning"}`}
          style={{ marginBottom: 16 }}
        >
          {saveMsg.text}
        </div>
      )}

      <h2>AI Model Configuration</h2>
      <div className="ew-card">
        <div className="ew-admin-form-row">
          <label>Inference Endpoint URL</label>
          <input
            value={config.AI_ENDPOINT_URL}
            onChange={(e) =>
              setConfig({ ...config, AI_ENDPOINT_URL: e.target.value })
            }
            placeholder="https://your-endpoint.com or https://your-endpoint.com/v1/chat/completions"
          />
        </div>
        <div className="ew-admin-form-row">
          <label>Model Name</label>
          <input
            value={config.AI_MODEL_NAME}
            onChange={(e) =>
              setConfig({ ...config, AI_MODEL_NAME: e.target.value })
            }
            placeholder="gpt-4o-mini"
          />
        </div>
        <div className="ew-admin-form-row">
          <label>API Key / Token</label>
          <div className="ew-admin-key-field">
            <input
              type={showKeys.ai ? "text" : "password"}
              value={config.AI_API_KEY}
              onChange={(e) =>
                setConfig({ ...config, AI_API_KEY: e.target.value })
              }
              placeholder="Enter API key..."
            />
            <button
              type="button"
              className="ew-admin-key-toggle"
              onClick={() => toggleShowKey("ai")}
              title={showKeys.ai ? "Hide key" : "Show key"}
            >
              <KeyVisibilityIcon visible={showKeys.ai} />
            </button>
          </div>
        </div>
        <div className="ew-admin-form-grid">
          <div className="ew-admin-form-row">
            <label>Temperature</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={config.AI_TEMPERATURE}
              onChange={(e) =>
                setConfig({ ...config, AI_TEMPERATURE: e.target.value })
              }
            />
          </div>
          <div className="ew-admin-form-row">
            <label>Max Tokens</label>
            <input
              type="number"
              value={config.AI_MAX_TOKENS}
              onChange={(e) =>
                setConfig({ ...config, AI_MAX_TOKENS: e.target.value })
              }
            />
          </div>
          <div className="ew-admin-form-row">
            <label>Timeout (seconds)</label>
            <input
              type="number"
              value={config.AI_TIMEOUT}
              onChange={(e) =>
                setConfig({ ...config, AI_TIMEOUT: e.target.value })
              }
            />
          </div>
        </div>
        <div className="ew-admin-form-actions">
          <button
            className="ew-admin-btn"
            onClick={() => handleTest("ai")}
            disabled={testing.ai}
          >
            {testing.ai ? "Testing..." : "Test AI Connection"}
          </button>
        </div>
        {testResults.ai && (
          <pre
            className={`ew-admin-test-result ${testResults.ai.success ? "ew-admin-test-result--success" : "ew-admin-test-result--error"}`}
          >
            {testResults.ai.message}
          </pre>
        )}
      </div>

      <h2 style={{ marginTop: 24 }}>Data Source API Keys</h2>
      <div className="ew-card">
        <div className="ew-admin-form-row">
          <label>NewsAPI Key</label>
          <div className="ew-admin-key-field">
            <input
              type={showKeys.newsapi ? "text" : "password"}
              value={config.NEWSAPI_KEY}
              onChange={(e) =>
                setConfig({ ...config, NEWSAPI_KEY: e.target.value })
              }
              placeholder="Enter NewsAPI key..."
            />
            <button
              type="button"
              className="ew-admin-key-toggle"
              onClick={() => toggleShowKey("newsapi")}
              title={showKeys.newsapi ? "Hide key" : "Show key"}
            >
              <KeyVisibilityIcon visible={showKeys.newsapi} />
            </button>
          </div>
          <span className="ew-admin-form-hint">
            Get a free key at newsapi.org — provides news headlines for embassy countries.
          </span>
        </div>
        <div className="ew-admin-form-actions" style={{ marginTop: 8 }}>
          <button
            className="ew-admin-btn ew-admin-btn--sm"
            onClick={() => handleTest("newsapi")}
            disabled={testing.newsapi}
          >
            {testing.newsapi ? "Testing..." : "Test NewsAPI"}
          </button>
        </div>
        {testResults.newsapi && (
          <pre
            className={`ew-admin-test-result ${testResults.newsapi.success ? "ew-admin-test-result--success" : "ew-admin-test-result--error"}`}
          >
            {testResults.newsapi.message}
          </pre>
        )}

        <hr className="ew-admin-divider" />

        <div className="ew-admin-form-row">
          <label>OpenWeatherMap Key</label>
          <div className="ew-admin-key-field">
            <input
              type={showKeys.weather ? "text" : "password"}
              value={config.OPENWEATHER_KEY}
              onChange={(e) =>
                setConfig({ ...config, OPENWEATHER_KEY: e.target.value })
              }
              placeholder="Enter OpenWeatherMap key..."
            />
            <button
              type="button"
              className="ew-admin-key-toggle"
              onClick={() => toggleShowKey("weather")}
              title={showKeys.weather ? "Hide key" : "Show key"}
            >
              <KeyVisibilityIcon visible={showKeys.weather} />
            </button>
          </div>
          <span className="ew-admin-form-hint">
            Get a free key at openweathermap.org — checks for severe weather near embassies.
          </span>
        </div>
        <div className="ew-admin-form-actions" style={{ marginTop: 8 }}>
          <button
            className="ew-admin-btn ew-admin-btn--sm"
            onClick={() => handleTest("weather")}
            disabled={testing.weather}
          >
            {testing.weather ? "Testing..." : "Test Weather API"}
          </button>
        </div>
        {testResults.weather && (
          <pre
            className={`ew-admin-test-result ${testResults.weather.success ? "ew-admin-test-result--success" : "ew-admin-test-result--error"}`}
          >
            {testResults.weather.message}
          </pre>
        )}

        <hr className="ew-admin-divider" />

        <div className="ew-admin-form-row">
          <label>Use Mock Data</label>
          <select
            value={config.USE_MOCK_DATA}
            onChange={(e) =>
              setConfig({ ...config, USE_MOCK_DATA: e.target.value })
            }
            className="ew-filter-select"
            style={{ maxWidth: 200 }}
          >
            <option value="true">Yes (mock data)</option>
            <option value="false">No (real APIs)</option>
          </select>
          <span className="ew-admin-form-hint">
            When enabled, mock data generators are used instead of real API calls.
          </span>
        </div>
      </div>

      <div className="ew-admin-form-actions" style={{ marginTop: 16 }}>
        <button
          className="ew-admin-btn ew-admin-btn--primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save All Configuration"}
        </button>
      </div>
    </div>
  );
}

/* ---- Activity ---- */

function ActivitySection() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useActivity(page);
  const [expandedReasoning, setExpandedReasoning] = useState<string | null>(null);

  const severityColor = (s: string) =>
    s === "CRITICAL" ? "#d83933" : s === "WARNING" ? "#e87722" : "#71767a";

  if (isLoading) return <p>Loading activity...</p>;

  const totalPages = Math.ceil((data?.total ?? 0) / 20);

  return (
    <div className="ew-admin-section">
      <h2>Activity Log</h2>
      <table className="ew-admin-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Source</th>
            <th>Embassy</th>
            <th>Method</th>
            <th>Severity</th>
            <th>Title</th>
          </tr>
        </thead>
        <tbody>
          {(data?.data ?? []).map((item) => (
            <Fragment key={item.id}>
              <tr>
                <td>{new Date(item.timestamp).toLocaleString()}</td>
                <td>{item.source}</td>
                <td>
                  {item.embassyId && item.embassyName ? (
                    <a
                      href={`/embassies/${item.embassyId}`}
                      className="ew-admin-embassy-link"
                    >
                      {item.embassyName}
                    </a>
                  ) : (
                    <span className="ew-admin-unmatched">Unmatched</span>
                  )}
                </td>
                <td>
                  {item.matchedBy === "ai" ? (
                    <button
                      className="ew-admin-method-badge ew-admin-method-badge--ai"
                      onClick={() =>
                        setExpandedReasoning(
                          expandedReasoning === item.id ? null : item.id,
                        )
                      }
                      title="Click to see AI reasoning"
                    >
                      AI
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d={expandedReasoning === item.id ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} />
                      </svg>
                    </button>
                  ) : item.matchedBy === "ai-unmatched" ? (
                    <button
                      className="ew-admin-method-badge ew-admin-method-badge--failed"
                      onClick={() =>
                        setExpandedReasoning(
                          expandedReasoning === item.id ? null : item.id,
                        )
                      }
                      title="Click to see why AI couldn't match"
                    >
                      Failed
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d={expandedReasoning === item.id ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} />
                      </svg>
                    </button>
                  ) : item.matchedBy === "keyword" ? (
                    <span className="ew-admin-method-badge ew-admin-method-badge--keyword">
                      Keyword
                    </span>
                  ) : item.embassyId ? (
                    <span className="ew-admin-method-badge ew-admin-method-badge--direct">
                      Direct
                    </span>
                  ) : (
                    <span className="ew-admin-method-badge ew-admin-method-badge--none">
                      —
                    </span>
                  )}
                </td>
                <td>
                  <span
                    className="ew-severity-badge"
                    style={{ background: severityColor(item.severity) }}
                  >
                    {item.severity}
                  </span>
                </td>
                <td>{item.title}</td>
              </tr>
              {expandedReasoning === item.id && (item.aiReasoning || item.matchedBy === "ai-unmatched") && (
                <tr className="ew-admin-table__expanded">
                  <td colSpan={6}>
                    <div className="ew-admin-ai-reasoning">
                      <div className="ew-admin-ai-reasoning__header">
                        <strong>AI Classification</strong>
                        {item.aiConfidence != null && (
                          <span className="ew-admin-ai-confidence">
                            <span
                              className="ew-admin-ai-confidence__bar"
                              style={{
                                width: `${Math.round(item.aiConfidence * 100)}%`,
                                background:
                                  item.aiConfidence >= 0.8
                                    ? "#2e8540"
                                    : item.aiConfidence >= 0.5
                                      ? "#e8a820"
                                      : "#d83933",
                              }}
                            />
                            <span className="ew-admin-ai-confidence__label">
                              {Math.round(item.aiConfidence * 100)}% confidence
                            </span>
                          </span>
                        )}
                      </div>
                      <div className="ew-admin-ai-reasoning__row">
                        <span className="ew-admin-ai-reasoning__label">Reasoning</span>
                        <span>{item.aiReasoning}</span>
                      </div>
                      {item.aiRelevanceToEmbassy && (
                        <div className="ew-admin-ai-reasoning__row">
                          <span className="ew-admin-ai-reasoning__label">Embassy Relevance</span>
                          <span>{item.aiRelevanceToEmbassy}</span>
                        </div>
                      )}
                      {item.aiKeyEntities && item.aiKeyEntities.length > 0 && (
                        <div className="ew-admin-ai-reasoning__row">
                          <span className="ew-admin-ai-reasoning__label">Key Entities</span>
                          <span className="ew-admin-ai-reasoning__entities">
                            {item.aiKeyEntities.map((e, i) => (
                              <span key={i} className="ew-admin-ai-entity-tag">{e}</span>
                            ))}
                          </span>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div className="ew-admin-pagination">
          <button
            className="ew-admin-btn ew-admin-btn--sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            className="ew-admin-btn ew-admin-btn--sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
