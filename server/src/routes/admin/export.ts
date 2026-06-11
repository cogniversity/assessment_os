import { Router } from "express";
import { stringify } from "csv-stringify/sync";
import PDFDocument from "pdfkit";
import fs from "fs";
import { Role, type ConceptBreakdown } from "@assessment-os/shared";
import { prisma } from "../../db.js";
import { getUser } from "../../middleware/auth.js";
import { getManagerSkillIds } from "../../services/managerSkills.js";
import { config } from "../../config.js";

export const exportRouter = Router();

function topicNames(assessment: {
  displayName: string | null;
  topics: { topic: { name: string; category?: { name: string } | null } }[];
}) {
  const names = assessment.topics.map((t) => t.topic.name);
  return {
    topics: names.join(", ") || assessment.displayName || "—",
    category:
      assessment.topics
        .map((t) => t.topic.category?.name)
        .filter(Boolean)
        .join(", ") || "—",
  };
}

async function managerAssessmentScope(user: { id: string; role: string }) {
  if (user.role !== Role.CAPABILITY_MANAGER) return {};
  const skillIds = await getManagerSkillIds(user.id);
  return { skillId: { in: skillIds } };
}

function completedAttemptsWhere(
  managerScope: object,
  query: { topicId?: unknown; from?: unknown; to?: unknown }
) {
  const { topicId, from, to } = query;
  return {
    status: { in: ["completed", "timed_out"] as const },
    ...(from && { completedAt: { gte: new Date(String(from)) } }),
    ...(to && { completedAt: { lte: new Date(String(to)) } }),
    assessment: {
      ...managerScope,
      ...(topicId ? { topics: { some: { topicId: String(topicId) } } } : {}),
    },
  };
}

exportRouter.get("/results", async (req, res) => {
  const user = getUser(req);
  const managerScope = await managerAssessmentScope(user);
  const attempts = await prisma.assessmentAttempt.findMany({
    where: completedAttemptsWhere(managerScope, req.query),
    include: {
      assessment: {
        include: {
          topics: { include: { topic: { include: { category: true } } } },
          skillRole: true,
          user: { include: { profile: true } },
        },
      },
      certificate: true,
      capabilityReport: true,
      _count: { select: { proctoringEvents: true } },
    },
  });

  const rows = attempts.map((a) => {
    const p = a.assessment.user.profile;
    const { topics, category } = topicNames(a.assessment);
    return {
      candidateName: a.assessment.user.name,
      email: a.assessment.user.email,
      country: p?.country ?? "",
      employeeId: p?.employeeId ?? "",
      band: p?.band ?? "",
      subBand: p?.subBand ?? "",
      assessment: a.assessment.displayName ?? topics,
      topics,
      category,
      skillRole: a.assessment.skillRole.name,
      score: a.score,
      pass: a.score !== null && a.score >= a.assessment.passMark ? "pass" : "fail",
      completedAt: a.completedAt?.toISOString() ?? "",
      autoSubmitted: a.autoSubmittedAt ? "yes" : "no",
      proctoringEvents: a._count.proctoringEvents,
      proficiency: a.certificate?.proficiency ?? "",
      capabilityReport: a.capabilityReport?.reportNumber ?? "",
    };
  });

  const csv = stringify(rows, { header: true });
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=results.csv");
  res.send(csv);
});

exportRouter.get("/capability-concepts", async (req, res) => {
  const user = getUser(req);
  const managerScope = await managerAssessmentScope(user);
  const attempts = await prisma.assessmentAttempt.findMany({
    where: {
      ...completedAttemptsWhere(managerScope, req.query),
      capabilityReport: { isNot: null },
    },
    include: {
      assessment: {
        include: {
          topics: { include: { topic: { include: { category: true } } } },
          skillRole: true,
          user: { include: { profile: true } },
        },
      },
      capabilityReport: true,
    },
  });

  const rows: Record<string, string | number>[] = [];
  for (const a of attempts) {
    const report = a.capabilityReport!;
    const concepts = report.concepts as ConceptBreakdown[];
    const { topics } = topicNames(a.assessment);
    const base = {
      attemptId: a.id,
      candidateName: a.assessment.user.name,
      email: a.assessment.user.email,
      assessment: a.assessment.displayName ?? topics,
      skillRole: a.assessment.skillRole.name,
      score: a.score ?? "",
      pass: a.score !== null && a.score >= a.assessment.passMark ? "pass" : "fail",
      completedAt: a.completedAt?.toISOString() ?? "",
      reportNumber: report.reportNumber,
    };
    for (const c of concepts) {
      rows.push({
        ...base,
        conceptCode: c.code,
        conceptName: c.name,
        questionCount: c.questionCount,
        correctCount: c.correctCount,
        accuracy: c.accuracy,
        status: c.status,
      });
    }
  }

  const csv = stringify(rows, { header: true });
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=capability-concepts.csv");
  res.send(csv);
});

// ─── assessment report PDF ────────────────────────────────────────────────────

const AR_NAVY   = "#1E3A5F";
const AR_GOLD   = "#C9A84C";
const AR_SILVER = "#8B96A5";
const AR_WHITE  = "#FFFFFF";
const AR_SLATE_50  = "#F8FAFC";
const AR_SLATE_100 = "#F1F5F9";
const AR_SLATE_200 = "#E2E8F0";
const AR_GREEN  = "#16A34A";
const AR_RED    = "#DC2626";

type ARDoc = InstanceType<typeof PDFDocument>;

function arraysMatch(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

function arDateShort(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function arDrawBorder(doc: ARDoc) {
  const { width: W, height: H } = doc.page;
  doc.rect(14, 14, W - 28, H - 28).lineWidth(3).strokeColor(AR_NAVY).stroke();
  doc.rect(22, 22, W - 44, H - 44).lineWidth(1).strokeColor(AR_GOLD).stroke();
}

function arDrawFooter(doc: ARDoc, attemptId: string, date: string) {
  const { width: W, height: H } = doc.page;
  const fH = 32;
  const fY = H - 22 - fH;
  doc.rect(22, fY, W - 44, fH).fillColor(AR_SLATE_50).fill();
  doc.moveTo(32, fY + 1).lineTo(W - 32, fY + 1).strokeColor(AR_GOLD).lineWidth(0.8).stroke();
  doc.fillColor(AR_SILVER).fontSize(7.5).font("Helvetica")
    .text(`Attempt: ${attemptId}`, 36, fY + 10, { width: (W - 44) / 2 - 16 });
  doc.fillColor(AR_SILVER).fontSize(7.5).font("Helvetica")
    .text(`Completed: ${date}`, 36 + (W - 44) / 2, fY + 10, {
      width: (W - 44) / 2 - 16,
      align: "right",
    });
}

function arDrawHeader(doc: ARDoc, orgName: string, logoPath: string): number {
  const { width: W } = doc.page;
  const hH = 64;
  doc.rect(22, 22, W - 44, hH).fillColor(AR_NAVY).fill();

  const hasLogo = fs.existsSync(logoPath);
  let textX = 36;
  if (hasLogo) {
    const sz = 40, cx = 36 + sz / 2, cy = 22 + hH / 2, r = sz / 2 + 4;
    doc.circle(cx, cy, r).fillColor(AR_WHITE).fill();
    doc.image(logoPath, cx - sz / 2 + 3, cy - sz / 2 + 3, { fit: [sz - 6, sz - 6], width: sz - 6, height: sz - 6 });
    textX = cx + r + 12;
  }

  if (orgName.trim()) {
    doc.fillColor("#A8B8CC").fontSize(8).font("Helvetica")
      .text(orgName.toUpperCase(), textX, 30, { width: W - textX - 32, characterSpacing: 0.8 });
    doc.fillColor(AR_GOLD).fontSize(15).font("Helvetica-Bold")
      .text("ASSESSMENT REPORT", textX, 46, { width: W - textX - 32, characterSpacing: 1.5 });
  } else {
    doc.fillColor(AR_GOLD).fontSize(17).font("Helvetica-Bold")
      .text("ASSESSMENT REPORT", 0, 22 + (hH - 17) / 2, { align: "center", characterSpacing: 2 });
  }

  const after = 22 + hH;
  doc.moveTo(32, after + 3).lineTo(W - 32, after + 3).strokeColor(AR_GOLD).lineWidth(0.8).stroke();
  return after + 8;
}

function arDrawInfoPanel(
  doc: ARDoc,
  opts: {
    candidateName: string;
    assessmentLabel: string;
    skillRole: string;
    topics: string;
    category: string;
    score: number | null;
    passMark: number;
    passed: boolean;
    proficiency: string | null;
    certNumber: string | null;
    capabilityReportNumber: string | null;
  },
  startY: number
): number {
  const { width: W } = doc.page;
  const bH = 72;
  doc.rect(22, startY, W - 44, bH).fillColor(AR_SLATE_50).fill();
  doc.rect(22, startY, W - 44, bH).lineWidth(0.4).strokeColor(AR_SLATE_200).stroke();

  const left = 36, mid = W / 2 - 8, right = W / 2 + 16;

  // Left column
  doc.fillColor(AR_NAVY).fontSize(10.5).font("Helvetica-Bold")
    .text(opts.candidateName, left, startY + 7, { width: mid - left - 8 });
  doc.fillColor(AR_SILVER).fontSize(8.5).font("Helvetica")
    .text(opts.assessmentLabel, left, startY + 22, { width: mid - left - 8, ellipsis: true });
  doc.fillColor(AR_SILVER).fontSize(8).font("Helvetica")
    .text(`${opts.skillRole}  ·  ${opts.topics}`, left, startY + 35, { width: mid - left - 8 });
  if (opts.category && opts.category !== "—") {
    doc.fillColor(AR_SILVER).fontSize(8).font("Helvetica")
      .text(`Category: ${opts.category}`, left, startY + 47, { width: mid - left - 8 });
  }

  // Vertical divider
  doc.moveTo(mid, startY + 8).lineTo(mid, startY + bH - 8).strokeColor(AR_SLATE_200).lineWidth(0.5).stroke();

  // Right column — score + pill
  const passed = opts.passed;
  const pillClr = passed ? AR_GREEN : AR_RED;
  const pillBg  = passed ? "#F0FDF4" : "#FFF1F2";

  doc.fillColor(AR_NAVY).fontSize(20).font("Helvetica-Bold")
    .text(opts.score != null ? `${opts.score}%` : "—", right, startY + 5, { width: 60 });
  doc.fillColor(AR_SILVER).fontSize(7.5).font("Helvetica")
    .text(`pass mark ${opts.passMark}%`, right + 64, startY + 15);

  const pillW = 62, pillH = 18, pillR = 4;
  const pillX = W - 36 - pillW;
  const pillY = startY + (bH - pillH) / 2;
  doc.roundedRect(pillX, pillY, pillW, pillH, pillR).fillColor(pillBg).fill();
  doc.roundedRect(pillX, pillY, pillW, pillH, pillR).lineWidth(1).strokeColor(pillClr).stroke();
  doc.fillColor(pillClr).fontSize(9).font("Helvetica-Bold")
    .text(passed ? "PASS" : "FAIL", pillX, pillY + 4, { width: pillW, align: "center" });

  // Refs row
  const refs: string[] = [];
  if (opts.proficiency) refs.push(`Proficiency: ${opts.proficiency.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}`);
  if (opts.certNumber) refs.push(`Cert: ${opts.certNumber}`);
  if (opts.capabilityReportNumber) refs.push(`Cap. report: ${opts.capabilityReportNumber}`);
  if (refs.length) {
    doc.fillColor(AR_SILVER).fontSize(7.5).font("Helvetica")
      .text(refs.join("  ·  "), right, startY + 50, { width: W - right - 36 });
  }

  return startY + bH + 2;
}

function arDrawStatsStrip(
  doc: ARDoc,
  stats: { total: number; correct: number; wrong: number; skipped: number },
  startY: number
): number {
  const { width: W } = doc.page;
  const sH = 36;
  const boxes = [
    { label: "Questions",  count: stats.total,   accent: AR_NAVY,   bg: AR_SLATE_100 },
    { label: "Correct",    count: stats.correct,  accent: AR_GREEN,  bg: "#F0FDF4"    },
    { label: "Wrong",      count: stats.wrong,    accent: AR_RED,    bg: "#FFF1F2"    },
    { label: "Skipped",    count: stats.skipped,  accent: AR_SILVER, bg: AR_SLATE_100 },
  ];
  const boxW = (W - 44) / boxes.length;
  boxes.forEach((b, i) => {
    const bx = 22 + i * boxW;
    doc.rect(bx, startY, boxW, sH).fillColor(b.bg).fill();
    doc.rect(bx, startY, boxW, sH).lineWidth(0.4).strokeColor(AR_SLATE_200).stroke();
    doc.rect(bx, startY, 5, sH).fillColor(b.accent).fill();
    doc.fillColor(b.accent).fontSize(15).font("Helvetica-Bold")
      .text(String(b.count), bx + 14, startY + 5, { width: 32 });
    doc.fillColor(AR_NAVY).fontSize(8.5).font("Helvetica")
      .text(b.label, bx + 50, startY + 13, { width: boxW - 58 });
  });
  const after = startY + sH + 2;
  doc.moveTo(32, after).lineTo(W - 32, after).strokeColor(AR_GOLD).lineWidth(0.5).stroke();
  return after + 4;
}

function arSectionHeading(doc: ARDoc, title: string, y: number): number {
  const { width: W } = doc.page;
  doc.fillColor(AR_NAVY).fontSize(8.5).font("Helvetica-Bold")
    .text(title, 36, y + 2, { characterSpacing: 1.2 });
  const after = y + 18;
  doc.moveTo(36, after).lineTo(W - 36, after).strokeColor(AR_SLATE_200).lineWidth(0.4).stroke();
  return after + 2;
}

function arContinuationHeader(doc: ARDoc, assessmentLabel: string): number {
  const { width: W } = doc.page;
  doc.rect(22, 22, W - 44, 24).fillColor(AR_NAVY).fill();
  doc.fillColor("#A8B8CC").fontSize(7).font("Helvetica")
    .text(assessmentLabel, 36, 26, { width: W - 72, ellipsis: true });
  doc.fillColor(AR_GOLD).fontSize(8.5).font("Helvetica-Bold")
    .text("ASSESSMENT REPORT (continued)", W - 240, 26, { width: 214, align: "right", characterSpacing: 0.5 });
  return 22 + 24 + 6;
}

/**
 * Draws one question block and returns the new y position below it.
 * Caller must ensure there is enough room before calling.
 */
function arDrawQuestion(
  doc: ARDoc,
  q: {
    stem: string;
    options: string[];
    selectedIndices: readonly number[];
    correctIndices: readonly number[];
  },
  idx: number,
  startY: number,
  contentX: number,
  contentW: number
): number {
  const { width: W } = doc.page;
  const isSkipped = q.selectedIndices.length === 0;
  const isCorrect = !isSkipped && arraysMatch(q.selectedIndices, q.correctIndices);

  const statusLabel = isSkipped ? "SKIPPED" : isCorrect ? "CORRECT ✓" : "WRONG ✗";
  const statusClr   = isSkipped ? AR_SILVER : isCorrect ? AR_GREEN : AR_RED;
  const statusBg    = isSkipped ? AR_SLATE_100 : isCorrect ? "#F0FDF4" : "#FFF1F2";

  // Question header bar (navy, 22 px)
  const headerH = 22;
  doc.rect(22, startY, W - 44, headerH).fillColor(AR_NAVY).fill();

  // Q# badge
  const badgeW = 28, badgeH = 14, badgeR = 3;
  const badgeX = contentX, badgeY = startY + (headerH - badgeH) / 2;
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, badgeR).fillColor(AR_GOLD).fill();
  doc.fillColor(AR_NAVY).fontSize(7.5).font("Helvetica-Bold")
    .text(`Q${idx + 1}`, badgeX, badgeY + 3, { width: badgeW, align: "center" });

  // Status badge on right
  const sbW = 72, sbH = 14, sbR = 3;
  const sbX = W - 36 - sbW;
  const sbY = startY + (headerH - sbH) / 2;
  doc.roundedRect(sbX, sbY, sbW, sbH, sbR).fillColor(statusBg).fill();
  doc.fillColor(statusClr).fontSize(7.5).font("Helvetica-Bold")
    .text(statusLabel, sbX, sbY + 3, { width: sbW, align: "center" });

  let cy = startY + headerH + 6;

  // Question stem
  doc.fillColor(AR_NAVY).fontSize(9.5).font("Helvetica-Bold")
    .text(q.stem, contentX + 30, cy, { width: contentW - 30 });
  cy = doc.y + 5;

  // Selected answer row
  const selectedText = isSkipped
    ? "—  (skipped)"
    : q.selectedIndices.map(i => q.options[i]).join("; ");
  doc.fontSize(8.5).font("Helvetica");
  doc.fillColor(AR_SILVER).text("Selected: ", contentX + 30, cy, { continued: true, width: contentW - 30 });
  doc.fillColor(isCorrect ? AR_GREEN : isSkipped ? AR_SILVER : AR_RED).font("Helvetica-Bold").text(selectedText);
  cy = doc.y + 3;

  // Correct answer row (only when wrong and not skipped)
  if (!isCorrect && !isSkipped) {
    const correctText = q.correctIndices.map(i => q.options[i]).join("; ");
    doc.font("Helvetica");
    doc.fillColor(AR_SILVER).text("Correct:  ", contentX + 30, cy, { continued: true, width: contentW - 30 });
    doc.fillColor(AR_GREEN).font("Helvetica-Bold").text(correctText);
    cy = doc.y + 3;
  }

  cy += 8;

  // Separator
  doc.moveTo(32, cy).lineTo(W - 32, cy).strokeColor(AR_SLATE_200).lineWidth(0.3).stroke();
  cy += 4;

  return cy;
}

function buildAssessmentReportPdf(
  doc: ARDoc,
  opts: {
    candidateName: string;
    assessmentLabel: string;
    skillRole: string;
    topics: string;
    category: string;
    score: number | null;
    passMark: number;
    passed: boolean;
    completedAt: Date | null;
    proficiency: string | null;
    certNumber: string | null;
    capabilityReportNumber: string | null;
    attemptId: string;
    answers: {
      stem: string;
      options: string[];
      selectedIndices: readonly number[];
      correctIndices: readonly number[];
    }[];
    proctoringEvents: { eventType: string }[];
    orgName: string;
    logoPath: string;
  }
) {
  const { width: W, height: H } = doc.page;
  const FOOTER_H  = 32;
  const FOOTER_Y  = H - 22 - FOOTER_H;
  const CONTENT_X = 36;
  const CONTENT_W = W - CONTENT_X - 36;
  const dateStr = arDateShort(opts.completedAt);

  // ── page 1 ────────────────────────────────────────────────────
  arDrawBorder(doc);
  arDrawFooter(doc, opts.attemptId, dateStr);
  let cy = arDrawHeader(doc, opts.orgName, opts.logoPath);
  cy = arDrawInfoPanel(doc, opts, cy);

  const totalQ   = opts.answers.length;
  const correctQ = opts.answers.filter(a => a.selectedIndices.length > 0 && arraysMatch(a.selectedIndices, a.correctIndices)).length;
  const skippedQ = opts.answers.filter(a => a.selectedIndices.length === 0).length;
  const wrongQ   = totalQ - correctQ - skippedQ;

  cy = arDrawStatsStrip(doc, { total: totalQ, correct: correctQ, wrong: wrongQ, skipped: skippedQ }, cy);
  cy = arSectionHeading(doc, "QUESTION REVIEW", cy);

  // ── questions ─────────────────────────────────────────────────
  for (let i = 0; i < opts.answers.length; i++) {
    const a = opts.answers[i];

    // Estimate height needed for this question
    doc.fontSize(9.5).font("Helvetica-Bold");
    const stemH = doc.heightOfString(a.stem, { width: CONTENT_W - 30 });
    const selectedText = a.selectedIndices.length === 0 ? "— (skipped)"
      : a.selectedIndices.map(idx => a.options[idx]).join("; ");
    doc.fontSize(8.5).font("Helvetica-Bold");
    const selH = doc.heightOfString(`Selected: ${selectedText}`, { width: CONTENT_W - 30 });
    let corrH = 0;
    if (a.selectedIndices.length > 0 && !arraysMatch(a.selectedIndices, a.correctIndices)) {
      const ct = a.correctIndices.map(idx => a.options[idx]).join("; ");
      corrH = doc.heightOfString(`Correct:  ${ct}`, { width: CONTENT_W - 30 });
    }
    const needed = 22 + 6 + stemH + 5 + selH + corrH + 8 + 16;

    if (cy + needed > FOOTER_Y - 8) {
      doc.addPage({ size: "A4", margins: { top: 0, bottom: 0, left: 0, right: 0 } });
      arDrawBorder(doc);
      arDrawFooter(doc, opts.attemptId, dateStr);
      cy = arContinuationHeader(doc, opts.assessmentLabel);
      cy = arSectionHeading(doc, "QUESTION REVIEW (continued)", cy);
    }

    cy = arDrawQuestion(doc, a, i, cy, CONTENT_X, CONTENT_W);
  }

  // ── proctoring section ────────────────────────────────────────
  if (opts.proctoringEvents.length > 0) {
    const breakdown = opts.proctoringEvents.reduce<Record<string, number>>((acc, e) => {
      acc[e.eventType] = (acc[e.eventType] ?? 0) + 1;
      return acc;
    }, {});
    const rowsNeeded = 24 + Object.keys(breakdown).length * 22 + 16;

    if (cy + rowsNeeded > FOOTER_Y - 8) {
      doc.addPage({ size: "A4", margins: { top: 0, bottom: 0, left: 0, right: 0 } });
      arDrawBorder(doc);
      arDrawFooter(doc, opts.attemptId, dateStr);
      cy = arContinuationHeader(doc, opts.assessmentLabel);
    }

    cy = arSectionHeading(doc, "PROCTORING EVENTS", cy + 6);

    let rowIdx = 0;
    for (const [type, count] of Object.entries(breakdown)) {
      const rowBg = rowIdx % 2 === 0 ? AR_WHITE : AR_SLATE_50;
      const rowH  = 20;
      doc.rect(22, cy, W - 44, rowH).fillColor(rowBg).fill();
      doc.rect(22, cy, W - 44, rowH).lineWidth(0.3).strokeColor(AR_SLATE_200).stroke();
      doc.fillColor(AR_NAVY).fontSize(9).font("Helvetica")
        .text(type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
          CONTENT_X, cy + 5, { width: CONTENT_W - 60 });
      doc.fillColor(AR_NAVY).fontSize(9).font("Helvetica-Bold")
        .text(String(count), CONTENT_X + CONTENT_W - 50, cy + 5, { width: 50, align: "right" });
      cy += rowH;
      rowIdx++;
    }
  } else {
    if (cy + 30 < FOOTER_Y - 8) {
      cy = arSectionHeading(doc, "PROCTORING EVENTS", cy + 6);
      doc.fillColor(AR_SILVER).fontSize(9).font("Helvetica")
        .text("No proctoring events recorded.", CONTENT_X, cy + 6);
    }
  }
}

exportRouter.get("/attempt/:attemptId/pdf", async (req, res) => {
  const attempt = await prisma.assessmentAttempt.findUnique({
    where: { id: req.params.attemptId },
    include: {
      assessment: {
        include: {
          topics: { include: { topic: { include: { category: true } } } },
          skillRole: true,
          user: { include: { profile: true } },
        },
      },
      certificate: true,
      capabilityReport: true,
      answers: { include: { question: true } },
      proctoringEvents: true,
    },
  });
  if (!attempt) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const user = getUser(req);
  if (user.role === Role.CAPABILITY_MANAGER) {
    const skillIds = await getManagerSkillIds(user.id);
    if (!skillIds.includes(attempt.assessment.skillId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  const { topics, category } = topicNames(attempt.assessment);
  const passed = attempt.score !== null && attempt.score >= attempt.assessment.passMark;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=attempt-${attempt.id}.pdf`);

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    info: {
      Title: `Assessment Report — ${attempt.assessment.displayName ?? topics}`,
      Author: config.orgName || "Assessment OS",
      Subject: `Assessment result for ${attempt.assessment.user.name}`,
    },
  });
  doc.pipe(res);

  buildAssessmentReportPdf(doc, {
    candidateName: attempt.assessment.user.name,
    assessmentLabel: attempt.assessment.displayName ?? topics,
    skillRole: attempt.assessment.skillRole.name,
    topics,
    category,
    score: attempt.score,
    passMark: attempt.assessment.passMark,
    passed,
    completedAt: attempt.completedAt,
    proficiency: attempt.certificate?.proficiency ?? null,
    certNumber: attempt.certificate?.certNumber ?? null,
    capabilityReportNumber: attempt.capabilityReport?.reportNumber ?? null,
    attemptId: attempt.id,
    answers: attempt.answers.map(a => ({
      stem: a.question.stem,
      options: a.question.options as string[],
      selectedIndices: a.selectedIndices,
      correctIndices: a.question.correctIndices,
    })),
    proctoringEvents: attempt.proctoringEvents,
    orgName: config.orgName,
    logoPath: config.logoPath,
  });

  doc.end();
});
