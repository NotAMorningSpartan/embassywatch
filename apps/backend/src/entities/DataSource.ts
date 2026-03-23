import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
} from "typeorm";
import { DataSourceType, HealthStatus } from "./enums.js";
import { RawEvent } from "./RawEvent.js";

@Entity("data_sources")
export class DataSource {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "enum", enum: DataSourceType })
  type!: DataSourceType;

  @Column({ type: "varchar", nullable: true })
  endpoint!: string;

  @Column({ type: "varchar", nullable: true })
  apiKey!: string;

  @Column({ type: "boolean", default: true })
  enabled!: boolean;

  @Column({ type: "timestamptz", nullable: true })
  lastFetchedAt!: Date | null;

  @Column({ type: "enum", enum: HealthStatus, default: HealthStatus.HEALTHY })
  healthStatus!: HealthStatus;

  @Column({ type: "jsonb", default: {} })
  config!: Record<string, unknown>;

  @OneToMany(() => RawEvent, (re) => re.dataSource)
  rawEvents!: RawEvent[];
}
