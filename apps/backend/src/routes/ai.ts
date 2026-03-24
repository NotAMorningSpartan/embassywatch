import { Router } from "express";
import { z } from "zod";
import { In, MoreThan } from "typeorm";
import { AppDataSource } from "../config/database.js";
import { Embassy } from "../entities/Embassy.js";
import { ThreatAssessment } from "../entities/ThreatAssessment.js";
import { RawEvent } from "../entities/RawEvent.js";
import { DataSource as DataSourceEntity } from "../entities/DataSource.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { AppError } from "../middleware/errorHandler.js";
import { getConfig, callWithRetry } from "../services/AIClientService.js";
import { ThreatLevel, Region } from "../entities/enums.js";

const router = Router();
router.use(authenticate);

const embassyRepo = () => AppDataSource.getRepository(Embassy);
const assessmentRepo = () => AppDataSource.getRepository(ThreatAssessment);
const eventRepo = () => AppDataSource.getRepository(RawEvent);

// Rate limiting: track per-user query counts
const queryCountMap = new Map<string, { count: number; resetAt: number }>();
const MAX_QUERIES_PER_HOUR = 10;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = queryCountMap.get(userId);
  if (!entry || now > entry.resetAt) {
    queryCountMap.set(userId, { count: 1, resetAt: now + 3600000 });
    return true;
  }
  if (entry.count >= MAX_QUERIES_PER_HOUR) return false;
  entry.count++;
  return true;
}

const THREAT_SCORE: Record<string, number> = {
  LOW: 1, GUARDED: 2, ELEVATED: 3, HIGH: 4, SEVERE: 5,
};

const REGION_LABELS: Record<string, string> = {
  AFRICA: "Africa",
  EAST_ASIA_PACIFIC: "East Asia & Pacific",
  EUROPE_EURASIA: "Europe & Eurasia",
  NEAR_EAST: "Near East",
  SOUTH_CENTRAL_ASIA: "South & Central Asia",
  WESTERN_HEMISPHERE: "Western Hemisphere",
};

/* ---- Context Assembly ---- */

interface QueryContext {
  embassies: Embassy[];
  recentAssessments: ThreatAssessment[];
  recentEvents: RawEvent[];
  focusEmbassyIds?: string[];
  focusRegion?: string;
  isComparison?: boolean;
}

function extractEntities(question: string, embassies: Embassy[]) {
  const q = question.toLowerCase();
  const matchedEmbassies: Embassy[] = [];
  const matchedRegions: string[] = [];

  // Match embassy names, cities, countries
  for (const e of embassies) {
    if (
      q.includes(e.name.toLowerCase()) ||
      q.includes(e.city.toLowerCase()) ||
      q.includes(e.country.toLowerCase())
    ) {
      matchedEmbassies.push(e);
    }
  }

  // Match regions
  for (const [key, label] of Object.entries(REGION_LABELS)) {
    if (q.includes(label.toLowerCase()) || q.includes(key.toLowerCase().replace(/_/g, " "))) {
      matchedRegions.push(key);
    }
  }

  const isComparison = q.includes("compare") || q.includes("versus") || q.includes(" vs ");
  const isRecent = q.includes("changed") || q.includes("recent") || q.includes("last 24") || q.includes("last 48") || q.includes("today");
  const isHighest = q.includes("highest") || q.includes("most dangerous") || q.includes("severe") || q.includes("critical");

  return { matchedEmbassies, matchedRegions, isComparison, isRecent, isHighest };
}

async function assembleContext(
  question: string,
  pageContext?: { type: string; embassyId?: string; watchlistIds?: string[] },
): Promise<QueryContext> {
  const allEmbassies = await embassyRepo().find({ order: { name: "ASC" } });
  const entities = extractEntities(question, allEmbassies);

  const now = new Date();
  const hours48ago = new Date(now.getTime() - 48 * 3600_000);
  const hours72ago = new Date(now.getTime() - 72 * 3600_000);

  // Determine focus
  let focusEmbassyIds: string[] | undefined;
  let focusRegion: string | undefined;

  if (entities.matchedEmbassies.length > 0) {
    focusEmbassyIds = entities.matchedEmbassies.map((e) => e.id);
  } else if (pageContext?.embassyId) {
    focusEmbassyIds = [pageContext.embassyId];
  } else if (pageContext?.watchlistIds?.length) {
    focusEmbassyIds = pageContext.watchlistIds;
  }

  if (entities.matchedRegions.length > 0) {
    focusRegion = entities.matchedRegions[0];
  }

  // Get recent assessments
  const assessmentQuery = assessmentRepo()
    .createQueryBuilder("ta")
    .leftJoinAndSelect("ta.embassy", "embassy")
    .where("ta.assessedAt >= :since", { since: hours48ago })
    .orderBy("ta.assessedAt", "DESC")
    .limit(30);

  if (focusEmbassyIds) {
    assessmentQuery.andWhere("ta.embassyId IN (:...ids)", { ids: focusEmbassyIds });
  }

  const recentAssessments = await assessmentQuery.getMany();

  // Get recent events (top 50 by severity)
  const eventQuery = eventRepo()
    .createQueryBuilder("re")
    .where("re.createdAt >= :since", { since: hours72ago })
    .orderBy(
      `CASE re.severity WHEN 'CRITICAL' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END`,
      "ASC",
    )
    .addOrderBy("re.createdAt", "DESC")
    .limit(50);

  if (focusEmbassyIds) {
    eventQuery.andWhere("re.embassyId IN (:...ids)", { ids: focusEmbassyIds });
  }

  const recentEvents = await eventQuery.getMany();

  return {
    embassies: allEmbassies,
    recentAssessments,
    recentEvents,
    focusEmbassyIds,
    focusRegion,
    isComparison: entities.isComparison,
  };
}

function buildContextText(ctx: QueryContext): string {
  const lines: string[] = [];

  // Overall summary
  const byLevel: Record<string, number> = {};
  const byRegion: Record<string, Embassy[]> = {};
  for (const e of ctx.embassies) {
    byLevel[e.currentThreatLevel] = (byLevel[e.currentThreatLevel] || 0) + 1;
    if (!byRegion[e.region]) byRegion[e.region] = [];
    byRegion[e.region].push(e);
  }

  lines.push(`=== EmbassyWatch Data Snapshot ===`);
  lines.push(`Total embassies monitored: ${ctx.embassies.length}`);
  lines.push(`Threat level breakdown: ${Object.entries(byLevel).map(([k, v]) => `${k}: ${v}`).join(", ")}`);
  lines.push(``);

  // If focused on specific embassies, show detailed info
  if (ctx.focusEmbassyIds) {
    const focused = ctx.embassies.filter((e) => ctx.focusEmbassyIds!.includes(e.id));
    lines.push(`=== Focus Embassies ===`);
    for (const e of focused) {
      lines.push(`- ${e.name} (${e.city}, ${e.country})`);
      lines.push(`  Region: ${REGION_LABELS[e.region] ?? e.region}`);
      lines.push(`  Current Threat Level: ${e.currentThreatLevel}`);
      lines.push(`  Last Assessed: ${e.lastAssessedAt ? new Date(e.lastAssessedAt).toISOString() : "Never"}`);

      // Latest assessment for this embassy
      const assessment = ctx.recentAssessments.find((a) => a.embassyId === e.id);
      if (assessment) {
        lines.push(`  AI Assessment Summary: ${assessment.summary}`);
        lines.push(`  Confidence: ${Math.round(assessment.confidence * 100)}%`);
        lines.push(`  Key Factors: ${assessment.keyFactors.join("; ")}`);
      }
    }
    lines.push(``);
  }

  // If focused on a region, show regional data
  if (ctx.focusRegion) {
    const regional = byRegion[ctx.focusRegion] ?? [];
    lines.push(`=== ${REGION_LABELS[ctx.focusRegion] ?? ctx.focusRegion} Region ===`);
    for (const e of regional) {
      lines.push(`- ${e.name} (${e.city}, ${e.country}): ${e.currentThreatLevel}`);
    }
    lines.push(``);
  }

  // If no specific focus, show highest threats
  if (!ctx.focusEmbassyIds && !ctx.focusRegion) {
    const sorted = [...ctx.embassies].sort(
      (a, b) => (THREAT_SCORE[b.currentThreatLevel] ?? 0) - (THREAT_SCORE[a.currentThreatLevel] ?? 0),
    );
    lines.push(`=== Highest Threat Embassies ===`);
    for (const e of sorted.slice(0, 10)) {
      lines.push(`- ${e.name} (${e.city}, ${e.country}): ${e.currentThreatLevel}`);
    }
    lines.push(``);

    // Regional summary
    lines.push(`=== Regional Summary ===`);
    for (const [region, embs] of Object.entries(byRegion)) {
      const avg =
        embs.reduce((sum, e) => sum + (THREAT_SCORE[e.currentThreatLevel] ?? 1), 0) / embs.length;
      const highest = embs.reduce((max, e) =>
        (THREAT_SCORE[e.currentThreatLevel] ?? 0) > (THREAT_SCORE[max.currentThreatLevel] ?? 0) ? e : max,
      );
      lines.push(
        `- ${REGION_LABELS[region] ?? region}: ${embs.length} embassies, avg score ${avg.toFixed(1)}/5, highest: ${highest.name} (${highest.currentThreatLevel})`,
      );
    }
    lines.push(``);
  }

  // Recent assessments
  if (ctx.recentAssessments.length > 0) {
    lines.push(`=== Recent Assessments (last 48h) ===`);
    for (const a of ctx.recentAssessments.slice(0, 10)) {
      lines.push(
        `- ${a.embassy?.name ?? "Unknown"}: ${a.threatLevel} (confidence ${Math.round(a.confidence * 100)}%) — ${a.summary.substring(0, 150)}`,
      );
    }
    lines.push(``);
  }

  // Recent events
  if (ctx.recentEvents.length > 0) {
    lines.push(`=== Recent Events (last 72h, top by severity) ===`);
    for (const e of ctx.recentEvents.slice(0, 20)) {
      lines.push(`- [${e.severity}] ${e.title} (${new Date(e.createdAt).toISOString().split("T")[0]})`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}

/* ---- Mock Responses ---- */

async function generateMockResponse(question: string, ctx: QueryContext): Promise<string> {
  const q = question.toLowerCase();

  if (q.includes("highest threat") || q.includes("most dangerous")) {
    const sorted = [...ctx.embassies]
      .sort((a, b) => (THREAT_SCORE[b.currentThreatLevel] ?? 0) - (THREAT_SCORE[a.currentThreatLevel] ?? 0))
      .slice(0, 5);
    return `## Highest Threat Embassies\n\nBased on current assessments, the embassies with the highest threat levels are:\n\n${sorted
      .map((e, i) => `${i + 1}. **${e.name}** (${e.city}, ${e.country}) — **${e.currentThreatLevel}**`)
      .join("\n")}\n\nThese assessments are based on aggregated intelligence from multiple data sources including news, weather conditions, and State Department travel advisories.`;
  }

  if (q.includes("changed") || q.includes("recent") || q.includes("last 24")) {
    if (ctx.recentAssessments.length > 0) {
      return `## Recent Changes\n\nIn the last 48 hours, ${ctx.recentAssessments.length} new threat assessments were generated:\n\n${ctx.recentAssessments
        .slice(0, 5)
        .map((a) => `- **${a.embassy?.name ?? "Unknown"}**: ${a.threatLevel} (${Math.round(a.confidence * 100)}% confidence)`)
        .join("\n")}\n\nOverall, the threat landscape remains dynamic with ongoing monitoring across all regions.`;
    }
    return `## Recent Activity\n\nNo significant threat level changes have been detected in the last 24 hours. All monitored embassies are within their previously assessed operational parameters.`;
  }

  // Check for specific embassy/country
  if (ctx.focusEmbassyIds) {
    const focused = ctx.embassies.filter((e) => ctx.focusEmbassyIds!.includes(e.id));
    if (focused.length === 1) {
      const e = focused[0];
      return `## ${e.name}\n\n**Location:** ${e.city}, ${e.country}\n**Region:** ${REGION_LABELS[e.region] ?? e.region}\n**Current Threat Level:** ${e.currentThreatLevel}\n\nThis embassy is currently assessed at the **${e.currentThreatLevel}** threat level. ${
        ctx.recentEvents.length > 0
          ? `There are ${ctx.recentEvents.length} recent events associated with this location.`
          : "No recent notable events have been recorded."
      }\n\n*This is a mock response — connect an AI model for detailed analysis.*`;
    }
  }

  return `Based on current data, all ${ctx.embassies.length} monitored embassies are being tracked across ${Object.keys(REGION_LABELS).length} regions. No significant anomalies detected in the last 24 hours.\n\n*This is a mock response — connect an AI model for detailed analysis.*`;
}

/* ---- Route ---- */

const querySchema = z.object({
  question: z.string().min(1).max(2000),
  pageContext: z.object({
    type: z.string(),
    embassyId: z.string().optional(),
    watchlistIds: z.array(z.string()).optional(),
  }).optional(),
});

router.post("/query", validate(querySchema), async (req, res) => {
  const userId = req.user!.id;
  if (!checkRateLimit(userId)) {
    throw new AppError(429, "Rate limit exceeded. Maximum 10 AI queries per hour.");
  }

  const { question, pageContext } = req.body;
  const startTime = Date.now();

  // Assemble context
  const ctx = await assembleContext(question, pageContext);
  const contextText = buildContextText(ctx);

  const config = getConfig();
  const useMock = process.env.USE_MOCK_DATA === "true" || !config.endpointUrl;

  if (useMock) {
    const answer = await generateMockResponse(question, ctx);
    return res.json({
      answer,
      model: "mock-response-engine",
      tokensUsed: 0,
      processingTimeMs: Date.now() - startTime,
    });
  }

  // Build messages for AI
  const systemPrompt = `You are an intelligence analyst assistant for EmbassyWatch, a monitoring platform for U.S. embassy security operations worldwide.

You have access to the following current data snapshot. Answer ONLY based on this data — do not use general knowledge about world events.

${contextText}

INSTRUCTIONS:
- Cite specific embassies, events, or assessments by name when relevant.
- Use markdown formatting: **bold** for emphasis, ## headers, - bullet lists, 1. numbered lists.
- Be concise but thorough. Aim for 150-400 words.
- If the question is outside the scope of the data provided, say "I don't have enough data to answer that question."
- Do not speculate beyond what the data shows.
- When discussing threat levels, always mention the specific level (LOW, GUARDED, ELEVATED, HIGH, SEVERE).`;

  try {
    const rawResponse = await callWithRetry(
      config,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
    );

    // callWithRetry returns the raw text content from the model
    const answer = rawResponse || "I was unable to generate a response. Please try again.";
    const tokensUsed = 0; // not available from callWithRetry

    return res.json({
      answer,
      model: config.modelName,
      tokensUsed,
      processingTimeMs: Date.now() - startTime,
    });
  } catch (err) {
    console.error("AI query failed:", err);
    return res.status(503).json({
      error:
        "The AI analysis engine is currently offline. Please try again later or check the system health in the admin panel.",
    });
  }
});

export default router;
