import { useEffect, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useFeedStore, type FeedEvent } from "../stores/useFeedStore";
import { usePreferencesStore } from "../stores/usePreferencesStore";
import { playSoundForEvent } from "../utils/feedSounds";

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

const SEVERITY_COLORS: Record<string, string> = {
  INFO: "#2e8540",
  WARNING: "#e8a820",
  CRITICAL: "#d83933",
};

const TYPE_COLORS: Record<string, string> = {
  NEW_EVENT: "#71767a",
  THREAT_CHANGE: "#2e75b6",
  THREAT_ASSESSED: "#2e75b6",
  SOURCE_STATUS: "#71767a",
  ANALYSIS_STARTED: "#71767a",
  ANALYSIS_COMPLETED: "#71767a",
};

function relativeTime(ts: string): string {
  const ms = Date.now() - new Date(ts).getTime();
  if (ms < 5_000) return "Just now";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h ago`;
  return `${Math.floor(ms / 86400_000)}d ago`;
}

function EventIcon({ type, sourceType }: { type: string; sourceType?: string }) {
  if (type === "THREAT_CHANGE") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    );
  }
  if (type === "SOURCE_STATUS" || type === "ANALYSIS_STARTED" || type === "ANALYSIS_COMPLETED" || type === "THREAT_ASSESSED") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="2" width="20" height="8" rx="2" />
        <rect x="2" y="14" width="20" height="8" rx="2" />
        <line x1="6" y1="6" x2="6.01" y2="6" />
        <line x1="6" y1="18" x2="6.01" y2="18" />
      </svg>
    );
  }
  if (sourceType === "WEATHER") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 17.58A5 5 0 0018 8h-1.26A8 8 0 104 16.25" />
        <line x1="8" y1="16" x2="8.01" y2="16" />
        <line x1="8" y1="20" x2="8.01" y2="20" />
        <line x1="12" y1="18" x2="12.01" y2="18" />
        <line x1="12" y1="22" x2="12.01" y2="22" />
      </svg>
    );
  }
  if (sourceType === "ADVISORY") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    );
  }
  // News (default)
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2zm0 0a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2" />
      <line x1="10" y1="6" x2="18" y2="6" />
      <line x1="10" y1="10" x2="18" y2="10" />
      <line x1="10" y1="14" x2="14" y2="14" />
    </svg>
  );
}

function FeedItem({ event, animate }: { event: FeedEvent; animate: boolean }) {
  const navigate = useNavigate();
  const barColor =
    event.type === "THREAT_CHANGE"
      ? "#2e75b6"
      : SEVERITY_COLORS[event.severity ?? "INFO"] ?? "#71767a";

  const handleClick = () => {
    if (event.embassyId) {
      navigate(`/embassies/${event.embassyId}`);
      useFeedStore.getState().setOpen(false);
    }
  };

  return (
    <div
      className={`ew-feed-item${animate ? " ew-feed-item--animate" : ""}${event.embassyId ? " ew-feed-item--clickable" : ""}`}
      onClick={handleClick}
      style={{ "--bar-color": barColor } as React.CSSProperties}
    >
      <div className="ew-feed-item__icon" style={{ color: TYPE_COLORS[event.type] ?? "#71767a" }}>
        <EventIcon type={event.type} sourceType={event.sourceType} />
      </div>
      <div className="ew-feed-item__body">
        {event.type === "THREAT_CHANGE" ? (
          <>
            <div className="ew-feed-item__threat-change">
              <strong>{event.embassyName}</strong>
              <div className="ew-feed-item__level-transition">
                <span
                  className="ew-feed-item__level-badge"
                  style={{ background: THREAT_COLORS[event.previousLevel ?? ""] }}
                >
                  {THREAT_LABELS[event.previousLevel ?? ""] ?? event.previousLevel}
                </span>
                <span className="ew-feed-item__arrow">→</span>
                <span
                  className="ew-feed-item__level-badge"
                  style={{ background: THREAT_COLORS[event.newLevel ?? ""] }}
                >
                  {THREAT_LABELS[event.newLevel ?? ""] ?? event.newLevel}
                </span>
              </div>
            </div>
            {event.summary && (
              <div className="ew-feed-item__summary">{event.summary}</div>
            )}
          </>
        ) : event.type === "THREAT_ASSESSED" ? (
          <div className="ew-feed-item__title">
            <strong>{event.embassyName}</strong> — Assessment confirmed:{" "}
            <span style={{ color: THREAT_COLORS[event.newLevel ?? ""] }}>
              {THREAT_LABELS[event.newLevel ?? ""] ?? event.newLevel}
            </span>
          </div>
        ) : event.type === "SOURCE_STATUS" ? (
          <div className="ew-feed-item__title">
            {event.title || `${event.sourceName ?? "System"}: ${event.status ?? "OK"}`}
          </div>
        ) : event.type === "ANALYSIS_STARTED" ? (
          <div className="ew-feed-item__title">
            Analysis started for {event.embassyCount ?? "all"} embassies
          </div>
        ) : event.type === "ANALYSIS_COMPLETED" ? (
          <div className="ew-feed-item__title">
            Analysis completed for {event.embassyCount ?? "all"} embassies
            {event.duration_ms ? ` in ${(event.duration_ms / 1000).toFixed(1)}s` : ""}
          </div>
        ) : (
          <div className="ew-feed-item__title">{event.title || event.embassyName || "System event"}</div>
        )}
        <div className="ew-feed-item__meta">
          {event.source && <span>{event.source}</span>}
          {event.source && <span className="ew-feed-item__dot">·</span>}
          <span>{relativeTime(event.timestamp)}</span>
          {event.embassyName && (
            <>
              <span className="ew-feed-item__dot">·</span>
              <span>{event.embassyName}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ActivityFeed() {
  const isOpen = useFeedStore((s) => s.isOpen);
  const events = useFeedStore((s) => s.events);
  const isConnected = useFeedStore((s) => s.isConnected);
  const isMuted = useFeedStore((s) => s.isMuted);
  const filters = useFeedStore((s) => s.filters);
  const setOpen = useFeedStore((s) => s.setOpen);
  const setMuted = useFeedStore((s) => s.setMuted);
  const setFilters = useFeedStore((s) => s.setFilters);
  const clearEvents = useFeedStore((s) => s.clearEvents);
  const theme = usePreferencesStore((s) => s.theme);
  const prevCountRef = useRef(events.length);
  const location = useLocation();

  // Sound notifications
  useEffect(() => {
    if (events.length <= prevCountRef.current) {
      prevCountRef.current = events.length;
      return;
    }
    const newEvents = events.slice(0, events.length - prevCountRef.current);
    prevCountRef.current = events.length;

    if (isMuted || isOpen) return;

    for (const ev of newEvents) {
      playSoundForEvent(ev.severity, ev.type, ev.newLevel, ev.previousLevel);
    }
  }, [events.length, isMuted, isOpen]);

  // Filter events
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (!filters.types.includes(e.type)) return false;
      if (filters.minSeverity === "CRITICAL" && e.severity !== "CRITICAL") return false;
      if (filters.minSeverity === "WARNING" && e.severity !== "CRITICAL" && e.severity !== "WARNING") return false;
      return true;
    });
  }, [events, filters]);

  // Auto-update relative timestamps
  const forceUpdate = useRef(0);
  useEffect(() => {
    const timer = setInterval(() => {
      forceUpdate.current++;
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, setOpen]);

  const toggleType = (type: string) => {
    const types = filters.types.includes(type)
      ? filters.types.filter((t) => t !== type)
      : [...filters.types, type];
    setFilters({ types });
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Mobile backdrop */}
      <div className="ew-feed-backdrop" onClick={() => setOpen(false)} />

      <div className={`ew-feed-panel${theme === "dark" ? " ew-feed-panel--dark" : ""}`}>
        {/* Header */}
        <div className="ew-feed-panel__header">
          <div className="ew-feed-panel__title">
            <span
              className={`ew-feed-panel__status-dot${isConnected ? " ew-feed-panel__status-dot--connected" : ""}`}
            />
            Live Feed
            {!isConnected && (
              <span className="ew-feed-panel__reconnecting">Reconnecting...</span>
            )}
          </div>
          <div className="ew-feed-panel__header-actions">
            <button
              className={`ew-feed-panel__mute-btn${isMuted ? " ew-feed-panel__mute-btn--muted" : ""}`}
              onClick={() => setMuted(!isMuted)}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
                </svg>
              )}
            </button>
            <button className="ew-feed-panel__close" onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="ew-feed-panel__filters">
          <div className="ew-feed-panel__filter-row">
            {[
              { type: "NEW_EVENT", label: "Events" },
              { type: "THREAT_CHANGE", label: "Threats" },
              { type: "SOURCE_STATUS", label: "System" },
            ].map(({ type, label }) => (
              <button
                key={type}
                className={`ew-feed-filter-chip${filters.types.includes(type) ? " ew-feed-filter-chip--active" : ""}`}
                onClick={() => toggleType(type)}
              >
                {label}
              </button>
            ))}
          </div>
          <select
            className="ew-feed-panel__severity-select"
            value={filters.minSeverity}
            onChange={(e) =>
              setFilters({ minSeverity: e.target.value as "ALL" | "WARNING" | "CRITICAL" })
            }
          >
            <option value="ALL">All Severity</option>
            <option value="WARNING">Warning+</option>
            <option value="CRITICAL">Critical Only</option>
          </select>
        </div>

        {/* Clear */}
        {events.length > 0 && (
          <button className="ew-feed-panel__clear" onClick={clearEvents}>
            Clear History
          </button>
        )}

        {/* Events */}
        <div className="ew-feed-panel__events">
          {filteredEvents.length === 0 ? (
            <div className="ew-feed-panel__empty">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ew-gray)" strokeWidth="1.5">
                <path d="M4.93 4.93l14.14 14.14M12 2a10 10 0 100 20 10 10 0 000-20z" />
              </svg>
              <p>No events yet</p>
              <p className="ew-feed-panel__empty-sub">
                The feed will populate as data sources are checked.
              </p>
            </div>
          ) : (
            filteredEvents.map((event, i) => (
              <FeedItem key={event.id} event={event} animate={i < 3} />
            ))
          )}
        </div>
      </div>
    </>
  );
}

/* Ticker Bar Component */
export function FeedTicker() {
  const events = useFeedStore((s) => s.events);
  const showTicker = useFeedStore((s) => s.showTicker);
  const setOpen = useFeedStore((s) => s.setOpen);
  const theme = usePreferencesStore((s) => s.theme);
  const latest = events[0];

  if (!showTicker || !latest) return null;

  const barColor =
    latest.type === "THREAT_CHANGE"
      ? "#2e75b6"
      : SEVERITY_COLORS[latest.severity ?? "INFO"] ?? "#71767a";

  return (
    <div
      className={`ew-ticker${theme === "dark" ? " ew-ticker--dark" : ""}`}
      onClick={() => setOpen(true)}
    >
      <span className="ew-ticker__dot" style={{ background: barColor }} />
      <span className="ew-ticker__icon">
        <EventIcon type={latest.type} sourceType={latest.sourceType} />
      </span>
      <span className="ew-ticker__text">
        {latest.type === "THREAT_CHANGE"
          ? `${latest.embassyName}: ${THREAT_LABELS[latest.previousLevel ?? ""]} → ${THREAT_LABELS[latest.newLevel ?? ""]}`
          : latest.type === "THREAT_ASSESSED"
            ? `${latest.embassyName} — Assessment confirmed: ${THREAT_LABELS[latest.newLevel ?? ""] ?? latest.newLevel}`
            : latest.type === "SOURCE_STATUS"
              ? latest.title || `${latest.sourceName ?? "System"}: ${latest.status ?? "OK"}`
              : latest.title || latest.embassyName || "System event"}
      </span>
      <span className="ew-ticker__time">{relativeTime(latest.timestamp)}</span>
    </div>
  );
}
