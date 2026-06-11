import { Router } from "express";
import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import fs from "fs/promises";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../db.js";
import { profileUpdateSchema } from "@assessment-os/shared";
import { updateProfile, ensureProfile } from "../services/profileService.js";
import { resumePath, externalCertPath } from "../services/storage.js";
import { Role } from "@assessment-os/shared";
import { listSkillProficienciesForUser } from "../services/skillProficiencyService.js";

export const profileRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

profileRouter.use(requireAuth);

profileRouter.get("/me", async (req, res) => {
  const user = (req as { user: { id: string } }).user;
  await ensureProfile(user.id);
  const full = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      profile: true,
      externalCertificates: true,
      assessments: {
        include: {
          skill: true,
          skillRole: true,
          topics: { include: { topic: true } },
          attempts: { include: { certificate: true, capabilityReport: true } },
        },
      },
    },
  });
  const fieldDefs = await prisma.profileFieldDefinition.findMany({ where: { active: true } });
  const remarks = await prisma.candidateRemark.findMany({
    where: { candidateUserId: user.id, visibility: "normal" },
    orderBy: { createdAt: "desc" },
  });
  const certs = await prisma.certificate.findMany({
    where: { attempt: { assessment: { userId: user.id } } },
    include: {
      attempt: {
        include: { assessment: { include: { topics: { include: { topic: true } } } } },
      },
    },
  });
  const capabilityReports = await prisma.capabilityReport.findMany({
    where: {
      attempt: {
        assessment: {
          userId: user.id,
          shareCapabilityWithCandidate: true,
        },
      },
    },
    include: {
      attempt: {
        include: {
          assessment: { include: { skill: true, skillRole: true, topics: { include: { topic: true } } } },
        },
      },
    },
    orderBy: { issuedAt: "desc" },
  });
  const skillProficiencies = await listSkillProficienciesForUser(user.id);
  res.json({
    user: full,
    fieldDefs,
    remarks,
    platformCertificates: certs,
    capabilityReports,
    skillProficiencies,
  });
});

profileRouter.get("/:userId", async (req, res) => {
  const actor = (req as { user: { id: string; role: string } }).user;
  const targetId = req.params.userId;
  if (actor.role === Role.CANDIDATE && actor.id !== targetId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: targetId },
    include: {
      profile: true,
      externalCertificates: true,
      assessments: {
        include: {
          skill: true,
          skillRole: true,
          topics: { include: { topic: true } },
          attempts: true,
        },
      },
      remarksReceived: {
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  let remarks = user.remarksReceived;
  if (actor.role === Role.CANDIDATE) {
    remarks = remarks.filter((r) => r.visibility === "normal");
  }
  const audit = await prisma.profileAuditLog.findMany({
    where: { candidateUserId: targetId },
    orderBy: { changedAt: "desc" },
    take: 50,
    include: { actor: { select: { name: true } } },
  });
  const skillProficiencies = await listSkillProficienciesForUser(targetId);
  res.json({ ...user, remarksReceived: remarks, auditLog: audit, skillProficiencies });
});

profileRouter.patch("/:userId", async (req, res, next) => {
  try {
    const actor = (req as { user: { id: string; role: string } }).user;
    const targetId = req.params.userId;
    const canEdit =
      actor.id === targetId ||
      actor.role === Role.ADMIN ||
      actor.role === Role.CAPABILITY_MANAGER;
    if (!canEdit) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const data = profileUpdateSchema.parse(req.body);
    const profile = await updateProfile(targetId, actor.id, data, data.changeReason);
    res.json(profile);
  } catch (e) {
    next(e);
  }
});

profileRouter.post("/:userId/resume", upload.single("file"), async (req, res, next) => {
  try {
    const actor = (req as { user: { id: string; role: string } }).user;
    const targetId = req.params.userId;
    if (actor.id !== targetId && actor.role === Role.CANDIDATE) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const ext = path.extname(req.file!.originalname);
    const filename = `${targetId}-${uuidv4()}${ext}`;
    await fs.writeFile(resumePath(filename), req.file!.buffer);
    await ensureProfile(targetId);
    const profile = await prisma.candidateProfile.update({
      where: { userId: targetId },
      data: { resumeFilePath: filename },
    });
    res.json(profile);
  } catch (e) {
    next(e);
  }
});

function canAccessProfileTarget(
  actor: { id: string; role: string },
  targetId: string
): boolean {
  return (
    actor.id === targetId ||
    actor.role === Role.ADMIN ||
    actor.role === Role.CAPABILITY_MANAGER
  );
}

profileRouter.get("/:userId/external-certificates/:certId/file", async (req, res, next) => {
  try {
    const actor = (req as { user: { id: string; role: string } }).user;
    const targetId = String(req.params.userId);
    const certId = String(req.params.certId);
    if (!canAccessProfileTarget(actor, targetId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const cert = await prisma.externalCertificate.findFirst({
      where: { id: certId, userId: targetId },
    });
    if (!cert) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const ext = path.extname(cert.filePath).toLowerCase();
    const type =
      ext === ".pdf"
        ? "application/pdf"
        : ext === ".png"
          ? "image/png"
          : ext === ".jpg" || ext === ".jpeg"
            ? "image/jpeg"
            : ext === ".webp"
              ? "image/webp"
              : "application/octet-stream";
    const buf = await fs.readFile(externalCertPath(cert.filePath));
    const safeName = cert.title.replace(/[^\w.-]+/g, "_") + (ext || ".bin");
    res.setHeader("Content-Type", type);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(safeName)}"`);
    res.send(buf);
  } catch (e) {
    next(e);
  }
});

profileRouter.post("/:userId/external-certificates", upload.single("file"), async (req, res, next) => {
  try {
    const actor = (req as { user: { id: string; role: string } }).user;
    const targetId = req.params.userId;
    if (!canAccessProfileTarget(actor, targetId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "Certificate file is required" });
      return;
    }
    const { title, issuer, certificateNumber, issueDate, expiryDate } = req.body;
    const ext = path.extname(req.file!.originalname);
    const filename = `${targetId}-${uuidv4()}${ext}`;
    await fs.writeFile(externalCertPath(filename), req.file!.buffer);
    const cert = await prisma.externalCertificate.create({
      data: {
        userId: targetId,
        title: title || "Certificate",
        issuer: issuer || null,
        filePath: filename,
        certificateNumber: certificateNumber || null,
        issueDate: issueDate ? new Date(issueDate) : null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
      },
    });
    res.status(201).json(cert);
  } catch (e) {
    next(e);
  }
});

profileRouter.get("/field-definitions", async (_req, res) => {
  res.json(await prisma.profileFieldDefinition.findMany({ where: { active: true }, orderBy: { displayOrder: "asc" } }));
});
