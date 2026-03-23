import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import type { Embassy } from "../hooks/useEmbassies";

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

const LIGHT_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const DARK_TILES =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const LIGHT_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const DARK_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';

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
}

export default function EmbassyMap({ embassies, darkMode, region }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 18,
      scrollWheelZoom: true,
    });

    tileRef.current = L.tileLayer(darkMode ? DARK_TILES : LIGHT_TILES, {
      attribution: darkMode ? DARK_ATTR : LIGHT_ATTR,
    }).addTo(map);

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

  // Switch tiles on theme change
  useEffect(() => {
    if (!mapRef.current || !tileRef.current) return;
    tileRef.current.setUrl(darkMode ? DARK_TILES : LIGHT_TILES);
    tileRef.current.options.attribution = darkMode ? DARK_ATTR : LIGHT_ATTR;
  }, [darkMode]);

  // Zoom to region when filter changes
  useEffect(() => {
    if (!mapRef.current) return;
    if (region && REGION_BOUNDS[region]) {
      mapRef.current.fitBounds(REGION_BOUNDS[region], { padding: [30, 30], maxZoom: 6 });
    } else {
      mapRef.current.setView(DEFAULT_VIEW, DEFAULT_ZOOM);
    }
  }, [region]);

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

  return <div ref={containerRef} style={{ height: "100%", width: "100%" }} />;
}
