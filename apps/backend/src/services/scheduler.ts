import cron from "node-cron";
import { DataAggregationService } from "./DataAggregationService.js";
import { NewsAPIAdapter } from "./adapters/NewsAPIAdapter.js";
import { WeatherAdapter } from "./adapters/WeatherAdapter.js";
import { TravelAdvisoryAdapter } from "./adapters/TravelAdvisoryAdapter.js";
import { assessAll } from "./ThreatAnalysisService.js";

let service: DataAggregationService | null = null;

export function getAggregationService(): DataAggregationService {
  if (!service) {
    service = new DataAggregationService();
    service.register(new NewsAPIAdapter());
    service.register(new WeatherAdapter());
    service.register(new TravelAdvisoryAdapter());
  }
  return service;
}

export function startScheduler(): void {
  const cronSchedule = process.env.AGGREGATION_CRON ?? "*/30 * * * *";
  const aggregationService = getAggregationService();

  console.log(`[Scheduler] Data aggregation scheduled: "${cronSchedule}"`);

  cron.schedule(cronSchedule, async () => {
    console.log(`[Scheduler] Triggering data aggregation at ${new Date().toISOString()}`);
    try {
      const result = await aggregationService.runAll();
      console.log(
        `[Scheduler] Aggregation complete: ${result.total} events, ${result.errors.length} errors`,
      );
    } catch (err) {
      console.error("[Scheduler] Aggregation failed:", err);
    }
  });

  // Threat analysis schedule (default: every 6 hours)
  const analysisCron = process.env.ANALYSIS_CRON ?? "0 */6 * * *";
  console.log(`[Scheduler] Threat analysis scheduled: "${analysisCron}"`);

  cron.schedule(analysisCron, async () => {
    console.log(`[Scheduler] Triggering threat analysis at ${new Date().toISOString()}`);
    try {
      const result = await assessAll();
      console.log(
        `[Scheduler] Analysis complete: ${result.succeeded}/${result.total} succeeded`,
      );
    } catch (err) {
      console.error("[Scheduler] Analysis failed:", err);
    }
  });

  // Run once on startup after a short delay
  const runOnStartup = process.env.AGGREGATE_ON_STARTUP !== "false";
  if (runOnStartup) {
    setTimeout(async () => {
      console.log("[Scheduler] Running initial aggregation...");
      try {
        await aggregationService.runAll();
        console.log("[Scheduler] Running initial threat analysis...");
        const analysisResult = await assessAll();
        console.log(
          `[Scheduler] Initial analysis: ${analysisResult.succeeded}/${analysisResult.total} succeeded`,
        );
      } catch (err) {
        console.error("[Scheduler] Initial run failed:", err);
      }
    }, 3000);
  }
}
