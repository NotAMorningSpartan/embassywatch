import type { Embassy } from "../entities/Embassy.js";
import type { RawEvent } from "../entities/RawEvent.js";
import { ThreatLevel, Severity } from "../entities/enums.js";

export interface AIConfig {
  endpointUrl: string;
  modelName: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
}

export interface ThreatAnalysis {
  threatLevel: ThreatLevel;
  confidence: number;
  summary: string;
  keyFactors: string[];
  recommendations: string[];
  aiModelUsed: string;
  rawAiResponse: string;
}

function getConfig(): AIConfig {
  return {
    endpointUrl: process.env.AI_ENDPOINT_URL ?? "",
    modelName: process.env.AI_MODEL_NAME ?? "default",
    apiKey: process.env.AI_API_KEY ?? "",
    temperature: Number(process.env.AI_TEMPERATURE ?? "0.3"),
    maxTokens: Number(process.env.AI_MAX_TOKENS ?? "2048"),
    timeout: Number(process.env.AI_TIMEOUT ?? "60") * 1000,
  };
}

function buildPrompt(
  embassy: Embassy,
  events: RawEvent[],
  baseline: ThreatLevel,
): string {
  const eventSummary = events
    .slice(0, 20)
    .map(
      (e) =>
        `- [${e.severity}] ${e.title} (${new Date(e.eventDate).toISOString().slice(0, 10)})${e.category ? ` [${e.category}]` : ""}`,
    )
    .join("\n");

  return `You are a threat assessment analyst for U.S. embassy security operations.

Analyze the current security situation for the following embassy and provide a threat assessment.

EMBASSY: ${embassy.name}
LOCATION: ${embassy.city}, ${embassy.country} (${embassy.region})
CURRENT BASELINE THREAT LEVEL: ${baseline}

RECENT EVENTS (last 72 hours):
${eventSummary || "No recent events recorded."}

Based on the above information, provide a threat assessment in the following JSON format ONLY (no additional text):

{
  "threatLevel": "LOW|GUARDED|ELEVATED|HIGH|SEVERE",
  "confidence": 0.0-1.0,
  "summary": "2-3 paragraph assessment summary",
  "keyFactors": ["factor1", "factor2", ...],
  "recommendations": ["recommendation1", "recommendation2", ...]
}

Consider:
1. The severity and frequency of recent events
2. The historical baseline threat level
3. Regional geopolitical context
4. Types of threats (terrorism, civil unrest, natural disaster, crime, cyber)
5. Proximity and relevance of events to embassy operations

Provide a confidence score reflecting how certain you are of the assessment given available data.`;
}

function parseResponse(raw: string, modelName: string): ThreatAnalysis | null {
  try {
    // Try to extract JSON from the response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (
      !parsed.threatLevel ||
      !Object.values(ThreatLevel).includes(parsed.threatLevel)
    )
      return null;
    if (typeof parsed.confidence !== "number") return null;
    if (typeof parsed.summary !== "string") return null;

    return {
      threatLevel: parsed.threatLevel,
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      summary: parsed.summary,
      keyFactors: Array.isArray(parsed.keyFactors) ? parsed.keyFactors : [],
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations
        : [],
      aiModelUsed: modelName,
      rawAiResponse: raw,
    };
  } catch {
    return null;
  }
}

async function callWithRetry(
  config: AIConfig,
  messages: { role: string; content: string }[],
  retries = 3,
): Promise<string> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Support both base URL and full URL with /v1/chat/completions
      const url = config.endpointUrl.includes("/v1/chat/completions")
        ? config.endpointUrl
        : `${config.endpointUrl.replace(/\/+$/, "")}/v1/chat/completions`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey
            ? { Authorization: `Bearer ${config.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          model: config.modelName,
          messages,
          temperature: config.temperature,
          max_tokens: config.maxTokens,
        }),
        signal: AbortSignal.timeout(config.timeout),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`AI API returned ${res.status}: ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("Empty response from AI API");
      return content;
    } catch (err) {
      console.error(
        `[AIClient] Attempt ${attempt}/${retries} failed:`,
        (err as Error).message,
      );
      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
  throw new Error("All retry attempts exhausted");
}

export async function analyzeEmbassyThreats(
  embassy: Embassy,
  recentEvents: RawEvent[],
  historicalBaseline: ThreatLevel,
): Promise<ThreatAnalysis> {
  const config = getConfig();

  if (!config.endpointUrl) {
    console.log("[AIClient] No endpoint configured, using mock analysis");
    return generateMockAnalysis(embassy, recentEvents, historicalBaseline);
  }

  try {
    const prompt = buildPrompt(embassy, recentEvents, historicalBaseline);
    console.log(
      `[AIClient] Analyzing ${embassy.name} with ${recentEvents.length} events`,
    );

    // Use single user message for maximum compatibility with all model providers
    // (some models like Llama-Guard don't support system role or require alternating roles)
    const rawResponse = await callWithRetry(config, [
      { role: "user", content: prompt },
    ]);

    const parsed = parseResponse(rawResponse, config.modelName);
    if (!parsed) {
      console.warn("[AIClient] Failed to parse AI response, using mock");
      return generateMockAnalysis(embassy, recentEvents, historicalBaseline);
    }

    return parsed;
  } catch (err) {
    console.error("[AIClient] Analysis failed:", (err as Error).message);
    return generateMockAnalysis(embassy, recentEvents, historicalBaseline);
  }
}

/** Deterministic mock analysis based on event count/severity */
export function generateMockAnalysis(
  embassy: Embassy,
  events: RawEvent[],
  baseline: ThreatLevel,
): ThreatAnalysis {
  const criticalCount = events.filter(
    (e) => e.severity === Severity.CRITICAL,
  ).length;
  const warningCount = events.filter(
    (e) => e.severity === Severity.WARNING,
  ).length;
  const totalEvents = events.length;

  // Score: 0-100 based on events
  let score = 0;
  score += criticalCount * 25;
  score += warningCount * 10;
  score += Math.min(totalEvents, 10) * 2;

  // Adjust based on baseline
  const baselineScore: Record<string, number> = {
    LOW: 0,
    GUARDED: 10,
    ELEVATED: 25,
    HIGH: 40,
    SEVERE: 60,
  };
  score += baselineScore[baseline] ?? 0;

  // Determine threat level
  let threatLevel: ThreatLevel;
  if (score >= 80) threatLevel = ThreatLevel.SEVERE;
  else if (score >= 55) threatLevel = ThreatLevel.HIGH;
  else if (score >= 35) threatLevel = ThreatLevel.ELEVATED;
  else if (score >= 15) threatLevel = ThreatLevel.GUARDED;
  else threatLevel = ThreatLevel.LOW;

  const confidence = Math.min(0.95, 0.4 + totalEvents * 0.05);

  const categories = [...new Set(events.map((e) => e.category).filter(Boolean))];

  const keyFactors: string[] = [];
  if (criticalCount > 0)
    keyFactors.push(`${criticalCount} critical event(s) in the past 72 hours`);
  if (warningCount > 0)
    keyFactors.push(`${warningCount} warning-level event(s) detected`);
  if (categories.length > 0)
    keyFactors.push(`Event categories: ${categories.join(", ")}`);
  if (totalEvents === 0)
    keyFactors.push("No recent events — assessment based on historical baseline");
  keyFactors.push(`Historical baseline: ${baseline}`);

  const recommendations: string[] = [];
  if (threatLevel === ThreatLevel.SEVERE || threatLevel === ThreatLevel.HIGH) {
    recommendations.push("Increase perimeter security and restrict access");
    recommendations.push("Brief all personnel on emergency procedures");
    recommendations.push("Coordinate with local law enforcement");
  }
  if (threatLevel === ThreatLevel.ELEVATED) {
    recommendations.push("Heighten security awareness among staff");
    recommendations.push("Review and update emergency action plans");
  }
  recommendations.push("Continue monitoring local media and intelligence feeds");
  recommendations.push("Maintain regular check-ins with regional security officer");

  const summary = `Assessment for ${embassy.name} in ${embassy.city}, ${embassy.country}.\n\n${totalEvents > 0 ? `${totalEvents} event(s) were analyzed from the past 72 hours, including ${criticalCount} critical and ${warningCount} warning-level incidents. ${categories.length > 0 ? `Key event categories include ${categories.join(", ")}.` : ""}` : "No recent events have been recorded for this location."}\n\nBased on the available data and historical baseline of ${baseline}, the current threat level is assessed as ${threatLevel} with ${Math.round(confidence * 100)}% confidence. ${threatLevel === ThreatLevel.LOW ? "The security environment remains stable with no significant concerns." : "Embassy personnel should maintain heightened awareness and follow recommended security protocols."}`;

  return {
    threatLevel,
    confidence,
    summary,
    keyFactors,
    recommendations,
    aiModelUsed: "mock-rule-engine",
    rawAiResponse: JSON.stringify(
      { threatLevel, confidence, summary, keyFactors, recommendations },
      null,
      2,
    ),
  };
}
