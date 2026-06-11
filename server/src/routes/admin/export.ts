import { Router } from "express";
import { stringify } from "csv-stringify/sync";
import PDFDocument from "pdfkit";
import { Role, type ConceptBreakdown } from "@assessment-os/shared";
import { prisma } from "../../db.js";
import { getUser } from "../../middleware/auth.js";
import { getManagerSkillIds } from "../../services/managerSkills.js";

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

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=attempt-${attempt.id}.pdf`);

  const doc = new PDFDocument();
  doc.pipe(res);
  doc.fontSize(18).text("Assessment Report", { align: "center" });
  doc.moveDown();
  doc.fontSize(12).text(`Candidate: ${attempt.assessment.user.name}`);
  doc.text(`Assessment: ${attempt.assessment.displayName ?? topics}`);
  doc.text(`Skill role: ${attempt.assessment.skillRole.name}`);
  doc.text(`Topics: ${topics}`);
  doc.text(`Category: ${category}`);
  doc.text(`Score: ${attempt.score}%`);
  doc.text(`Pass mark: ${attempt.assessment.passMark}%`);
  if (attempt.certificate?.proficiency) {
    doc.text(`Proficiency: ${attempt.certificate.proficiency.replace(/_/g, " ")}`);
  }
  if (attempt.capabilityReport) {
    doc.text(`Capability report: ${attempt.capabilityReport.reportNumber}`);
  }
  doc.moveDown();
  doc.text("Questions:");
  for (const a of attempt.answers) {
    const opts = a.question.options as string[];
    doc.text(`- ${a.question.stem}`);
    doc.text(`  Selected: ${a.selectedIndices.length ? a.selectedIndices.map((i) => opts[i]).join("; ") : "skipped"}`);
    const correct = a.question.correctIndices.map((i) => opts[i]).join("; ");
    doc.text(`  Correct: ${correct}`);
  }
  doc.moveDown();
  doc.text(`Proctoring events: ${attempt.proctoringEvents.length}`);
  if (attempt.proctoringEvents.length > 0) {
    // Group by type for a concise breakdown
    const breakdown = attempt.proctoringEvents.reduce<Record<string, number>>((acc, e) => {
      acc[e.eventType] = (acc[e.eventType] ?? 0) + 1;
      return acc;
    }, {});
    for (const [type, count] of Object.entries(breakdown)) {
      doc.text(`  ${type}: ${count}`);
    }
  }
  doc.end();
});
