import { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useEmbassies } from "../hooks/useEmbassies";
import {
  useWatchlist,
  useAddToWatchlist,
  useRemoveFromWatchlist,
} from "../hooks/useUser";
import type { Embassy } from "../hooks/useEmbassies";

const REGIONS = [
  { value: "", label: "All Regions" },
  { value: "AFRICA", label: "Africa" },
  { value: "EAST_ASIA_PACIFIC", label: "East Asia & Pacific" },
  { value: "EUROPE_EURASIA", label: "Europe & Eurasia" },
  { value: "NEAR_EAST", label: "Near East" },
  { value: "SOUTH_CENTRAL_ASIA", label: "South & Central Asia" },
  { value: "WESTERN_HEMISPHERE", label: "Western Hemisphere" },
];

const THREAT_LEVELS = ["LOW", "GUARDED", "ELEVATED", "HIGH", "SEVERE"] as const;

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

const SORT_OPTIONS = [
  { value: "name_asc", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
  { value: "threat_desc", label: "Threat Level (High → Low)" },
  { value: "threat_asc", label: "Threat Level (Low → High)" },
  { value: "assessed_desc", label: "Last Assessed (Recent)" },
];

const THREAT_ORDER: Record<string, number> = {
  SEVERE: 5,
  HIGH: 4,
  ELEVATED: 3,
  GUARDED: 2,
  LOW: 1,
};

const PAGE_SIZES = [10, 25, 50, 100];

function relativeTime(date: string | null): string {
  if (!date) return "Never";
  const ms = Date.now() - new Date(date).getTime();
  if (ms < 60_000) return "Just now";
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h ago`;
  return `${Math.floor(ms / 86400_000)}d ago`;
}

type ViewMode = "table" | "grid";

export default function EmbassiesPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read initial state from URL
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [region, setRegion] = useState(searchParams.get("region") ?? "");
  const [threatFilters, setThreatFilters] = useState<string[]>(
    searchParams.get("threat")?.split(",").filter(Boolean) ?? [],
  );
  const [sort, setSort] = useState(searchParams.get("sort") ?? "name_asc");
  const [page, setPage] = useState(Number(searchParams.get("page")) || 1);
  const [pageSize, setPageSize] = useState(
    Number(searchParams.get("limit")) || 25,
  );
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [watchlistOnly, setWatchlistOnly] = useState(
    searchParams.get("watchlist") === "true",
  );

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Sync URL params
  useEffect(() => {
    const params: Record<string, string> = {};
    if (debouncedSearch) params.search = debouncedSearch;
    if (region) params.region = region;
    if (threatFilters.length) params.threat = threatFilters.join(",");
    if (sort !== "name_asc") params.sort = sort;
    if (page > 1) params.page = String(page);
    if (pageSize !== 25) params.limit = String(pageSize);
    if (watchlistOnly) params.watchlist = "true";
    setSearchParams(params, { replace: true });
  }, [debouncedSearch, region, threatFilters, sort, page, pageSize, watchlistOnly]);

  // Fetch data
  const { data, isLoading, isError, refetch } = useEmbassies({
    page,
    limit: pageSize,
    region: region || undefined,
    search: debouncedSearch || undefined,
  });

  const { data: watchlist } = useWatchlist();
  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();
  const watchlistIds = new Set(watchlist?.map((e) => e.id) ?? []);

  // Client-side filtering for threat level (API doesn't support multi-select) and watchlist
  let embassies = data?.data ?? [];
  if (threatFilters.length > 0) {
    embassies = embassies.filter((e) =>
      threatFilters.includes(e.currentThreatLevel),
    );
  }
  if (watchlistOnly) {
    embassies = embassies.filter((e) => watchlistIds.has(e.id));
  }

  // Client-side sorting
  embassies = [...embassies].sort((a, b) => {
    switch (sort) {
      case "name_desc":
        return b.name.localeCompare(a.name);
      case "threat_desc":
        return (THREAT_ORDER[b.currentThreatLevel] ?? 0) - (THREAT_ORDER[a.currentThreatLevel] ?? 0);
      case "threat_asc":
        return (THREAT_ORDER[a.currentThreatLevel] ?? 0) - (THREAT_ORDER[b.currentThreatLevel] ?? 0);
      case "assessed_desc":
        return (
          new Date(b.lastAssessedAt ?? 0).getTime() -
          new Date(a.lastAssessedAt ?? 0).getTime()
        );
      default:
        return a.name.localeCompare(b.name);
    }
  });

  const totalFromServer = data?.total ?? 0;
  const activeFilterCount =
    (debouncedSearch ? 1 : 0) +
    (region ? 1 : 0) +
    threatFilters.length +
    (watchlistOnly ? 1 : 0);

  const clearFilters = useCallback(() => {
    setSearch("");
    setDebouncedSearch("");
    setRegion("");
    setThreatFilters([]);
    setSort("name_asc");
    setPage(1);
    setWatchlistOnly(false);
  }, []);

  const toggleThreat = (level: string) => {
    setThreatFilters((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level],
    );
    setPage(1);
  };

  const totalPages = Math.ceil(totalFromServer / pageSize);
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalFromServer);

  return (
    <>
      <div className="ew-list-header">
        <h1>Embassy Directory</h1>
        <p className="ew-list-header__sub">
          Monitoring {totalFromServer} posts worldwide
        </p>
      </div>

      {/* Filter bar */}
      <div className="ew-filter-bar">
        <div className="ew-filter-bar__top">
          <div className="ew-filter-bar__search">
            <input
              type="text"
              placeholder="Search by name, city, or country..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="ew-filter-input"
            />
          </div>
          <select
            value={region}
            onChange={(e) => {
              setRegion(e.target.value);
              setPage(1);
            }}
            className="ew-filter-select"
          >
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
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
        </div>

        <div className="ew-filter-bar__threats">
          {THREAT_LEVELS.map((level) => (
            <button
              key={level}
              className={`ew-threat-pill${threatFilters.includes(level) ? " ew-threat-pill--active" : ""}`}
              style={{
                borderColor: THREAT_COLORS[level],
                ...(threatFilters.includes(level)
                  ? { background: THREAT_COLORS[level], color: "#fff" }
                  : { color: THREAT_COLORS[level] }),
              }}
              onClick={() => toggleThreat(level)}
            >
              {THREAT_LABELS[level]}
            </button>
          ))}
          <label className="ew-filter-bar__watchlist-toggle">
            <input
              type="checkbox"
              checked={watchlistOnly}
              onChange={() => {
                setWatchlistOnly(!watchlistOnly);
                setPage(1);
              }}
            />
            Watchlist Only
          </label>
          {activeFilterCount > 0 && (
            <button className="ew-filter-bar__clear" onClick={clearFilters}>
              Clear Filters ({activeFilterCount})
            </button>
          )}
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
          Failed to load embassies.{" "}
          <button className="ew-admin-btn" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      ) : embassies.length === 0 ? (
        <div className="ew-list-empty">
          <div className="ew-list-empty__icon">&#128269;</div>
          <p>No embassies match your filters</p>
          <button className="ew-admin-btn" onClick={clearFilters}>
            Clear Filters
          </button>
        </div>
      ) : viewMode === "table" ? (
        <div className="ew-list-table-wrap">
          <table className="ew-list-table">
            <thead>
              <tr>
                <th
                  className="ew-list-table__sortable"
                  onClick={() =>
                    setSort(sort === "name_asc" ? "name_desc" : "name_asc")
                  }
                >
                  Name{" "}
                  {sort === "name_asc"
                    ? "▲"
                    : sort === "name_desc"
                      ? "▼"
                      : ""}
                </th>
                <th>City</th>
                <th>Country</th>
                <th>Region</th>
                <th
                  className="ew-list-table__sortable"
                  onClick={() =>
                    setSort(
                      sort === "threat_desc" ? "threat_asc" : "threat_desc",
                    )
                  }
                >
                  Threat Level{" "}
                  {sort === "threat_desc"
                    ? "▼"
                    : sort === "threat_asc"
                      ? "▲"
                      : ""}
                </th>
                <th
                  className="ew-list-table__sortable"
                  onClick={() => setSort("assessed_desc")}
                >
                  Last Assessed{" "}
                  {sort === "assessed_desc" ? "▼" : ""}
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {embassies.map((e, i) => (
                <tr
                  key={e.id}
                  className={i % 2 === 1 ? "ew-list-table__zebra" : ""}
                >
                  <td className="ew-list-table__name">{e.name}</td>
                  <td>{e.city}</td>
                  <td>{e.country}</td>
                  <td>
                    <span className="ew-list-table__region">
                      {REGIONS.find((r) => r.value === e.region)?.label ??
                        e.region}
                    </span>
                  </td>
                  <td>
                    <span
                      className="ew-list-table__threat-badge"
                      style={{ background: THREAT_COLORS[e.currentThreatLevel] }}
                    >
                      {THREAT_LABELS[e.currentThreatLevel]}
                    </span>
                  </td>
                  <td title={e.lastAssessedAt ? new Date(e.lastAssessedAt).toLocaleString() : ""}>
                    {relativeTime(e.lastAssessedAt)}
                  </td>
                  <td className="ew-list-table__actions">
                    <Link to={`/embassies/${e.id}`} className="ew-list-table__view">
                      View
                    </Link>
                    <WatchlistStar
                      embassyId={e.id}
                      isWatched={watchlistIds.has(e.id)}
                      onAdd={() => addToWatchlist.mutate(e.id)}
                      onRemove={() => removeFromWatchlist.mutate(e.id)}
                    />
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
              className="ew-list-card"
            >
              <div className="ew-list-card__top">
                <span
                  className="ew-list-card__threat"
                  style={{ background: THREAT_COLORS[e.currentThreatLevel] }}
                >
                  {THREAT_LABELS[e.currentThreatLevel]}
                </span>
                <WatchlistStar
                  embassyId={e.id}
                  isWatched={watchlistIds.has(e.id)}
                  onAdd={() => addToWatchlist.mutate(e.id)}
                  onRemove={() => removeFromWatchlist.mutate(e.id)}
                />
              </div>
              <h3 className="ew-list-card__name">{e.name}</h3>
              <p className="ew-list-card__location">
                {e.city}, {e.country}
              </p>
              <div className="ew-list-card__footer">
                <span className="ew-list-card__region">
                  {REGIONS.find((r) => r.value === e.region)?.label ?? e.region}
                </span>
                <span
                  className="ew-list-card__assessed"
                  title={e.lastAssessedAt ? new Date(e.lastAssessedAt).toLocaleString() : ""}
                >
                  {relativeTime(e.lastAssessedAt)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && !isError && totalFromServer > 0 && (
        <div className="ew-pagination">
          <div className="ew-pagination__info">
            Showing {startItem}–{endItem} of {totalFromServer} embassies
          </div>
          <div className="ew-pagination__controls">
            <button
              className="ew-pagination__btn"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let p: number;
              if (totalPages <= 7) {
                p = i + 1;
              } else if (page <= 4) {
                p = i + 1;
              } else if (page >= totalPages - 3) {
                p = totalPages - 6 + i;
              } else {
                p = page - 3 + i;
              }
              return (
                <button
                  key={p}
                  className={`ew-pagination__btn${p === page ? " ew-pagination__btn--active" : ""}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              );
            })}
            <button
              className="ew-pagination__btn"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
          <div className="ew-pagination__size">
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="ew-filter-select ew-filter-select--sm"
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s} per page
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </>
  );
}

function WatchlistStar({
  embassyId,
  isWatched,
  onAdd,
  onRemove,
}: {
  embassyId: string;
  isWatched: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <button
      className={`ew-watchlist-star${isWatched ? " ew-watchlist-star--active" : ""}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        isWatched ? onRemove() : onAdd();
      }}
      title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
    >
      {isWatched ? "\u2605" : "\u2606"}
    </button>
  );
}
