import { Router } from "express";
import { AppDataSource } from "../config/database.js";
import { ThreatAssessment } from "../entities/ThreatAssessment.js";
import { Region } from "../entities/enums.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { UserRole } from "../entities/enums.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  assessEmbassy,
  assessAll,
  assessByRegion,
} from "../services/ThreatAnalysisService.js";

const router = Router();
router.use(authenticate);

const assessmentRepo = () => AppDataSource.getRepository(ThreatAssessment);

// GET /api/threats/:embassyId/latest
router.get("/:embassyId/latest", async (req, res) => {
  const assessment = await assessmentRepo().findOne({
    where: { embassyId: req.params.embassyId },
    order: { assessedAt: "DESC" },
  });

  if (!assessment) {
    throw new AppError(404, "No assessment found for this embassy");
  }

  res.json(assessment);
});

// POST /api/threats/:embassyId/analyze — ADMIN only
router.post(
  "/:embassyId/analyze",
  requireRole(UserRole.ADMIN),
  async (req, res) => {
    const assessment = await assessEmbassy(req.params.embassyId);
    res.json(assessment);
  },
);

// POST /api/threats/analyze-all — ADMIN only
router.post("/analyze-all", requireRole(UserRole.ADMIN), async (_req, res) => {
  const result = await assessAll();
  res.json(result);
});

// POST /api/threats/analyze-region/:region — ADMIN only
router.post(
  "/analyze-region/:region",
  requireRole(UserRole.ADMIN),
  async (req, res) => {
    const region = req.params.region as Region;
    if (!Object.values(Region).includes(region)) {
      throw new AppError(400, "Invalid region");
    }
    const result = await assessByRegion(region);
    res.json(result);
  },
);

export default router;
