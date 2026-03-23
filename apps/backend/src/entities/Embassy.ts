import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import { Region, ThreatLevel } from "./enums.js";
import { ThreatAssessment } from "./ThreatAssessment.js";
import { RawEvent } from "./RawEvent.js";

@Entity("embassies")
export class Embassy {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "varchar" })
  city!: string;

  @Column({ type: "varchar" })
  country!: string;

  @Column({ type: "enum", enum: Region })
  region!: Region;

  @Column({ type: "float" })
  latitude!: number;

  @Column({ type: "float" })
  longitude!: number;

  @Column({ type: "varchar", nullable: true })
  address!: string;

  @Column({ type: "enum", enum: ThreatLevel, default: ThreatLevel.LOW })
  currentThreatLevel!: ThreatLevel;

  @Column({ type: "timestamptz", nullable: true })
  lastAssessedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => ThreatAssessment, (ta) => ta.embassy)
  threatAssessments!: ThreatAssessment[];

  @OneToMany(() => RawEvent, (re) => re.embassy)
  rawEvents!: RawEvent[];
}
