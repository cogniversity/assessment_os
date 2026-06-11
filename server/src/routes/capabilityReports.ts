import { Router } from "express";
import PDFDocument from "pdfkit";
import { Role } from "@assessment-os/shared";
import { requireAuth } from "../middleware/auth.js";
import { getUser } from "../middleware/auth.js";
import { getManagerSkillIds } from "../services/managerSkills.js";
import {
  getCapabilityReportForAttempt,
  type ConceptBreakdown,
  type CapabilitySummary,
} from "../services/capabilityReportService.js";

export const capabilityReportsRouter = Router();

capabilityReportsRouter.use(requireAuth);

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
    if (skillIds.includes(assessment.skillId)) return { allowed: true, report };
    return { allowed: false, report };
  }
  if (user.role === Role.CANDIDATE) {
    if (assessment.userId !== user.id) return { allowed: false, report };
    if (!assessment.shareCapabilityWithCandidate) return { allowed: false, report };
    return { allowed: true, report };
  }
  return { allowed: false, report };
}

capabilityReportsRouter.get("/attempt/:attemptId", async (req, res) => {
  const user = getUser(req);
  const { allowed, report } = await canAccessReport(user, req.params.attemptId);
  if (!report) {
    res.status(404).json({ error: "Capability report not found" });
    return;
  }
  if (!allowed) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json(report);
});

capabilityReportsRouter.get("/attempt/:attemptId/pdf", async (req, res) => {
  const user = getUser(req);
  const { allowed, report } = await canAccessReport(user, req.params.attemptId);
  if (!report) {
    res.status(404).json({ error: "Capability report not found" });
    return;
  }
  if (!allowed) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const summary = report.summary as CapabilitySummary;
  const concepts = report.concepts as ConceptBreakdown[];

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=capability-${report.reportNumber}.pdf`
  );

  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);
  doc.fontSize(18).text("Capability Report", { align: "center" });
  doc.moveDown();
  doc.fontSize(11).text(`Report: ${report.reportNumber}`);
  doc.text(`Candidate: ${report.attempt.assessment.user.name}`);
  doc.text(`Skill: ${summary.skillName} (${summary.skillCode})`);
  doc.text(`Role: ${summary.skillRoleName}`);
  doc.text(`Score: ${summary.overallScore}% (pass mark ${summary.passMark}%)`);
  doc.text(`Result: ${summary.passed ? "Pass" : "Fail"}`);
  doc.moveDown();
  doc.fontSize(13).text("Concept breakdown");
  doc.moveDown(0.5);

  if (concepts.length === 0) {
    doc.fontSize(11).text("No concepts were tagged on questions in this attempt.");
    if (summary.untaggedQuestionCount > 0) {
      doc.text(`${summary.untaggedQuestionCount} question(s) had no concept tags.`);
    }
  } else {
    doc.fontSize(10);
    for (const c of concepts) {
      const label =
        c.status === "strength" ? "Strength" : c.status === "gap" ? "Gap" : "Neutral";
      doc.text(
        `${c.name} (${c.code}): ${c.correctCount}/${c.questionCount} correct — ${c.accuracy}% [${label}]`
      );
    }
    if (summary.untaggedQuestionCount > 0) {
      doc.moveDown();
      doc.text(`${summary.untaggedQuestionCount} question(s) were not mapped to concepts.`);
    }
  }
  doc.end();
});
