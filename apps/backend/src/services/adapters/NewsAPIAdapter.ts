import { DataSourceType, HealthStatus } from "../../entities/enums.js";
import { DataSourceAdapter, type RawEventData } from "../DataSourceAdapter.js";
import { generateMockNews } from "../mock/mockNews.js";

export class NewsAPIAdapter extends DataSourceAdapter {
  readonly name = "NewsAPI";
  readonly type = DataSourceType.NEWS;

  private apiKey: string | undefined;
  private useMock: boolean;

  constructor() {
    super();
    this.apiKey = process.env.NEWSAPI_KEY;
    this.useMock = process.env.USE_MOCK_DATA === "true" || !this.apiKey;
  }

  async fetch(): Promise<RawEventData[]> {
    if (this.useMock) {
      console.log("[NewsAPI] Using mock data generator");
      return generateMockNews(8);
    }

    try {
      const res = await fetch(
        `https://newsapi.org/v2/everything?q=embassy+OR+diplomatic+OR+consulate&sortBy=publishedAt&pageSize=20&apiKey=${this.apiKey}`,
      );
      if (!res.ok) throw new Error(`NewsAPI returned ${res.status}`);
      const data = await res.json();
      return (data.articles ?? []).map(this.normalize);
    } catch (err) {
      console.error("[NewsAPI] Fetch failed, falling back to mock:", err);
      return generateMockNews(8);
    }
  }

  private normalize(article: {
    title?: string;
    description?: string;
    content?: string;
    publishedAt?: string;
    url?: string;
    source?: { name?: string };
  }): RawEventData {
    const title = article.title ?? "Untitled";
    const content = article.description ?? article.content ?? "";
    const lowerContent = (title + " " + content).toLowerCase();

    let severity = HealthStatus.HEALTHY as unknown as RawEventData["severity"];
    if (/attack|bomb|kill|terror|explo|shoot|war|conflict/.test(lowerContent)) {
      severity = "CRITICAL" as RawEventData["severity"];
    } else if (/protest|unrest|warn|threat|sanction|detain|arrest/.test(lowerContent)) {
      severity = "WARNING" as RawEventData["severity"];
    } else {
      severity = "INFO" as RawEventData["severity"];
    }

    return {
      title,
      content: content.slice(0, 2000),
      eventDate: article.publishedAt ? new Date(article.publishedAt) : new Date(),
      severity,
      category: "News",
      sourceUrl: article.url ?? "",
      metadata: { source: "NewsAPI", publisher: article.source?.name },
    };
  }

  async healthCheck(): Promise<HealthStatus> {
    if (this.useMock) return HealthStatus.HEALTHY;
    try {
      const res = await fetch(
        `https://newsapi.org/v2/top-headlines?country=us&pageSize=1&apiKey=${this.apiKey}`,
      );
      return res.ok ? HealthStatus.HEALTHY : HealthStatus.DEGRADED;
    } catch {
      return HealthStatus.DOWN;
    }
  }
}
