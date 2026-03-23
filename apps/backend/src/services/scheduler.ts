import cron from "node-cron";
import { DataAggregationService } from "./DataAggregationService.js";
import { NewsAPIAdapter } from "./adapters/NewsAPIAdapter.js";
import { WeatherAdapter } from "./adapters/WeatherAdapter.js";
import { TravelAdvisoryAdapter } from "./adapters/TravelAdvisoryAdapter.js";

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

  // Run once on startup after a short delay
  const runOnStartup = process.env.AGGREGATE_ON_STARTUP !== "false";
  if (runOnStartup) {
    setTimeout(async () => {
      console.log("[Scheduler] Running initial aggregation...");
      try {
        await aggregationService.runAll();
      } catch (err) {
        console.error("[Scheduler] Initial aggregation failed:", err);
      }
    }, 3000);
  }
}
