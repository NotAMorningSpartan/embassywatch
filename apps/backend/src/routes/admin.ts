import { Router } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { AppDataSource } from "../config/database.js";
import { User } from "../entities/User.js";
import { DataSource as DataSourceEntity } from "../entities/DataSource.js";
import { UserRole } from "../entities/enums.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { AppError } from "../middleware/errorHandler.js";
import { redis } from "../config/redis.js";
import { RawEvent } from "../entities/RawEvent.js";
import { getAggregationService } from "../services/scheduler.js";

const router = Router();
router.use(authenticate, requireRole(UserRole.ADMIN));

const userRepo = () => AppDataSource.getRepository(User);
const sourceRepo = () => AppDataSource.getRepository(DataSourceEntity);

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1),
  role: z.nativeEnum(UserRole),
});

const updateSourceSchema = z.object({
  endpoint: z.string().optional(),
  apiKey: z.string().optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

// GET /api/admin/users
router.get("/users", async (_req, res) => {
  const users = await userRepo().find({ order: { createdAt: "DESC" } });
  const sanitized = users.map(({ passwordHash: _, ...u }) => u);
  res.json(sanitized);
});

// POST /api/admin/users
router.post("/users", validate(createUserSchema), async (req, res) => {
  const { email, password, displayName, role } = req.body;

  const existing = await userRepo().findOneBy({ email });
  if (existing) {
    throw new AppError(409, "User with this email already exists");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = userRepo().create({ email, passwordHash, displayName, role });
  await userRepo().save(user);

  const { passwordHash: _, ...result } = user;
  res.status(201).json(result);
});

// GET /api/admin/sources
router.get("/sources", async (_req, res) => {
  const sources = await sourceRepo().find({ order: { name: "ASC" } });
  res.json(sources);
});

// PATCH /api/admin/sources/:id
router.patch("/sources/:id", validate(updateSourceSchema), async (req, res) => {
  const source = await sourceRepo().findOneBy({ id: req.params.id as string });
  if (!source) {
    throw new AppError(404, "Data source not found");
  }

  Object.assign(source, req.body);
  await sourceRepo().save(source);

  res.json(source);
});

// GET /api/admin/system/health
router.get("/system/health", async (_req, res) => {
  const health: Record<string, { status: string; message?: string }> = {};

  // Database
  try {
    await AppDataSource.query("SELECT 1");
    health.database = { status: "healthy" };
  } catch (err) {
    health.database = { status: "down", message: (err as Error).message };
  }

  // Redis
  if (redis) {
    try {
      await redis.ping();
      health.redis = { status: "healthy" };
    } catch (err) {
      health.redis = { status: "down", message: (err as Error).message };
    }
  } else {
    health.redis = { status: "down", message: "Not connected" };
  }

  // AI endpoint
  const aiUrl = process.env.AI_ENDPOINT_URL;
  if (aiUrl) {
    try {
      const response = await fetch(aiUrl, { method: "GET", signal: AbortSignal.timeout(5000) });
      health.ai = { status: response.ok ? "healthy" : "degraded" };
    } catch (err) {
      health.ai = { status: "down", message: (err as Error).message };
    }
  } else {
    health.ai = { status: "down", message: "Not configured" };
  }

  // Data source health
  const sources = await sourceRepo().find();
  for (const src of sources) {
    health[`source_${src.name}`] = {
      status: src.healthStatus ?? "unknown",
      message: src.lastFetchedAt
        ? `Last fetched: ${src.lastFetchedAt.toISOString()}`
        : "Never fetched",
    };
  }

  res.json({ ...health, timestamp: new Date().toISOString() });
});

// GET /api/admin/sources with event counts
router.get("/sources/detailed", async (_req, res) => {
  const sources = await sourceRepo().find({ order: { name: "ASC" } });
  const eventRepo = AppDataSource.getRepository(RawEvent);

  const detailed = await Promise.all(
    sources.map(async (src) => {
      const eventCount = await eventRepo.count({
        where: { dataSourceId: src.id },
      });
      return { ...src, eventCount };
    }),
  );

  res.json(detailed);
});

// POST /api/admin/sources/:id/fetch — trigger immediate fetch
router.post("/sources/:id/fetch", async (req, res) => {
  const source = await sourceRepo().findOneBy({ id: req.params.id as string });
  if (!source) {
    throw new AppError(404, "Data source not found");
  }

  const service = getAggregationService();
  const result = await service.runAll();
  res.json({ message: "Fetch triggered", ...result });
});

// PATCH /api/admin/users/:id — update user role/status
const updateUserSchema = z.object({
  role: z.nativeEnum(UserRole).optional(),
  displayName: z.string().min(1).optional(),
});

router.patch("/users/:id", validate(updateUserSchema), async (req, res) => {
  const user = await userRepo().findOneBy({ id: req.params.id as string });
  if (!user) {
    throw new AppError(404, "User not found");
  }

  if (req.body.role) user.role = req.body.role;
  if (req.body.displayName) user.displayName = req.body.displayName;
  await userRepo().save(user);

  const { passwordHash: _, ...result } = user;
  res.json(result);
});

// GET /api/admin/activity — recent system activity
router.get("/activity", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));

  const eventRepo = AppDataSource.getRepository(RawEvent);
  const [events, total] = await eventRepo.findAndCount({
    relations: ["dataSource"],
    order: { createdAt: "DESC" },
    skip: (page - 1) * limit,
    take: limit,
  });

  const activity = events.map((e) => ({
    id: e.id,
    type: "data_fetch" as const,
    title: e.title,
    source: e.dataSource?.name ?? "Unknown",
    severity: e.severity,
    timestamp: e.createdAt,
  }));

  res.json({ data: activity, total, page, limit });
});

export default router;
