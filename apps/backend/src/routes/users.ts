import { Router } from "express";
import { In } from "typeorm";
import { z } from "zod";
import bcrypt from "bcrypt";
import { AppDataSource } from "../config/database.js";
import { User } from "../entities/User.js";
import { Embassy } from "../entities/Embassy.js";
import { ThreatAssessment } from "../entities/ThreatAssessment.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { AppError } from "../middleware/errorHandler.js";

const router = Router();
router.use(authenticate);

const userRepo = () => AppDataSource.getRepository(User);
const embassyRepo = () => AppDataSource.getRepository(Embassy);
const assessmentRepo = () => AppDataSource.getRepository(ThreatAssessment);

const preferencesSchema = z.object({}).passthrough();

const THREAT_ORDER: Record<string, number> = {
  SEVERE: 5,
  HIGH: 4,
  ELEVATED: 3,
  GUARDED: 2,
  LOW: 1,
};

// GET /api/users/me
router.get("/me", async (req, res) => {
  const user = await userRepo().findOneBy({ id: req.user!.id });
  if (!user) {
    throw new AppError(404, "User not found");
  }

  const { passwordHash: _, ...profile } = user;
  res.json(profile);
});

// PATCH /api/users/me/preferences
router.patch("/me/preferences", validate(preferencesSchema), async (req, res) => {
  const user = await userRepo().findOneBy({ id: req.user!.id });
  if (!user) {
    throw new AppError(404, "User not found");
  }

  user.preferences = { ...user.preferences, ...req.body };
  await userRepo().save(user);

  const { passwordHash: _, ...profile } = user;
  res.json(profile);
});

// GET /api/users/me/watchlist
router.get("/me/watchlist", async (req, res) => {
  const user = await userRepo().findOneBy({ id: req.user!.id });
  if (!user) {
    throw new AppError(404, "User not found");
  }

  const watchlist = (user.preferences.watchlist as string[]) || [];
  if (watchlist.length === 0) {
    res.json([]);
    return;
  }

  const { sort, search } = req.query;

  let embassies = await embassyRepo().find({
    where: { id: In(watchlist) },
  });

  // Search filter
  if (search && typeof search === "string") {
    const q = search.toLowerCase();
    embassies = embassies.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.city.toLowerCase().includes(q) ||
        e.country.toLowerCase().includes(q),
    );
  }

  // Sort
  switch (sort) {
    case "name_desc":
      embassies.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case "threat_desc":
      embassies.sort(
        (a, b) =>
          (THREAT_ORDER[b.currentThreatLevel] ?? 0) -
          (THREAT_ORDER[a.currentThreatLevel] ?? 0),
      );
      break;
    case "threat_asc":
      embassies.sort(
        (a, b) =>
          (THREAT_ORDER[a.currentThreatLevel] ?? 0) -
          (THREAT_ORDER[b.currentThreatLevel] ?? 0),
      );
      break;
    case "assessed_desc":
      embassies.sort(
        (a, b) =>
          new Date(b.lastAssessedAt ?? 0).getTime() -
          new Date(a.lastAssessedAt ?? 0).getTime(),
      );
      break;
    default:
      embassies.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Fetch last two assessments per embassy for trend calculation
  const embassyIds = embassies.map((e) => e.id);
  const assessments = embassyIds.length
    ? await assessmentRepo()
        .createQueryBuilder("ta")
        .where("ta.embassyId IN (:...ids)", { ids: embassyIds })
        .orderBy("ta.embassyId", "ASC")
        .addOrderBy("ta.assessedAt", "DESC")
        .getMany()
    : [];

  // Group assessments by embassy, keep top 2
  const assessmentsByEmbassy: Record<string, ThreatAssessment[]> = {};
  for (const a of assessments) {
    if (!assessmentsByEmbassy[a.embassyId]) {
      assessmentsByEmbassy[a.embassyId] = [];
    }
    if (assessmentsByEmbassy[a.embassyId].length < 2) {
      assessmentsByEmbassy[a.embassyId].push(a);
    }
  }

  // Build response with trend data
  const result = embassies.map((e) => {
    const history = assessmentsByEmbassy[e.id] || [];
    let trend: "improving" | "worsening" | "stable" = "stable";
    let previousThreatLevel: string | null = null;

    if (history.length >= 2) {
      const current = THREAT_ORDER[history[0].threatLevel] ?? 0;
      const previous = THREAT_ORDER[history[1].threatLevel] ?? 0;
      previousThreatLevel = history[1].threatLevel;
      if (current > previous) trend = "worsening";
      else if (current < previous) trend = "improving";
    }

    return { ...e, trend, previousThreatLevel };
  });

  res.json(result);
});

// GET /api/users/me/watchlist/changes
router.get("/me/watchlist/changes", async (req, res) => {
  const user = await userRepo().findOneBy({ id: req.user!.id });
  if (!user) {
    throw new AppError(404, "User not found");
  }

  const watchlist = (user.preferences.watchlist as string[]) || [];
  if (watchlist.length === 0) {
    res.json([]);
    return;
  }

  const days = Number(req.query.days) || 7;
  const since = new Date();
  since.setDate(since.getDate() - days);

  // Get all assessments for watched embassies in the time window
  const assessments = await assessmentRepo()
    .createQueryBuilder("ta")
    .leftJoinAndSelect("ta.embassy", "embassy")
    .where("ta.embassyId IN (:...ids)", { ids: watchlist })
    .andWhere("ta.assessedAt >= :since", { since })
    .orderBy("ta.assessedAt", "DESC")
    .limit(50)
    .getMany();

  // Find threat level changes by comparing consecutive assessments
  const changes: Array<{
    embassyId: string;
    embassyName: string;
    fromLevel: string;
    toLevel: string;
    changedAt: string;
  }> = [];

  // Group by embassy
  const byEmbassy: Record<string, ThreatAssessment[]> = {};
  for (const a of assessments) {
    if (!byEmbassy[a.embassyId]) byEmbassy[a.embassyId] = [];
    byEmbassy[a.embassyId].push(a);
  }

  for (const [embassyId, history] of Object.entries(byEmbassy)) {
    for (let i = 0; i < history.length - 1; i++) {
      if (history[i].threatLevel !== history[i + 1].threatLevel) {
        changes.push({
          embassyId,
          embassyName: history[i].embassy?.name ?? "Unknown",
          fromLevel: history[i + 1].threatLevel,
          toLevel: history[i].threatLevel,
          changedAt: history[i].assessedAt.toISOString(),
        });
      }
    }
    // Also check if the first assessment in the window differs from the
    // most recent one before the window (get previous assessment)
    if (history.length === 1) {
      const prev = await assessmentRepo()
        .createQueryBuilder("ta")
        .where("ta.embassyId = :embassyId", { embassyId })
        .andWhere("ta.assessedAt < :since", { since })
        .orderBy("ta.assessedAt", "DESC")
        .limit(1)
        .getOne();

      if (prev && prev.threatLevel !== history[0].threatLevel) {
        changes.push({
          embassyId,
          embassyName: history[0].embassy?.name ?? "Unknown",
          fromLevel: prev.threatLevel,
          toLevel: history[0].threatLevel,
          changedAt: history[0].assessedAt.toISOString(),
        });
      }
    }
  }

  // Sort by date descending and limit to 20
  changes.sort(
    (a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime(),
  );

  res.json(changes.slice(0, 20));
});

// POST /api/users/me/watchlist/:embassyId
router.post("/me/watchlist/:embassyId", async (req, res) => {
  const { embassyId } = req.params;

  const embassy = await embassyRepo().findOneBy({ id: embassyId });
  if (!embassy) {
    throw new AppError(404, "Embassy not found");
  }

  const user = await userRepo().findOneBy({ id: req.user!.id });
  if (!user) {
    throw new AppError(404, "User not found");
  }

  const watchlist = (user.preferences.watchlist as string[]) || [];
  if (!watchlist.includes(embassyId)) {
    watchlist.push(embassyId);
  }
  user.preferences = { ...user.preferences, watchlist };
  await userRepo().save(user);

  const embassies = await embassyRepo().find({
    where: { id: In(watchlist) },
    order: { name: "ASC" },
  });

  res.json(embassies);
});

// DELETE /api/users/me/watchlist/:embassyId
router.delete("/me/watchlist/:embassyId", async (req, res) => {
  const { embassyId } = req.params;

  const user = await userRepo().findOneBy({ id: req.user!.id });
  if (!user) {
    throw new AppError(404, "User not found");
  }

  const watchlist = ((user.preferences.watchlist as string[]) || []).filter(
    (id) => id !== embassyId,
  );
  user.preferences = { ...user.preferences, watchlist };
  await userRepo().save(user);

  if (watchlist.length === 0) {
    res.json({ embassies: [], count: 0 });
    return;
  }

  const embassies = await embassyRepo().find({
    where: { id: In(watchlist) },
    order: { name: "ASC" },
  });

  res.json({ embassies, count: embassies.length });
});

// PATCH /api/users/me/password
const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

router.patch("/me/password", validate(passwordSchema), async (req, res) => {
  const user = await userRepo().findOneBy({ id: req.user!.id });
  if (!user) {
    throw new AppError(404, "User not found");
  }

  const { currentPassword, newPassword } = req.body;

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    throw new AppError(400, "Current password is incorrect");
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await userRepo().save(user);

  res.json({ message: "Password updated successfully" });
});

export default router;
