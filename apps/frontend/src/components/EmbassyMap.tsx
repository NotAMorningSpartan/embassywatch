import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import type { Embassy, CountryThreat } from "../hooks/useEmbassies";
import countriesGeoJSON from "../assets/countries.geo.json";

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

const THREAT_OPACITY: Record<string, number> = {
  LOW: 0.2,
  GUARDED: 0.25,
  ELEVATED: 0.3,
  HIGH: 0.35,
  SEVERE: 0.4,
};

const THREAT_OPACITY_DARK: Record<string, number> = {
  LOW: 0.3,
  GUARDED: 0.35,
  ELEVATED: 0.4,
  HIGH: 0.45,
  SEVERE: 0.5,
};

export type MapStyle = "standard" | "satellite" | "high-contrast";

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

const DEFAULT_VIEW: [number, number] = [20, 0];
const DEFAULT_ZOOM = 2;

const REGION_BOUNDS: Record<string, L.LatLngBoundsExpression> = {
  AFRICA: [[-35, -20], [38, 55]],
  EAST_ASIA_PACIFIC: [[-45, 90], [50, 180]],
  EUROPE_EURASIA: [[35, -15], [72, 60]],
  NEAR_EAST: [[10, 25], [45, 75]],
  SOUTH_CENTRAL_ASIA: [[0, 55], [45, 100]],
  WESTERN_HEMISPHERE: [[-55, -130], [55, -30]],
};

interface Props {
  embassies: Embassy[];
  darkMode: boolean;
  region?: string;
  mapStyle?: MapStyle;
  threatByCountry?: CountryThreat[];
  showMarkers?: boolean;
  showHeatMap?: boolean;
  onToggleMarkers?: (v: boolean) => void;
  onToggleHeatMap?: (v: boolean) => void;
  onCountryClick?: (countryName: string) => void;
}

export default function EmbassyMap({
  embassies,
  darkMode,
  region,
  mapStyle = "standard",
  threatByCountry,
  showMarkers = true,
  showHeatMap = false,
  onToggleMarkers,
  onToggleHeatMap,
  onCountryClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const geoJsonRef = useRef<L.GeoJSON | null>(null);
  const [heatMapVisible, setHeatMapVisible] = useState(showHeatMap);
  const [markersVisible, setMarkersVisible] = useState(showMarkers);

  // Sync with props
  useEffect(() => setHeatMapVisible(showHeatMap), [showHeatMap]);
  useEffect(() => setMarkersVisible(showMarkers), [showMarkers]);

  // Build threat lookup by country code
  const threatLookup = useRef<Record<string, CountryThreat>>({});
  useEffect(() => {
    const lookup: Record<string, CountryThreat> = {};
    if (threatByCountry) {
      for (const c of threatByCountry) {
        lookup[c.countryCode] = c;
      }
    }
    threatLookup.current = lookup;
  }, [threatByCountry]);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: DEFAULT_VIEW,
      zoom: DEFAULT_ZOOM,
      minZoom: 2,
      maxZoom: 18,
      scrollWheelZoom: true,
    });

    tileRef.current = L.tileLayer(getTileUrl(mapStyle, darkMode)).addTo(map);

    clusterRef.current = L.markerClusterGroup({
      maxClusterRadius: 40,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        let size = "small";
        if (count >= 20) size = "large";
        else if (count >= 10) size = "medium";
        return L.divIcon({
          html: `<div><span>${count}</span></div>`,
          className: `ew-cluster ew-cluster--${size}`,
          iconSize: L.point(40, 40),
        });
      },
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Switch tiles on theme or style change
  useEffect(() => {
    if (!mapRef.current || !tileRef.current) return;
    tileRef.current.setUrl(getTileUrl(mapStyle, darkMode));
  }, [darkMode, mapStyle]);

  // Zoom to region when filter changes
  useEffect(() => {
    if (!mapRef.current) return;
    if (region && REGION_BOUNDS[region]) {
      mapRef.current.fitBounds(REGION_BOUNDS[region], { padding: [30, 30], maxZoom: 6 });
    } else {
      mapRef.current.setView(DEFAULT_VIEW, DEFAULT_ZOOM);
    }
  }, [region]);

  // GeoJSON choropleth layer
  const getStyle = useCallback(
    (feature: GeoJSON.Feature | undefined) => {
      if (!feature) return {};
      const code = feature.id as string;
      const data = threatLookup.current[code];
      if (!data) {
        return {
          fillColor: "transparent",
          fillOpacity: 0,
          color: "transparent",
          weight: 0,
        };
      }
      const opacityMap = darkMode ? THREAT_OPACITY_DARK : THREAT_OPACITY;
      return {
        fillColor: THREAT_COLORS[data.aggregatedThreatLevel] ?? "#71767a",
        fillOpacity: opacityMap[data.aggregatedThreatLevel] ?? 0.2,
        color: "#fff",
        weight: 1,
        opacity: 0.6,
      };
    },
    [darkMode],
  );

  // Create/update GeoJSON layer
  useEffect(() => {
    if (!mapRef.current) return;

    // Remove old layer
    if (geoJsonRef.current) {
      mapRef.current.removeLayer(geoJsonRef.current);
      geoJsonRef.current = null;
    }

    if (!heatMapVisible || !threatByCountry?.length) return;

    const geoJson = L.geoJSON(countriesGeoJSON as GeoJSON.FeatureCollection, {
      style: getStyle,
      onEachFeature: (feature, layer) => {
        const code = feature.id as string;
        const data = threatLookup.current[code];
        if (!data) return;

        const color = THREAT_COLORS[data.aggregatedThreatLevel] ?? "#71767a";
        const label = THREAT_LABELS[data.aggregatedThreatLevel] ?? data.aggregatedThreatLevel;

        // Tooltip
        layer.bindTooltip(
          `<div class="ew-choropleth-tooltip" style="border-left: 4px solid ${color}">
            <strong>${data.countryName}</strong>
            <div class="ew-choropleth-tooltip__level" style="color:${color}">${label}</div>
            <div class="ew-choropleth-tooltip__count">${data.embassyCount} ${data.embassyCount === 1 ? "embassy" : "embassies"} monitored</div>
          </div>`,
          { sticky: true, className: `ew-choropleth-tooltip-wrap${darkMode ? " ew-choropleth-tooltip-wrap--dark" : ""}` },
        );

        // Hover effect
        layer.on("mouseover", () => {
          (layer as L.Path).setStyle({ fillOpacity: 0.6 });
        });
        layer.on("mouseout", () => {
          geoJson.resetStyle(layer);
        });

        // Click to zoom + filter
        layer.on("click", () => {
          if (mapRef.current) {
            mapRef.current.fitBounds((layer as L.Polygon).getBounds(), { padding: [30, 30] });
          }
          onCountryClick?.(data.countryName);
        });
      },
    });

    // Add below markers
    geoJson.addTo(mapRef.current);
    if (clusterRef.current) {
      clusterRef.current.bringToFront();
    }
    geoJsonRef.current = geoJson;
  }, [heatMapVisible, threatByCountry, darkMode, getStyle, onCountryClick]);

  // Update GeoJSON styles when dark mode changes
  useEffect(() => {
    if (!geoJsonRef.current) return;
    geoJsonRef.current.setStyle((feature) => getStyle(feature as GeoJSON.Feature));
  }, [darkMode, getStyle]);

  // Toggle marker visibility
  useEffect(() => {
    if (!clusterRef.current || !mapRef.current) return;
    if (markersVisible) {
      if (!mapRef.current.hasLayer(clusterRef.current)) {
        mapRef.current.addLayer(clusterRef.current);
      }
    } else {
      if (mapRef.current.hasLayer(clusterRef.current)) {
        mapRef.current.removeLayer(clusterRef.current);
      }
    }
  }, [markersVisible]);

  // Update markers when embassies change
  useEffect(() => {
    if (!clusterRef.current) return;
    clusterRef.current.clearLayers();

    embassies.forEach((embassy) => {
      const color = THREAT_COLORS[embassy.currentThreatLevel] ?? "#71767a";
      const label =
        THREAT_LABELS[embassy.currentThreatLevel] ??
        embassy.currentThreatLevel;

      const marker = L.circleMarker([embassy.latitude, embassy.longitude], {
        radius: 8,
        color,
        fillColor: color,
        fillOpacity: 0.85,
        weight: 2,
      });

      marker.bindPopup(`
        <div class="ew-map-popup">
          <strong>${embassy.name}</strong>
          <div class="ew-map-popup__location">${embassy.city}, ${embassy.country}</div>
          <span class="ew-map-popup__threat" style="background:${color}">${label}</span>
          <a class="ew-map-popup__link" href="/embassies/${embassy.id}">View Details &rarr;</a>
        </div>
      `);

      clusterRef.current!.addLayer(marker);
    });
  }, [embassies]);

  // Resize handler
  useEffect(() => {
    const timer = setTimeout(() => mapRef.current?.invalidateSize(), 200);
    return () => clearTimeout(timer);
  }, [embassies]);

  const handleToggleMarkers = () => {
    const next = !markersVisible;
    setMarkersVisible(next);
    onToggleMarkers?.(next);
  };

  const handleToggleHeatMap = () => {
    const next = !heatMapVisible;
    setHeatMapVisible(next);
    onToggleHeatMap?.(next);
  };

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <div ref={containerRef} style={{ height: "100%", width: "100%" }} />

      {/* Layer Controls */}
      <div className={`ew-map-controls${darkMode ? " ew-map-controls--dark" : ""}`}>
        <button
          className={`ew-map-controls__btn${markersVisible ? " ew-map-controls__btn--active" : ""}`}
          onClick={handleToggleMarkers}
          title="Toggle embassy markers"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="10" r="3" />
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
          </svg>
          Markers
        </button>
        <button
          className={`ew-map-controls__btn${heatMapVisible ? " ew-map-controls__btn--active" : ""}`}
          onClick={handleToggleHeatMap}
          title="Toggle threat heat map"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3h18v18H3z" />
            <path d="M3 9h18M3 15h18M9 3v18M15 3v18" opacity="0.4" />
          </svg>
          Heat Map
        </button>
      </div>

      {/* Legend */}
      {heatMapVisible && (
        <div className={`ew-map-legend${darkMode ? " ew-map-legend--dark" : ""}`}>
          <div className="ew-map-legend__title">Threat Level</div>
          <div className="ew-map-legend__bar">
            {(["LOW", "GUARDED", "ELEVATED", "HIGH", "SEVERE"] as const).map((level) => (
              <div key={level} className="ew-map-legend__item">
                <div
                  className="ew-map-legend__swatch"
                  style={{ background: THREAT_COLORS[level] }}
                />
                <span className="ew-map-legend__label">{THREAT_LABELS[level]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
