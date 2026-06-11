import { Router } from "express";
import PDFDocument from "pdfkit";
import fs from "fs";
import { PROFICIENCY_LEVELS } from "@assessment-os/shared";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../db.js";
import { config } from "../config.js";

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

const METER_SEGMENT_COLORS = ["#E2E8F0", "#CBD5E1", "#94A3B8", "#64748B", "#475569", "#1E3A5F"];

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

/** Horizontal proficiency scale: band widths from thresholds, tick marks, candidate score marker. */
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
  const barH = 18;
  const bounds = [0, ...thresholds, 100];
  const levelIndex = PROFICIENCY_LEVELS.indexOf(proficiency as (typeof PROFICIENCY_LEVELS)[number]);

  doc.fillColor(colors.silver).fontSize(8).font("Helvetica")
    .text("Proficiency scale", x, y, { width, align: "center" });

  const barY = y + 14;
  for (let i = 0; i < 6; i++) {
    const startPct = bounds[i] / 100;
    const endPct = bounds[i + 1] / 100;
    const segX = x + startPct * width;
    const segW = Math.max(1, (endPct - startPct) * width);
    doc.rect(segX, barY, segW, barH).fillColor(METER_SEGMENT_COLORS[i] ?? colors.navy).fill();
    if (i === levelIndex) {
      doc.rect(segX, barY, segW, barH).lineWidth(1.5).strokeColor(colors.gold).stroke();
    }
    const label = METER_SHORT_LABELS[PROFICIENCY_LEVELS[i]] ?? PROFICIENCY_LEVELS[i];
    doc.fillColor(i >= 3 ? "#FFFFFF" : colors.navy).fontSize(6.5).font("Helvetica-Bold")
      .text(label, segX, barY + 5, { width: segW, align: "center" });
  }

  for (const t of thresholds) {
    const tx = x + (t / 100) * width;
    doc.moveTo(tx, barY).lineTo(tx, barY + barH + 3).lineWidth(0.5).strokeColor(colors.silver).stroke();
    doc.fillColor(colors.silver).fontSize(6).font("Helvetica")
      .text(`${t}%`, tx - 12, barY + barH + 5, { width: 24, align: "center" });
  }

  if (score != null) {
    const clamped = Math.min(100, Math.max(0, score));
    const mx = x + (clamped / 100) * width;
    doc.moveTo(mx, barY - 2)
      .lineTo(mx - 5, barY - 10)
      .lineTo(mx + 5, barY - 10)
      .closePath()
      .fillColor(colors.gold)
      .fill();
    doc.fillColor(colors.navy).fontSize(7).font("Helvetica-Bold")
      .text(`${clamped}%`, mx - 14, barY - 22, { width: 28, align: "center" });
  }

  return barY + barH + 18;
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
  const profBlockH = showProf ? 26 + 12 + 52 : 0;
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
    verifyUrl: `${config.serverBaseUrl}/api/certificates/${cert.certNumber}`,
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
