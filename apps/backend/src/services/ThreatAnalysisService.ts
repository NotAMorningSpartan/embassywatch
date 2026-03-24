import { MoreThan } from "typeorm";
import { AppDataSource } from "../config/database.js";
import { Embassy } from "../entities/Embassy.js";
import { RawEvent } from "../entities/RawEvent.js";
import { ThreatAssessment } from "../entities/ThreatAssessment.js";
import { ThreatLevel, Region } from "../entities/enums.js";
import { analyzeEmbassyThreats } from "./AIClientService.js";

const CONCURRENCY_LIMIT = 5;

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  const executing: Promise<void>[] = [];

  for (const task of tasks) {
    const p = task()
      .then((value) => {
        results.push({ status: "fulfilled", value });
      })
      .catch((reason) => {
        results.push({ status: "rejected", reason });
      })
      .finally(() => {
        executing.splice(executing.indexOf(p), 1);
      });
    executing.push(p);

    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

export async function assessEmbassy(
  embassyId: string,
): Promise<ThreatAssessment> {
  const embassyRepo = AppDataSource.getRepository(Embassy);
  const eventRepo = AppDataSource.getRepository(RawEvent);
  const assessmentRepo = AppDataSource.getRepository(ThreatAssessment);

  const embassy = await embassyRepo.findOneBy({ id: embassyId });
  if (!embassy) throw new Error(`Embassy not found: ${embassyId}`);

  // Gather recent events (last 72 hours) + always include travel advisories
  const since = new Date(Date.now() - 72 * 3600_000);
  const recentEvents = await eventRepo.find({
    where: {
      embassyId: embassy.id,
      eventDate: MoreThan(since),
    },
    relations: ["dataSource"],
    order: { eventDate: "DESC" },
    take: 30,
  });

  // Always include the latest travel advisory regardless of age
  const latestAdvisory = await eventRepo
    .createQueryBuilder("e")
    .leftJoinAndSelect("e.dataSource", "ds")
    .where("e.embassyId = :id", { id: embassy.id })
    .andWhere("e.category = :cat", { cat: "Travel Advisory" })
    .orderBy("e.eventDate", "DESC")
    .limit(1)
    .getOne();

  if (latestAdvisory && !recentEvents.some((e) => e.id === latestAdvisory.id)) {
    recentEvents.unshift(latestAdvisory);
  }

  // Compute historical baseline from last assessment or default
  const lastAssessment = await assessmentRepo.findOne({
    where: { embassyId: embassy.id },
    order: { assessedAt: "DESC" },
  });
  const baseline = lastAssessment?.threatLevel ?? embassy.currentThreatLevel;

  // Run AI analysis
  console.log(
    `[ThreatAnalysis] Analyzing ${embassy.name} — ${recentEvents.length} events, baseline: ${baseline}`,
  );
  const analysis = await analyzeEmbassyThreats(
    embassy,
    recentEvents,
    baseline,
  );

  // Store assessment
  const assessment = assessmentRepo.create({
    embassyId: embassy.id,
    threatLevel: analysis.threatLevel,
    confidence: analysis.confidence,
    summary: analysis.summary,
    keyFactors: analysis.keyFactors,
    recommendations: analysis.recommendations,
    aiModelUsed: analysis.aiModelUsed,
    rawAiResponse: analysis.rawAiResponse,
    assessedAt: new Date(),
  });
  await assessmentRepo.save(assessment);

  // Update embassy current threat level
  embassy.currentThreatLevel = analysis.threatLevel;
  embassy.lastAssessedAt = new Date();
  await embassyRepo.save(embassy);

  console.log(
    `[ThreatAnalysis] ${embassy.name} → ${analysis.threatLevel} (${Math.round(analysis.confidence * 100)}% confidence)`,
  );

  return assessment;
}

export async function assessAll(): Promise<{
  total: number;
  succeeded: number;
  failed: number;
  errors: string[];
}> {
  const embassyRepo = AppDataSource.getRepository(Embassy);
  const embassies = await embassyRepo.find();

  console.log(
    `[ThreatAnalysis] Starting full analysis for ${embassies.length} embassies...`,
  );
  const startTime = Date.now();

  const tasks = embassies.map(
    (embassy) => () => assessEmbassy(embassy.id),
  );
  const results = await runWithConcurrency(tasks, CONCURRENCY_LIMIT);

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => String(r.reason));

  const elapsed = Date.now() - startTime;
  console.log(
    `[ThreatAnalysis] Complete in ${elapsed}ms — ${succeeded}/${embassies.length} succeeded, ${errors.length} failed`,
  );

  return {
    total: embassies.length,
    succeeded,
    failed: errors.length,
    errors,
  };
}

export async function assessByRegion(region: Region): Promise<{
  total: number;
  succeeded: number;
  failed: number;
  errors: string[];
}> {
  const embassyRepo = AppDataSource.getRepository(Embassy);
  const embassies = await embassyRepo.find({ where: { region } });

  console.log(
    `[ThreatAnalysis] Analyzing ${embassies.length} embassies in ${region}...`,
  );

  const tasks = embassies.map(
    (embassy) => () => assessEmbassy(embassy.id),
  );
  const results = await runWithConcurrency(tasks, CONCURRENCY_LIMIT);

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => String(r.reason));

  return {
    total: embassies.length,
    succeeded,
    failed: errors.length,
    errors,
  };
}
