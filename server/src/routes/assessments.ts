import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import {
  buildAttemptReviewQuestions,
  recalculateAndPersistAttemptScore,
  scorePercentFromReview,
} from "../services/attemptReview.js";
import {
  dedupeQuestionsByStem,
  selectQuestions,
  uniqueQuestionOrder,
} from "../services/questionSelector.js";
import { scoreAttempt } from "../services/scoring.js";
import { issueCertificateIfEligible } from "../services/certificateService.js";
import { issueCapabilityReportIfEligible } from "../services/capabilityReportService.js";
import { upsertSkillProficiencyFromAttempt } from "../services/skillProficiencyService.js";
import { AttemptStatus, AssessmentStatus } from "@prisma/client";

export const assessmentsRouter = Router();

assessmentsRouter.use(requireAuth);

function stripQuestion(q: { correctIndices: number[]; explanation: string | null; [k: string]: unknown }) {
  const { correctIndices, explanation, ...rest } = q;
  return rest;
}

async function checkTimeExpired(attempt: {
  id: string;
  startedAt: Date;
  status: string;
  currentAnswers: unknown;
  questionOrder: unknown;
  assessment: { timeLimitMinutes: number; questionCount: number };
}) {
  const limit = attempt.assessment.timeLimitMinutes;
  if (limit <= 0 || attempt.status !== "in_progress") return null;
  const expires = new Date(attempt.startedAt.getTime() + limit * 60 * 1000);
  if (new Date() <= expires) return null;
  return autoSubmit(attempt.id);
}

async function autoSubmit(attemptId: string) {
  const attempt = await prisma.assessmentAttempt.findUnique({
    where: { id: attemptId },
    include: { assessment: true },
  });
  if (!attempt || attempt.status !== "in_progress") return attempt;

  const orderIds = uniqueQuestionOrder(attempt.questionOrder as string[]);
  const questions = await prisma.question.findMany({
    where: { id: { in: orderIds } },
  });
  const answers = (attempt.currentAnswers as Record<string, number | number[]>) || {};
  const { score, results } = scoreAttempt(
    orderIds,
    answers,
    questions,
    attempt.assessment.multiSelectScoringMode
  );

  await prisma.attemptAnswer.deleteMany({ where: { attemptId } });
  await prisma.attemptAnswer.createMany({
    data: results.map((r) => ({
      attemptId,
      questionId: r.questionId,
      selectedIndices: r.selectedIndices,
      pointsEarned: r.points,
      isFullyCorrect: r.isFullyCorrect,
    })),
  });
  await prisma.$transaction([
    prisma.assessmentAttempt.update({
      where: { id: attemptId },
      data: {
        score,
        status: AttemptStatus.timed_out,
        completedAt: new Date(),
        autoSubmittedAt: new Date(),
      },
    }),
    prisma.assessment.update({
      where: { id: attempt.assessmentId },
      data: { status: AssessmentStatus.completed },
    }),
  ]);

  const passed = score >= attempt.assessment.passMark;
  if (passed) {
    await issueCertificateIfEligible(attemptId);
    await upsertSkillProficiencyFromAttempt(attemptId);
  }
  await issueCapabilityReportIfEligible(attemptId);
  return prisma.assessmentAttempt.findUnique({
    where: { id: attemptId },
    include: { assessment: true },
  });
}

assessmentsRouter.get("/my", async (req, res, next) => {
  try {
    const user = (req as { user: { id: string } }).user;
    const list = await prisma.assessment.findMany({
      where: { userId: user.id },
      include: {
        topics: { include: { topic: { include: { category: true } } } },
        skill: true,
        attempts: { orderBy: { startedAt: "desc" } },
        reattemptRequests: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(list);
  } catch (e) {
    next(e);
  }
});

assessmentsRouter.get("/:id", async (req, res, next) => {
  try {
    const user = (req as { user: { id: string; role: string } }).user;
    const assessment = await prisma.assessment.findUnique({
      where: { id: req.params.id },
      include: {
        topics: { include: { topic: { include: { category: true } } } },
        skill: true,
        attempts: true,
        user: true,
      },
    });
    if (!assessment) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (assessment.userId !== user.id && user.role === "candidate") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    res.json(assessment);
  } catch (e) {
    next(e);
  }
});

assessmentsRouter.post("/:id/start", async (req, res, next) => {
  try {
    const user = (req as { user: { id: string } }).user;
    const assessment = await prisma.assessment.findUnique({
      where: { id: req.params.id },
      include: { topics: true },
    });
    if (!assessment || assessment.userId !== user.id) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (assessment.deadline && new Date() > assessment.deadline) {
      await prisma.assessment.update({
        where: { id: assessment.id },
        data: { status: AssessmentStatus.expired },
      });
      res.status(400).json({ error: "Assessment deadline passed" });
      return;
    }

    const inProgress = await prisma.assessmentAttempt.findFirst({
      where: { assessmentId: assessment.id, status: "in_progress" },
    });
    if (inProgress) {
      const expired = await checkTimeExpired({
        ...inProgress,
        assessment,
      } as Parameters<typeof checkTimeExpired>[0]);
      if (expired && (expired as { status: string }).status !== "in_progress") {
        res.status(400).json({
          error: "in_progress",
          message: "Contact your manager to abandon and restart",
          attemptId: inProgress.id,
        });
        return;
      }
      res.status(400).json({
        error: "in_progress",
        message: "Contact your manager to abandon and restart",
        attemptId: inProgress.id,
      });
      return;
    }

    // Pool spans all topics associated with this assessment
    const topicIds = assessment.topics.map((t) => t.topicId);
    const poolRaw = await prisma.question.findMany({
      where: {
        skillId: assessment.skillId,
        topicId: { in: topicIds },
        status: "published",
        skillRoles: { some: { skillRoleId: assessment.skillRoleId } },
      },
    });
    const pool = dedupeQuestionsByStem(poolRaw);
    const selected = selectQuestions(pool, {
      easy:   assessment.easyCount,
      medium: assessment.mediumCount,
      hard:   assessment.hardCount,
    });
    const questionOrder = selected.map((q) => q.id);

    const attempt = await prisma.assessmentAttempt.create({
      data: {
        assessmentId: assessment.id,
        questionOrder,
        currentAnswers: {},
      },
    });
    await prisma.assessment.update({
      where: { id: assessment.id },
      data: { status: AssessmentStatus.in_progress },
    });

    res.json({
      attemptId: attempt.id,
      timeLimitMinutes: assessment.timeLimitMinutes,
      questions: selected.map(stripQuestion),
      total: questionOrder.length,
    });
  } catch (e) {
    next(e);
  }
});

assessmentsRouter.get("/:id/result", async (req, res, next) => {
  try {
    const user = (req as { user: { id: string; role: string } }).user;
    const assessment = await prisma.assessment.findUnique({
      where: { id: req.params.id },
      select: {
        userId: true,
        passMark: true,
        revealAnswersAfterTest: true,
        issueCertificate: true,
        issueCapabilityReport: true,
        shareCapabilityWithCandidate: true,
      },
    });
    if (!assessment || (assessment.userId !== user.id && user.role === "candidate")) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const finishedAttempts = await prisma.assessmentAttempt.findMany({
      where: {
        assessmentId: req.params.id,
        status: { in: ["completed", "timed_out"] },
      },
      orderBy: { completedAt: "desc" },
      include: { certificate: { select: { certNumber: true, proficiency: true } } },
    });
    if (finishedAttempts.length === 0) {
      res.status(404).json({ error: "No completed attempt" });
      return;
    }

    const attemptIdParam = typeof req.query.attemptId === "string" ? req.query.attemptId : undefined;
    const detailAttempt =
      (attemptIdParam
        ? await prisma.assessmentAttempt.findFirst({
            where: {
              id: attemptIdParam,
              assessmentId: req.params.id,
              status: { in: ["completed", "timed_out"] },
            },
            include: {
              certificate: true,
              capabilityReport: true,
              assessment: true,
              answers: { include: { question: true } },
            },
          })
        : null) ??
      (await prisma.assessmentAttempt.findFirst({
        where: {
          id: finishedAttempts[0].id,
          assessmentId: req.params.id,
        },
        include: {
          certificate: true,
          capabilityReport: true,
          assessment: true,
          answers: { include: { question: true } },
        },
      }));

    if (!detailAttempt) {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }

    const reveal = assessment.revealAnswersAfterTest;
    const reviewQuestions = await buildAttemptReviewQuestions(detailAttempt);
    let displayScore = detailAttempt.score;
    if (reviewQuestions.length > 0) {
      const recomputed = scorePercentFromReview(reviewQuestions);
      if (recomputed !== null) {
        displayScore = recomputed;
        if (recomputed !== detailAttempt.score) {
          await recalculateAndPersistAttemptScore(detailAttempt.id);
        }
      }
    }

    let certificate = detailAttempt.certificate;
    const passed =
      displayScore !== null && displayScore >= assessment.passMark;
    if (passed) {
      if (assessment.issueCertificate && !certificate) {
        certificate = await issueCertificateIfEligible(detailAttempt.id);
      }
      await upsertSkillProficiencyFromAttempt(detailAttempt.id);
    }

    let capabilityReport = detailAttempt.capabilityReport;
    if (assessment.issueCapabilityReport && !capabilityReport) {
      capabilityReport = await issueCapabilityReportIfEligible(detailAttempt.id);
    }

    res.json({
      passMark: assessment.passMark,
      issueCertificate: assessment.issueCertificate,
      issueCapabilityReport: assessment.issueCapabilityReport,
      shareCapabilityWithCandidate: assessment.shareCapabilityWithCandidate,
      attempt: { ...detailAttempt, score: displayScore, certificate, capabilityReport },
      attempts: finishedAttempts.map((a, idx) => {
        const score = a.id === detailAttempt.id ? displayScore : a.score;
        return {
          id: a.id,
          score,
          status: a.status,
          startedAt: a.startedAt,
          completedAt: a.completedAt,
          attemptNumber: finishedAttempts.length - idx,
          passed: score != null && score >= assessment.passMark,
          certNumber: a.certificate?.certNumber ?? null,
        };
      }),
      revealAnswers: reveal,
      questions: reveal ? reviewQuestions : undefined,
    });
  } catch (e) {
    next(e);
  }
});

export { autoSubmit };
