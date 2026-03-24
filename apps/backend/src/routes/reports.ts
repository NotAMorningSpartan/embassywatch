import { Router } from "express";
import archiver from "archiver";
import { MoreThan, In } from "typeorm";
import { AppDataSource } from "../config/database.js";
import { Embassy } from "../entities/Embassy.js";
import { ThreatAssessment } from "../entities/ThreatAssessment.js";
import { RawEvent } from "../entities/RawEvent.js";
import { DataSource } from "../entities/DataSource.js";
import { authenticate } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { generateEmbassyReport } from "../services/ReportService.js";
import { redis } from "../config/redis.js";

const router = Router();
router.use(authenticate);

const embassyRepo = () => AppDataSource.getRepository(Embassy);
const assessmentRepo = () => AppDataSource.getRepository(ThreatAssessment);
const eventRepo = () => AppDataSource.getRepository(RawEvent);
const sourceRepo = () => AppDataSource.getRepository(DataSource);

async function getReportData(embassyId: string) {
  const embassy = await embassyRepo().findOneBy({ id: embassyId });
  if (!embassy) throw new AppError(404, "Embassy not found");

  const assessment = await assessmentRepo().findOne({
    where: { embassyId },
    order: { assessedAt: "DESC" },
  });

  const since72h = new Date(Date.now() - 72 * 60 * 60 * 1000);
  const events = await eventRepo().find({
    where: {
      embassyId,
      eventDate: MoreThan(since72h),
    },
    relations: ["dataSource"],
    order: { eventDate: "DESC" },
    take: 20,
  });

  const since90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const assessmentHistory = await assessmentRepo().find({
    where: {
      embassyId,
      assessedAt: MoreThan(since90d),
    },
    order: { assessedAt: "DESC" },
  });

  const dataSources = await sourceRepo().find({
    where: { enabled: true },
    order: { name: "ASC" },
  });

  return { embassy, assessment, events, assessmentHistory, dataSources };
}

// GET /api/embassies/:id/report?format=pdf
router.get("/embassies/:id/report", async (req, res) => {
  const { id } = req.params;

  // Check Redis cache
  const reportData = await getReportData(id);
  const cacheKey = `report:${id}:${reportData.assessment?.id ?? "none"}`;

  if (redis) {
    try {
      const cached = await redis.getBuffer(cacheKey);
      if (cached) {
        const safeName = reportData.embassy.name.replace(/[^a-zA-Z0-9]/g, "_");
        const dateStr = new Date().toISOString().split("T")[0];
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="EmbassyWatch_${safeName}_${dateStr}.pdf"`,
        );
        res.send(cached);
        return;
      }
    } catch {
      // Cache miss, continue
    }
  }

  const pdfBuffer = await generateEmbassyReport(reportData);

  // Cache for 1 hour
  if (redis) {
    try {
      await redis.set(cacheKey, pdfBuffer, "EX", 3600);
    } catch {
      // Cache write failure is non-critical
    }
  }

  const safeName = reportData.embassy.name.replace(/[^a-zA-Z0-9]/g, "_");
  const dateStr = new Date().toISOString().split("T")[0];
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="EmbassyWatch_${safeName}_${dateStr}.pdf"`,
  );
  res.send(pdfBuffer);
});

// POST /api/reports/bulk — bulk export as ZIP
router.post("/bulk", async (req, res) => {
  const { embassyIds } = req.body;

  if (!Array.isArray(embassyIds) || embassyIds.length === 0) {
    throw new AppError(400, "embassyIds array is required");
  }
  if (embassyIds.length > 20) {
    throw new AppError(400, "Maximum 20 embassies per bulk export");
  }

  const embassies = await embassyRepo().find({
    where: { id: In(embassyIds) },
  });

  if (embassies.length === 0) {
    throw new AppError(404, "No valid embassies found");
  }

  const dateStr = new Date().toISOString().split("T")[0];
  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="EmbassyWatch_Reports_${dateStr}.zip"`,
  );

  const archive = archiver("zip", { zlib: { level: 5 } });
  archive.pipe(res);

  for (const embassy of embassies) {
    try {
      const reportData = await getReportData(embassy.id);
      const pdfBuffer = await generateEmbassyReport(reportData);
      const safeName = embassy.name.replace(/[^a-zA-Z0-9]/g, "_");
      archive.append(pdfBuffer, {
        name: `EmbassyWatch_${safeName}_${dateStr}.pdf`,
      });
    } catch (err) {
      console.error(`Failed to generate report for ${embassy.name}:`, err);
      // Skip failed reports, continue with others
    }
  }

  await archive.finalize();
});

export default router;
