import { v4 as uuidv4 } from "uuid";
import { prisma } from "../db.js";
import { mapScoreToProficiency } from "./scoring.js";
import type { Proficiency } from "@prisma/client";

export async function issueCertificateIfEligible(attemptId: string) {
  const attempt = await prisma.assessmentAttempt.findUnique({
    where: { id: attemptId },
    include: {
      assessment: true,
      certificate: true,
    },
  });
  if (!attempt || attempt.certificate || attempt.score === null) return null;

  // All cert/pass settings are snapshotted directly on the assessment record
  const a = attempt.assessment;
  if (!a.issueCertificate || attempt.score < a.passMark) return null;

  const thresholds = (a.proficiencyThresholds as number[]) || [40, 55, 70, 85, 95];
  const proficiency = mapScoreToProficiency(attempt.score, thresholds) as Proficiency;
  const certNumber = `CERT-${uuidv4().slice(0, 8).toUpperCase()}`;
  const expiresAt =
    a.certValidityDays > 0
      ? new Date(Date.now() + a.certValidityDays * 24 * 60 * 60 * 1000)
      : null;

  return prisma.certificate.create({
    data: {
      attemptId,
      certNumber,
      proficiency,
      expiresAt,
    },
  });
}
