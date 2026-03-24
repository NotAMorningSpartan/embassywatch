import PDFDocument from "pdfkit";
import { generateThreatChart } from "./ChartService.js";
import type { Embassy } from "../entities/Embassy.js";
import type { ThreatAssessment } from "../entities/ThreatAssessment.js";
import type { RawEvent } from "../entities/RawEvent.js";
import type { DataSource } from "../entities/DataSource.js";

const THREAT_COLORS: Record<string, [number, number, number]> = {
  LOW: [46, 133, 64], GUARDED: [46, 117, 182], ELEVATED: [232, 168, 32],
  HIGH: [232, 119, 34], SEVERE: [216, 57, 51],
};
const THREAT_LABELS: Record<string, string> = {
  LOW: "Low", GUARDED: "Guarded", ELEVATED: "Elevated", HIGH: "High", SEVERE: "Severe",
};
const NAVY: [number, number, number] = [27, 58, 92];
const GRAY: [number, number, number] = [113, 118, 122];
const RED: [number, number, number] = [216, 57, 51];
const BLACK: [number, number, number] = [30, 30, 30];
const LEFT = 50;
const RIGHT = 562;
const CW = 512; // content width

interface ReportData {
  embassy: Embassy;
  assessment: ThreatAssessment | null;
  events: RawEvent[];
  assessmentHistory: ThreatAssessment[];
  dataSources: DataSource[];
  aiModelName?: string;
}

function section(doc: PDFKit.PDFDocument, title: string) {
  const sy = doc.y;
  // Left accent bar
  doc.save()
    .roundedRect(LEFT, sy, 3, 16, 1).fill(NAVY)
    .restore();
  doc.fontSize(13).fillColor(NAVY).text(title, LEFT + 10, sy + 1);
  doc.y += 6;
  doc.fillColor(BLACK);
}

export async function generateEmbassyReport(data: ReportData): Promise<Buffer> {
  let chartPng: Buffer | null = null;
  const chartData = data.assessmentHistory.map((a) => ({
    date: new Date(a.assessedAt), threatLevel: a.threatLevel,
  }));
  if (chartData.length >= 2) {
    try { chartPng = await generateThreatChart(chartData); } catch { /* skip */ }
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: "letter",
      margins: { top: 72, bottom: 72, left: LEFT, right: LEFT },
      bufferPages: true,
      autoFirstPage: true,
      info: { Title: `Threat Assessment — ${data.embassy.name}`, Author: "EmbassyWatch" },
    });
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const timeStr = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    const tColor = THREAT_COLORS[data.embassy.currentThreatLevel] ?? GRAY;
    const tLabel = THREAT_LABELS[data.embassy.currentThreatLevel] ?? data.embassy.currentThreatLevel;

    // Track which pages are cover vs content
    const coverPages = new Set<number>(); // 0-indexed
    coverPages.add(0);

    // ========== PAGE 1: COVER (standalone) ==========
    // Center content vertically on the page
    doc.y = 200;
    doc.fontSize(32).fillColor(NAVY).text("Threat Assessment Report", LEFT, doc.y, { align: "center", width: CW });
    doc.moveDown(1.2);
    doc.fontSize(18).fillColor(GRAY).text(data.embassy.name, { align: "center", width: CW });
    doc.moveDown(0.3);
    doc.fontSize(13).fillColor(GRAY).text(`${data.embassy.city}, ${data.embassy.country}`, { align: "center", width: CW });
    doc.moveDown(1.5);

    // Threat badge
    const bw = 180, bh = 42, bx = (doc.page.width - bw) / 2, by = doc.y;
    doc.save().roundedRect(bx, by, bw, bh, 5).fill(tColor).restore();
    doc.save().fontSize(18).fillColor([255, 255, 255])
      .text(tLabel.toUpperCase(), bx, by + 12, { width: bw, align: "center" }).restore();
    doc.y = by + bh;

    // Generated timestamp and prepared by — bottom right
    const footerY = doc.page.height - 120;
    doc.fontSize(9).fillColor(GRAY)
      .text(`Generated: ${dateStr} at ${timeStr}`, LEFT, footerY, { align: "right", width: CW });
    doc.y = footerY + 14;
    doc.fontSize(9).fillColor(GRAY)
      .text("Prepared by EmbassyWatch Automated Analysis System", LEFT, doc.y, { align: "right", width: CW });

    // ========== PAGE 2: EXECUTIVE SUMMARY ==========
    doc.addPage();
    doc.y = 52;

    section(doc, "Executive Summary");
    if (data.assessment) {
      doc.fontSize(9.5).fillColor(BLACK).text(data.assessment.summary, LEFT, doc.y, { width: CW, lineGap: 3 });
      doc.moveDown(0.6);
      const conf = data.assessment.confidence;
      doc.fontSize(8).fillColor(GRAY).text(`Confidence: ${Math.round(conf * 100)}%`, LEFT);
      const barY = doc.y + 2, barW = 250, barH = 8;
      doc.save().roundedRect(LEFT, barY, barW, barH, 2).fill([230, 230, 230]).restore();
      const cc: [number, number, number] = conf > 0.8 ? [46, 133, 64] : conf > 0.5 ? [232, 168, 32] : [216, 57, 51];
      doc.save().roundedRect(LEFT, barY, barW * conf, barH, 2).fill(cc).restore();
      doc.y = barY + barH + 10;
      if (data.assessment.keyFactors?.length) {
        doc.fontSize(10).fillColor(NAVY).text("Key Factors", LEFT);
        doc.moveDown(0.2);
        for (const f of data.assessment.keyFactors) {
          doc.fontSize(8.5).fillColor(BLACK).text(`• ${f}`, LEFT + 10, doc.y, { width: CW - 10 });
          doc.moveDown(0.1);
        }
      }
    } else {
      doc.fontSize(9.5).fillColor(GRAY).text("No AI assessment has been generated for this embassy. Run an analysis from the admin panel to populate this section.", LEFT, doc.y, { width: CW });
    }

    // ========== PAGE 3: EVENTS + RECOMMENDATIONS ==========
    doc.addPage();
    doc.y = 52;
    section(doc, "Contributing Events (72h)");

    if (data.events.length > 0) {
      const cx = [LEFT, LEFT + 60, LEFT + 140, LEFT + 220, LEFT + 275];
      const cw = [60, 80, 80, 55, CW - 275];
      const hdr = ["Date", "Source", "Category", "Severity", "Title"];
      // Write all headers at the SAME Y position
      const hdrY = doc.y;
      doc.fontSize(7).fillColor(NAVY);
      hdr.forEach((h, i) => {
        doc.text(h, cx[i], hdrY, { width: cw[i], lineBreak: false });
      });
      doc.y = hdrY + 12;
      // Header underline
      doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).strokeColor([200, 200, 200]).lineWidth(0.5).stroke();
      doc.y += 5;
      for (const ev of data.events.slice(0, 20)) {
        if (doc.y > 700) break;
        const ry = doc.y;
        const ed = ev.eventDate ? new Date(ev.eventDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
        const sn = (ev as unknown as { dataSource?: { name?: string } }).dataSource?.name ?? "—";
        doc.fontSize(6.5).fillColor(BLACK);
        doc.text(ed, cx[0], ry, { width: cw[0], lineBreak: false });
        doc.text(sn, cx[1], ry, { width: cw[1], lineBreak: false });
        doc.text(ev.category ?? "—", cx[2], ry, { width: cw[2], lineBreak: false });
        const sc = ev.severity === "CRITICAL" ? RED : ev.severity === "WARNING" ? [232, 119, 34] as [number, number, number] : GRAY;
        doc.fillColor(sc).text(ev.severity ?? "—", cx[3], ry, { width: cw[3], lineBreak: false });
        doc.fillColor(BLACK).text((ev.title ?? "—").substring(0, 65), cx[4], ry, { width: cw[4], lineBreak: false });
        doc.y = ry + 12;
      }
    } else {
      doc.fontSize(9).fillColor(GRAY).text("No events recorded in the last 72 hours.", LEFT);
    }

    doc.moveDown(1);
    if (data.assessment?.recommendations?.length) {
      section(doc, "Recommendations");
      data.assessment.recommendations.forEach((r, i) => {
        doc.fontSize(9).fillColor(BLACK).text(`${i + 1}. ${r}`, LEFT + 10, doc.y, { width: CW - 10 });
        doc.moveDown(0.2);
      });
    }

    // ========== PAGE 4: HISTORY + METADATA ==========
    doc.addPage();
    doc.y = 52;
    section(doc, "90-Day Threat Level History");

    if (chartPng) {
      doc.image(chartPng, LEFT, doc.y, { width: CW, height: 160 });
      doc.y += 168;
    } else {
      doc.fontSize(9).fillColor(GRAY).text("Insufficient data for trend chart (minimum 2 assessments required).", LEFT);
      doc.moveDown(0.5);
    }

    const last10 = data.assessmentHistory.slice(0, 10);
    if (last10.length) {
      doc.fontSize(9).fillColor(NAVY).text("Recent Assessments", LEFT);
      doc.moveDown(0.2);
      for (const a of last10) {
        const ad = new Date(a.assessedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        const al = THREAT_LABELS[a.threatLevel] ?? a.threatLevel;
        doc.fontSize(7.5).fillColor(THREAT_COLORS[a.threatLevel] ?? GRAY).text(`${ad} — ${al}`, LEFT + 8);
        doc.moveDown(0.05);
      }
    }

    doc.moveDown(0.8);
    section(doc, "Report Metadata");
    doc.fontSize(8.5).fillColor(NAVY).text("Embassy Profile", LEFT);
    doc.moveDown(0.15);
    doc.fontSize(8).fillColor(BLACK);
    doc.text(`Name: ${data.embassy.name}`, LEFT + 8);
    doc.text(`Address: ${data.embassy.address ?? "N/A"}`, LEFT + 8);
    doc.text(`Coordinates: ${data.embassy.latitude.toFixed(4)}, ${data.embassy.longitude.toFixed(4)}`, LEFT + 8);
    doc.text(`Region: ${data.embassy.region.replace(/_/g, " ")}`, LEFT + 8);
    doc.moveDown(0.4);
    doc.fontSize(8.5).fillColor(NAVY).text("Data Sources", LEFT);
    doc.moveDown(0.15);
    doc.fontSize(8).fillColor(BLACK);
    for (const ds of data.dataSources) {
      doc.text(`${ds.name} (${ds.type}) — Last fetched: ${ds.lastFetchedAt ? new Date(ds.lastFetchedAt).toLocaleString() : "Never"}`, LEFT + 8);
    }
    doc.moveDown(0.4);
    doc.fontSize(8.5).fillColor(NAVY).text("AI Model", LEFT);
    doc.moveDown(0.15);
    doc.fontSize(8).fillColor(BLACK);
    doc.text(`Model: ${data.assessment?.aiModelUsed ?? data.aiModelName ?? "N/A"}`, LEFT + 8);
    doc.text(`Analysis: ${data.assessment ? new Date(data.assessment.assessedAt).toLocaleString() : "N/A"}`, LEFT + 8);
    doc.moveDown(0.6);
    doc.fontSize(7).fillColor(GRAY).text("Disclaimer: This report was generated by an automated AI system for demonstration purposes. It does not represent the official assessment of any U.S. government agency.", LEFT, doc.y, { width: CW, lineGap: 2 });

    // ========== ADD HEADERS/FOOTERS TO ALL BUFFERED PAGES ==========
    // We use low-level page content stream writes to avoid doc.text() creating new pages
    const range = doc.bufferedPageRange();
    const totalPages = range.count;

    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      const pg = doc.page;
      const isCover = coverPages.has(i);
      const fy = pg.height - 50;

      // Draw all lines (these don't trigger pagination)
      if (!isCover) {
        doc.moveTo(LEFT, 42).lineTo(RIGHT, 42)
          .strokeColor([200, 200, 200]).lineWidth(0.5).stroke();
      }
      doc.moveTo(LEFT, fy).lineTo(RIGHT, fy)
        .strokeColor([200, 200, 200]).lineWidth(0.5).stroke();

      // Write text using explicit Y positions — critically, reset doc.y after each
      // Top banner
      doc.fontSize(7).fillColor(RED)
        .text("UNCLASSIFIED // FOR DEMONSTRATION ONLY", 0, 15, {
          align: "center", width: pg.width, lineBreak: false, height: 10,
        });
      doc.y = 72; // reset cursor to safe zone

      if (!isCover) {
        doc.fontSize(7.5).fillColor(GRAY)
          .text(`EmbassyWatch — ${data.embassy.name}`, LEFT, 28, { lineBreak: false, height: 10 });
        doc.y = 72;
        doc.fontSize(7.5).fillColor(GRAY)
          .text(dateStr, LEFT, 28, { align: "right", width: CW, lineBreak: false, height: 10 });
        doc.y = 72;
      }

      // Page number — write at absolute position, then immediately reset
      doc.fontSize(7.5).fillColor(GRAY)
        .text(`Page ${i + 1}`, 0, fy + 8, {
          align: "center", width: pg.width, lineBreak: false, height: 10,
        });
      doc.y = 72; // CRITICAL: reset so we don't trigger a new page

      // Bottom banner
      doc.fontSize(7).fillColor(RED)
        .text("UNCLASSIFIED // FOR DEMONSTRATION ONLY", 0, fy + 22, {
          align: "center", width: pg.width, lineBreak: false, height: 10,
        });
      doc.y = 72; // CRITICAL: reset again
    }

    // Switch back to last content page before ending
    doc.switchToPage(totalPages - 1);
    doc.y = 72;

    doc.flushPages();
    doc.end();
  });
}
