import { ILike } from "typeorm";
import { AppDataSource } from "../config/database.js";
import { RawEvent } from "../entities/RawEvent.js";
import { DataSource as DataSourceEntity } from "../entities/DataSource.js";
import { Embassy } from "../entities/Embassy.js";
import { HealthStatus } from "../entities/enums.js";
import type { DataSourceAdapter, RawEventData } from "./DataSourceAdapter.js";

export class DataAggregationService {
  private adapters: DataSourceAdapter[] = [];

  register(adapter: DataSourceAdapter): void {
    this.adapters.push(adapter);
    console.log(`[Aggregation] Registered adapter: ${adapter.name} (${adapter.type})`);
  }

  /** Run all adapters in parallel, store results, handle failures gracefully */
  async runAll(): Promise<{ total: number; errors: string[] }> {
    console.log(`[Aggregation] Starting fetch from ${this.adapters.length} sources...`);
    const startTime = Date.now();

    const results = await Promise.allSettled(
      this.adapters.map((adapter) => this.runAdapter(adapter)),
    );

    let total = 0;
    const errors: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const adapter = this.adapters[i];
      if (result.status === "fulfilled") {
        total += result.value;
        console.log(`[Aggregation] ${adapter.name}: stored ${result.value} events`);
      } else {
        const errMsg = `${adapter.name}: ${result.reason}`;
        errors.push(errMsg);
        console.error(`[Aggregation] ${errMsg}`);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(
      `[Aggregation] Complete in ${elapsed}ms — ${total} events stored, ${errors.length} errors`,
    );
    return { total, errors };
  }

  private async runAdapter(adapter: DataSourceAdapter): Promise<number> {
    // Ensure data source entity exists in DB
    const dsRepo = AppDataSource.getRepository(DataSourceEntity);
    let dsEntity = await dsRepo.findOneBy({ name: adapter.name });
    if (!dsEntity) {
      dsEntity = dsRepo.create({
        name: adapter.name,
        type: adapter.type,
        enabled: true,
        healthStatus: HealthStatus.HEALTHY,
      });
      await dsRepo.save(dsEntity);
    }

    const useMock = process.env.USE_MOCK_DATA === "true";

    try {
      // Fetch events
      const rawEvents = await adapter.fetch();
      if (rawEvents.length === 0) {
        dsEntity.lastFetchedAt = new Date();
        dsEntity.healthStatus = useMock ? HealthStatus.MOCK : HealthStatus.HEALTHY;
        await dsRepo.save(dsEntity);
        return 0;
      }

      // Resolve country names to embassy IDs
      const embassyRepo = AppDataSource.getRepository(Embassy);
      const eventRepo = AppDataSource.getRepository(RawEvent);

      const entities: RawEvent[] = [];
      for (const ev of rawEvents) {
        let embassyId: string | null = ev.embassyId ?? null;

        if (!embassyId && ev.country) {
          const embassy = await embassyRepo.findOne({
            where: { country: ILike(`%${ev.country}%`) },
          });
          embassyId = embassy?.id ?? null;
        }

        const entity = eventRepo.create({
          dataSourceId: dsEntity.id,
          embassyId,
          title: ev.title,
          content: ev.content,
          eventDate: ev.eventDate,
          severity: ev.severity,
          category: ev.category,
          sourceUrl: ev.sourceUrl,
          metadata: ev.metadata,
        });
        entities.push(entity);
      }

      // Bulk insert
      await eventRepo.save(entities);

      // Update data source health & timestamp
      dsEntity.lastFetchedAt = new Date();
      dsEntity.healthStatus = useMock ? HealthStatus.MOCK : HealthStatus.HEALTHY;
      await dsRepo.save(dsEntity);

      return entities.length;
    } catch (err) {
      // Update health to DOWN on failure
      dsEntity.healthStatus = HealthStatus.DOWN;
      dsEntity.lastFetchedAt = new Date();
      await dsRepo.save(dsEntity);
      throw err;
    }
  }

  /** Run a single adapter by data source name */
  async runOne(sourceName: string): Promise<{ total: number; errors: string[] }> {
    const adapter = this.adapters.find((a) => a.name === sourceName);
    if (!adapter) {
      return { total: 0, errors: [`No adapter found for source: ${sourceName}`] };
    }

    try {
      const count = await this.runAdapter(adapter);
      return { total: count, errors: [] };
    } catch (err) {
      return { total: 0, errors: [`${adapter.name}: ${err}`] };
    }
  }

  /** Check health of all adapters */
  async healthCheckAll(): Promise<Record<string, HealthStatus>> {
    const results: Record<string, HealthStatus> = {};
    await Promise.allSettled(
      this.adapters.map(async (adapter) => {
        try {
          results[adapter.name] = await adapter.healthCheck();
        } catch {
          results[adapter.name] = HealthStatus.DOWN;
        }
      }),
    );
    return results;
  }
}
