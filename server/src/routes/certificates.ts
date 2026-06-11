import { Router } from "express";
import PDFDocument from "pdfkit";
import fs from "fs";
import { PROFICIENCY_LEVELS } from "@assessment-os/shared";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../db.js";
import { certificateVerifyUrl, config } from "../config.js";

export const certificatesRouter = Router();
certificatesRouter.use(requireAuth);

const certInclude = {
  attempt: {
    include: {
      assessment: {
        include: {
          topics: { include: { topic: true } },
          user: true,
        },
      },
    },
  },
} as const;

function assessmentLabel(assessment: {
  displayName: string | null;
  topics: { topic: { name: string } }[];
}) {
  if (assessment.displayName) return assessment.displayName;
  const names = assessment.topics.map((t) => t.topic.name);
  return names.length ? names.join(", ") : "Assessment";
}

const PROFICIENCY_LABEL_MAP: Record<string, string> = {
  entry:             "Entry",
  beginner:          "Beginner",
  novice:            "Entry",
  advanced_beginner: "Advanced Beginner",
  competent:         "Competent",
  proficient:        "Proficient",
  expert:            "Expert",
};

function proficiencyLabel(p: string): string {
  return PROFICIENCY_LABEL_MAP[p] ?? p.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

const DEFAULT_THRESHOLDS = [40, 55, 70, 85, 95];

// Light-grey → warm-gold → deep-navy: a gradient that reads instantly as "novice → expert"
const METER_SEGMENT_COLORS = ["#E2E8F0", "#FDE68A", "#F59E0B", "#C9A84C", "#2D5078", "#1E3A5F"];

const METER_SHORT_LABELS: Record<string, string> = {
  entry: "Entry",
  beginner: "Beginner",
  advanced_beginner: "Adv. Beg.",
  competent: "Competent",
  proficient: "Proficient",
  expert: "Expert",
};

function normalizeThresholds(raw: unknown): number[] {
  if (!Array.isArray(raw) || raw.length < 5) return DEFAULT_THRESHOLDS;
  return raw.slice(0, 5).map((v) => Number(v));
}

/**
 * Horizontal proficiency scale.
 *
 * Layout (top → bottom):
 *   "Proficiency scale" label  (8pt, y = y)
 *   Score pill + stem          (24 px indicator area)
 *   Coloured bar               (barH = 26 px)
 *   Tick + level label row     (18 px)
 *
 * Returns the y co-ordinate immediately below the last label row.
 */
function drawProficiencyMeter(
  doc: InstanceType<typeof PDFDocument>,
  opts: {
    x: number;
    y: number;
    width: number;
    proficiency: string;
    score: number | null;
    thresholds: number[];
    colors: { navy: string; gold: string; silver: string };
  }
) {
  const { x, y, width, proficiency, score, thresholds, colors } = opts;
  const barH = 26;
  const INDICATOR_H = 24; // space above bar reserved for score pill
  const bounds = [0, ...thresholds, 100];
  const levelIndex = PROFICIENCY_LEVELS.indexOf(proficiency as (typeof PROFICIENCY_LEVELS)[number]);

  // "Proficiency scale" title
  doc.fillColor(colors.silver).fontSize(8).font("Helvetica")
    .text("Proficiency scale", x, y, { width, align: "center" });

  const barY = y + 14 + INDICATOR_H;

  // Segments
  for (let i = 0; i < 6; i++) {
    const segX = x + (bounds[i] / 100) * width;
    const segW = Math.max(2, ((bounds[i + 1] - bounds[i]) / 100) * width);
    doc.rect(segX, barY, segW, barH)
      .fillColor(METER_SEGMENT_COLORS[i] ?? colors.navy)
      .fill();

    // White divider between segments (skip before first)
    if (i > 0) {
      doc.moveTo(segX, barY).lineTo(segX, barY + barH)
        .lineWidth(0.6).strokeColor("#FFFFFF").stroke();
    }

    // Gold stroke on the active level
    if (i === levelIndex) {
      doc.rect(segX + 0.5, barY + 0.5, segW - 1, barH - 1)
        .lineWidth(2).strokeColor(colors.gold).stroke();
    }
  }

  // Thin silver border around whole bar
  doc.rect(x, barY, width, barH)
    .lineWidth(0.5).strokeColor(colors.silver).stroke();

  // Level labels BELOW bar (centred on each segment)
  const labelY = barY + barH + 10;
  for (let i = 0; i < 6; i++) {
    const segX = x + (bounds[i] / 100) * width;
    const segW = ((bounds[i + 1] - bounds[i]) / 100) * width;
    const label = METER_SHORT_LABELS[PROFICIENCY_LEVELS[i]] ?? PROFICIENCY_LEVELS[i];
    const isActive = i === levelIndex;

    // Tick mark
    doc.moveTo(segX + segW / 2, barY + barH)
      .lineTo(segX + segW / 2, barY + barH + 4)
      .lineWidth(0.4).strokeColor(colors.silver).stroke();

    doc
      .fillColor(isActive ? colors.navy : colors.silver)
      .fontSize(isActive ? 7.5 : 7)
      .font(isActive ? "Helvetica-Bold" : "Helvetica")
      .text(label, segX, labelY, { width: segW, align: "center" });
  }

  // Score pill + vertical stem above the bar
  if (score != null) {
    const clamped = Math.min(100, Math.max(0, score));
    const mx = x + (clamped / 100) * width;

    const pillW = 36, pillH = 15, pillR = 3;
    const pillX = Math.min(Math.max(x, mx - pillW / 2), x + width - pillW);
    const pillTop = barY - INDICATOR_H + 1;

    // Stem from pill bottom → bar top
    doc.moveTo(mx, pillTop + pillH)
      .lineTo(mx, barY)
      .lineWidth(1.5).strokeColor(colors.gold).stroke();

    // Small arrowhead at bar surface
    doc.moveTo(mx - 4, barY)
      .lineTo(mx + 4, barY)
      .lineTo(mx, barY + 5)
      .closePath().fillColor(colors.gold).fill();

    // Pill background
    doc.roundedRect(pillX, pillTop, pillW, pillH, pillR)
      .fillColor(colors.gold).fill();

    // Pill score text
    doc.fillColor(colors.navy).fontSize(8).font("Helvetica-Bold")
      .text(`${clamped}%`, pillX, pillTop + 3, { width: pillW, align: "center" });
  }

  return labelY + 12;
}

function buildCertificatePdf(
  doc: InstanceType<typeof PDFDocument>,
  opts: {
    recipientName: string;
    assessmentLabel: string;
    certNumber: string;
    issuedAt: Date;
    expiresAt: Date | null;
    proficiency: string | null;
    score: number | null;
    proficiencyThresholds: number[];
    showProficiency: boolean;
    verifyUrl: string;
    orgName: string;
    logoPath: string;
  }
) {
  const W = doc.page.width;
  const H = doc.page.height;

  // ── palette ──────────────────────────────────────────────────────────────
  const NAVY   = "#1E3A5F";
  const GOLD   = "#C9A84C";
  const SILVER = "#8B96A5";
  const WHITE  = "#FFFFFF";

  // ── outer border ─────────────────────────────────────────────────────────
  const borderOuter = 18;
  const borderInner = 26;
  doc
    .rect(borderOuter, borderOuter, W - borderOuter * 2, H - borderOuter * 2)
    .lineWidth(4)
    .strokeColor(NAVY)
    .stroke();
  doc
    .rect(borderInner, borderInner, W - borderInner * 2, H - borderInner * 2)
    .lineWidth(1.5)
    .strokeColor(GOLD)
    .stroke();

  // ── header band ──────────────────────────────────────────────────────────
  // Show logo + org name only when a logo file actually exists.
  // Otherwise the header contains only "CERTIFICATE OF COMPLETION".
  const hasLogo = fs.existsSync(opts.logoPath);
  const headerH = hasLogo ? 84 : 64;
  doc.rect(borderInner, borderInner, W - borderInner * 2, headerH).fillColor(NAVY).fill();

  const hasOrgName = opts.orgName.trim().length > 0;

  if (hasLogo || hasOrgName) {
    // Logo on the left (if available)
    let afterLogoX = borderInner + 28;
    if (hasLogo) {
      const logoSize = 48;
      const logoX = borderInner + 28;
      const logoY = borderInner + (headerH - logoSize) / 2;
      const logoCircleR = logoSize / 2 + 5;
      const logoCX = logoX + logoSize / 2;
      const logoCY = logoY + logoSize / 2;
      doc.circle(logoCX, logoCY, logoCircleR).fillColor(WHITE).fill();
      const pad = 4;
      doc.image(opts.logoPath, logoX + pad, logoY + pad, {
        width: logoSize - pad * 2,
        height: logoSize - pad * 2,
        fit: [logoSize - pad * 2, logoSize - pad * 2],
      });
      afterLogoX = logoCX + logoCircleR + 16;
    }

    // Org name (small, muted) only when configured
    if (hasOrgName) {
      const orgW = W - borderInner - 24 - afterLogoX;
      doc.fillColor("#A8B8CC").fontSize(11).font("Helvetica")
        .text(opts.orgName, afterLogoX, borderInner + 16, { width: orgW, align: hasLogo ? "left" : "center" });
    }

    // "CERTIFICATE OF COMPLETION" — dominant, gold
    const coCY = hasOrgName ? borderInner + 36 : borderInner + (headerH - 15) / 2;
    const coCX = hasLogo ? afterLogoX : 0;
    const coCW = hasLogo ? W - borderInner - 24 - afterLogoX : undefined;
    doc.fillColor(GOLD).fontSize(15).font("Helvetica-Bold")
      .text("CERTIFICATE OF COMPLETION", coCX, coCY, {
        width: coCW,
        align: hasLogo ? "left" : "center",
        characterSpacing: 1.5,
      });
  } else {
    // Nothing configured — "CERTIFICATE OF COMPLETION" alone, centred
    doc.fillColor(GOLD).fontSize(17).font("Helvetica-Bold")
      .text("CERTIFICATE OF COMPLETION", 0, borderInner + (headerH - 17) / 2, {
        align: "center",
        characterSpacing: 2,
      });
  }

  // ── gold decorative line below header ────────────────────────────────────
  const lineY = borderInner + headerH + 4;
  doc
    .moveTo(borderInner + 24, lineY)
    .lineTo(W - borderInner - 24, lineY)
    .lineWidth(1)
    .strokeColor(GOLD)
    .stroke();

  // ── body: true vertical centering of the whole content block ────────────
  const footerH = 52;
  const bodyTop = borderInner + headerH + 12;
  const bodyBottom = H - borderInner - footerH - 8;
  const bodyHeight = bodyBottom - bodyTop;

  const showProf = opts.showProficiency && !!opts.proficiency;
  // meter now needs ~92 px (14 title + 24 indicator + 26 bar + 18 labels + 10 buffer)
  const profBlockH = showProf ? 26 + 12 + 92 : 0;
  const blockH = 12 + 14 + 38 + 8 + 2 + 8 + 12 + 10 + 18 + 12 + profBlockH + 18 + 12;
  let cy = bodyTop + (bodyHeight - blockH) / 2;

  doc.fillColor(SILVER).fontSize(11).font("Helvetica")
    .text("This certificate is awarded to", 0, cy, { align: "center" });
  cy += 26;

  // Recipient name
  doc.fillColor(NAVY).fontSize(34).font("Helvetica-Bold")
    .text(opts.recipientName, 0, cy, { align: "center" });
  cy += 42;

  // Gold rule under name
  const ruleLen = Math.min(opts.recipientName.length * 14 + 80, 340);
  doc
    .moveTo((W - ruleLen) / 2, cy)
    .lineTo((W + ruleLen) / 2, cy)
    .lineWidth(0.8)
    .strokeColor(GOLD)
    .stroke();
  cy += 14;

  // "for successfully completing"
  doc.fillColor(SILVER).fontSize(10).font("Helvetica")
    .text("for successfully completing", 0, cy, { align: "center" });
  cy += 18;

  // Assessment label
  doc.fillColor(NAVY).fontSize(15).font("Helvetica-Bold")
    .text(opts.assessmentLabel, borderInner + 40, cy, {
      width: W - (borderInner + 40) * 2,
      align: "center",
    });
  cy += 26;

  if (showProf) {
    const profLabel = proficiencyLabel(opts.proficiency!);
    const profText =
      opts.score != null
        ? `Proficiency: ${profLabel} (${opts.score}%)`
        : `Proficiency: ${profLabel}`;
    const badgeW = 280;
    const badgeH = 26;
    const badgeX = (W - badgeW) / 2;
    doc.roundedRect(badgeX, cy, badgeW, badgeH, 5).fillColor(NAVY).fill();
    doc.fillColor(GOLD).fontSize(10).font("Helvetica-Bold")
      .text(profText, badgeX, cy + 7, { width: badgeW, align: "center" });
    cy += badgeH + 10;

    const meterW = Math.min(420, W - (borderInner + 60) * 2);
    const meterX = (W - meterW) / 2;
    cy = drawProficiencyMeter(doc, {
      x: meterX,
      y: cy,
      width: meterW,
      proficiency: opts.proficiency!,
      score: opts.score,
      thresholds: opts.proficiencyThresholds,
      colors: { navy: NAVY, gold: GOLD, silver: SILVER },
    });
    cy += 8;
  }

  // Date(s) — centred, or split if both issued + expiry
  cy += 4;
  const fullW = W - (borderInner + 40) * 2;
  const dateX = borderInner + 40;
  if (opts.expiresAt) {
    doc.fillColor(SILVER).fontSize(9.5).font("Helvetica")
      .text(`Issued: ${formatDate(opts.issuedAt)}`, dateX, cy, { width: fullW / 2 - 8, align: "center" });
    doc.fillColor(SILVER).fontSize(9.5).font("Helvetica")
      .text(`Valid until: ${formatDate(opts.expiresAt)}`, dateX + fullW / 2 + 8, cy, { width: fullW / 2 - 8, align: "center" });
  } else {
    doc.fillColor(SILVER).fontSize(9.5).font("Helvetica")
      .text(`Issued: ${formatDate(opts.issuedAt)}`, dateX, cy, { width: fullW, align: "center" });
  }

  // ── footer band ──────────────────────────────────────────────────────────
  const footerTop = H - borderInner - footerH;
  doc
    .rect(borderInner, footerTop, W - borderInner * 2, footerH)
    .fillColor("#F0F4F8")
    .fill();

  doc
    .moveTo(borderInner + 24, footerTop + 1)
    .lineTo(W - borderInner - 24, footerTop + 1)
    .lineWidth(0.8)
    .strokeColor(GOLD)
    .stroke();

  doc
    .fillColor(SILVER)
    .fontSize(8)
    .font("Helvetica")
    .text(`Certificate ID: ${opts.certNumber}`, borderInner + 24, footerTop + 10, {
      width: W - (borderInner + 24) * 2,
      align: "center",
    });
  doc
    .fillColor(SILVER)
    .fontSize(7.5)
    .text(`Verify at ${opts.verifyUrl}`, borderInner + 24, footerTop + 26, {
      width: W - (borderInner + 24) * 2,
      align: "center",
    });
}

certificatesRouter.get("/:certNumber", async (req, res) => {
  const cert = await prisma.certificate.findUnique({
    where: { certNumber: req.params.certNumber },
    include: certInclude,
  });
  if (!cert) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const expired = cert.expiresAt && new Date() > cert.expiresAt;
  const assessment = cert.attempt.assessment;
  res.json({
    ...cert,
    expired: !!expired,
    score: cert.attempt.score,
    proficiencyThresholds: normalizeThresholds(assessment.proficiencyThresholds),
    assessmentLabel: assessmentLabel(assessment),
  });
});

certificatesRouter.get("/:certNumber/pdf", async (req, res) => {
  const cert = await prisma.certificate.findUnique({
    where: { certNumber: req.params.certNumber },
    include: certInclude,
  });
  if (!cert) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const assessment = cert.attempt.assessment;
  const user = assessment.user;
  const label = assessmentLabel(assessment);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${cert.certNumber}.pdf"`
  );

  const doc = new PDFDocument({
    layout: "landscape",
    size: "A4",
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    info: {
      Title: `Certificate — ${label}`,
      Author: config.orgName,
      Subject: `Certificate of Completion for ${user.name}`,
    },
  });

  doc.pipe(res);

  buildCertificatePdf(doc, {
    recipientName: user.name,
    assessmentLabel: label,
    certNumber: cert.certNumber,
    issuedAt: cert.issuedAt,
    expiresAt: cert.expiresAt,
    proficiency: cert.proficiency,
    score: cert.attempt.score,
    proficiencyThresholds: normalizeThresholds(assessment.proficiencyThresholds),
    showProficiency: assessment.showProficiencyOnCert,
    verifyUrl: certificateVerifyUrl(cert.certNumber),
    orgName: config.orgName,
    logoPath: config.logoPath,
  });

  doc.end();
});

certificatesRouter.get("/my/list", async (req, res) => {
  const user = (req as { user: { id: string } }).user;
  const certs = await prisma.certificate.findMany({
    where: { attempt: { assessment: { userId: user.id } } },
    include: { attempt: { include: { assessment: { include: { topics: { include: { topic: true } } } } } } },
    orderBy: { issuedAt: "desc" },
  });
  res.json(certs);
});
