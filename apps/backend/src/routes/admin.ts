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

/* ---- Runtime config store (persisted to Redis, applied to process.env) ---- */

const CONFIG_KEY = "embassywatch:runtime-config";

interface RuntimeConfig {
  AI_ENDPOINT_URL?: string;
  AI_MODEL_NAME?: string;
  AI_API_KEY?: string;
  AI_TEMPERATURE?: string;
  AI_MAX_TOKENS?: string;
  AI_TIMEOUT?: string;
  NEWSAPI_KEY?: string;
  OPENWEATHER_KEY?: string;
  USE_MOCK_DATA?: string;
}

async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (!redis) return {};
  try {
    const raw = await redis.get(CONFIG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveRuntimeConfig(config: RuntimeConfig): Promise<void> {
  // Apply to process.env immediately
  for (const [key, value] of Object.entries(config)) {
    if (value !== undefined && value !== "") {
      process.env[key] = value;
    }
  }
  // Persist to Redis
  if (redis) {
    await redis.set(CONFIG_KEY, JSON.stringify(config));
  }
}

// Load saved config on module init — Redis config always overrides .env
// because it represents the admin's most recent choices from the UI
loadRuntimeConfig().then((config) => {
  for (const [key, value] of Object.entries(config)) {
    if (value !== undefined && value !== "") {
      process.env[key] = value;
    }
  }
});

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
  const useMock = process.env.USE_MOCK_DATA === "true";
  const eventRepo = AppDataSource.getRepository(RawEvent);

  interface HealthDetail {
    status: string;
    name: string;
    category: "infrastructure" | "data_source" | "ai";
    message: string;
    details?: Record<string, string | number | boolean | null>;
  }

  const checks: HealthDetail[] = [];

  // ---- INFRASTRUCTURE ----

  // Database
  try {
    const startMs = Date.now();
    const [{ count }] = await AppDataSource.query("SELECT COUNT(*) as count FROM embassies");
    const latencyMs = Date.now() - startMs;
    checks.push({
      status: "healthy",
      name: "PostgreSQL Database",
      category: "infrastructure",
      message: `Connected · ${count} embassies · ${latencyMs}ms latency`,
      details: { latencyMs, embassyCount: Number(count) },
    });
  } catch (err) {
    checks.push({
      status: "down",
      name: "PostgreSQL Database",
      category: "infrastructure",
      message: `Connection failed: ${(err as Error).message}`,
    });
  }

  // Redis
  if (redis) {
    try {
      const startMs = Date.now();
      await redis.ping();
      const latencyMs = Date.now() - startMs;
      const info = await redis.info("memory");
      const memMatch = info.match(/used_memory_human:(\S+)/);
      checks.push({
        status: "healthy",
        name: "Redis Cache",
        category: "infrastructure",
        message: `Connected · ${latencyMs}ms latency${memMatch ? ` · ${memMatch[1]} memory` : ""}`,
        details: { latencyMs },
      });
    } catch (err) {
      checks.push({
        status: "down",
        name: "Redis Cache",
        category: "infrastructure",
        message: `Connection failed: ${(err as Error).message}`,
      });
    }
  } else {
    checks.push({
      status: "down",
      name: "Redis Cache",
      category: "infrastructure",
      message: "Not connected — rate limiting and token blacklist disabled",
    });
  }

  // ---- AI ----

  const aiUrl = process.env.AI_ENDPOINT_URL;
  const aiKey = process.env.AI_API_KEY;
  const aiModel = process.env.AI_MODEL_NAME ?? "not configured";
  if (aiUrl) {
    try {
      const startMs = Date.now();
      const fullUrl = aiUrl.includes("/v1/chat/completions")
        ? aiUrl
        : `${aiUrl.replace(/\/+$/, "")}/v1/chat/completions`;
      const response = await fetch(fullUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(aiKey ? { Authorization: `Bearer ${aiKey}` } : {}),
        },
        body: JSON.stringify({
          model: aiModel,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 5,
          temperature: 0,
        }),
        signal: AbortSignal.timeout(10000),
      });
      const latencyMs = Date.now() - startMs;
      if (response.ok) {
        checks.push({
          status: "healthy",
          name: "AI Inference Endpoint",
          category: "ai",
          message: `Model: ${aiModel} · ${latencyMs}ms response time`,
          details: { model: aiModel, latencyMs, endpoint: aiUrl },
        });
      } else {
        checks.push({
          status: "degraded",
          name: "AI Inference Endpoint",
          category: "ai",
          message: `HTTP ${response.status} · Model: ${aiModel} · ${latencyMs}ms`,
          details: { model: aiModel, latencyMs, httpStatus: response.status },
        });
      }
    } catch (err) {
      checks.push({
        status: "down",
        name: "AI Inference Endpoint",
        category: "ai",
        message: `Connection failed: ${(err as Error).message}`,
        details: { model: aiModel, endpoint: aiUrl },
      });
    }
  } else {
    checks.push({
      status: "not_configured",
      name: "AI Inference Endpoint",
      category: "ai",
      message: "No endpoint URL configured — go to AI Config to set up",
    });
  }

  // ---- DATA SOURCES ----

  // Get DB source info for last-fetched timestamps and event counts
  const sources = await sourceRepo().find();
  const sourceMap = new Map(sources.map((s) => [s.name, s]));

  // NewsAPI
  const newsKey = process.env.NEWSAPI_KEY;
  const newsSource = sourceMap.get("NewsAPI");
  const newsEventCount = newsSource
    ? await eventRepo.count({ where: { dataSourceId: newsSource.id } })
    : 0;
  if (useMock) {
    checks.push({
      status: "mock",
      name: "NewsAPI",
      category: "data_source",
      message: `Using mock data · ${newsEventCount} events stored`,
      details: { eventCount: newsEventCount, lastFetched: newsSource?.lastFetchedAt?.toISOString() ?? null },
    });
  } else if (newsKey) {
    try {
      const startMs = Date.now();
      const r = await fetch(`https://newsapi.org/v2/top-headlines?country=us&pageSize=1&apiKey=${newsKey}`, { signal: AbortSignal.timeout(8000) });
      const d = await r.json();
      const latencyMs = Date.now() - startMs;
      if (d.status === "ok") {
        checks.push({
          status: "healthy",
          name: "NewsAPI",
          category: "data_source",
          message: `${d.totalResults.toLocaleString()} articles available · ${newsEventCount} events stored · ${latencyMs}ms`,
          details: { totalArticles: d.totalResults, eventCount: newsEventCount, latencyMs, lastFetched: newsSource?.lastFetchedAt?.toISOString() ?? null },
        });
      } else {
        checks.push({
          status: "degraded",
          name: "NewsAPI",
          category: "data_source",
          message: `API error: ${d.message ?? "Unknown"} · ${newsEventCount} events stored`,
          details: { eventCount: newsEventCount },
        });
      }
    } catch (err) {
      checks.push({
        status: "down",
        name: "NewsAPI",
        category: "data_source",
        message: `Connection failed: ${(err as Error).message}`,
        details: { eventCount: newsEventCount },
      });
    }
  } else {
    checks.push({
      status: "not_configured",
      name: "NewsAPI",
      category: "data_source",
      message: "No API key configured — go to AI Config to set up",
    });
  }

  // OpenWeatherMap
  const weatherKey = process.env.OPENWEATHER_KEY;
  const weatherSource = sourceMap.get("OpenWeatherMap");
  const weatherEventCount = weatherSource
    ? await eventRepo.count({ where: { dataSourceId: weatherSource.id } })
    : 0;
  if (useMock) {
    checks.push({
      status: "mock",
      name: "OpenWeatherMap",
      category: "data_source",
      message: `Using mock data · ${weatherEventCount} events stored`,
      details: { eventCount: weatherEventCount, lastFetched: weatherSource?.lastFetchedAt?.toISOString() ?? null },
    });
  } else if (weatherKey) {
    try {
      const startMs = Date.now();
      const r = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=London&appid=${weatherKey}`, { signal: AbortSignal.timeout(8000) });
      const latencyMs = Date.now() - startMs;
      if (r.ok) {
        const d = await r.json();
        checks.push({
          status: "healthy",
          name: "OpenWeatherMap",
          category: "data_source",
          message: `API responding · ${weatherEventCount} events stored · ${latencyMs}ms`,
          details: { eventCount: weatherEventCount, latencyMs, testCity: "London", temp: d.main?.temp, lastFetched: weatherSource?.lastFetchedAt?.toISOString() ?? null },
        });
      } else {
        checks.push({
          status: "degraded",
          name: "OpenWeatherMap",
          category: "data_source",
          message: `HTTP ${r.status} · ${weatherEventCount} events stored`,
          details: { eventCount: weatherEventCount, httpStatus: r.status },
        });
      }
    } catch (err) {
      checks.push({
        status: "down",
        name: "OpenWeatherMap",
        category: "data_source",
        message: `Connection failed: ${(err as Error).message}`,
        details: { eventCount: weatherEventCount },
      });
    }
  } else {
    checks.push({
      status: "not_configured",
      name: "OpenWeatherMap",
      category: "data_source",
      message: "No API key configured — go to AI Config to set up",
    });
  }

  // Travel Advisory
  const advisorySource = sourceMap.get("State Department Travel Advisories");
  const advisoryEventCount = advisorySource
    ? await eventRepo.count({ where: { dataSourceId: advisorySource.id } })
    : 0;
  if (useMock) {
    checks.push({
      status: "mock",
      name: "State Dept Travel Advisories",
      category: "data_source",
      message: `Using mock data · ${advisoryEventCount} advisories stored`,
      details: { eventCount: advisoryEventCount, lastFetched: advisorySource?.lastFetchedAt?.toISOString() ?? null },
    });
  } else {
    try {
      const startMs = Date.now();
      const r = await fetch("https://cadataapi.state.gov/api/TravelAdvisories", { signal: AbortSignal.timeout(10000) });
      const latencyMs = Date.now() - startMs;
      if (r.ok) {
        const advisories = await r.json();
        checks.push({
          status: "healthy",
          name: "State Dept Travel Advisories",
          category: "data_source",
          message: `${advisories.length} advisories available · ${advisoryEventCount} matched to embassies · ${latencyMs}ms`,
          details: { totalAdvisories: advisories.length, eventCount: advisoryEventCount, latencyMs, lastFetched: advisorySource?.lastFetchedAt?.toISOString() ?? null },
        });
      } else {
        checks.push({
          status: "degraded",
          name: "State Dept Travel Advisories",
          category: "data_source",
          message: `HTTP ${r.status} from cadataapi.state.gov · ${advisoryEventCount} advisories stored`,
          details: { eventCount: advisoryEventCount, httpStatus: r.status },
        });
      }
    } catch (err) {
      checks.push({
        status: "down",
        name: "State Dept Travel Advisories",
        category: "data_source",
        message: `Connection failed: ${(err as Error).message}`,
        details: { eventCount: advisoryEventCount },
      });
    }
  }

  res.json({ checks, timestamp: new Date().toISOString() });
});

// GET /api/admin/sources with event counts
router.get("/sources/detailed", async (_req, res) => {
  const sources = await sourceRepo().find({ order: { name: "ASC" } });
  const eventRepo = AppDataSource.getRepository(RawEvent);
  const useMock = process.env.USE_MOCK_DATA === "true";

  const detailed = await Promise.all(
    sources.map(async (src) => {
      const eventCount = await eventRepo.count({
        where: { dataSourceId: src.id },
      });
      // If mock mode is on, always show MOCK regardless of DB status
      // If mock mode is off, use the DB status (HEALTHY/DEGRADED/DOWN)
      const healthStatus = useMock ? "MOCK" : (src.healthStatus === "MOCK" ? "HEALTHY" : src.healthStatus);
      return { ...src, healthStatus, eventCount };
    }),
  );

  res.json(detailed);
});

// POST /api/admin/sources/:id/fetch — trigger immediate fetch for ONE source
router.post("/sources/:id/fetch", async (req, res) => {
  const source = await sourceRepo().findOneBy({ id: req.params.id as string });
  if (!source) {
    throw new AppError(404, "Data source not found");
  }

  const service = getAggregationService();
  const result = await service.runOne(source.name);
  res.json({ message: `Fetch triggered for ${source.name}`, ...result });
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

// GET /api/admin/config — get current runtime config (unmasked, admin-only)
router.get("/config", async (_req, res) => {
  const saved = await loadRuntimeConfig();
  const config = {
    AI_ENDPOINT_URL: process.env.AI_ENDPOINT_URL ?? saved.AI_ENDPOINT_URL ?? "",
    AI_MODEL_NAME: process.env.AI_MODEL_NAME ?? saved.AI_MODEL_NAME ?? "",
    AI_API_KEY: process.env.AI_API_KEY ?? saved.AI_API_KEY ?? "",
    AI_TEMPERATURE: process.env.AI_TEMPERATURE ?? saved.AI_TEMPERATURE ?? "0.3",
    AI_MAX_TOKENS: process.env.AI_MAX_TOKENS ?? saved.AI_MAX_TOKENS ?? "2048",
    AI_TIMEOUT: process.env.AI_TIMEOUT ?? saved.AI_TIMEOUT ?? "60",
    NEWSAPI_KEY: process.env.NEWSAPI_KEY ?? saved.NEWSAPI_KEY ?? "",
    OPENWEATHER_KEY: process.env.OPENWEATHER_KEY ?? saved.OPENWEATHER_KEY ?? "",
    USE_MOCK_DATA: process.env.USE_MOCK_DATA ?? saved.USE_MOCK_DATA ?? "true",
  };
  res.json({ config, hasKeys: {
    ai: !!config.AI_API_KEY,
    newsapi: !!config.NEWSAPI_KEY,
    openweather: !!config.OPENWEATHER_KEY,
  }});
});

// PUT /api/admin/config — save runtime config
const configSchema = z.object({
  AI_ENDPOINT_URL: z.string().optional(),
  AI_MODEL_NAME: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  AI_TEMPERATURE: z.string().optional(),
  AI_MAX_TOKENS: z.string().optional(),
  AI_TIMEOUT: z.string().optional(),
  NEWSAPI_KEY: z.string().optional(),
  OPENWEATHER_KEY: z.string().optional(),
  USE_MOCK_DATA: z.string().optional(),
});

router.put("/config", validate(configSchema), async (req, res) => {
  const current = await loadRuntimeConfig();
  const updates: RuntimeConfig = { ...current };

  // Only update fields that were explicitly provided (not masked values)
  for (const [key, value] of Object.entries(req.body)) {
    if (value !== undefined && typeof value === "string" && !value.includes("••••")) {
      (updates as Record<string, string>)[key] = value;
    }
  }

  await saveRuntimeConfig(updates);
  res.json({ message: "Configuration saved and applied." });
});

// POST /api/admin/config/test-ai — test AI endpoint connection
// Accepts optional body { endpointUrl, apiKey, modelName } to test before saving
router.post("/config/test-ai", async (req, res) => {
  const url = req.body?.endpointUrl || process.env.AI_ENDPOINT_URL;
  const key = req.body?.apiKey || process.env.AI_API_KEY;
  const model = req.body?.modelName || process.env.AI_MODEL_NAME || "default";

  if (!url) {
    res.json({ success: false, message: "No AI endpoint URL configured." });
    return;
  }

  const fullUrl = url.includes("/v1/chat/completions")
    ? url
    : `${url.replace(/\/+$/, "")}/v1/chat/completions`;

  try {
    const response = await fetch(fullUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Respond with exactly one word: OK" }],
        max_tokens: 10,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (response.ok) {
      const content = data.choices?.[0]?.message?.content ?? JSON.stringify(data).slice(0, 200);
      res.json({ success: true, message: `Model responded: ${content}` });
    } else {
      res.json({ success: false, message: `HTTP ${response.status}: ${JSON.stringify(data).slice(0, 300)}` });
    }
  } catch (err) {
    res.json({ success: false, message: `Connection failed: ${(err as Error).message}` });
  }
});

// POST /api/admin/config/test-newsapi — test NewsAPI connection
// Accepts optional body { apiKey } to test before saving
router.post("/config/test-newsapi", async (req, res) => {
  const key = req.body?.apiKey || process.env.NEWSAPI_KEY;
  if (!key) {
    res.json({ success: false, message: "No NewsAPI key configured." });
    return;
  }
  try {
    const response = await fetch(
      `https://newsapi.org/v2/top-headlines?country=us&pageSize=1&apiKey=${key}`,
      { signal: AbortSignal.timeout(10000) },
    );
    const data = await response.json();
    if (response.ok && data.status === "ok") {
      res.json({ success: true, message: `Connected. ${data.totalResults} articles available.` });
    } else {
      res.json({ success: false, message: data.message ?? `HTTP ${response.status}` });
    }
  } catch (err) {
    res.json({ success: false, message: `Connection failed: ${(err as Error).message}` });
  }
});

// POST /api/admin/config/test-weather — test OpenWeatherMap connection
// Accepts optional body { apiKey } to test before saving
router.post("/config/test-weather", async (req, res) => {
  const key = req.body?.apiKey || process.env.OPENWEATHER_KEY;
  if (!key) {
    res.json({ success: false, message: "No OpenWeatherMap key configured." });
    return;
  }
  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=London&appid=${key}`,
      { signal: AbortSignal.timeout(10000) },
    );
    const data = await response.json();
    if (response.ok) {
      res.json({ success: true, message: `Connected. Weather data retrieved successfully.` });
    } else {
      res.json({ success: false, message: data.message ?? `HTTP ${response.status}` });
    }
  } catch (err) {
    res.json({ success: false, message: `Connection failed: ${(err as Error).message}` });
  }
});

// DELETE /api/admin/events — purge all raw events
router.delete("/events", async (_req, res) => {
  const eventRepo = AppDataSource.getRepository(RawEvent);
  const count = await eventRepo.count();
  await eventRepo.clear();
  res.json({ message: `Purged ${count} events.`, count });
});

// GET /api/admin/activity — recent system activity
router.get("/activity", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));

  const eventRepo = AppDataSource.getRepository(RawEvent);
  const [events, total] = await eventRepo.findAndCount({
    relations: ["dataSource", "embassy"],
    order: { createdAt: "DESC" },
    skip: (page - 1) * limit,
    take: limit,
  });

  const activity = events.map((e) => {
    const meta = (e.metadata ?? {}) as Record<string, unknown>;
    return {
      id: e.id,
      type: "data_fetch" as const,
      title: e.title,
      source: e.dataSource?.name ?? "Unknown",
      severity: e.severity,
      timestamp: e.createdAt,
      embassyId: e.embassyId ?? null,
      embassyName: e.embassy?.name ?? null,
      matchedBy: (meta.matchedBy as string) ?? null,
      aiReasoning: (meta.aiReasoning as string) ?? null,
      aiConfidence: (meta.aiConfidence as number) ?? null,
      aiRelevanceToEmbassy: (meta.aiRelevanceToEmbassy as string) ?? null,
      aiKeyEntities: (meta.aiKeyEntities as string[]) ?? null,
    };
  });

  res.json({ data: activity, total, page, limit });
});

export default router;
