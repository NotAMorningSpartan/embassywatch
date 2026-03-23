import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Link } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  useWatchlist,
  useWatchlistChanges,
  useRemoveFromWatchlist,
  useUpdatePreferences,
  useCurrentUser,
} from "../hooks/useUser";
import type { WatchlistEmbassy } from "../hooks/useUser";
import { usePreferencesStore } from "../stores/usePreferencesStore";
import { useAuthStore } from "../stores/useAuthStore";

const THREAT_COLORS: Record<string, string> = {
  LOW: "#2e8540",
  GUARDED: "#2e75b6",
  ELEVATED: "#e8a820",
  HIGH: "#e87722",
  SEVERE: "#d83933",
};

const THREAT_LABELS: Record<string, string> = {
  LOW: "Low",
  GUARDED: "Guarded",
  ELEVATED: "Elevated",
  HIGH: "High",
  SEVERE: "Severe",
};

const THREAT_ORDER: Record<string, number> = {
  SEVERE: 5,
  HIGH: 4,
  ELEVATED: 3,
  GUARDED: 2,
  LOW: 1,
};

const SORT_OPTIONS = [
  { value: "threat_desc", label: "Threat Level (High → Low)" },
  { value: "name_asc", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
  { value: "threat_asc", label: "Threat Level (Low → High)" },
  { value: "assessed_desc", label: "Last Assessed (Recent)" },
];

type MapStyle = "standard" | "satellite" | "high-contrast";

const TILE_URLS: Record<MapStyle, { light: string; dark: string }> = {
  standard: {
    light: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  },
  satellite: {
    light: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    dark: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  },
  "high-contrast": {
    light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    dark: "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
  },
};

function getTileUrl(mapStyle: MapStyle, darkMode: boolean): string {
  const entry = TILE_URLS[mapStyle] ?? TILE_URLS.standard;
  return darkMode ? entry.dark : entry.light;
}

function relativeTime(date: string | null): string {
  if (!date) return "Never";
  const ms = Date.now() - new Date(date).getTime();
  if (ms < 60_000) return "Just now";
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h ago`;
  return `${Math.floor(ms / 86400_000)}d ago`;
}

type ViewMode = "table" | "grid";

export default function WatchlistPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState("threat_desc");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [threatFilter, setThreatFilter] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [showBulkRemoveModal, setShowBulkRemoveModal] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const theme = usePreferencesStore((s) => s.theme);
  const user = useAuthStore((s) => s.user);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const cardRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

  // Map refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: watchlist, isLoading, isError, refetch } = useWatchlist({
    sort,
    search: debouncedSearch || undefined,
  });
  const { data: changes } = useWatchlistChanges(7);
  const removeFromWatchlist = useRemoveFromWatchlist();
  const { data: currentUser } = useCurrentUser();
  const updatePreferences = useUpdatePreferences();
  const mapStyle = ((currentUser?.preferences?.settings as Record<string, unknown>)?.mapStyle as MapStyle) ?? "standard";

  // Apply client-side threat filter
  const embassies = useMemo(() => {
    let list = watchlist ?? [];
    if (threatFilter) {
      list = list.filter((e) => e.currentThreatLevel === threatFilter);
    }
    return list;
  }, [watchlist, threatFilter]);

  // Threat breakdown
  const threatBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of watchlist ?? []) {
      counts[e.currentThreatLevel] = (counts[e.currentThreatLevel] || 0) + 1;
    }
    return counts;
  }, [watchlist]);

  // Highest threat embassy
  const highestThreat = useMemo(() => {
    if (!watchlist?.length) return null;
    return [...watchlist].sort(
      (a, b) =>
        (THREAT_ORDER[b.currentThreatLevel] ?? 0) -
        (THREAT_ORDER[a.currentThreatLevel] ?? 0),
    )[0];
  }, [watchlist]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 18,
      scrollWheelZoom: true,
    });
    tileRef.current = L.tileLayer(
      getTileUrl(mapStyle, theme === "dark"),
    ).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Switch tiles on theme change
  useEffect(() => {
    if (!tileRef.current) return;
    tileRef.current.setUrl(getTileUrl(mapStyle, theme === "dark"));
  }, [theme, mapStyle]);

  // Update markers
  useEffect(() => {
    if (!mapRef.current) return;
    // Remove old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (!embassies.length) return;

    const scrollToEmbassy = (id: string) => {
      setHighlightId(id);
      const el =
        viewMode === "table" ? rowRefs.current[id] : cardRefs.current[id];
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => setHighlightId(null), 2000);
    };

    embassies.forEach((e) => {
      const color = THREAT_COLORS[e.currentThreatLevel] ?? "#71767a";
      const marker = L.circleMarker([e.latitude, e.longitude], {
        radius: 8,
        color,
        fillColor: color,
        fillOpacity: 0.85,
        weight: 2,
      });
      marker.bindPopup(`
        <div class="ew-map-popup">
          <strong>${e.name}</strong>
          <div class="ew-map-popup__location">${e.city}, ${e.country}</div>
          <span class="ew-map-popup__threat" style="background:${color}">${THREAT_LABELS[e.currentThreatLevel]}</span>
          <a class="ew-map-popup__link" href="/embassies/${e.id}">View Details &rarr;</a>
        </div>
      `);
      marker.on("click", () => scrollToEmbassy(e.id));
      marker.addTo(mapRef.current!);
      markersRef.current.push(marker);
    });

    // Fit bounds
    const bounds = L.latLngBounds(
      embassies.map((e) => [e.latitude, e.longitude] as [number, number]),
    );
    mapRef.current.fitBounds(bounds.pad(0.2));
  }, [embassies, viewMode]);

  // Resize handler
  useEffect(() => {
    const timer = setTimeout(() => mapRef.current?.invalidateSize(), 200);
    return () => clearTimeout(timer);
  }, [embassies]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () =>
    setSelectedIds(new Set(embassies.map((e) => e.id)));
  const deselectAll = () => setSelectedIds(new Set());

  const handleRemove = (id: string) => {
    removeFromWatchlist.mutate(id);
    setConfirmRemoveId(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleBulkRemove = () => {
    selectedIds.forEach((id) => removeFromWatchlist.mutate(id));
    setSelectedIds(new Set());
    setShowBulkRemoveModal(false);
  };

  // Notification prefs
  const notifPrefs =
    (currentUser?.preferences?.notifications as Record<string, unknown>) || {};
  const [notifThreatChange, setNotifThreatChange] = useState(
    (notifPrefs.watchlistThreatChange as boolean) ?? true,
  );
  const [notifNewAssessment, setNotifNewAssessment] = useState(
    (notifPrefs.watchlistNewAssessment as boolean) ?? false,
  );

  const saveNotifPrefs = () => {
    updatePreferences.mutate({
      notifications: {
        ...notifPrefs,
        watchlistThreatChange: notifThreatChange,
        watchlistNewAssessment: notifNewAssessment,
      },
    });
  };

  // Empty state
  if (!isLoading && !isError && (!watchlist || watchlist.length === 0)) {
    return (
      <div className="ew-watchlist-empty">
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--ew-gray)"
          strokeWidth="1.5"
        >
          <path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26z" />
        </svg>
        <h2>You haven't added any embassies yet</h2>
        <p>
          Add embassies to your watchlist from the Embassy Directory or any
          embassy detail page.
        </p>
        <Link to="/embassies" className="ew-btn ew-btn--primary">
          Browse Embassies
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="ew-list-header">
        <h1>My Watchlist</h1>
        <p className="ew-list-header__sub">
          {isLoading
            ? "Loading..."
            : `Tracking ${watchlist?.length ?? 0} embassies`}
        </p>
        <p className="ew-watchlist-helper">
          Add embassies to your watchlist from the Embassy Directory or any
          embassy detail page.
        </p>
      </div>

      {/* Notification Settings (collapsible) */}
      <div className="ew-watchlist-notif">
        <button
          className="ew-watchlist-notif__toggle"
          onClick={() => setShowNotifSettings(!showNotifSettings)}
        >
          {showNotifSettings ? "▾" : "▸"} Notification Settings for Watchlist
        </button>
        {showNotifSettings && (
          <div className="ew-watchlist-notif__body">
            <label className="ew-watchlist-notif__option">
              <input
                type="checkbox"
                checked={notifThreatChange}
                onChange={(e) => setNotifThreatChange(e.target.checked)}
              />
              Notify me when a watched embassy's threat level changes
            </label>
            <label className="ew-watchlist-notif__option">
              <input
                type="checkbox"
                checked={notifNewAssessment}
                onChange={(e) => setNotifNewAssessment(e.target.checked)}
              />
              Notify me when a new assessment is generated for a watched embassy
            </label>
            <div className="ew-watchlist-notif__method">
              <label>Notification method:</label>
              <select className="ew-filter-select ew-filter-select--sm">
                <option value="in-app">In-app</option>
                <option disabled>Email (coming soon)</option>
                <option disabled>SMS (coming soon)</option>
              </select>
            </div>
            <button
              className="ew-btn ew-btn--primary ew-btn--sm"
              onClick={saveNotifPrefs}
              disabled={updatePreferences.isPending}
            >
              {updatePreferences.isPending ? "Saving..." : "Save Preferences"}
            </button>
          </div>
        )}
      </div>

      {/* Overview bar */}
      {!isLoading && watchlist && watchlist.length > 0 && (
        <div className="ew-watchlist-overview">
          <div className="ew-watchlist-overview__cards">
            {Object.entries(threatBreakdown)
              .sort(
                ([a], [b]) =>
                  (THREAT_ORDER[b] ?? 0) - (THREAT_ORDER[a] ?? 0),
              )
              .map(([level, count]) => (
                <button
                  key={level}
                  className={`ew-watchlist-overview__card${threatFilter === level ? " ew-watchlist-overview__card--active" : ""}`}
                  style={{
                    borderColor: THREAT_COLORS[level],
                    background:
                      threatFilter === level
                        ? THREAT_COLORS[level]
                        : undefined,
                    color: threatFilter === level ? "#fff" : THREAT_COLORS[level],
                  }}
                  onClick={() =>
                    setThreatFilter(threatFilter === level ? null : level)
                  }
                >
                  <strong>{count}</strong> {THREAT_LABELS[level]}
                </button>
              ))}
            {threatFilter && (
              <button
                className="ew-filter-bar__clear"
                onClick={() => setThreatFilter(null)}
              >
                Clear
              </button>
            )}
          </div>
          {highestThreat &&
            (THREAT_ORDER[highestThreat.currentThreatLevel] ?? 0) >= 4 && (
              <Link
                to={`/embassies/${highestThreat.id}`}
                className={`ew-watchlist-alert ew-watchlist-alert--${highestThreat.currentThreatLevel === "SEVERE" ? "error" : "warning"}`}
              >
                <strong>Highest active threat:</strong> {highestThreat.name} —{" "}
                <span
                  style={{
                    color: THREAT_COLORS[highestThreat.currentThreatLevel],
                    fontWeight: 700,
                  }}
                >
                  {THREAT_LABELS[highestThreat.currentThreatLevel]}
                </span>
              </Link>
            )}
        </div>
      )}

      {/* Mini map */}
      {!isLoading && embassies.length > 0 && (
        <div className="ew-watchlist-map">
          <div ref={mapContainerRef} style={{ height: "100%", width: "100%" }} />
        </div>
      )}

      {/* Filter/sort bar */}
      <div className="ew-filter-bar" style={{ marginTop: 16 }}>
        <div className="ew-filter-bar__top">
          <div className="ew-filter-bar__search">
            <input
              type="text"
              placeholder="Search watchlist..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ew-filter-input"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="ew-filter-select"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <div className="ew-filter-bar__views">
            <button
              className={`ew-view-btn${viewMode === "table" ? " ew-view-btn--active" : ""}`}
              onClick={() => setViewMode("table")}
              title="Table view"
            >
              &#9776;
            </button>
            <button
              className={`ew-view-btn${viewMode === "grid" ? " ew-view-btn--active" : ""}`}
              onClick={() => setViewMode("grid")}
              title="Grid view"
            >
              &#9638;
            </button>
          </div>
          <div className="ew-watchlist-select-controls">
            <button
              className="ew-btn ew-btn--sm ew-btn--outline"
              onClick={selectAll}
            >
              Select All
            </button>
            {selectedIds.size > 0 && (
              <button
                className="ew-btn ew-btn--sm ew-btn--outline"
                onClick={deselectAll}
              >
                Deselect All
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="ew-list-skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="ew-list-skeleton__row" />
          ))}
        </div>
      ) : isError ? (
        <div className="ew-alert ew-alert--warning">
          Failed to load watchlist.{" "}
          <button className="ew-admin-btn" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      ) : embassies.length === 0 ? (
        <div className="ew-list-empty">
          <div className="ew-list-empty__icon">&#128269;</div>
          <p>No embassies match your filter</p>
          <button
            className="ew-admin-btn"
            onClick={() => {
              setSearch("");
              setThreatFilter(null);
            }}
          >
            Clear Filters
          </button>
        </div>
      ) : viewMode === "table" ? (
        <div className="ew-list-table-wrap">
          <table className="ew-list-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={
                      selectedIds.size === embassies.length &&
                      embassies.length > 0
                    }
                    onChange={() =>
                      selectedIds.size === embassies.length
                        ? deselectAll()
                        : selectAll()
                    }
                  />
                </th>
                <th>Name</th>
                <th>City</th>
                <th>Country</th>
                <th>Region</th>
                <th>Threat Level</th>
                <th>Last Assessed</th>
                <th>Trend</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {embassies.map((e, i) => (
                <tr
                  key={e.id}
                  ref={(el) => {
                    rowRefs.current[e.id] = el;
                  }}
                  className={`${i % 2 === 1 ? "ew-list-table__zebra" : ""}${highlightId === e.id ? " ew-watchlist-highlight" : ""}`}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(e.id)}
                      onChange={() => toggleSelect(e.id)}
                    />
                  </td>
                  <td className="ew-list-table__name">{e.name}</td>
                  <td>{e.city}</td>
                  <td>{e.country}</td>
                  <td>{e.region.replace(/_/g, " ")}</td>
                  <td>
                    <span
                      className="ew-list-table__threat-badge"
                      style={{
                        background: THREAT_COLORS[e.currentThreatLevel],
                      }}
                    >
                      {THREAT_LABELS[e.currentThreatLevel]}
                    </span>
                  </td>
                  <td
                    title={
                      e.lastAssessedAt
                        ? new Date(e.lastAssessedAt).toLocaleString()
                        : ""
                    }
                  >
                    {relativeTime(e.lastAssessedAt)}
                  </td>
                  <td>
                    <TrendIndicator trend={e.trend} />
                  </td>
                  <td className="ew-list-table__actions">
                    <Link
                      to={`/embassies/${e.id}`}
                      className="ew-list-table__view"
                    >
                      View
                    </Link>
                    <span className="ew-watchlist-remove-wrap">
                      {confirmRemoveId === e.id ? (
                        <span className="ew-watchlist-confirm-tooltip">
                          Remove?{" "}
                          <button
                            className="ew-btn ew-btn--sm ew-btn--danger"
                            onClick={() => handleRemove(e.id)}
                          >
                            Yes
                          </button>
                          <button
                            className="ew-btn ew-btn--sm ew-btn--outline"
                            onClick={() => setConfirmRemoveId(null)}
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          className="ew-watchlist-remove-btn"
                          onClick={() => setConfirmRemoveId(e.id)}
                          title="Remove from watchlist"
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="ew-list-grid">
          {embassies.map((e) => (
            <Link
              key={e.id}
              to={`/embassies/${e.id}`}
              className={`ew-list-card${highlightId === e.id ? " ew-watchlist-highlight" : ""}`}
              ref={(el) => {
                cardRefs.current[e.id] = el;
              }}
            >
              <div className="ew-list-card__top">
                <span
                  className="ew-list-card__threat"
                  style={{
                    background: THREAT_COLORS[e.currentThreatLevel],
                  }}
                >
                  {THREAT_LABELS[e.currentThreatLevel]}
                </span>
                <span className="ew-list-card__trend">
                  <TrendIndicator trend={e.trend} />
                </span>
                <input
                  type="checkbox"
                  checked={selectedIds.has(e.id)}
                  onChange={(ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    toggleSelect(e.id);
                  }}
                  onClick={(ev) => ev.stopPropagation()}
                  style={{ marginLeft: "auto" }}
                />
              </div>
              <h3 className="ew-list-card__name">{e.name}</h3>
              <p className="ew-list-card__location">
                {e.city}, {e.country}
              </p>
              <div className="ew-list-card__footer">
                <span className="ew-list-card__region">
                  {e.region.replace(/_/g, " ")}
                </span>
                <span className="ew-list-card__assessed">
                  {relativeTime(e.lastAssessedAt)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Recent Changes Panel */}
      <div className="ew-watchlist-changes">
        <h2>Recent Changes (Last 7 Days)</h2>
        {!changes || changes.length === 0 ? (
          <div className="ew-watchlist-changes__none">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#2e8540"
              strokeWidth="2"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
            No threat level changes in the past week
          </div>
        ) : (
          <ul className="ew-watchlist-changes__list">
            {changes.map((c, i) => (
              <li key={i} className="ew-watchlist-changes__item">
                <Link to={`/embassies/${c.embassyId}`}>
                  <span
                    className="ew-watchlist-changes__dot"
                    style={{ background: THREAT_COLORS[c.toLevel] }}
                  />
                  <strong>{c.embassyName}</strong> changed from{" "}
                  <span
                    style={{
                      color: THREAT_COLORS[c.fromLevel],
                      fontWeight: 600,
                    }}
                  >
                    {THREAT_LABELS[c.fromLevel]}
                  </span>{" "}
                  to{" "}
                  <span
                    style={{
                      color: THREAT_COLORS[c.toLevel],
                      fontWeight: 600,
                    }}
                  >
                    {THREAT_LABELS[c.toLevel]}
                  </span>{" "}
                  — {relativeTime(c.changedAt)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="ew-watchlist-bulk-bar">
          <span>{selectedIds.size} selected</span>
          <button
            className="ew-btn ew-btn--danger"
            onClick={() => setShowBulkRemoveModal(true)}
          >
            Remove Selected ({selectedIds.size})
          </button>
          {user?.role === "ADMIN" && (
            <button className="ew-btn ew-btn--primary">
              Request Analysis ({selectedIds.size})
            </button>
          )}
        </div>
      )}

      {/* Bulk Remove Modal */}
      {showBulkRemoveModal && (
        <div
          className="ew-modal-overlay"
          onClick={() => setShowBulkRemoveModal(false)}
        >
          <div className="ew-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Remove from Watchlist</h3>
            <p>Remove {selectedIds.size} embassies from your watchlist?</p>
            <div className="ew-modal__actions">
              <button
                className="ew-btn ew-btn--danger"
                onClick={handleBulkRemove}
              >
                Remove
              </button>
              <button
                className="ew-btn ew-btn--outline"
                onClick={() => setShowBulkRemoveModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TrendIndicator({ trend }: { trend: string }) {
  if (trend === "worsening") {
    return (
      <span className="ew-trend ew-trend--worsening" title="Worsening">
        ▲
      </span>
    );
  }
  if (trend === "improving") {
    return (
      <span className="ew-trend ew-trend--improving" title="Improving">
        ▼
      </span>
    );
  }
  return (
    <span className="ew-trend ew-trend--stable" title="Stable">
      —
    </span>
  );
}
