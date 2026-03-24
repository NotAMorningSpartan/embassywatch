import PDFDocument from "pdfkit";
import { generateThreatChart } from "./ChartService.js";
import type { Embassy } from "../entities/Embassy.js";
import type { ThreatAssessment } from "../entities/ThreatAssessment.js";
import type { RawEvent } from "../entities/RawEvent.js";
import type { DataSource } from "../entities/DataSource.js";

const THREAT_COLORS: Record<string, [number, number, number]> = {
  LOW: [46, 133, 64],
  GUARDED: [46, 117, 182],
  ELEVATED: [232, 168, 32],
  HIGH: [232, 119, 34],
  SEVERE: [216, 57, 51],
};

const THREAT_LABELS: Record<string, string> = {
  LOW: "Low",
  GUARDED: "Guarded",
  ELEVATED: "Elevated",
  HIGH: "High",
  SEVERE: "Severe",
};

const NAVY: [number, number, number] = [27, 58, 92];
const GRAY: [number, number, number] = [113, 118, 122];
const RED: [number, number, number] = [216, 57, 51];
const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];

interface ReportData {
  embassy: Embassy;
  assessment: ThreatAssessment | null;
  events: RawEvent[];
  assessmentHistory: ThreatAssessment[];
  dataSources: DataSource[];
  aiModelName?: string;
}

function addClassificationBanner(doc: PDFKit.PDFDocument, y: number) {
  doc
    .fontSize(8)
    .fillColor(RED)
    .text("UNCLASSIFIED // FOR DEMONSTRATION ONLY", 0, y, {
      align: "center",
      width: doc.page.width,
    });
}

function addPageHeader(
  doc: PDFKit.PDFDocument,
  embassyName: string,
  date: string,
) {
  const top = 25;
  doc
    .fontSize(8)
    .fillColor(GRAY)
    .text(`EmbassyWatch — ${embassyName}`, 50, top, { width: 300 })
    .text(date, 50, top, {
      align: "right",
      width: doc.page.width - 100,
    });
  addClassificationBanner(doc, top + 14);
  doc
    .moveTo(50, top + 28)
    .lineTo(doc.page.width - 50, top + 28)
    .strokeColor(NAVY)
    .lineWidth(0.5)
    .stroke();
}

function addPageFooter(doc: PDFKit.PDFDocument, pageNum: number) {
  const bottom = doc.page.height - 40;
  doc
    .moveTo(50, bottom)
    .lineTo(doc.page.width - 50, bottom)
    .strokeColor(NAVY)
    .lineWidth(0.5)
    .stroke();
  doc
    .fontSize(8)
    .fillColor(GRAY)
    .text(`Page ${pageNum}`, 0, bottom + 6, {
      align: "center",
      width: doc.page.width,
    });
  addClassificationBanner(doc, bottom + 18);
}

function sectionHeader(doc: PDFKit.PDFDocument, title: string, y?: number) {
  if (y !== undefined) doc.y = y;
  doc
    .fontSize(16)
    .fillColor(NAVY)
    .text(title, 50, doc.y, { underline: false })
    .moveDown(0.3);
  doc
    .moveTo(50, doc.y)
    .lineTo(250, doc.y)
    .strokeColor(NAVY)
    .lineWidth(1)
    .stroke();
  doc.moveDown(0.5);
}

export async function generateEmbassyReport(
  data: ReportData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: "letter",
      margins: { top: 60, bottom: 60, left: 50, right: 50 },
      info: {
        Title: `Threat Assessment Report — ${data.embassy.name}`,
        Author: "EmbassyWatch Automated Analysis System",
      },
    });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const dateStr = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const timeStr = new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const threatColor =
      THREAT_COLORS[data.embassy.currentThreatLevel] ?? GRAY;
    const threatLabel =
      THREAT_LABELS[data.embassy.currentThreatLevel] ??
      data.embassy.currentThreatLevel;

    // ===== PAGE 1: COVER =====
    addClassificationBanner(doc, 30);
    doc.moveDown(4);

    doc
      .fontSize(32)
      .fillColor(NAVY)
      .text("Threat Assessment Report", { align: "center" })
      .moveDown(0.5);

    doc
      .fontSize(18)
      .fillColor(GRAY)
      .text(data.embassy.name, { align: "center" })
      .fontSize(14)
      .text(`${data.embassy.city}, ${data.embassy.country}`, {
        align: "center",
      })
      .moveDown(1.5);

    // Threat level badge
    const badgeWidth = 200;
    const badgeHeight = 50;
    const badgeX = (doc.page.width - badgeWidth) / 2;
    doc
      .roundedRect(badgeX, doc.y, badgeWidth, badgeHeight, 6)
      .fill(threatColor);
    doc
      .fontSize(22)
      .fillColor(WHITE)
      .text(threatLabel.toUpperCase(), badgeX, doc.y - badgeHeight + 15, {
        width: badgeWidth,
        align: "center",
      });
    doc.y += 20;
    doc.moveDown(2);

    doc
      .fontSize(12)
      .fillColor(GRAY)
      .text(`Generated: ${dateStr} at ${timeStr}`, { align: "center" })
      .moveDown(0.5)
      .text("Prepared by EmbassyWatch Automated Analysis System", {
        align: "center",
      })
      .moveDown(4);

    addClassificationBanner(doc, doc.page.height - 50);

    // ===== PAGE 2: EXECUTIVE SUMMARY =====
    doc.addPage();
    addPageHeader(doc, data.embassy.name, dateStr);
    addPageFooter(doc, 2);

    sectionHeader(doc, "Executive Summary", 70);

    if (data.assessment) {
      doc
        .fontSize(11)
        .fillColor(BLACK)
        .text(data.assessment.summary, 50, doc.y, {
          width: doc.page.width - 100,
          lineGap: 4,
        })
        .moveDown(1);

      // Confidence bar
      doc
        .fontSize(10)
        .fillColor(GRAY)
        .text(
          `Confidence: ${Math.round(data.assessment.confidence * 100)}%`,
          50,
        )
        .moveDown(0.3);

      const barWidth = 300;
      const barHeight = 12;
      const barX = 50;
      const barY = doc.y;
      doc.roundedRect(barX, barY, barWidth, barHeight, 3).fill([230, 230, 230]);
      const fillWidth = barWidth * data.assessment.confidence;
      const confColor: [number, number, number] =
        data.assessment.confidence > 0.8
          ? [46, 133, 64]
          : data.assessment.confidence > 0.5
            ? [232, 168, 32]
            : [216, 57, 51];
      doc.roundedRect(barX, barY, fillWidth, barHeight, 3).fill(confColor);
      doc.y = barY + barHeight + 15;

      // Key factors
      if (data.assessment.keyFactors?.length) {
        doc
          .fontSize(12)
          .fillColor(NAVY)
          .text("Key Factors", 50)
          .moveDown(0.3);
        data.assessment.keyFactors.forEach((factor, i) => {
          doc
            .fontSize(10)
            .fillColor(BLACK)
            .text(`${i + 1}. ${factor}`, 60, doc.y, {
              width: doc.page.width - 120,
            })
            .moveDown(0.2);
        });
      }
    } else {
      doc
        .fontSize(11)
        .fillColor(GRAY)
        .text(
          "No AI assessment has been generated for this embassy. Run an analysis from the admin panel to populate this section.",
          50,
          doc.y,
          { width: doc.page.width - 100 },
        );
    }

    // ===== PAGE 3: DETAILED ANALYSIS =====
    doc.addPage();
    addPageHeader(doc, data.embassy.name, dateStr);
    addPageFooter(doc, 3);

    sectionHeader(doc, "Contributing Factors & Events", 70);

    if (data.events.length > 0) {
      // Table header
      const colX = [50, 120, 210, 310, 380];
      const colW = [65, 85, 95, 65, doc.page.width - 50 - 380];
      doc.fontSize(8).fillColor(NAVY);
      ["Date", "Source", "Category", "Severity", "Title"].forEach(
        (h, i) => {
          doc.text(h, colX[i], doc.y, { width: colW[i], continued: false });
        },
      );
      const headerY = doc.y;
      doc.y = headerY + 14;
      doc
        .moveTo(50, doc.y)
        .lineTo(doc.page.width - 50, doc.y)
        .strokeColor(GRAY)
        .lineWidth(0.5)
        .stroke();
      doc.y += 4;

      // Rows (max 20)
      const events = data.events.slice(0, 20);
      events.forEach((ev) => {
        const rowY = doc.y;
        if (rowY > doc.page.height - 100) return; // overflow guard
        doc.fontSize(7).fillColor(BLACK);
        const evDate = ev.eventDate
          ? new Date(ev.eventDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })
          : "—";
        doc.text(evDate, colX[0], rowY, { width: colW[0] });
        doc.text((ev as unknown as { dataSource?: { name?: string } }).dataSource?.name ?? "—", colX[1], rowY, {
          width: colW[1],
        });
        doc.text(ev.category ?? "—", colX[2], rowY, { width: colW[2] });

        const sevColor =
          ev.severity === "CRITICAL"
            ? RED
            : ev.severity === "WARNING"
              ? [232, 119, 34] as [number, number, number]
              : GRAY;
        doc.fillColor(sevColor).text(ev.severity, colX[3], rowY, {
          width: colW[3],
        });

        doc.fillColor(BLACK).text(ev.title?.substring(0, 60) ?? "—", colX[4], rowY, {
          width: colW[4],
        });

        doc.y = rowY + 14;
      });
    } else {
      doc
        .fontSize(10)
        .fillColor(GRAY)
        .text("No events recorded in the last 72 hours.", 50);
    }

    doc.moveDown(1);

    // Recommendations
    if (data.assessment?.recommendations?.length) {
      sectionHeader(doc, "Recommendations");
      data.assessment.recommendations.forEach((rec, i) => {
        doc
          .fontSize(10)
          .fillColor(BLACK)
          .text(`${i + 1}. ${rec}`, 60, doc.y, {
            width: doc.page.width - 120,
          })
          .moveDown(0.3);
      });
    }

    // ===== PAGE 4: HISTORICAL TREND (async part handled below) =====
    // We'll add it after chart generation

    // ===== PAGE 5: METADATA =====
    const addMetadataPage = () => {
      doc.addPage();
      addPageHeader(doc, data.embassy.name, dateStr);
      addPageFooter(doc, 5);

      sectionHeader(doc, "Report Metadata", 70);

      doc.fontSize(10).fillColor(NAVY).text("Embassy Profile", 50).moveDown(0.3);
      doc.fontSize(9).fillColor(BLACK);
      doc.text(`Name: ${data.embassy.name}`, 60);
      doc.text(`Address: ${data.embassy.address ?? "N/A"}`, 60);
      doc.text(
        `Coordinates: ${data.embassy.latitude.toFixed(4)}, ${data.embassy.longitude.toFixed(4)}`,
        60,
      );
      doc.text(`Region: ${data.embassy.region}`, 60);
      doc.moveDown(0.8);

      doc.fontSize(10).fillColor(NAVY).text("Data Sources", 50).moveDown(0.3);
      doc.fontSize(9).fillColor(BLACK);
      if (data.dataSources.length) {
        data.dataSources.forEach((ds) => {
          doc.text(
            `${ds.name} (${ds.type}) — Last fetched: ${ds.lastFetchedAt ? new Date(ds.lastFetchedAt).toLocaleString() : "Never"}`,
            60,
          );
        });
      } else {
        doc.text("No active data sources.", 60);
      }
      doc.moveDown(0.8);

      doc.fontSize(10).fillColor(NAVY).text("AI Model", 50).moveDown(0.3);
      doc.fontSize(9).fillColor(BLACK);
      doc.text(
        `Model: ${data.assessment?.aiModelUsed ?? data.aiModelName ?? "N/A"}`,
        60,
      );
      doc.text(
        `Analysis timestamp: ${data.assessment ? new Date(data.assessment.assessedAt).toLocaleString() : "N/A"}`,
        60,
      );
      doc.moveDown(1);

      doc
        .fontSize(8)
        .fillColor(GRAY)
        .text(
          "Disclaimer: This report was generated by an automated AI system for demonstration purposes. It does not represent the official assessment of any U.S. government agency.",
          50,
          doc.y,
          { width: doc.page.width - 100, lineGap: 2 },
        );
    };

    // Generate chart and complete PDF
    const chartAssessments = data.assessmentHistory.map((a) => ({
      date: new Date(a.assessedAt),
      threatLevel: a.threatLevel,
    }));

    const finishPdf = async () => {
      // Page 4: Historical Trend
      doc.addPage();
      addPageHeader(doc, data.embassy.name, dateStr);
      addPageFooter(doc, 4);

      sectionHeader(doc, "90-Day Threat Level History", 70);

      if (chartAssessments.length >= 2) {
        try {
          const chartPng = await generateThreatChart(chartAssessments);
          doc.image(chartPng, 50, doc.y, {
            width: doc.page.width - 100,
            height: 180,
          });
          doc.y += 190;
        } catch (err) {
          doc
            .fontSize(10)
            .fillColor(GRAY)
            .text("Chart generation failed.", 50);
          doc.moveDown(1);
        }
      } else {
        doc
          .fontSize(10)
          .fillColor(GRAY)
          .text(
            "Insufficient data to generate a trend chart (minimum 2 assessments required).",
            50,
          );
        doc.moveDown(1);
      }

      // Recent assessments table
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor(NAVY).text("Recent Assessments", 50).moveDown(0.3);

      const last10 = data.assessmentHistory.slice(0, 10);
      if (last10.length) {
        last10.forEach((a) => {
          const aDate = new Date(a.assessedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          const aLevel = THREAT_LABELS[a.threatLevel] ?? a.threatLevel;
          const aColor = THREAT_COLORS[a.threatLevel] ?? GRAY;
          const summary = a.summary?.substring(0, 80) ?? "";
          doc.fontSize(8).fillColor(aColor).text(`${aDate} — ${aLevel}`, 60);
          if (summary) {
            doc.fontSize(7).fillColor(GRAY).text(summary + "...", 70);
          }
          doc.moveDown(0.2);
        });
      } else {
        doc.fontSize(9).fillColor(GRAY).text("No previous assessments.", 60);
      }

      // Page 5: Metadata
      addMetadataPage();

      doc.end();
    };

    finishPdf().catch(reject);
  });
}
