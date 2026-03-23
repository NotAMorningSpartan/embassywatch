import { Severity } from "../../entities/enums.js";
import type { RawEventData } from "../DataSourceAdapter.js";

const WEATHER_EVENTS: { title: string; severity: Severity; detail: string }[] = [
  { title: "Tropical storm warning issued", severity: Severity.CRITICAL, detail: "sustained winds of 60+ mph expected within 48 hours" },
  { title: "Severe thunderstorm watch", severity: Severity.WARNING, detail: "large hail and damaging winds possible through the evening" },
  { title: "Flash flood warning in effect", severity: Severity.CRITICAL, detail: "heavy rainfall expected to cause dangerous flooding in low-lying areas" },
  { title: "Extreme heat advisory", severity: Severity.WARNING, detail: "temperatures exceeding 45°C (113°F) expected for the next 3 days" },
  { title: "Dust storm advisory", severity: Severity.WARNING, detail: "visibility reduced to less than 1km in affected areas" },
  { title: "Winter storm warning", severity: Severity.WARNING, detail: "heavy snowfall and ice accumulation expected" },
  { title: "Earthquake aftershock activity", severity: Severity.CRITICAL, detail: "multiple aftershocks recorded following the main seismic event" },
  { title: "Volcanic ash advisory", severity: Severity.CRITICAL, detail: "volcanic ash cloud affecting air travel and air quality" },
  { title: "Monsoon flooding in progress", severity: Severity.CRITICAL, detail: "rising water levels threatening infrastructure and residential areas" },
  { title: "Dense fog advisory", severity: Severity.INFO, detail: "visibility below 200m expected through early morning hours" },
  { title: "Air quality alert", severity: Severity.WARNING, detail: "AQI exceeds 200 due to wildfire smoke and industrial emissions" },
  { title: "Tsunami watch issued", severity: Severity.CRITICAL, detail: "following offshore earthquake, coastal monitoring in effect" },
];

const LOCATIONS: { city: string; country: string }[] = [
  { city: "Manila", country: "Philippines" },
  { city: "Dhaka", country: "Bangladesh" },
  { city: "Baghdad", country: "Iraq" },
  { city: "Riyadh", country: "Saudi Arabia" },
  { city: "New Delhi", country: "India" },
  { city: "Mexico City", country: "Mexico" },
  { city: "Jakarta", country: "Indonesia" },
  { city: "Nairobi", country: "Kenya" },
  { city: "Cairo", country: "Egypt" },
  { city: "Tokyo", country: "Japan" },
  { city: "Bogota", country: "Colombia" },
  { city: "Ankara", country: "Turkey" },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateMockWeather(count: number = 5): RawEventData[] {
  const events: RawEventData[] = [];
  for (let i = 0; i < count; i++) {
    const weather = pick(WEATHER_EVENTS);
    const loc = pick(LOCATIONS);
    const hoursAgo = Math.floor(Math.random() * 24);
    events.push({
      title: `${loc.city}: ${weather.title}`,
      content: `Weather alert for ${loc.city}, ${loc.country}: ${weather.detail}. Embassy personnel should take appropriate precautions and monitor local weather services for updates. Non-essential travel in affected areas should be postponed.`,
      eventDate: new Date(Date.now() - hoursAgo * 3600_000),
      severity: weather.severity,
      category: "Weather",
      sourceUrl: `https://weather.example.com/alert/${Date.now()}-${i}`,
      metadata: { source: "OpenWeatherMap", city: loc.city, country: loc.country, mock: true },
      country: loc.country,
    });
  }
  return events;
}
