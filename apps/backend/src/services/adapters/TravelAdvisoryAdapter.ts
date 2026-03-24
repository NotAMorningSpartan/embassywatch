import { AppDataSource } from "../../config/database.js";
import { Embassy } from "../../entities/Embassy.js";
import { DataSourceType, HealthStatus, Severity } from "../../entities/enums.js";
import { DataSourceAdapter, type RawEventData } from "../DataSourceAdapter.js";
import { generateMockAdvisories } from "../mock/mockAdvisory.js";

interface TravelAdvisoryEntry {
  Title: string;
  Link: string;
  Category: string[];
  Summary: string;
  id: string;
  Published: string;
  Updated: string;
}

// Map of country names to match between embassy DB and advisory titles
// The advisory title format is "CountryName - Level N: Description"
function extractCountryFromTitle(title: string): string | null {
  const match = title.match(/^(.+?)\s*-\s*Level/i);
  return match ? match[1].trim() : null;
}

function extractLevelFromTitle(title: string): number {
  const match = title.match(/Level\s+(\d)/i);
  return match ? parseInt(match[1], 10) : 0;
}

function levelToSeverity(level: number): Severity {
  switch (level) {
    case 4: return Severity.CRITICAL;
    case 3: return Severity.CRITICAL;
    case 2: return Severity.WARNING;
    default: return Severity.INFO;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export class TravelAdvisoryAdapter extends DataSourceAdapter {
  readonly name = "State Department Travel Advisories";
  readonly type = DataSourceType.ADVISORY;

  private get useMock(): boolean {
    return process.env.USE_MOCK_DATA === "true";
  }

  async fetch(): Promise<RawEventData[]> {
    if (this.useMock) {
      console.log("[TravelAdvisory] Using mock data generator");
      return generateMockAdvisories(6);
    }

    try {
      // Fetch all advisories from State Department API
      const res = await fetch("https://cadataapi.state.gov/api/TravelAdvisories", {
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`Travel advisory API returned ${res.status}`);

      const advisories: TravelAdvisoryEntry[] = await res.json();
      console.log(`[TravelAdvisory] Fetched ${advisories.length} advisories from State Department`);

      // Get embassy countries from DB for matching
      const embassyRepo = AppDataSource.getRepository(Embassy);
      const embassies = await embassyRepo.find({ select: ["id", "country", "name"] });
      const embassyByCountry = new Map<string, { id: string; name: string }>();
      for (const e of embassies) {
        embassyByCountry.set(e.country.toLowerCase(), { id: e.id, name: e.name });
      }

      const events: RawEventData[] = [];

      for (const advisory of advisories) {
        const advisoryCountry = extractCountryFromTitle(advisory.Title);
        if (!advisoryCountry) continue;

        // Match advisory country to embassy country
        const embassy = embassyByCountry.get(advisoryCountry.toLowerCase());
        if (!embassy) continue; // Only create events for countries where we have embassies

        const level = extractLevelFromTitle(advisory.Title);
        const severity = levelToSeverity(level);
        const summary = stripHtml(advisory.Summary);
        const publishedDate = new Date(advisory.Published);

        events.push({
          title: advisory.Title,
          content: summary.slice(0, 2000),
          eventDate: publishedDate,
          severity,
          category: "Travel Advisory",
          sourceUrl: advisory.Link,
          metadata: {
            source: "State Department",
            country: advisoryCountry,
            advisoryLevel: level,
            advisoryLabel: advisory.Title.split(":")[1]?.trim() ?? "",
            publishedAt: advisory.Published,
            updatedAt: advisory.Updated,
          },
          country: advisoryCountry,
          embassyId: embassy.id,
        });
      }

      console.log(`[TravelAdvisory] Matched ${events.length} advisories to embassy countries`);
      return events;
    } catch (err) {
      console.error("[TravelAdvisory] Fetch failed, falling back to mock:", err);
      return generateMockAdvisories(6);
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    if (this.useMock) return HealthStatus.HEALTHY;
    try {
      const res = await fetch("https://cadataapi.state.gov/api/TravelAdvisories", {
        method: "HEAD",
        signal: AbortSignal.timeout(10000),
      });
      return res.ok ? HealthStatus.HEALTHY : HealthStatus.DEGRADED;
    } catch {
      return HealthStatus.DOWN;
    }
  }
}
