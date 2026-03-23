import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useEmbassies, useEmbassyStats } from "../hooks/useEmbassies";
import { usePreferencesStore } from "../stores/usePreferencesStore";
import EmbassyMap from "../components/EmbassyMap";

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
  const [regionFilter, setRegionFilter] = useState("");
  const theme = usePreferencesStore((s) => s.theme);

  const { data: embassyData, isLoading: embassiesLoading } = useEmbassies({
    limit: 100,
    region: regionFilter || undefined,
  });
  const { data: stats, isLoading: statsLoading } = useEmbassyStats();

  const embassies = embassyData?.data ?? [];

  const filteredEmbassies = useMemo(() => {
    if (!regionFilter) return embassies;
    return embassies.filter((e) => e.region === regionFilter);
  }, [embassies, regionFilter]);

  return (
    <>
      <h1>Dashboard</h1>

      {/* Region filters */}
      <div className="ew-region-filters">
        {REGIONS.map((r) => (
          <button
            key={r.value}
            className={`ew-region-filter${regionFilter === r.value ? " ew-region-filter--active" : ""}`}
            onClick={() => setRegionFilter(r.value)}
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
          <EmbassyMap embassies={filteredEmbassies} darkMode={theme === "dark"} region={regionFilter} />
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

      {/* Recent Assessments feed */}
      <div className="ew-recent-assessments">
        <h2>Recent Assessments</h2>
        {embassiesLoading ? (
          <p>Loading...</p>
        ) : filteredEmbassies.length === 0 ? (
          <p className="ew-recent-assessments__empty">No embassies found for this region.</p>
        ) : (
          <div className="ew-recent-assessments__grid">
            {filteredEmbassies.slice(0, 10).map((embassy) => (
              <Link
                key={embassy.id}
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
            ))}
          </div>
        )}
      </div>
    </>
  );
}
