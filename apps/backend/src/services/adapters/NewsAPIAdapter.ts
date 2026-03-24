import { AppDataSource } from "../../config/database.js";
import { Embassy } from "../../entities/Embassy.js";
import { DataSourceType, HealthStatus } from "../../entities/enums.js";
import { DataSourceAdapter, type RawEventData } from "../DataSourceAdapter.js";
import { generateMockNews } from "../mock/mockNews.js";

// Cache of country names from embassy DB for matching
let countryCache: string[] | null = null;

async function getCountries(): Promise<string[]> {
  if (countryCache) return countryCache;
  try {
    const embassyRepo = AppDataSource.getRepository(Embassy);
    const embassies = await embassyRepo.find({ select: ["country"] });
    countryCache = [...new Set(embassies.map((e) => e.country))];
    return countryCache;
  } catch {
    return [];
  }
}

function extractCountryKeyword(text: string, countries: string[]): string | undefined {
  const lower = text.toLowerCase();
  for (const country of countries) {
    const countryLower = country.toLowerCase();
    const idx = lower.indexOf(countryLower);
    if (idx !== -1) {
      const before = idx > 0 ? lower[idx - 1] : " ";
      const after = idx + countryLower.length < lower.length ? lower[idx + countryLower.length] : " ";
      if (/[\s,.:;!?'"()\-\/]/.test(before) && /[\s,.:;!?'"()\-\/]/.test(after)) {
        return country;
      }
    }
  }

  const aliases: Record<string, string> = {
    "american": "United States", "u.s.": "United States", "u.s": "United States",
    "british": "United Kingdom", "uk": "United Kingdom",
    "iranian": "Iran", "iraqi": "Iraq", "israeli": "Israel",
    "chinese": "China", "russian": "Russia", "ukrainian": "Ukraine",
    "turkish": "Turkey", "egyptian": "Egypt", "nigerian": "Nigeria",
    "pakistani": "Pakistan", "indian": "India", "brazilian": "Brazil",
    "colombian": "Colombia", "mexican": "Mexico", "japanese": "Japan",
    "korean": "South Korea", "philippine": "Philippines", "filipino": "Philippines",
    "afghan": "Afghanistan", "ethiopian": "Ethiopia", "kenyan": "Kenya",
    "saudi": "Saudi Arabia", "emirati": "United Arab Emirates",
    "jordanian": "Jordan", "lebanese": "Lebanon", "kuwaiti": "Kuwait",
    "thai": "Thailand", "vietnamese": "Vietnam", "indonesian": "Indonesia",
    "polish": "Poland", "german": "Germany", "french": "France",
    "spanish": "Spain", "italian": "Italy", "argentine": "Argentina",
    "chilean": "Chile", "peruvian": "Peru", "panamanian": "Panama",
    "cuban": "Cuba", "qatari": "Qatar",
  };

  for (const [alias, country] of Object.entries(aliases)) {
    if (lower.includes(alias)) {
      if (countries.includes(country)) return country;
    }
  }

  return undefined;
}

interface AIClassification {
  countries: string[];
  reasoning: string;
  confidence: number;
  relevanceToEmbassy: string;
  keyEntities: string[];
}

/**
 * Use AI to determine which countries an article affects.
 * Processes each article individually to avoid index confusion.
 * Allows multi-country classification for regional/worldwide events.
 */
async function extractCountriesWithAI(
  articles: { index: number; title: string; content: string }[],
  countries: string[],
): Promise<Map<number, AIClassification>> {
  const result = new Map<number, AIClassification>();
  if (articles.length === 0) return result;

  const aiUrl = process.env.AI_ENDPOINT_URL;
  const aiKey = process.env.AI_API_KEY;
  const aiModel = process.env.AI_MODEL_NAME ?? "default";

  if (!aiUrl) return result;

  const fullUrl = aiUrl.includes("/v1/chat/completions")
    ? aiUrl
    : `${aiUrl.replace(/\/+$/, "")}/v1/chat/completions`;

  const countryList = countries.join(", ");

  // Process articles concurrently (limit concurrency to 3)
  const concurrency = 3;
  for (let i = 0; i < articles.length; i += concurrency) {
    const batch = articles.slice(i, i + concurrency);
    const promises = batch.map(async (article) => {
      const prompt = `You are a news classifier for a U.S. embassy security monitoring system.

Analyze this news article and determine which countries with U.S. embassies it is relevant to.

ARTICLE TITLE: ${article.title}
ARTICLE CONTENT: ${article.content.slice(0, 300)}

COUNTRIES WITH U.S. EMBASSIES: ${countryList}

IMPORTANT RULES:
- An article can be relevant to MULTIPLE countries. For example, a "worldwide security alert" affects many countries.
- If the article mentions a specific region (Middle East, Africa, etc.), include ALL countries from that region that have U.S. embassies.
- If the article is about bilateral relations (e.g., US-Iran), include the non-US country.
- If the article mentions threats to "American interests abroad" or "U.S. embassies worldwide", include the most relevant countries based on context.
- Only respond with "NONE" if the article has truly zero relevance to any U.S. embassy operations.

Respond with ONLY a JSON object:
{
  "countries": ["Country1", "Country2"],
  "confidence": 0.0-1.0,
  "reasoning": "Why these countries were selected",
  "relevanceToEmbassy": "How this affects U.S. embassy security operations",
  "keyEntities": ["entity1", "entity2"]
}

For confidence: 1.0 = countries are explicitly named, 0.7 = strongly implied by region/context, 0.4 = loosely related.
For countries: list ALL relevant countries from the list above, or ["NONE"] if truly irrelevant.`;

      try {
        const response = await fetch(fullUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(aiKey ? { Authorization: `Bearer ${aiKey}` } : {}),
          },
          body: JSON.stringify({
            model: aiModel,
            messages: [{ role: "user", content: prompt }],
            max_tokens: 500,
            temperature: 0,
          }),
          signal: AbortSignal.timeout(60000),
        });

        if (!response.ok) return;

        const data = await response.json() as Record<string, any>;
        const raw = data.choices?.[0]?.message?.content ?? "";

        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return;

        const parsed = JSON.parse(jsonMatch[0]) as {
          countries?: string[];
          country?: string;
          confidence?: number;
          reasoning?: string;
          relevanceToEmbassy?: string;
          keyEntities?: string[];
        };

        // Support both "countries" array and legacy "country" string
        let matchedCountries = parsed.countries ?? (parsed.country ? [parsed.country] : []);
        const countrySet = new Set(countries);
        matchedCountries = matchedCountries.filter(
          (c) => c !== "NONE" && countrySet.has(c),
        );

        const classification: AIClassification = {
          countries: matchedCountries,
          reasoning: parsed.reasoning ?? "No reasoning provided",
          confidence: typeof parsed.confidence === "number"
            ? Math.max(0, Math.min(1, parsed.confidence))
            : 0.5,
          relevanceToEmbassy: parsed.relevanceToEmbassy ?? "",
          keyEntities: Array.isArray(parsed.keyEntities) ? parsed.keyEntities : [],
        };

        result.set(article.index, classification);
      } catch (err) {
        console.warn(`[NewsAPI] AI classification failed for article ${article.index}:`, (err as Error).message);
      }
    });

    await Promise.all(promises);
  }

  const matched = [...result.values()].filter((c) => c.countries.length > 0).length;
  console.log(`[NewsAPI] AI classified ${matched}/${articles.length} articles to countries (${result.size} total processed)`);

  return result;
}

export class NewsAPIAdapter extends DataSourceAdapter {
  readonly name = "NewsAPI";
  readonly type = DataSourceType.NEWS;

  private get apiKey(): string | undefined {
    return process.env.NEWSAPI_KEY;
  }

  private get useMock(): boolean {
    return process.env.USE_MOCK_DATA === "true" || !this.apiKey;
  }

  async fetch(): Promise<RawEventData[]> {
    if (this.useMock) {
      console.log("[NewsAPI] Using mock data generator");
      return generateMockNews(8);
    }

    try {
      const countries = await getCountries();
      const res = await fetch(
        `https://newsapi.org/v2/everything?q=embassy+OR+diplomatic+OR+consulate&sortBy=publishedAt&pageSize=20&apiKey=${this.apiKey}`,
      );
      if (!res.ok) throw new Error(`NewsAPI returned ${res.status}`);
      const data = await res.json() as Record<string, any>;
      const rawArticles = data.articles ?? [];

      // First pass: normalize and try keyword matching
      const events: RawEventData[] = rawArticles.map(
        (article: Record<string, unknown>) => this.normalize(article, countries),
      );

      // Collect unmatched articles for AI classification
      const unmatched: { index: number; title: string; content: string }[] = [];
      for (let i = 0; i < events.length; i++) {
        if (!events[i].country) {
          unmatched.push({
            index: i,
            title: events[i].title,
            content: events[i].content,
          });
        }
      }

      if (unmatched.length > 0) {
        console.log(`[NewsAPI] ${events.length - unmatched.length} matched by keyword, ${unmatched.length} sent to AI`);
        const aiResults = await extractCountriesWithAI(unmatched, countries);
        const extraEvents: RawEventData[] = [];

        for (const [index, classification] of aiResults) {
          const aiMeta = {
            aiReasoning: classification.reasoning,
            aiConfidence: classification.confidence,
            aiRelevanceToEmbassy: classification.relevanceToEmbassy,
            aiKeyEntities: classification.keyEntities,
            aiCountries: classification.countries,
          };

          if (classification.countries.length > 0) {
            // First country goes on the original event
            events[index].country = classification.countries[0];
            const meta = events[index].metadata as Record<string, unknown>;
            meta.country = classification.countries[0];
            meta.matchedBy = "ai";
            Object.assign(meta, aiMeta);

            // Additional countries create duplicate events
            for (let c = 1; c < classification.countries.length; c++) {
              extraEvents.push({
                ...events[index],
                country: classification.countries[c],
                metadata: {
                  ...(events[index].metadata as Record<string, unknown>),
                  country: classification.countries[c],
                  matchedBy: "ai",
                  ...aiMeta,
                },
              });
            }
          } else {
            // AI couldn't match — store reasoning anyway
            const meta = events[index].metadata as Record<string, unknown>;
            meta.matchedBy = "ai-unmatched";
            Object.assign(meta, aiMeta);
          }
        }

        // Add duplicates for multi-country events
        if (extraEvents.length > 0) {
          console.log(`[NewsAPI] Created ${extraEvents.length} additional events for multi-country articles`);
          events.push(...extraEvents);
        }
      }

      return events;
    } catch (err) {
      console.error("[NewsAPI] Fetch failed, falling back to mock:", err);
      return generateMockNews(8);
    }
  }

  private normalize(
    article: {
      title?: string;
      description?: string;
      content?: string;
      publishedAt?: string;
      url?: string;
      source?: { name?: string };
    },
    countries: string[],
  ): RawEventData {
    const title = article.title ?? "Untitled";
    const content = article.description ?? article.content ?? "";
    const fullText = title + " " + content;
    const lowerContent = fullText.toLowerCase();

    let severity: RawEventData["severity"];
    if (/attack|bomb|kill|terror|explo|shoot|war|conflict/.test(lowerContent)) {
      severity = "CRITICAL" as RawEventData["severity"];
    } else if (/protest|unrest|warn|threat|sanction|detain|arrest/.test(lowerContent)) {
      severity = "WARNING" as RawEventData["severity"];
    } else {
      severity = "INFO" as RawEventData["severity"];
    }

    const country = extractCountryKeyword(fullText, countries);

    return {
      title,
      content: content.slice(0, 2000),
      eventDate: article.publishedAt ? new Date(article.publishedAt) : new Date(),
      severity,
      category: "News",
      sourceUrl: article.url ?? "",
      metadata: {
        source: "NewsAPI",
        publisher: article.source?.name,
        country,
        matchedBy: country ? "keyword" : undefined,
      },
      country,
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
