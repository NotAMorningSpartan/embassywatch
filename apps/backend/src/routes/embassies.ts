import { Router } from "express";
import { ILike } from "typeorm";
import { AppDataSource } from "../config/database.js";
import { Embassy } from "../entities/Embassy.js";
import { ThreatAssessment } from "../entities/ThreatAssessment.js";
import { RawEvent } from "../entities/RawEvent.js";
import { Region, ThreatLevel, Severity } from "../entities/enums.js";
import { authenticate } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";

const router = Router();
router.use(authenticate);

const embassyRepo = () => AppDataSource.getRepository(Embassy);
const assessmentRepo = () => AppDataSource.getRepository(ThreatAssessment);
const eventRepo = () => AppDataSource.getRepository(RawEvent);

// GET /api/embassies/stats — must be before /:id
router.get("/stats", async (_req, res) => {
  const repo = embassyRepo();

  const byRegion = await repo
    .createQueryBuilder("e")
    .select("e.region", "region")
    .addSelect("COUNT(*)", "count")
    .groupBy("e.region")
    .getRawMany();

  const byThreatLevel = await repo
    .createQueryBuilder("e")
    .select("e.currentThreatLevel", "threatLevel")
    .addSelect("COUNT(*)", "count")
    .groupBy("e.currentThreatLevel")
    .getRawMany();

  const total = await repo.count();

  res.json({
    byRegion: Object.fromEntries(byRegion.map((r) => [r.region, Number(r.count)])),
    byThreatLevel: Object.fromEntries(byThreatLevel.map((r) => [r.threatLevel, Number(r.count)])),
    total,
  });
});

// GET /api/embassies
router.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const { region, threatLevel, search } = req.query;

  const where: Record<string, unknown>[] = [];
  const baseWhere: Record<string, unknown> = {};

  if (region && Object.values(Region).includes(region as Region)) {
    baseWhere.region = region;
  }
  if (threatLevel && Object.values(ThreatLevel).includes(threatLevel as ThreatLevel)) {
    baseWhere.currentThreatLevel = threatLevel;
  }

  if (search && typeof search === "string" && search.trim()) {
    where.push(
      { ...baseWhere, name: ILike(`%${search}%`) },
      { ...baseWhere, country: ILike(`%${search}%`) },
    );
  } else {
    where.push(baseWhere);
  }

  const [data, total] = await embassyRepo().findAndCount({
    where,
    order: { name: "ASC" },
    skip: (page - 1) * limit,
    take: limit,
  });

  res.json({ data, total, page, limit });
});

// GET /api/embassies/:id
router.get("/:id", async (req, res) => {
  const embassy = await embassyRepo().findOneBy({ id: req.params.id });
  if (!embassy) {
    throw new AppError(404, "Embassy not found");
  }

  const latestAssessment = await assessmentRepo().findOne({
    where: { embassyId: embassy.id },
    order: { assessedAt: "DESC" },
  });

  res.json({ ...embassy, latestAssessment });
});

// GET /api/embassies/:id/assessments
router.get("/:id/assessments", async (req, res) => {
  const embassy = await embassyRepo().findOneBy({ id: req.params.id });
  if (!embassy) {
    throw new AppError(404, "Embassy not found");
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

  const [data, total] = await assessmentRepo().findAndCount({
    where: { embassyId: embassy.id },
    order: { assessedAt: "DESC" },
    skip: (page - 1) * limit,
    take: limit,
  });

  res.json({ data, total, page, limit });
});

// GET /api/embassies/:id/events
router.get("/:id/events", async (req, res) => {
  const embassy = await embassyRepo().findOneBy({ id: req.params.id });
  if (!embassy) {
    throw new AppError(404, "Embassy not found");
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const { severity, sourceType } = req.query;

  const qb = eventRepo()
    .createQueryBuilder("e")
    .leftJoinAndSelect("e.dataSource", "ds")
    .where("e.embassyId = :embassyId", { embassyId: embassy.id });

  if (severity && Object.values(Severity).includes(severity as Severity)) {
    qb.andWhere("e.severity = :severity", { severity });
  }
  if (sourceType && typeof sourceType === "string") {
    qb.andWhere("ds.type = :sourceType", { sourceType });
  }

  qb.orderBy("e.eventDate", "DESC")
    .skip((page - 1) * limit)
    .take(limit);

  const [data, total] = await qb.getManyAndCount();

  res.json({ data, total, page, limit });
});

export default router;
