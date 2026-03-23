import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { ThreatLevel } from "./enums.js";
import { Embassy } from "./Embassy.js";

@Entity("threat_assessments")
export class ThreatAssessment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  embassyId!: string;

  @Column({ type: "enum", enum: ThreatLevel })
  threatLevel!: ThreatLevel;

  @Column({ type: "float" })
  confidence!: number;

  @Column({ type: "text" })
  summary!: string;

  @Column({ type: "jsonb", default: [] })
  keyFactors!: string[];

  @Column({ type: "jsonb", default: [] })
  recommendations!: string[];

  @Column({ nullable: true })
  aiModelUsed!: string;

  @Column({ type: "text", nullable: true })
  rawAiResponse!: string;

  @Column({ type: "timestamptz" })
  assessedAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => Embassy, (embassy) => embassy.threatAssessments)
  @JoinColumn({ name: "embassyId" })
  embassy!: Embassy;
}
