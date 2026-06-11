import { Router } from "express";
import PDFDocument from "pdfkit";
import fs from "fs";
import { Role } from "@assessment-os/shared";
import { requireAuth, getUser } from "../middleware/auth.js";
import { config } from "../config.js";
import { getManagerSkillIds } from "../services/managerSkills.js";
import {
  getCapabilityReportForAttempt,
  type ConceptBreakdown,
  type CapabilitySummary,
} from "../services/capabilityReportService.js";

export const capabilityReportsRouter = Router();
capabilityReportsRouter.use(requireAuth);

// ─── access guard ─────────────────────────────────────────────────────────────

async function canAccessReport(
  user: { id: string; role: string },
  attemptId: string
): Promise<{ allowed: boolean; report: Awaited<ReturnType<typeof getCapabilityReportForAttempt>> }> {
  const report = await getCapabilityReportForAttempt(attemptId);
  if (!report) return { allowed: false, report: null };

  const assessment = report.attempt.assessment;
  if (user.role === Role.ADMIN) return { allowed: true, report };
  if (user.role === Role.CAPABILITY_MANAGER) {
    const skillIds = await getManagerSkillIds(user.id);
    return skillIds.includes(assessment.skillId)
      ? { allowed: true, report }
      : { allowed: false, report };
  }
  if (user.role === Role.CANDIDATE) {
    if (assessment.userId !== user.id) return { allowed: false, report };
    if (!assessment.shareCapabilityWithCandidate) return { allowed: false, report };
    return { allowed: true, report };
  }
  return { allowed: false, report };
}

// ─── routes ───────────────────────────────────────────────────────────────────

capabilityReportsRouter.get("/attempt/:attemptId", async (req, res) => {
  const user = getUser(req);
  const { allowed, report } = await canAccessReport(user, req.params.attemptId);
  if (!report) { res.status(404).json({ error: "Capability report not found" }); return; }
  if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }
  res.json(report);
});

capabilityReportsRouter.get("/attempt/:attemptId/pdf", async (req, res) => {
  const user = getUser(req);
  const { allowed, report } = await canAccessReport(user, req.params.attemptId);
  if (!report) { res.status(404).json({ error: "Capability report not found" }); return; }
  if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }

  const summary = report.summary as CapabilitySummary;
  const concepts = report.concepts as ConceptBreakdown[];

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=capability-${report.reportNumber}.pdf`);

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    info: {
      Title: `Capability Report — ${report.reportNumber}`,
      Author: config.orgName || "Assessment OS",
      Subject: `Capability report for ${report.attempt.assessment.user.name}`,
    },
  });
  doc.pipe(res);

  buildCapabilityPdf(doc, {
    summary,
    concepts,
    reportNumber: report.reportNumber,
    candidateName: report.attempt.assessment.user.name,
    orgName: config.orgName,
    logoPath: config.logoPath,
  });

  doc.end();
});

// ─── PDF builder ──────────────────────────────────────────────────────────────

// Palette (matches certificate)
const NAVY    = "#1E3A5F";
const GOLD    = "#C9A84C";
const SILVER  = "#8B96A5";
const WHITE   = "#FFFFFF";
const SLATE_50  = "#F8FAFC";
const SLATE_100 = "#F1F5F9";
const SLATE_200 = "#E2E8F0";

// Status colours
const STATUS_COLORS = {
  strength: { strip: "#22C55E", bg: "#F0FDF4", text: "#16A34A", label: "Strength" },
  neutral:  { strip: SILVER,    bg: SLATE_100, text: SILVER,    label: "Neutral"  },
  gap:      { strip: "#EF4444", bg: "#FFF1F2", text: "#DC2626", label: "Gap"      },
} as const;

function sc(status: ConceptBreakdown["status"]) { return STATUS_COLORS[status]; }

function dateShort(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

type Doc = InstanceType<typeof PDFDocument>;

// ── structural helpers ────────────────────────────────────────────────────────

function drawBorder(doc: Doc) {
  const { width: W, height: H } = doc.page;
  doc.rect(14, 14, W - 28, H - 28).lineWidth(3).strokeColor(NAVY).stroke();
  doc.rect(22, 22, W - 44, H - 44).lineWidth(1).strokeColor(GOLD).stroke();
}

function drawHeaderBand(doc: Doc, orgName: string, logoPath: string): number {
  const { width: W } = doc.page;
  const headerH = 64;
  doc.rect(22, 22, W - 44, headerH).fillColor(NAVY).fill();

  const hasLogo = fs.existsSync(logoPath);
  let textX = 36;

  if (hasLogo) {
    const sz = 40;
    const cx = 36 + sz / 2;
    const cy = 22 + headerH / 2;
    const r  = sz / 2 + 4;
    doc.circle(cx, cy, r).fillColor(WHITE).fill();
    doc.image(logoPath, cx - sz / 2 + 3, cy - sz / 2 + 3, {
      fit: [sz - 6, sz - 6], width: sz - 6, height: sz - 6,
    });
    textX = cx + r + 12;
  }

  const hasOrg = orgName.trim().length > 0;
  if (hasOrg) {
    doc.fillColor("#A8B8CC").fontSize(8).font("Helvetica")
      .text(orgName.toUpperCase(), textX, 30, {
        width: W - textX - 32,
        characterSpacing: 0.8,
      });
    doc.fillColor(GOLD).fontSize(15).font("Helvetica-Bold")
      .text("CAPABILITY REPORT", textX, 46, {
        width: W - textX - 32,
        characterSpacing: 1.5,
      });
  } else {
    doc.fillColor(GOLD).fontSize(17).font("Helvetica-Bold")
      .text("CAPABILITY REPORT", 0, 22 + (headerH - 17) / 2, {
        align: "center",
        characterSpacing: 2,
      });
  }

  // gold divider below header
  const afterHeader = 22 + headerH;
  doc.moveTo(32, afterHeader + 3).lineTo(W - 32, afterHeader + 3)
    .strokeColor(GOLD).lineWidth(0.8).stroke();

  return afterHeader + 8;
}

function drawInfoBand(
  doc: Doc,
  candidateName: string,
  summary: CapabilitySummary,
  issuedDate: string,
  startY: number
): number {
  const { width: W } = doc.page;
  const bandH = 56;

  doc.rect(22, startY, W - 44, bandH).fillColor(SLATE_50).fill();
  doc.rect(22, startY, W - 44, bandH).lineWidth(0.4).strokeColor(SLATE_200).stroke();

  const left = 36;
  const midX = W / 2 - 8;
  const right = W / 2 + 16;

  // Left column — candidate / skill / role
  doc.fillColor(NAVY).fontSize(10.5).font("Helvetica-Bold")
    .text(candidateName, left, startY + 8, { width: midX - left - 8 });
  doc.fillColor(SILVER).fontSize(8.5).font("Helvetica")
    .text(`${summary.skillCode} — ${summary.skillName}`, left, startY + 24, { width: midX - left - 8 });
  doc.fillColor(SILVER).fontSize(8.5).font("Helvetica")
    .text(summary.skillRoleName, left, startY + 37, { width: midX - left - 8 });

  // Vertical divider
  doc.moveTo(midX, startY + 10).lineTo(midX, startY + bandH - 10)
    .strokeColor(SLATE_200).lineWidth(0.5).stroke();

  // Right column — score / pass mark / date
  const passed  = summary.passed;
  const pillClr = passed ? "#16A34A" : "#DC2626";
  const pillBg  = passed ? "#F0FDF4" : "#FFF1F2";

  doc.fillColor(NAVY).fontSize(20).font("Helvetica-Bold")
    .text(`${summary.overallScore}%`, right, startY + 6, { width: 60 });
  doc.fillColor(SILVER).fontSize(7.5).font("Helvetica")
    .text(`pass mark ${summary.passMark}%`, right + 64, startY + 16);

  // PASS / FAIL pill
  const pillW = 62, pillH = 18, pillR = 4;
  const pillX = W - 36 - pillW;
  const pillY = startY + (bandH - pillH) / 2;
  doc.roundedRect(pillX, pillY, pillW, pillH, pillR).fillColor(pillBg).fill();
  doc.roundedRect(pillX, pillY, pillW, pillH, pillR)
    .lineWidth(1).strokeColor(pillClr).stroke();
  doc.fillColor(pillClr).fontSize(9).font("Helvetica-Bold")
    .text(passed ? "PASS" : "FAIL", pillX, pillY + 4, { width: pillW, align: "center" });

  doc.fillColor(SILVER).fontSize(7.5).font("Helvetica")
    .text(issuedDate, right, startY + 40);

  return startY + bandH + 2;
}

function drawStatsStrip(
  doc: Doc,
  concepts: ConceptBreakdown[],
  startY: number
): number {
  const { width: W } = doc.page;
  const stripH = 38;
  const boxW   = (W - 44) / 3;

  const strengths = concepts.filter(c => c.status === "strength").length;
  const neutrals  = concepts.filter(c => c.status === "neutral").length;
  const gaps      = concepts.filter(c => c.status === "gap").length;

  const stats = [
    { label: "Strengths", count: strengths, accent: "#22C55E", bg: "#F0FDF4" },
    { label: "Neutral",   count: neutrals,  accent: SILVER,    bg: SLATE_100 },
    { label: "Gaps",      count: gaps,      accent: "#EF4444", bg: "#FFF1F2" },
  ];

  stats.forEach((s, i) => {
    const bx = 22 + i * boxW;
    doc.rect(bx, startY, boxW, stripH).fillColor(s.bg).fill();
    doc.rect(bx, startY, boxW, stripH).lineWidth(0.4).strokeColor(SLATE_200).stroke();
    // left accent strip
    doc.rect(bx, startY, 5, stripH).fillColor(s.accent).fill();
    // large count
    doc.fillColor(s.accent).fontSize(16).font("Helvetica-Bold")
      .text(String(s.count), bx + 14, startY + 5, { width: 32 });
    // label
    doc.fillColor(NAVY).fontSize(9).font("Helvetica")
      .text(s.label, bx + 50, startY + 13, { width: boxW - 58 });
  });

  const after = startY + stripH + 2;
  doc.moveTo(32, after).lineTo(W - 32, after).strokeColor(GOLD).lineWidth(0.5).stroke();
  return after + 4;
}

// Column layout for the concept table (x, w)
const COLS = [
  { x: 36,  w: 188 }, // concept name + code
  { x: 230, w: 60  }, // correct / total
  { x: 296, w: 148 }, // accuracy bar + %
  { x: 450, w: 90  }, // status badge
] as const;

function drawTableHeader(doc: Doc, startY: number): number {
  const { width: W } = doc.page;
  const rowH = 18;
  doc.rect(22, startY, W - 44, rowH).fillColor(NAVY).fill();

  const headers = ["Concept", "Questions", "Accuracy", "Status"];
  const aligns  = ["left", "center", "left", "center"] as const;
  headers.forEach((h, i) => {
    doc.fillColor(GOLD).fontSize(7.5).font("Helvetica-Bold")
      .text(h, COLS[i].x, startY + 5, { width: COLS[i].w, align: aligns[i], characterSpacing: 0.5 });
  });

  return startY + rowH;
}

function drawConceptRow(
  doc: Doc,
  concept: ConceptBreakdown,
  startY: number,
  rowIndex: number
): void {
  const { width: W } = doc.page;
  const rowH = 32;
  const col  = sc(concept.status);

  // Row background (alternating)
  doc.rect(22, startY, W - 44, rowH).fillColor(rowIndex % 2 === 0 ? WHITE : SLATE_50).fill();
  doc.rect(22, startY, W - 44, rowH).lineWidth(0.3).strokeColor(SLATE_200).stroke();

  // Left status strip
  doc.rect(22, startY, 5, rowH).fillColor(col.strip).fill();

  // Col 0 — concept name + code
  doc.fillColor(NAVY).fontSize(9).font("Helvetica-Bold")
    .text(concept.name, COLS[0].x, startY + 6, { width: COLS[0].w, ellipsis: true });
  doc.fillColor(SILVER).fontSize(7.5).font("Helvetica")
    .text(concept.code, COLS[0].x, startY + 19, { width: COLS[0].w });

  // Col 1 — correct / total
  doc.fillColor(NAVY).fontSize(9).font("Helvetica")
    .text(`${concept.correctCount} / ${concept.questionCount}`, COLS[1].x, startY + 11, {
      width: COLS[1].w, align: "center",
    });

  // Col 2 — accuracy bar + %
  const barW   = COLS[2].w - 34;
  const barH   = 9;
  const barX   = COLS[2].x;
  const barY   = startY + (rowH - barH) / 2;
  const fillW  = Math.max(2, (concept.accuracy / 100) * barW);
  const barClr = concept.status === "strength" ? "#16A34A"
    : concept.status === "gap" ? "#EF4444" : SILVER;

  // background track
  doc.rect(barX, barY, barW, barH).fillColor(SLATE_200).fill();
  // rounded fill
  doc.roundedRect(barX, barY, fillW, barH, 2).fillColor(barClr).fill();
  // thin border on track
  doc.rect(barX, barY, barW, barH).lineWidth(0.3).strokeColor(SLATE_200).stroke();

  // accuracy % label
  doc.fillColor(NAVY).fontSize(9).font("Helvetica-Bold")
    .text(`${concept.accuracy}%`, COLS[2].x + barW + 4, startY + 11, { width: 28 });

  // Col 3 — status badge
  const badgeW = 58, badgeH = 16, badgeR = 4;
  const badgeX = COLS[3].x + (COLS[3].w - badgeW) / 2;
  const badgeY = startY + (rowH - badgeH) / 2;
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, badgeR).fillColor(col.bg).fill();
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, badgeR)
    .lineWidth(0.8).strokeColor(col.strip).stroke();
  doc.fillColor(col.text).fontSize(7.5).font("Helvetica-Bold")
    .text(col.label, badgeX, badgeY + 4, { width: badgeW, align: "center" });
}

function drawFooter(doc: Doc, reportNumber: string, issuedDate: string): void {
  const { width: W, height: H } = doc.page;
  const footerH = 34;
  const footerY = H - 22 - footerH;

  doc.rect(22, footerY, W - 44, footerH).fillColor(SLATE_50).fill();
  doc.moveTo(32, footerY + 1).lineTo(W - 32, footerY + 1)
    .strokeColor(GOLD).lineWidth(0.8).stroke();

  const halfW = (W - 44) / 2 - 16;
  doc.fillColor(SILVER).fontSize(8).font("Helvetica")
    .text(`Report: ${reportNumber}`, 36, footerY + 10, { width: halfW });
  doc.fillColor(SILVER).fontSize(8).font("Helvetica")
    .text(`Issued: ${issuedDate}`, 36 + halfW + 16, footerY + 10, { width: halfW, align: "right" });
}

// ── main builder ──────────────────────────────────────────────────────────────

function buildCapabilityPdf(
  doc: Doc,
  opts: {
    summary: CapabilitySummary;
    concepts: ConceptBreakdown[];
    reportNumber: string;
    candidateName: string;
    orgName: string;
    logoPath: string;
  }
) {
  const { width: W, height: H } = doc.page;
  const ROW_H    = 32;
  const FOOTER_Y = H - 22 - 34;  // footer reserve
  const issuedDate = dateShort(new Date());

  // ── page 1 ────────────────────────────────────────────────────────────
  drawBorder(doc);
  let cy = drawHeaderBand(doc, opts.orgName, opts.logoPath);
  cy = drawInfoBand(doc, opts.candidateName, opts.summary, issuedDate, cy);
  cy = drawStatsStrip(doc, opts.concepts, cy);

  // Section heading + thresholds legend
  doc.fillColor(NAVY).fontSize(8.5).font("Helvetica-Bold")
    .text("CONCEPT BREAKDOWN", 36, cy + 2, { characterSpacing: 1.2 });
  doc.fillColor(SILVER).fontSize(7).font("Helvetica")
    .text(
      `Strength ≥ ${opts.summary.strengthThreshold}%  ·  Gap < ${opts.summary.gapThreshold}%`,
      W - 210, cy + 3, { width: 178, align: "right" }
    );
  cy += 18;

  cy = drawTableHeader(doc, cy);

  if (opts.concepts.length === 0) {
    doc.fillColor(SILVER).fontSize(9.5).font("Helvetica")
      .text(
        "No concepts were tagged on questions in this attempt.",
        36, cy + 14, { width: W - 72 }
      );
  } else {
    for (let i = 0; i < opts.concepts.length; i++) {
      // Overflow → new page
      if (cy + ROW_H > FOOTER_Y - 6) {
        drawFooter(doc, opts.reportNumber, issuedDate);
        doc.addPage({
          size: "A4",
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
        });
        drawBorder(doc);

        // Minimal continuation header
        doc.rect(22, 22, W - 44, 24).fillColor(NAVY).fill();
        doc.fillColor(GOLD).fontSize(9).font("Helvetica-Bold")
          .text("CAPABILITY REPORT (continued)", 0, 28, {
            align: "center", characterSpacing: 1,
          });

        cy = 46 + 4;
        cy = drawTableHeader(doc, cy);
      }

      drawConceptRow(doc, opts.concepts[i], cy, i);
      cy += ROW_H;
    }
  }

  // Untagged-questions note
  if (opts.summary.untaggedQuestionCount > 0) {
    const note = `Note: ${opts.summary.untaggedQuestionCount} question${opts.summary.untaggedQuestionCount !== 1 ? "s" : ""} had no concept tags and were excluded from this breakdown.`;
    if (cy + 20 > FOOTER_Y - 6) {
      drawFooter(doc, opts.reportNumber, issuedDate);
      doc.addPage({
        size: "A4",
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      });
      drawBorder(doc);
      cy = 36;
    }
    doc.fillColor(SILVER).fontSize(8).font("Helvetica-Oblique")
      .text(note, 36, cy + 8, { width: W - 72 });
  }

  // Footer on last page
  drawFooter(doc, opts.reportNumber, issuedDate);
}
