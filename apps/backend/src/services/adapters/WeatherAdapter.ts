import { DataSourceType, HealthStatus } from "../../entities/enums.js";
import { DataSourceAdapter, type RawEventData } from "../DataSourceAdapter.js";
import { generateMockWeather } from "../mock/mockWeather.js";

export class WeatherAdapter extends DataSourceAdapter {
  readonly name = "OpenWeatherMap";
  readonly type = DataSourceType.WEATHER;

  private apiKey: string | undefined;
  private useMock: boolean;

  constructor() {
    super();
    this.apiKey = process.env.OPENWEATHER_KEY;
    this.useMock = process.env.USE_MOCK_DATA === "true" || !this.apiKey;
  }

  async fetch(): Promise<RawEventData[]> {
    if (this.useMock) {
      console.log("[Weather] Using mock data generator");
      return generateMockWeather(5);
    }

    // Real implementation would iterate embassy locations and check alerts
    try {
      // OpenWeatherMap One Call API for weather alerts
      // For now, fall back to mock if no specific implementation
      console.log("[Weather] Real API integration not yet implemented, using mock");
      return generateMockWeather(5);
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
