import { v4 as uuid } from "uuid";
import { AppDataSource } from "../config/database.js";
import { Embassy } from "../entities/Embassy.js";
import { emitFeedEvent, type FeedEvent } from "./socketServer.js";

const NEWS_TEMPLATES = [
  "Protests reported near government buildings in {country}",
  "Security forces deploy additional patrols in {city} district",
  "Opposition leaders call for demonstrations in {country}",
  "Diplomatic tensions rise between {country} and neighboring states",
  "Economic sanctions impact daily operations in {country}",
  "Flooding disrupts transportation networks in {city}",
  "International summit scheduled in {city} next week",
  "Travel restrictions updated for {country}",
  "Cybersecurity incident reported affecting {country} infrastructure",
  "Military exercises announced near {city}",
  "Humanitarian aid arrives in {city} following recent events",
  "Embassy staff advisory issued for {country}",
  "New security checkpoints established in {city}",
  "Power outages reported across {city} metropolitan area",
  "Regional stability discussions underway in {country}",
];

const WEATHER_TEMPLATES = [
  "Severe thunderstorm warning for {city} region",
  "Tropical storm approaching {country} coastline",
  "Extreme heat advisory: temperatures exceeding 45°C in {city}",
  "Flash flood warning issued for {city} area",
  "Dust storm reducing visibility in {city}",
  "Heavy snowfall disrupting travel in {country}",
  "Earthquake tremor detected near {city} (magnitude 3.2)",
  "Air quality alert for {city}: hazardous pollution levels",
];

const SYSTEM_TEMPLATES = [
  "Data source NewsAPI completed fetch: {count} new events",
  "Data source OpenWeatherMap completed fetch: {count} weather updates",
  "Travel advisory data refreshed for {count} countries",
  "AI analysis pipeline completed for {count} embassies",
  "Database maintenance: event cleanup removed {count} stale records",
];

const SEVERITIES: FeedEvent["severity"][] = ["INFO", "INFO", "INFO", "WARNING", "WARNING", "CRITICAL"];
const THREAT_LEVELS = ["LOW", "GUARDED", "ELEVATED", "HIGH", "SEVERE"];

let emitterInterval: ReturnType<typeof setTimeout> | null = null;
let threatChangeInterval: ReturnType<typeof setTimeout> | null = null;
let cachedEmbassies: Embassy[] = [];

async function loadEmbassies(): Promise<Embassy[]> {
  try {
    if (cachedEmbassies.length > 0) return cachedEmbassies;
    const repo = AppDataSource.getRepository(Embassy);
    cachedEmbassies = await repo.find();
    return cachedEmbassies;
  } catch {
    return [];
  }
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function emitRandomEvent(): Promise<void> {
  const embassies = await loadEmbassies();
  if (embassies.length === 0) return;

  const embassy = pick(embassies);
  const roll = Math.random();

  if (roll < 0.5) {
    // News event
    const template = pick(NEWS_TEMPLATES);
    const title = template
      .replace("{country}", embassy.country)
      .replace("{city}", embassy.city);

    emitFeedEvent({
      id: uuid(),
      type: "NEW_EVENT",
      source: "NewsAPI",
      sourceType: "NEWS",
      title,
      severity: pick(SEVERITIES),
      embassyId: embassy.id,
      embassyName: embassy.name,
      country: embassy.country,
      region: embassy.region,
      timestamp: new Date().toISOString(),
    });
  } else if (roll < 0.8) {
    // Weather event
    const template = pick(WEATHER_TEMPLATES);
    const title = template
      .replace("{country}", embassy.country)
      .replace("{city}", embassy.city);

    emitFeedEvent({
      id: uuid(),
      type: "NEW_EVENT",
      source: "OpenWeatherMap",
      sourceType: "WEATHER",
      title,
      severity: Math.random() < 0.6 ? "WARNING" : "CRITICAL",
      embassyId: embassy.id,
      embassyName: embassy.name,
      country: embassy.country,
      region: embassy.region,
      timestamp: new Date().toISOString(),
    });
  } else {
    // System event
    const template = pick(SYSTEM_TEMPLATES);
    const title = template.replace("{count}", String(randomInt(5, 50)));

    emitFeedEvent({
      id: uuid(),
      type: "SOURCE_STATUS",
      title,
      sourceName: pick(["NewsAPI", "OpenWeatherMap", "Travel Advisories"]),
      status: "HEALTHY",
      severity: "INFO",
      timestamp: new Date().toISOString(),
    });
  }
}

async function emitThreatChange(): Promise<void> {
  const embassies = await loadEmbassies();
  if (embassies.length === 0) return;

  const embassy = pick(embassies);
  const currentIdx = THREAT_LEVELS.indexOf(embassy.currentThreatLevel);
  const direction = Math.random() < 0.5 ? -1 : 1;
  const newIdx = Math.max(0, Math.min(THREAT_LEVELS.length - 1, currentIdx + direction));

  if (newIdx === currentIdx) return;

  const previousLevel = THREAT_LEVELS[currentIdx];
  const newLevel = THREAT_LEVELS[newIdx];

  emitFeedEvent({
    id: uuid(),
    type: "THREAT_CHANGE",
    embassyId: embassy.id,
    embassyName: embassy.name,
    country: embassy.country,
    region: embassy.region,
    previousLevel,
    newLevel,
    summary: `Threat level ${newIdx > currentIdx ? "elevated" : "reduced"} based on recent intelligence assessment.`,
    severity: newIdx > currentIdx ? "CRITICAL" : "INFO",
    timestamp: new Date().toISOString(),
  });
}

export function startMockEmitter(): void {
  if (emitterInterval) return;

  console.log("[MockEmitter] Starting mock event emitter");

  // Random events every 8-20 seconds
  const scheduleNext = () => {
    const delay = randomInt(8000, 20000);
    emitterInterval = setTimeout(async () => {
      await emitRandomEvent();
      scheduleNext();
    }, delay);
  };
  scheduleNext();

  // Threat changes every 2-5 minutes
  const scheduleThreatChange = () => {
    const delay = randomInt(120000, 300000);
    threatChangeInterval = setTimeout(async () => {
      await emitThreatChange();
      scheduleThreatChange();
    }, delay);
  };
  scheduleThreatChange();
}

export function stopMockEmitter(): void {
  if (emitterInterval) {
    clearTimeout(emitterInterval);
    emitterInterval = null;
  }
  if (threatChangeInterval) {
    clearTimeout(threatChangeInterval);
    threatChangeInterval = null;
  }
  console.log("[MockEmitter] Stopped");
}

export function isEmitterRunning(): boolean {
  return emitterInterval !== null;
}
