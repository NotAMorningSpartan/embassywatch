import { useState, useMemo, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useEmbassies, useEmbassyStats } from "../hooks/useEmbassies";
import { useCurrentUser } from "../hooks/useUser";
import { usePreferencesStore } from "../stores/usePreferencesStore";
import EmbassyMap from "../components/EmbassyMap";
import type { MapStyle } from "../components/EmbassyMap";
import api from "../services/api";
import type { Embassy, ThreatAssessment } from "../hooks/useEmbassies";

const REGIONS = [
  { value: "", label: "All Regions" },
  { value: "AFRICA", label: "Africa" },
  { value: "EAST_ASIA_PACIFIC", label: "East Asia / Pacific" },
  { value: "EUROPE_EURASIA", label: "Europe / Eurasia" },
  { value: "NEAR_EAST", label: "Near East" },
  { value: "SOUTH_CENTRAL_ASIA", label: "South / Central Asia" },
  { value: "WESTERN_HEMISPHERE", label: "Western Hemisphere" },
];

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

export default function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [regionFilter, setRegionFilter] = useState(
    searchParams.get("region") ?? "",
  );
  const theme = usePreferencesStore((s) => s.theme);
  const { data: currentUser } = useCurrentUser();
  const mapStyle = ((currentUser?.preferences?.settings as Record<string, unknown>)?.mapStyle as MapStyle) ?? "standard";

  // Sync region from URL params on mount / navigation
  useEffect(() => {
    const urlRegion = searchParams.get("region") ?? "";
    if (urlRegion !== regionFilter) {
      setRegionFilter(urlRegion);
    }
  }, [searchParams]);

  const { data: embassyData, isLoading: embassiesLoading } = useEmbassies({
    limit: 100,
    region: regionFilter || undefined,
  });
  const { data: stats, isLoading: statsLoading } = useEmbassyStats();

  const embassies = embassyData?.data ?? [];
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  const filteredEmbassies = useMemo(() => {
    if (!regionFilter) return embassies;
    return embassies.filter((e) => e.region === regionFilter);
  }, [embassies, regionFilter]);

  const highSevere = useMemo(
    () =>
      filteredEmbassies.filter(
        (e) =>
          e.currentThreatLevel === "HIGH" || e.currentThreatLevel === "SEVERE",
      ),
    [filteredEmbassies],
  );

  const toggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 3 ? [...prev, id] : prev,
    );
  };

  return (
    <>
      <h1>Dashboard</h1>

      {/* Region filters */}
      <div className="ew-region-filters">
        {REGIONS.map((r) => (
          <button
            key={r.value}
            className={`ew-region-filter${regionFilter === r.value ? " ew-region-filter--active" : ""}`}
            onClick={() => {
              setRegionFilter(r.value);
              if (r.value) {
                setSearchParams({ region: r.value });
              } else {
                setSearchParams({});
              }
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Map */}
      <div className="ew-dashboard-map">
        {embassiesLoading ? (
          <div className="ew-dashboard-map__loading">Loading map data...</div>
        ) : (
          <EmbassyMap embassies={filteredEmbassies} darkMode={theme === "dark"} region={regionFilter} mapStyle={mapStyle} />
        )}
      </div>

      {/* Summary bar */}
      <div className="ew-summary-bar">
        <div className="ew-summary-bar__total">
          <span className="ew-summary-bar__count">
            {statsLoading ? "..." : stats?.total ?? 0}
          </span>
          <span className="ew-summary-bar__label">Embassies Monitored</span>
        </div>
        <div className="ew-summary-bar__levels">
          {Object.entries(THREAT_LABELS).map(([key, label]) => (
            <div key={key} className="ew-summary-bar__level">
              <span
                className="ew-summary-bar__badge"
                style={{ background: THREAT_COLORS[key] }}
              >
                {statsLoading ? "-" : stats?.byThreatLevel[key] ?? 0}
              </span>
              <span className="ew-summary-bar__level-label">{label}</span>
            </div>
          ))}
        </div>
        <div className="ew-summary-bar__updated">
          Last updated: {new Date().toLocaleTimeString()}
        </div>
      </div>

      {/* Threat Summary — HIGH/SEVERE embassies */}
      {highSevere.length > 0 && (
        <div className="ew-threat-summary">
          <h2>Threat Alerts</h2>
          <div className="ew-threat-summary__list">
            {highSevere.map((embassy) => (
              <Link
                key={embassy.id}
                to={`/embassies/${embassy.id}`}
                className="ew-threat-summary__item"
              >
                <span
                  className="ew-threat-summary__badge"
                  style={{
                    background: THREAT_COLORS[embassy.currentThreatLevel],
                  }}
                >
                  {THREAT_LABELS[embassy.currentThreatLevel]}
                </span>
                <div className="ew-threat-summary__info">
                  <strong>{embassy.name}</strong>
                  <span>
                    {embassy.city}, {embassy.country}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent Assessments feed */}
      <div className="ew-recent-assessments">
        <div className="ew-recent-assessments__header">
          <h2>Recent Assessments</h2>
          {compareIds.length > 0 && (
            <button
              className="ew-admin-btn"
              onClick={() => setShowCompare(true)}
            >
              Compare ({compareIds.length})
            </button>
          )}
        </div>
        {embassiesLoading ? (
          <p>Loading...</p>
        ) : filteredEmbassies.length === 0 ? (
          <p className="ew-recent-assessments__empty">No embassies found for this region.</p>
        ) : (
          <div className="ew-recent-assessments__grid">
            {filteredEmbassies.slice(0, 10).map((embassy) => (
              <div key={embassy.id} className="ew-assessment-card__wrap">
                <Link
                  to={`/embassies/${embassy.id}`}
                  className="ew-assessment-card"
                >
                  <div className="ew-assessment-card__header">
                    <span className="ew-assessment-card__name">
                      {embassy.name}
                    </span>
                    <span
                      className="ew-assessment-card__threat"
                      style={{
                        background: THREAT_COLORS[embassy.currentThreatLevel],
                      }}
                    >
                      {THREAT_LABELS[embassy.currentThreatLevel] ?? embassy.currentThreatLevel}
                    </span>
                  </div>
                  <div className="ew-assessment-card__meta">
                    {embassy.city}, {embassy.country}
                  </div>
                  <div className="ew-assessment-card__summary">
                    Threat level: {THREAT_LABELS[embassy.currentThreatLevel] ?? embassy.currentThreatLevel}
                    {embassy.lastAssessedAt
                      ? ` — assessed ${new Date(embassy.lastAssessedAt).toLocaleDateString()}`
                      : " — no assessment yet"}
                  </div>
                </Link>
                <label className="ew-assessment-card__compare">
                  <input
                    type="checkbox"
                    checked={compareIds.includes(embassy.id)}
                    onChange={() => toggleCompare(embassy.id)}
                  />
                  Compare
                </label>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Comparison modal */}
      {showCompare && compareIds.length > 0 && (
        <CompareModal
          embassyIds={compareIds}
          embassies={embassies}
          onClose={() => setShowCompare(false)}
        />
      )}
    </>
  );
}

/* ---- Comparison Modal ---- */

function CompareModal({
  embassyIds,
  embassies,
  onClose,
}: {
  embassyIds: string[];
  embassies: Embassy[];
  onClose: () => void;
}) {
  // Fetch assessments for each embassy
  const assessments = embassyIds.map((id) => {
    const { data } = useQuery({
      queryKey: ["threats", id, "latest"],
      queryFn: () =>
        api.get<ThreatAssessment>(`/api/threats/${id}/latest`).then((r) => r.data),
    });
    return { embassy: embassies.find((e) => e.id === id), assessment: data };
  });

  // Find shared vs unique key factors
  const allFactors = assessments
    .map((a) => a.assessment?.keyFactors ?? [])
    .filter((f) => f.length > 0);
  const sharedFactors =
    allFactors.length > 1
      ? allFactors[0].filter((f) =>
          allFactors.slice(1).every((other) =>
            other.some((o) => o.toLowerCase().includes(f.toLowerCase())),
          ),
        )
      : [];

  return (
    <div className="ew-modal-overlay" onClick={onClose}>
      <div className="ew-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ew-modal__header">
          <h2>Embassy Comparison</h2>
          <button className="ew-modal__close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="ew-compare-grid">
          {assessments.map(({ embassy, assessment }) =>
            embassy ? (
              <div key={embassy.id} className="ew-compare-col">
                <h3>{embassy.name}</h3>
                <p className="ew-compare-col__location">
                  {embassy.city}, {embassy.country}
                </p>
                <span
                  className="ew-compare-col__threat"
                  style={{
                    background:
                      THREAT_COLORS[embassy.currentThreatLevel] ?? "#71767a",
                  }}
                >
                  {THREAT_LABELS[embassy.currentThreatLevel] ??
                    embassy.currentThreatLevel}
                </span>
                {assessment ? (
                  <>
                    <div className="ew-compare-col__confidence">
                      Confidence: {Math.round(assessment.confidence * 100)}%
                    </div>
                    <div className="ew-compare-col__factors">
                      <strong>Key Factors:</strong>
                      <ul>
                        {assessment.keyFactors.map((f, i) => (
                          <li
                            key={i}
                            className={
                              sharedFactors.some((s) =>
                                f.toLowerCase().includes(s.toLowerCase()),
                              )
                                ? "ew-compare-col__shared"
                                : ""
                            }
                          >
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                ) : (
                  <p className="ew-empty">No assessment data</p>
                )}
              </div>
            ) : null,
          )}
        </div>
        {sharedFactors.length > 0 && (
          <div className="ew-compare-shared">
            <strong>Shared Factors:</strong> {sharedFactors.join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}
