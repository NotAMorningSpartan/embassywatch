import { DataSource } from "typeorm";
import { Embassy } from "../entities/Embassy.js";
import { User } from "../entities/User.js";
import { ThreatAssessment } from "../entities/ThreatAssessment.js";
import { DataSource as DataSourceEntity } from "../entities/DataSource.js";
import { RawEvent } from "../entities/RawEvent.js";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  username: process.env.DB_USERNAME || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_DATABASE || "embassywatch",
  synchronize: process.env.NODE_ENV !== "production",
  logging: process.env.DB_LOGGING === "true",
  entities: [Embassy, User, ThreatAssessment, DataSourceEntity, RawEvent],
});
