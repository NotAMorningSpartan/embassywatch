import { Fragment, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";

/* ---- Types ---- */

interface HealthEntry {
  status: string;
  message?: string;
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
}

/* ---- Hooks ---- */

function useHealth() {
  return useQuery({
    queryKey: ["admin", "health"],
    queryFn: () =>
      api
        .get<Record<string, HealthEntry | string>>("/api/admin/system/health")
        .then((r) => r.data),
    refetchInterval: 60_000,
  });
}

function useSourcesDetailed() {
  return useQuery({
    queryKey: ["admin", "sources"],
    queryFn: () =>
      api.get<SourceDetailed[]>("/api/admin/sources/detailed").then((r) => r.data),
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
      {tab === "sources" && <SourcesSection />}
      {tab === "users" && <UsersSection />}
      {tab === "config" && <ConfigSection />}
      {tab === "activity" && <ActivitySection />}
    </>
  );
}

/* ---- Health ---- */

function HealthSection() {
  const { data, isLoading, refetch, isFetching } = useHealth();

  const statusColor = (s: string) =>
    s === "healthy" ? "#2e8540" : s === "degraded" ? "#e8a820" : "#d83933";

  if (isLoading) return <p>Loading health data...</p>;

  const entries = data
    ? Object.entries(data).filter(([k]) => k !== "timestamp")
    : [];
  const timestamp = data?.timestamp as string | undefined;

  return (
    <div className="ew-admin-section">
      <div className="ew-admin-section__header">
        <h2>System Health</h2>
        <button
          className="ew-admin-btn"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? "Checking..." : "Run Health Check"}
        </button>
      </div>
      {timestamp && (
        <p className="ew-admin-timestamp">
          Last checked: {new Date(timestamp).toLocaleString()}
        </p>
      )}
      <div className="ew-admin-health-grid">
        {entries.map(([key, val]) => {
          const entry = val as HealthEntry;
          return (
            <div key={key} className="ew-admin-health-card">
              <div
                className="ew-admin-health-card__indicator"
                style={{ background: statusColor(entry.status) }}
              />
              <div className="ew-admin-health-card__info">
                <strong>
                  {key === "ai"
                    ? "AI Endpoint"
                    : key === "database"
                      ? "Database"
                      : key === "redis"
                        ? "Redis"
                        : key.replace("source_", "")}
                </strong>
                <span className="ew-admin-health-card__status">
                  {entry.status}
                </span>
                {entry.message && (
                  <span className="ew-admin-health-card__msg">
                    {entry.message}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---- Sources ---- */

function SourcesSection() {
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

  if (isLoading) return <p>Loading data sources...</p>;

  return (
    <div className="ew-admin-section">
      <h2>Data Sources</h2>
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
                  <span
                    className="ew-admin-status-dot"
                    style={{
                      background:
                        src.healthStatus === "HEALTHY"
                          ? "#2e8540"
                          : src.healthStatus === "DEGRADED"
                            ? "#e8a820"
                            : "#d83933",
                    }}
                  />
                  {src.healthStatus}
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
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string } | null>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});

  // Load config from server
  if (configData && !loaded) {
    setConfig(configData.config);
    setLoaded(true);
  }

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
            placeholder="https://api.example.com/v1/chat/completions"
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
          <input
            type="password"
            value={config.AI_API_KEY}
            onChange={(e) =>
              setConfig({ ...config, AI_API_KEY: e.target.value })
            }
            placeholder="Enter API key..."
          />
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
          <input
            type="password"
            value={config.NEWSAPI_KEY}
            onChange={(e) =>
              setConfig({ ...config, NEWSAPI_KEY: e.target.value })
            }
            placeholder="Enter NewsAPI key..."
          />
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
          <input
            type="password"
            value={config.OPENWEATHER_KEY}
            onChange={(e) =>
              setConfig({ ...config, OPENWEATHER_KEY: e.target.value })
            }
            placeholder="Enter OpenWeatherMap key..."
          />
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
            <th>Severity</th>
            <th>Title</th>
          </tr>
        </thead>
        <tbody>
          {(data?.data ?? []).map((item) => (
            <tr key={item.id}>
              <td>{new Date(item.timestamp).toLocaleString()}</td>
              <td>{item.source}</td>
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
