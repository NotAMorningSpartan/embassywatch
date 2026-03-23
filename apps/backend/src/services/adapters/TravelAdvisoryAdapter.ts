import { DataSourceType, HealthStatus } from "../../entities/enums.js";
import { DataSourceAdapter, type RawEventData } from "../DataSourceAdapter.js";
import { generateMockAdvisories } from "../mock/mockAdvisory.js";

export class TravelAdvisoryAdapter extends DataSourceAdapter {
  readonly name = "State Department Travel Advisories";
  readonly type = DataSourceType.ADVISORY;

  private useMock: boolean;

  constructor() {
    super();
    this.useMock = process.env.USE_MOCK_DATA === "true";
  }

  async fetch(): Promise<RawEventData[]> {
    if (this.useMock) {
      console.log("[TravelAdvisory] Using mock data generator");
      return generateMockAdvisories(6);
    }

    try {
      // State Department CAP feed
      const res = await fetch(
        "https://travel.state.gov/_res/rss/TAsTWs.xml",
      );
      if (!res.ok) throw new Error(`Travel advisory feed returned ${res.status}`);
      // XML parsing would go here for real implementation
      console.log("[TravelAdvisory] XML parsing not yet implemented, using mock");
      return generateMockAdvisories(6);
    } catch (err) {
      console.error("[TravelAdvisory] Fetch failed, falling back to mock:", err);
      return generateMockAdvisories(6);
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    if (this.useMock) return HealthStatus.HEALTHY;
    try {
      const res = await fetch("https://travel.state.gov/_res/rss/TAsTWs.xml", {
        method: "HEAD",
      });
      return res.ok ? HealthStatus.HEALTHY : HealthStatus.DEGRADED;
    } catch {
      return HealthStatus.DOWN;
    }
  }
}
