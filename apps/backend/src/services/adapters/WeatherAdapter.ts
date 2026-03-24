import { AppDataSource } from "../../config/database.js";
import { Embassy } from "../../entities/Embassy.js";
import { DataSourceType, HealthStatus, Severity } from "../../entities/enums.js";
import { DataSourceAdapter, type RawEventData } from "../DataSourceAdapter.js";
import { generateMockWeather } from "../mock/mockWeather.js";

const SEVERE_WEATHER_IDS = new Set([
  200, 201, 202, 210, 211, 212, 221, // Thunderstorm
  502, 503, 504, 511, 522, 531,       // Heavy rain
  602, 611, 612, 613, 615, 616, 620, 621, 622, // Heavy snow
  711, 731, 751, 761, 762,             // Atmosphere: smoke, dust, volcanic ash
  771, 781,                             // Squall, tornado
]);

const WARNING_WEATHER_IDS = new Set([
  300, 301, 302, 310, 311, 312, 313, 314, 321, // Drizzle
  500, 501, 520, 521,                             // Moderate rain
  600, 601,                                       // Snow
  701, 721, 741,                                  // Mist, haze, fog
]);

export class WeatherAdapter extends DataSourceAdapter {
  readonly name = "OpenWeatherMap";
  readonly type = DataSourceType.WEATHER;

  private get apiKey(): string | undefined {
    return process.env.OPENWEATHER_KEY;
  }

  private get useMock(): boolean {
    return process.env.USE_MOCK_DATA === "true" || !this.apiKey;
  }

  async fetch(): Promise<RawEventData[]> {
    if (this.useMock) {
      console.log("[Weather] Using mock data generator");
      return generateMockWeather(5);
    }

    try {
      // Get embassy locations from DB
      const embassyRepo = AppDataSource.getRepository(Embassy);
      const embassies = await embassyRepo.find();

      // Sample a subset to avoid rate limits (free tier: 60 calls/min)
      const sample = embassies
        .sort(() => Math.random() - 0.5)
        .slice(0, 15);

      const events: RawEventData[] = [];

      for (const embassy of sample) {
        try {
          const res = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${embassy.latitude}&lon=${embassy.longitude}&appid=${this.apiKey}&units=metric`,
          );
          if (!res.ok) continue;

          const data = await res.json();
          const weatherId = data.weather?.[0]?.id;
          const weatherMain = data.weather?.[0]?.main ?? "Unknown";
          const weatherDesc = data.weather?.[0]?.description ?? "";
          const temp = data.main?.temp;
          const windSpeed = data.wind?.speed;

          // Only create events for notable weather
          let severity: Severity | null = null;
          if (weatherId && SEVERE_WEATHER_IDS.has(weatherId)) {
            severity = Severity.CRITICAL;
          } else if (weatherId && WARNING_WEATHER_IDS.has(weatherId)) {
            severity = Severity.WARNING;
          } else if (temp !== undefined && (temp > 45 || temp < -20)) {
            severity = Severity.WARNING;
          } else if (windSpeed !== undefined && windSpeed > 20) {
            severity = Severity.WARNING;
          }

          if (!severity) continue;

          const tempStr = temp !== undefined ? `${Math.round(temp)}°C` : "N/A";
          const windStr = windSpeed !== undefined ? `${Math.round(windSpeed)} m/s` : "N/A";

          events.push({
            title: `${weatherMain} alert near ${embassy.city}, ${embassy.country}`,
            content: `Weather condition: ${weatherDesc}. Temperature: ${tempStr}. Wind speed: ${windStr}. Embassy personnel at ${embassy.name} should monitor conditions and take appropriate precautions.`,
            eventDate: new Date(),
            severity,
            category: "Weather",
            sourceUrl: `https://weather.com/weather/today/l/${embassy.latitude},${embassy.longitude}`,
            metadata: {
              source: "OpenWeatherMap",
              city: embassy.city,
              country: embassy.country,
              weatherId,
              weatherMain,
              temp,
              windSpeed,
            },
            country: embassy.country,
            embassyId: embassy.id,
          });
        } catch {
          // Skip individual embassy failures
          continue;
        }
      }

      console.log(`[Weather] Fetched weather for ${sample.length} locations, ${events.length} notable events`);

      // If no notable weather found, that's fine — return empty
      return events;
    } catch (err) {
      console.error("[Weather] Fetch failed, falling back to mock:", err);
      return generateMockWeather(5);
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    if (this.useMock) return HealthStatus.HEALTHY;
    try {
      const res = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=London&appid=${this.apiKey}`,
      );
      return res.ok ? HealthStatus.HEALTHY : HealthStatus.DEGRADED;
    } catch {
      return HealthStatus.DOWN;
    }
  }
}
