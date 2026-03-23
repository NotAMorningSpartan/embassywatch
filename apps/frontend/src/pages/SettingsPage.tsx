import { useState, useEffect, useCallback } from "react";
import {
  useCurrentUser,
  useUpdatePreferences,
} from "../hooks/useUser";
import { useAuthStore } from "../stores/useAuthStore";
import api from "../services/api";

/* ---- constants ---- */

const REGIONS = [
  { value: "", label: "All Regions" },
  { value: "AFRICA", label: "Africa" },
  { value: "EAST_ASIA_PACIFIC", label: "East Asia & Pacific" },
  { value: "EUROPE_EURASIA", label: "Europe & Eurasia" },
  { value: "NEAR_EAST", label: "Near East" },
  { value: "SOUTH_CENTRAL_ASIA", label: "South & Central Asia" },
  { value: "WESTERN_HEMISPHERE", label: "Western Hemisphere" },
];

const MAP_CENTER_OPTIONS = [
  { value: "auto", label: "Auto (fit all embassies)" },
  { value: "AFRICA", label: "Africa" },
  { value: "EAST_ASIA_PACIFIC", label: "East Asia & Pacific" },
  { value: "EUROPE_EURASIA", label: "Europe & Eurasia" },
  { value: "NEAR_EAST", label: "Near East" },
  { value: "SOUTH_CENTRAL_ASIA", label: "South & Central Asia" },
  { value: "WESTERN_HEMISPHERE", label: "Western Hemisphere" },
  { value: "last", label: "Last viewed position" },
];

const FEED_LENGTHS = [5, 10, 25, 50];

const KEYBOARD_SHORTCUTS = [
  { keys: "G then D", action: "Go to Dashboard" },
  { keys: "G then E", action: "Go to Embassy List" },
  { keys: "G then W", action: "Go to Watchlist" },
  { keys: "/", action: "Focus search" },
  { keys: "T", action: "Toggle theme" },
  { keys: "?", action: "Show shortcut help" },
];

type Section = "appearance" | "notifications" | "dashboard" | "account";

interface Prefs {
  theme: "light" | "dark" | "system";
  mapStyle: "standard" | "satellite" | "high-contrast";
  sidebarCollapsed: boolean;
  density: "comfortable" | "compact";
  enableKeyboardShortcuts: boolean;
  notificationsEnabled: boolean;
  notifThreatChange: boolean;
  notifNewAssessment: boolean;
  notifDataSourceErrors: boolean;
  notifDailySummary: boolean;
  notifDeliveryEmail: boolean;
  notifEmail: string;
  notifQuietHours: boolean;
  notifQuietStart: string;
  notifQuietEnd: string;
  dashboardRegion: string;
  dashboardMapCenter: string;
  dashboardMapZoom: number;
  dashboardThreatFilters: string[];
  dashboardFeedLength: number;
  dashboardViewMode: "table" | "card";
}

const DEFAULT_PREFS: Prefs = {
  theme: "light",
  mapStyle: "standard",
  sidebarCollapsed: false,
  density: "comfortable",
  enableKeyboardShortcuts: true,
  notificationsEnabled: true,
  notifThreatChange: true,
  notifNewAssessment: false,
  notifDataSourceErrors: false,
  notifDailySummary: false,
  notifDeliveryEmail: false,
  notifEmail: "",
  notifQuietHours: false,
  notifQuietStart: "22:00",
  notifQuietEnd: "07:00",
  dashboardRegion: "",
  dashboardMapCenter: "auto",
  dashboardMapZoom: 2,
  dashboardThreatFilters: ["LOW", "GUARDED", "ELEVATED", "HIGH", "SEVERE"],
  dashboardFeedLength: 10,
  dashboardViewMode: "table",
};

function loadPrefs(serverPrefs: Record<string, unknown> | undefined): Prefs {
  if (!serverPrefs) return { ...DEFAULT_PREFS };
  const s = serverPrefs.settings as Record<string, unknown> | undefined;
  if (!s) return { ...DEFAULT_PREFS };
  return {
    theme: (s.theme as Prefs["theme"]) ?? DEFAULT_PREFS.theme,
    mapStyle: (s.mapStyle as Prefs["mapStyle"]) ?? DEFAULT_PREFS.mapStyle,
    sidebarCollapsed: (s.sidebarCollapsed as boolean) ?? DEFAULT_PREFS.sidebarCollapsed,
    density: (s.density as Prefs["density"]) ?? DEFAULT_PREFS.density,
    enableKeyboardShortcuts: (s.enableKeyboardShortcuts as boolean) ?? DEFAULT_PREFS.enableKeyboardShortcuts,
    notificationsEnabled: (s.notificationsEnabled as boolean) ?? DEFAULT_PREFS.notificationsEnabled,
    notifThreatChange: (s.notifThreatChange as boolean) ?? DEFAULT_PREFS.notifThreatChange,
    notifNewAssessment: (s.notifNewAssessment as boolean) ?? DEFAULT_PREFS.notifNewAssessment,
    notifDataSourceErrors: (s.notifDataSourceErrors as boolean) ?? DEFAULT_PREFS.notifDataSourceErrors,
    notifDailySummary: (s.notifDailySummary as boolean) ?? DEFAULT_PREFS.notifDailySummary,
    notifDeliveryEmail: (s.notifDeliveryEmail as boolean) ?? DEFAULT_PREFS.notifDeliveryEmail,
    notifEmail: (s.notifEmail as string) ?? DEFAULT_PREFS.notifEmail,
    notifQuietHours: (s.notifQuietHours as boolean) ?? DEFAULT_PREFS.notifQuietHours,
    notifQuietStart: (s.notifQuietStart as string) ?? DEFAULT_PREFS.notifQuietStart,
    notifQuietEnd: (s.notifQuietEnd as string) ?? DEFAULT_PREFS.notifQuietEnd,
    dashboardRegion: (s.dashboardRegion as string) ?? DEFAULT_PREFS.dashboardRegion,
    dashboardMapCenter: (s.dashboardMapCenter as string) ?? DEFAULT_PREFS.dashboardMapCenter,
    dashboardMapZoom: (s.dashboardMapZoom as number) ?? DEFAULT_PREFS.dashboardMapZoom,
    dashboardThreatFilters: (s.dashboardThreatFilters as string[]) ?? DEFAULT_PREFS.dashboardThreatFilters,
    dashboardFeedLength: (s.dashboardFeedLength as number) ?? DEFAULT_PREFS.dashboardFeedLength,
    dashboardViewMode: (s.dashboardViewMode as Prefs["dashboardViewMode"]) ?? DEFAULT_PREFS.dashboardViewMode,
  };
}

export default function SettingsPage() {
  const { data: currentUser, isLoading } = useCurrentUser();
  const updatePreferences = useUpdatePreferences();
  const authUser = useAuthStore((s) => s.user);

  const [section, setSection] = useState<Section>("appearance");
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [savedPrefs, setSavedPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // Display name
  const [displayName, setDisplayName] = useState("");

  // Load prefs from server
  useEffect(() => {
    if (currentUser) {
      const loaded = loadPrefs(currentUser.preferences);
      setPrefs(loaded);
      setSavedPrefs(loaded);
      setDisplayName(currentUser.displayName);
    }
  }, [currentUser]);

  // Count unsaved changes
  const changedCount = Object.keys(prefs).filter(
    (k) => JSON.stringify(prefs[k as keyof Prefs]) !== JSON.stringify(savedPrefs[k as keyof Prefs]),
  ).length + (displayName !== (currentUser?.displayName ?? "") ? 1 : 0);

  const hasChanges = changedCount > 0;

  // Browser beforeunload
  useEffect(() => {
    if (!hasChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasChanges]);

  const updatePref = useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg("");
    try {
      await updatePreferences.mutateAsync({
        settings: { ...prefs },
        displayName: undefined, // handled by the preferences endpoint
      });
      // Update display name if changed
      if (displayName !== currentUser?.displayName) {
        await api.patch("/api/users/me/preferences", { displayName });
      }
      setSavedPrefs({ ...prefs });
      setSuccessMsg("Settings saved successfully.");
      setTimeout(() => setSuccessMsg(""), 5000);
    } catch {
      setErrorMsg("Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setPrefs({ ...savedPrefs });
    setDisplayName(currentUser?.displayName ?? "");
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      await updatePreferences.mutateAsync({ settings: {} });
      setPrefs({ ...DEFAULT_PREFS });
      setSavedPrefs({ ...DEFAULT_PREFS });
      setShowResetModal(false);
      setSuccessMsg("Settings reset to defaults.");
      setTimeout(() => setSuccessMsg(""), 5000);
    } catch {
      setErrorMsg("Failed to reset settings.");
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    setPasswordError("");
    setPasswordMsg("");
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    setChangingPassword(true);
    try {
      await api.patch("/api/users/me/password", {
        currentPassword,
        newPassword,
      });
      setPasswordMsg("Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordMsg(""), 5000);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Failed to update password.";
      setPasswordError(msg);
    } finally {
      setChangingPassword(false);
    }
  };

  const toggleThreatFilter = (level: string) => {
    setPrefs((p) => ({
      ...p,
      dashboardThreatFilters: p.dashboardThreatFilters.includes(level)
        ? p.dashboardThreatFilters.filter((l) => l !== level)
        : [...p.dashboardThreatFilters, level],
    }));
  };

  if (isLoading) {
    return (
      <div className="ew-settings">
        <h1>Settings</h1>
        <div className="ew-list-skeleton">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="ew-list-skeleton__row" />
          ))}
        </div>
      </div>
    );
  }

  const isAdmin = authUser?.role === "ADMIN";

  return (
    <div className="ew-settings">
      <div className="ew-settings__header">
        <h1>Settings</h1>
        <p className="ew-settings__sub">Manage your preferences and account.</p>
      </div>

      {/* Success / Error alerts */}
      {successMsg && (
        <div className="ew-alert ew-alert--success ew-settings__alert">
          {successMsg}
          <button className="ew-alert__close" onClick={() => setSuccessMsg("")}>
            &times;
          </button>
        </div>
      )}
      {errorMsg && (
        <div className="ew-alert ew-alert--warning ew-settings__alert">
          {errorMsg}
          <button className="ew-alert__close" onClick={() => setErrorMsg("")}>
            &times;
          </button>
        </div>
      )}

      <div className="ew-settings__layout">
        {/* Side navigation */}
        <nav className="ew-settings__nav">
          {(
            [
              ["appearance", "Appearance"],
              ["notifications", "Notifications"],
              ["dashboard", "Dashboard Defaults"],
              ["account", "Account"],
            ] as [Section, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              className={`ew-settings__nav-item${section === key ? " ew-settings__nav-item--active" : ""}`}
              onClick={() => setSection(key)}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="ew-settings__content">
          {/* ---- APPEARANCE ---- */}
          {section === "appearance" && (
            <div className="ew-settings__section">
              <div className="ew-settings__card">
                <h2>Map Style</h2>
                <p className="ew-settings__desc">Select the base map tile layer.</p>
                <div className="ew-settings__radios">
                  {(["standard", "satellite", "high-contrast"] as const).map((s) => (
                    <label key={s} className="ew-settings__radio">
                      <input
                        type="radio"
                        name="mapStyle"
                        checked={prefs.mapStyle === s}
                        onChange={() => updatePref("mapStyle", s)}
                      />
                      <span className="ew-settings__radio-label">
                        {s === "high-contrast"
                          ? "High Contrast"
                          : s.charAt(0).toUpperCase() + s.slice(1)}
                      </span>
                    </label>
                  ))}
                </div>
                <p className="ew-settings__note">
                  Satellite tiles require an internet connection and may load slower.
                </p>
              </div>

              <div className="ew-settings__card">
                <h2>Sidebar</h2>
                <label className="ew-settings__toggle-row">
                  <input
                    type="checkbox"
                    checked={prefs.sidebarCollapsed}
                    onChange={(e) => updatePref("sidebarCollapsed", e.target.checked)}
                  />
                  Collapse sidebar by default
                </label>
              </div>

              <div className="ew-settings__card">
                <h2>Information Density</h2>
                <p className="ew-settings__desc">
                  Control spacing and sizing across the interface.
                </p>
                <div className="ew-settings__radios">
                  {(["comfortable", "compact"] as const).map((d) => (
                    <label key={d} className="ew-settings__radio">
                      <input
                        type="radio"
                        name="density"
                        checked={prefs.density === d}
                        onChange={() => updatePref("density", d)}
                      />
                      <span className="ew-settings__radio-label">
                        {d.charAt(0).toUpperCase() + d.slice(1)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="ew-settings__card">
                <h2>Keyboard Shortcuts</h2>
                <label className="ew-settings__toggle-row">
                  <input
                    type="checkbox"
                    checked={prefs.enableKeyboardShortcuts}
                    onChange={(e) =>
                      updatePref("enableKeyboardShortcuts", e.target.checked)
                    }
                  />
                  Enable keyboard shortcuts
                </label>
                <table className="ew-settings__shortcuts-table">
                  <thead>
                    <tr>
                      <th>Keys</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {KEYBOARD_SHORTCUTS.map((s) => (
                      <tr key={s.keys}>
                        <td>
                          <kbd>{s.keys}</kbd>
                        </td>
                        <td>{s.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ---- NOTIFICATIONS ---- */}
          {section === "notifications" && (
            <div className="ew-settings__section">
              <div className="ew-alert ew-alert--info ew-settings__alert">
                Notifications are currently in-app only for this demonstration
                environment.
              </div>

              <div className="ew-settings__card">
                <h2>Notifications</h2>
                <label className="ew-settings__toggle-row ew-settings__toggle-row--primary">
                  <input
                    type="checkbox"
                    checked={prefs.notificationsEnabled}
                    onChange={(e) =>
                      updatePref("notificationsEnabled", e.target.checked)
                    }
                  />
                  <strong>Enable notifications</strong>
                </label>
              </div>

              <div
                className={`ew-settings__card${!prefs.notificationsEnabled ? " ew-settings__card--disabled" : ""}`}
              >
                <h2>Notification Types</h2>
                <label className="ew-settings__toggle-row">
                  <input
                    type="checkbox"
                    checked={prefs.notifThreatChange}
                    disabled={!prefs.notificationsEnabled}
                    onChange={(e) => updatePref("notifThreatChange", e.target.checked)}
                  />
                  <span>
                    <strong>Threat level changes on watched embassies</strong>
                    <br />
                    <span className="ew-settings__desc">
                      Get notified when a watched embassy's threat level goes up or down.
                    </span>
                  </span>
                </label>
                <label className="ew-settings__toggle-row">
                  <input
                    type="checkbox"
                    checked={prefs.notifNewAssessment}
                    disabled={!prefs.notificationsEnabled}
                    onChange={(e) =>
                      updatePref("notifNewAssessment", e.target.checked)
                    }
                  />
                  <span>
                    <strong>New AI assessments completed</strong>
                    <br />
                    <span className="ew-settings__desc">
                      Notified when a new analysis run finishes for any watched embassy.
                    </span>
                  </span>
                </label>
                {isAdmin && (
                  <label className="ew-settings__toggle-row">
                    <input
                      type="checkbox"
                      checked={prefs.notifDataSourceErrors}
                      disabled={!prefs.notificationsEnabled}
                      onChange={(e) =>
                        updatePref("notifDataSourceErrors", e.target.checked)
                      }
                    />
                    <span>
                      <strong>Data source outages or errors</strong>
                      <br />
                      <span className="ew-settings__desc">
                        Admin-only: alerts when a data source fails or goes unhealthy.
                      </span>
                    </span>
                  </label>
                )}
                <label className="ew-settings__toggle-row">
                  <input
                    type="checkbox"
                    checked={prefs.notifDailySummary}
                    disabled={!prefs.notificationsEnabled}
                    onChange={(e) =>
                      updatePref("notifDailySummary", e.target.checked)
                    }
                  />
                  <span>
                    <strong>Daily watchlist summary digest</strong>
                    <br />
                    <span className="ew-settings__desc">
                      A daily summary of your watchlisted embassies' status.
                    </span>
                  </span>
                </label>
              </div>

              <div
                className={`ew-settings__card${!prefs.notificationsEnabled ? " ew-settings__card--disabled" : ""}`}
              >
                <h2>Delivery Method</h2>
                <label className="ew-settings__toggle-row">
                  <input type="checkbox" checked disabled />
                  In-App <span className="ew-settings__badge">Always on</span>
                </label>
                <label className="ew-settings__toggle-row">
                  <input
                    type="checkbox"
                    checked={prefs.notifDeliveryEmail}
                    disabled={!prefs.notificationsEnabled}
                    onChange={(e) =>
                      updatePref("notifDeliveryEmail", e.target.checked)
                    }
                  />
                  Email
                  {prefs.notifDeliveryEmail && (
                    <input
                      type="email"
                      className="ew-settings__inline-input"
                      value={prefs.notifEmail}
                      onChange={(e) => updatePref("notifEmail", e.target.value)}
                      placeholder="your@email.com"
                    />
                  )}
                </label>
                <label className="ew-settings__toggle-row">
                  <input type="checkbox" disabled />
                  SMS <span className="ew-settings__badge ew-settings__badge--muted">Coming soon</span>
                </label>
              </div>

              <div
                className={`ew-settings__card${!prefs.notificationsEnabled ? " ew-settings__card--disabled" : ""}`}
              >
                <h2>Quiet Hours</h2>
                <label className="ew-settings__toggle-row">
                  <input
                    type="checkbox"
                    checked={prefs.notifQuietHours}
                    disabled={!prefs.notificationsEnabled}
                    onChange={(e) =>
                      updatePref("notifQuietHours", e.target.checked)
                    }
                  />
                  Suppress non-critical notifications between:
                </label>
                {prefs.notifQuietHours && prefs.notificationsEnabled && (
                  <div className="ew-settings__time-range">
                    <input
                      type="time"
                      value={prefs.notifQuietStart}
                      onChange={(e) => updatePref("notifQuietStart", e.target.value)}
                      className="ew-settings__time-input"
                    />
                    <span>to</span>
                    <input
                      type="time"
                      value={prefs.notifQuietEnd}
                      onChange={(e) => updatePref("notifQuietEnd", e.target.value)}
                      className="ew-settings__time-input"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ---- DASHBOARD DEFAULTS ---- */}
          {section === "dashboard" && (
            <div className="ew-settings__section">
              <div className="ew-settings__card">
                <h2>Default Region Filter</h2>
                <select
                  className="ew-filter-select"
                  value={prefs.dashboardRegion}
                  onChange={(e) => updatePref("dashboardRegion", e.target.value)}
                >
                  {REGIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ew-settings__card">
                <h2>Default Map Center</h2>
                <select
                  className="ew-filter-select"
                  value={prefs.dashboardMapCenter}
                  onChange={(e) => updatePref("dashboardMapCenter", e.target.value)}
                >
                  {MAP_CENTER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ew-settings__card">
                <h2>Default Map Zoom Level</h2>
                <p className="ew-settings__desc">
                  {prefs.dashboardMapZoom === 2
                    ? "World view"
                    : prefs.dashboardMapZoom <= 4
                      ? "Continental view"
                      : prefs.dashboardMapZoom <= 6
                        ? "Regional view"
                        : "Country view"}
                  {" "}(zoom {prefs.dashboardMapZoom})
                </p>
                <input
                  type="range"
                  min={2}
                  max={8}
                  value={prefs.dashboardMapZoom}
                  onChange={(e) =>
                    updatePref("dashboardMapZoom", Number(e.target.value))
                  }
                  className="ew-settings__slider"
                />
                <div className="ew-settings__slider-labels">
                  <span>World (2)</span>
                  <span>Country (8)</span>
                </div>
              </div>

              <div className="ew-settings__card">
                <h2>Default Threat Level Filters</h2>
                <p className="ew-settings__desc">
                  Which threat levels to show on the dashboard by default.
                </p>
                <div className="ew-settings__checkboxes">
                  {["LOW", "GUARDED", "ELEVATED", "HIGH", "SEVERE"].map((level) => (
                    <label key={level} className="ew-settings__checkbox">
                      <input
                        type="checkbox"
                        checked={prefs.dashboardThreatFilters.includes(level)}
                        onChange={() => toggleThreatFilter(level)}
                      />
                      {level.charAt(0) + level.slice(1).toLowerCase()}
                    </label>
                  ))}
                </div>
              </div>

              <div className="ew-settings__card">
                <h2>Recent Assessments Feed</h2>
                <p className="ew-settings__desc">
                  Number of recent assessments shown on the dashboard.
                </p>
                <select
                  className="ew-filter-select"
                  value={prefs.dashboardFeedLength}
                  onChange={(e) =>
                    updatePref("dashboardFeedLength", Number(e.target.value))
                  }
                >
                  {FEED_LENGTHS.map((n) => (
                    <option key={n} value={n}>
                      {n} items
                    </option>
                  ))}
                </select>
              </div>

              <div className="ew-settings__card">
                <h2>Default View Mode</h2>
                <div className="ew-settings__radios">
                  {(["table", "card"] as const).map((v) => (
                    <label key={v} className="ew-settings__radio">
                      <input
                        type="radio"
                        name="viewMode"
                        checked={prefs.dashboardViewMode === v}
                        onChange={() => updatePref("dashboardViewMode", v)}
                      />
                      <span className="ew-settings__radio-label">
                        {v === "table" ? "Table View" : "Card View"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ---- ACCOUNT ---- */}
          {section === "account" && (
            <div className="ew-settings__section">
              <div className="ew-settings__card">
                <h2>Profile</h2>
                <div className="ew-settings__field">
                  <label>Display Name</label>
                  <input
                    type="text"
                    className="ew-filter-input"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
                <div className="ew-settings__field">
                  <label>Email</label>
                  <input
                    type="text"
                    className="ew-filter-input"
                    value={currentUser?.email ?? ""}
                    disabled
                  />
                  <p className="ew-settings__note">
                    Contact an administrator to change your email.
                  </p>
                </div>
                <div className="ew-settings__field">
                  <label>Role</label>
                  <span className="ew-settings__role-badge">
                    {authUser?.role ?? "ANALYST"}
                  </span>
                </div>
              </div>

              <div className="ew-settings__card">
                <h2>Change Password</h2>
                {passwordMsg && (
                  <div className="ew-alert ew-alert--success" style={{ marginBottom: 12 }}>
                    {passwordMsg}
                  </div>
                )}
                {passwordError && (
                  <div className="ew-alert ew-alert--warning" style={{ marginBottom: 12 }}>
                    {passwordError}
                  </div>
                )}
                <div className="ew-settings__field">
                  <label>Current Password</label>
                  <input
                    type="password"
                    className="ew-filter-input"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
                <div className="ew-settings__field">
                  <label>New Password</label>
                  <input
                    type="password"
                    className="ew-filter-input"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  {newPassword && newPassword.length < 8 && (
                    <p className="ew-settings__error-text">
                      Must be at least 8 characters.
                    </p>
                  )}
                </div>
                <div className="ew-settings__field">
                  <label>Confirm New Password</label>
                  <input
                    type="password"
                    className="ew-filter-input"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  {confirmPassword && confirmPassword !== newPassword && (
                    <p className="ew-settings__error-text">
                      Passwords do not match.
                    </p>
                  )}
                </div>
                <button
                  className="ew-btn ew-btn--primary"
                  onClick={handlePasswordChange}
                  disabled={
                    changingPassword ||
                    !currentPassword ||
                    newPassword.length < 8 ||
                    newPassword !== confirmPassword
                  }
                >
                  {changingPassword ? "Updating..." : "Update Password"}
                </button>
              </div>

              <div className="ew-settings__card">
                <p className="ew-settings__muted">
                  Account created:{" "}
                  {currentUser?.createdAt
                    ? new Date(currentUser.createdAt).toLocaleDateString()
                    : "Unknown"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reset link */}
      <div className="ew-settings__reset">
        <button
          className="ew-settings__reset-btn"
          onClick={() => setShowResetModal(true)}
        >
          Reset All Settings to Defaults
        </button>
      </div>

      {/* Floating save bar */}
      {hasChanges && (
        <div className="ew-settings__save-bar ew-settings__save-bar--visible">
          <span>
            {changedCount} unsaved change{changedCount > 1 ? "s" : ""}
          </span>
          <div className="ew-settings__save-bar-actions">
            <button
              className="ew-btn ew-btn--outline"
              onClick={handleDiscard}
              disabled={saving}
            >
              Discard Changes
            </button>
            <button
              className="ew-btn ew-btn--primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      )}

      {/* Reset modal */}
      {showResetModal && (
        <div className="ew-modal-overlay" onClick={() => setShowResetModal(false)}>
          <div className="ew-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Reset All Settings</h3>
            <p>
              This will reset all preferences to their default values. This
              cannot be undone.
            </p>
            <div className="ew-modal__actions">
              <button className="ew-btn ew-btn--danger" onClick={handleReset}>
                Reset
              </button>
              <button
                className="ew-btn ew-btn--outline"
                onClick={() => setShowResetModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
