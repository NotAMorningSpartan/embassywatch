import { Router } from "express";
import { In } from "typeorm";
import { z } from "zod";
import { AppDataSource } from "../config/database.js";
import { User } from "../entities/User.js";
import { Embassy } from "../entities/Embassy.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { AppError } from "../middleware/errorHandler.js";

const router = Router();
router.use(authenticate);

const userRepo = () => AppDataSource.getRepository(User);
const embassyRepo = () => AppDataSource.getRepository(Embassy);

const preferencesSchema = z.object({}).passthrough();

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

  const embassies = await embassyRepo().find({
    where: { id: In(watchlist) },
    order: { name: "ASC" },
  });

  res.json(embassies);
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
    res.json([]);
    return;
  }

  const embassies = await embassyRepo().find({
    where: { id: In(watchlist) },
    order: { name: "ASC" },
  });

  res.json(embassies);
});

export default router;
