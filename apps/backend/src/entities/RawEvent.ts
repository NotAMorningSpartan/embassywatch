import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Severity } from "./enums.js";
import { DataSource } from "./DataSource.js";
import { Embassy } from "./Embassy.js";

@Entity("raw_events")
export class RawEvent {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  dataSourceId!: string;

  @Column({ nullable: true })
  embassyId!: string | null;

  @Column()
  title!: string;

  @Column({ type: "text" })
  content!: string;

  @Column({ type: "timestamptz" })
  eventDate!: Date;

  @Column({ type: "enum", enum: Severity })
  severity!: Severity;

  @Column({ nullable: true })
  category!: string;

  @Column({ nullable: true })
  sourceUrl!: string;

  @Column({ type: "jsonb", default: {} })
  metadata!: Record<string, unknown>;

  @Column({ type: "timestamptz", nullable: true })
  processedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => DataSource, (ds) => ds.rawEvents)
  @JoinColumn({ name: "dataSourceId" })
  dataSource!: DataSource;

  @ManyToOne(() => Embassy, (embassy) => embassy.rawEvents, { nullable: true })
  @JoinColumn({ name: "embassyId" })
  embassy!: Embassy | null;
}
