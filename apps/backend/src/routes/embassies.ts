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

// Country name → ISO 3166-1 alpha-3 mapping
const COUNTRY_ISO: Record<string, string> = {
  Afghanistan: "AFG", Argentina: "ARG", Australia: "AUS", Bangladesh: "BGD",
  Brazil: "BRA", Canada: "CAN", Chile: "CHL", China: "CHN", Colombia: "COL",
  Cuba: "CUB", "Democratic Republic of the Congo": "COD", Egypt: "EGY",
  Ethiopia: "ETH", France: "FRA", Germany: "DEU", Ghana: "GHA", India: "IND",
  Indonesia: "IDN", Iraq: "IRQ", Israel: "ISR", Italy: "ITA", Japan: "JPN",
  Jordan: "JOR", Kazakhstan: "KAZ", Kenya: "KEN", Kuwait: "KWT",
  Lebanon: "LBN", Mexico: "MEX", Nepal: "NPL", "New Zealand": "NZL",
  Nigeria: "NGA", Pakistan: "PAK", Panama: "PAN", Peru: "PER",
  Philippines: "PHL", Poland: "POL", Qatar: "QAT", Russia: "RUS",
  "Saudi Arabia": "SAU", Senegal: "SEN", "South Africa": "ZAF",
  "South Korea": "KOR", Spain: "ESP", "Sri Lanka": "LKA", Tanzania: "TZA",
  Thailand: "THA", Turkey: "TUR", Ukraine: "UKR",
  "United Arab Emirates": "ARE", "United Kingdom": "GBR", Uzbekistan: "UZB",
  Vietnam: "VNM",
};

const THREAT_SCORE: Record<string, number> = {
  LOW: 1, GUARDED: 2, ELEVATED: 3, HIGH: 4, SEVERE: 5,
};

const SCORE_TO_LEVEL = ["LOW", "GUARDED", "ELEVATED", "HIGH", "SEVERE"];

// GET /api/embassies/threat-by-country
router.get("/threat-by-country", async (_req, res) => {
  const embassies = await embassyRepo().find();

  const byCountry: Record<string, {
    countryCode: string;
    countryName: string;
    embassyCount: number;
    highestThreatScore: number;
    highestThreatLevel: string;
    totalScore: number;
  }> = {};

  for (const e of embassies) {
    const code = COUNTRY_ISO[e.country];
    if (!code) continue;

    if (!byCountry[code]) {
      byCountry[code] = {
        countryCode: code,
        countryName: e.country,
        embassyCount: 0,
        highestThreatScore: 0,
        highestThreatLevel: "LOW",
        totalScore: 0,
      };
    }

    const score = THREAT_SCORE[e.currentThreatLevel] ?? 1;
    byCountry[code].embassyCount++;
    byCountry[code].totalScore += score;
    if (score > byCountry[code].highestThreatScore) {
      byCountry[code].highestThreatScore = score;
      byCountry[code].highestThreatLevel = e.currentThreatLevel;
    }
  }

  const result = Object.values(byCountry).map((c) => ({
    countryCode: c.countryCode,
    countryName: c.countryName,
    aggregatedThreatLevel: c.highestThreatLevel,
    embassyCount: c.embassyCount,
    highestThreatLevel: c.highestThreatLevel,
    averageThreatScore: Math.round((c.totalScore / c.embassyCount) * 100) / 100,
  }));

  res.json(result);
});

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
