import { DataSourceType, HealthStatus, Severity } from "../entities/enums.js";

export interface RawEventData {
  title: string;
  content: string;
  eventDate: Date;
  severity: Severity;
  category: string;
  sourceUrl: string;
  metadata: Record<string, unknown>;
  /** ISO country name to match against embassies */
  country?: string;
  /** Specific embassy ID if known */
  embassyId?: string | null;
}

export abstract class DataSourceAdapter {
  abstract readonly name: string;
  abstract readonly type: DataSourceType;

  /** Fetch latest data from the source */
  abstract fetch(): Promise<RawEventData[]>;

  /** Check if the source is reachable */
  abstract healthCheck(): Promise<HealthStatus>;
}
