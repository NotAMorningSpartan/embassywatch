import bcrypt from "bcrypt";
import { AppDataSource } from "../config/database.js";
import { User } from "../entities/User.js";
import { UserRole } from "../entities/enums.js";

export async function seedUsers() {
  const repo = AppDataSource.getRepository(User);
  const existing = await repo.count();
  if (existing > 0) {
    console.log(`  Users: ${existing} already exist, skipping.`);
    return;
  }

  const hash = await bcrypt.hash("demo-password", 10);

  const users: Partial<User>[] = [
    {
      email: "admin@embassywatch.gov",
      passwordHash: hash,
      displayName: "Admin User",
      role: UserRole.ADMIN,
      preferences: {},
    },
    {
      email: "analyst@embassywatch.gov",
      passwordHash: hash,
      displayName: "Analyst User",
      role: UserRole.ANALYST,
      preferences: {},
    },
  ];

  await repo.save(users);
  console.log(`  Users: seeded ${users.length} users.`);
}
