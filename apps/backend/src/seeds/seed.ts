import "reflect-metadata";
import dotenv from "dotenv";
dotenv.config();

import { AppDataSource } from "../config/database.js";
import { seedUsers } from "./seedUsers.js";
import { seedEmbassies } from "./seedEmbassies.js";

async function main() {
  console.log("Initializing database connection...");
  await AppDataSource.initialize();
  console.log("Connected.\n");

  console.log("Seeding data:");
  await seedUsers();
  await seedEmbassies();

  console.log("\nSeed complete.");
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
