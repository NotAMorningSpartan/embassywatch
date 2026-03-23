import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  useEmbassy,
  useEmbassyAssessments,
  useEmbassyEvents,
  useEmbassies,
} from "../hooks/useEmbassies";
import { useWatchlist, useAddToWatchlist, useRemoveFromWatchlist } from "../hooks/useUser";
import { usePreferencesStore } from "../stores/usePreferencesStore";
import type { ThreatAssessment, RawEvent } from "../hooks/useEmbassies";

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

const THREAT_NUMERIC: Record<string, number> = {
  LOW: 1,
  GUARDED: 2,
  ELEVATED: 3,
  HIGH: 4,
  SEVERE: 5,
};

const REGION_LABELS: Record<string, string> = {
  AFRICA: "Africa",
  EAST_ASIA_PACIFIC: "East Asia / Pacific",
  EUROPE_EURASIA: "Europe / Eurasia",
  NEAR_EAST: "Near East",
  SOUTH_CENTRAL_ASIA: "South / Central Asia",
  WESTERN_HEMISPHERE: "Western Hemisphere",
};

const LIGHT_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

export default function EmbassyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: embassy, isLoading } = useEmbassy(id);
  const { data: assessmentsData } = useEmbassyAssessments(id);
  const [eventSeverity, setEventSeverity] = useState("");
  const [eventSourceType, setEventSourceType] = useState("");
  const { data: eventsData } = useEmbassyEvents(id, {
    severity: eventSeverity || undefined,
    sourceType: eventSourceType || undefined,
    limit: 20,
  });
  const { data: watchlist } = useWatchlist();
  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [rawExpanded, setRawExpanded] = useState(false);

  const isWatched = watchlist?.some((e) => e.id === id) ?? false;

  if (isLoading) {
    return (
      <>
        <h1>Loading...</h1>
        <div className="ew-placeholder">Fetching embassy details...</div>
      </>
    );
  }

  if (!embassy) {
    return (
      <>
        <h1>Embassy Not Found</h1>
        <p>
          <Link to="/embassies">Back to Embassy List</Link>
        </p>
      </>
    );
  }

  const assessment = embassy.latestAssessment;
  const assessments = assessmentsData?.data ?? [];
  const events = eventsData?.data ?? [];
  const threatColor = THREAT_COLORS[embassy.currentThreatLevel] ?? "#71767a";

  return (
    <>
      {/* 1. HEADER */}
      <div className="ew-detail-header">
        <div className="ew-detail-header__info">
          <h1>{embassy.name}</h1>
          <div className="ew-detail-header__meta">
            <span>
              {embassy.city}, {embassy.country}
            </span>
            <Link
              to={`/dashboard?region=${embassy.region}`}
              className="ew-detail-header__region"
            >
              {REGION_LABELS[embassy.region] ?? embassy.region}
            </Link>
          </div>
          {embassy.lastAssessedAt && (
            <div className="ew-detail-header__assessed">
              Last assessed:{" "}
              {new Date(embassy.lastAssessedAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </div>
          )}
        </div>
        <div className="ew-detail-header__actions">
          <div
            className="ew-detail-header__threat"
            style={{ background: threatColor }}
          >
            {THREAT_LABELS[embassy.currentThreatLevel] ?? embassy.currentThreatLevel}
          </div>
          <button
            className={`ew-detail-header__watchlist${isWatched ? " ew-detail-header__watchlist--active" : ""}`}
            onClick={() =>
              isWatched
                ? removeFromWatchlist.mutate(id!)
                : addToWatchlist.mutate(id!)
            }
            title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
          >
            {isWatched ? "\u2605" : "\u2606"}
          </button>
        </div>
      </div>

      <div className="ew-detail-grid">
        {/* 2. THREAT ASSESSMENT */}
        <div className="ew-card ew-detail-assessment">
          <h2>Threat Assessment</h2>
          {assessment ? (
            <>
              <div className="ew-detail-assessment__summary">
                {assessment.summary}
              </div>

              <div className="ew-detail-assessment__confidence">
                <label>
                  Confidence: {Math.round(assessment.confidence * 100)}%
                </label>
                <div className="ew-confidence-bar">
                  <div
                    className="ew-confidence-bar__fill"
                    style={{
                      width: `${assessment.confidence * 100}%`,
                      background: threatColor,
                    }}
                  />
                </div>
              </div>

              {assessment.keyFactors.length > 0 && (
                <div className="ew-detail-assessment__factors">
                  <h3>Key Factors</h3>
                  <div className="ew-chip-list">
                    {assessment.keyFactors.map((f, i) => (
                      <span key={i} className="ew-chip">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {assessment.recommendations.length > 0 && (
                <div className="ew-detail-assessment__recs">
                  <h3>Recommendations</h3>
                  <ol>
                    {assessment.recommendations.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ol>
                </div>
              )}

              {assessment.aiModelUsed && (
                <div className="ew-detail-assessment__model">
                  AI Model: {assessment.aiModelUsed}
                </div>
              )}

              {assessment.rawAiResponse && (
                <div className="ew-detail-assessment__raw">
                  <button
                    className="ew-detail-assessment__raw-toggle"
                    onClick={() => setRawExpanded(!rawExpanded)}
                  >
                    {rawExpanded ? "Hide" : "Show"} Raw Analysis
                  </button>
                  {rawExpanded && (
                    <pre className="ew-detail-assessment__raw-content">
                      {assessment.rawAiResponse}
                    </pre>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="ew-empty">No threat assessment available yet.</p>
          )}
        </div>

        {/* 5. MINI MAP */}
        <div className="ew-card ew-detail-minimap">
          <h2>Location</h2>
          <MiniMap
            lat={embassy.latitude}
            lng={embassy.longitude}
            embassyId={embassy.id}
          />
          {embassy.address && (
            <p className="ew-detail-minimap__address">{embassy.address}</p>
          )}
        </div>

        {/* 4. HISTORICAL TREND */}
        <div className="ew-card ew-detail-trend">
          <h2>Threat Level History</h2>
          {assessments.length > 1 ? (
            <ThreatChart assessments={assessments} />
          ) : (
            <p className="ew-empty">
              Not enough assessment history to display a trend.
            </p>
          )}
        </div>

        {/* 3. CONTRIBUTING EVENTS */}
        <div className="ew-card ew-detail-events">
          <h2>Contributing Events</h2>
          <div className="ew-detail-events__filters">
            <select
              value={eventSeverity}
              onChange={(e) => setEventSeverity(e.target.value)}
            >
              <option value="">All Severities</option>
              <option value="INFO">Info</option>
              <option value="WARNING">Warning</option>
              <option value="CRITICAL">Critical</option>
            </select>
            <select
              value={eventSourceType}
              onChange={(e) => setEventSourceType(e.target.value)}
            >
              <option value="">All Sources</option>
              <option value="NEWS">News</option>
              <option value="WEATHER">Weather</option>
              <option value="ADVISORY">Advisory</option>
              <option value="GEOPOLITICAL">Geopolitical</option>
            </select>
          </div>
          {events.length > 0 ? (
            <div className="ew-detail-events__table-wrap">
              <table className="ew-detail-events__table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Source</th>
                    <th>Category</th>
                    <th>Severity</th>
                    <th>Title</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <EventRow
                      key={ev.id}
                      event={ev}
                      expanded={expandedEvent === ev.id}
                      onToggle={() =>
                        setExpandedEvent(expandedEvent === ev.id ? null : ev.id)
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="ew-empty">No events recorded for this embassy.</p>
          )}
        </div>
      </div>
    </>
  );
}

/* ---- Sub-components ---- */

function EventRow({
  event,
  expanded,
  onToggle,
}: {
  event: RawEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  const severityColor =
    event.severity === "CRITICAL"
      ? "#d83933"
      : event.severity === "WARNING"
        ? "#e87722"
        : "#71767a";
  return (
    <>
      <tr className="ew-detail-events__row" onClick={onToggle}>
        <td>{new Date(event.eventDate).toLocaleDateString()}</td>
        <td>{event.dataSource?.name ?? event.dataSource?.type ?? "\u2014"}</td>
        <td>{event.category ?? "\u2014"}</td>
        <td>
          <span
            className="ew-severity-badge"
            style={{ background: severityColor }}
          >
            {event.severity}
          </span>
        </td>
        <td>{event.title}</td>
      </tr>
      {expanded && (
        <tr className="ew-detail-events__expanded">
          <td colSpan={5}>
            <div className="ew-detail-events__content">{event.content}</div>
            {event.sourceUrl && (
              <a
                href={event.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ew-detail-events__source-link"
              >
                View Source
              </a>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function ThreatChart({ assessments }: { assessments: ThreatAssessment[] }) {
  const sorted = [...assessments]
    .sort(
      (a, b) =>
        new Date(a.assessedAt).getTime() - new Date(b.assessedAt).getTime(),
    )
    .map((a) => ({
      date: new Date(a.assessedAt).toLocaleDateString(),
      level: THREAT_NUMERIC[a.threatLevel] ?? 0,
      label: THREAT_LABELS[a.threatLevel] ?? a.threatLevel,
      confidence: Math.round(a.confidence * 100),
    }));

  const avg = sorted.reduce((s, d) => s + d.level, 0) / sorted.length;

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={sorted} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis
          domain={[0, 5]}
          ticks={[1, 2, 3, 4, 5]}
          tickFormatter={(v: number) =>
            ["", "Low", "Guarded", "Elevated", "High", "Severe"][v] ?? ""
          }
          tick={{ fontSize: 11 }}
          width={70}
        />
        <Tooltip
          formatter={(_value: number, _name: string, props: { payload: { label: string; confidence: number } }) => [
            `${props.payload.label} (${props.payload.confidence}% confidence)`,
            "Threat",
          ]}
        />
        <ReferenceLine
          y={avg}
          stroke="#71767a"
          strokeDasharray="4 4"
          label={{ value: "Avg", position: "right", fontSize: 10 }}
        />
        <Line
          type="monotone"
          dataKey="level"
          stroke="#2e75b6"
          strokeWidth={2}
          dot={{ fill: "#2e75b6", r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function MiniMap({
  lat,
  lng,
  embassyId,
}: {
  lat: number;
  lng: number;
  embassyId: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const theme = usePreferencesStore((s) => s.theme);
  const { data: allEmbassies } = useEmbassies({ limit: 100 });

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom: 6,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
      dragging: true,
    });

    L.tileLayer(theme === "dark" ? DARK_TILES : LIGHT_TILES).addTo(map);

    L.circleMarker([lat, lng], {
      radius: 10,
      color: "#d83933",
      fillColor: "#d83933",
      fillOpacity: 0.9,
      weight: 3,
    }).addTo(map);

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lng, theme]);

  useEffect(() => {
    if (!mapRef.current || !allEmbassies?.data) return;

    allEmbassies.data
      .filter((e) => e.id !== embassyId)
      .filter((e) => {
        const dlat = e.latitude - lat;
        const dlng = e.longitude - lng;
        return dlat * dlat + dlng * dlng < 400;
      })
      .forEach((e) => {
        const color = THREAT_COLORS[e.currentThreatLevel] ?? "#71767a";
        L.circleMarker([e.latitude, e.longitude], {
          radius: 5,
          color,
          fillColor: color,
          fillOpacity: 0.7,
          weight: 1,
        })
          .bindPopup(`<strong>${e.name}</strong><br/>${e.city}, ${e.country}`)
          .addTo(mapRef.current!);
      });
  }, [allEmbassies, embassyId, lat, lng]);

  return <div ref={containerRef} className="ew-detail-minimap__map" />;
}
