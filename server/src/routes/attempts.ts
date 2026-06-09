import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { Role, ProctoringEventType } from "@assessment-os/shared";
import { scoreAttempt } from "../services/scoring.js";
import { uniqueQuestionOrder } from "../services/questionSelector.js";
import { issueCertificateIfEligible } from "../services/certificateService.js";
import { AttemptStatus, AssessmentStatus } from "@prisma/client";

const VALID_PROCTOR_EVENTS = new Set(Object.values(ProctoringEventType));

export const attemptsRouter = Router();

attemptsRouter.use(requireAuth);

function stripQuestion(q: { correctIndices: number[]; explanation: string | null; [k: string]: unknown }) {
  const { correctIndices, explanation, ...rest } = q;
  return rest;
}

attemptsRouter.get("/:id", async (req, res, next) => {
  try {
    const attempt = await prisma.assessmentAttempt.findUnique({
      where: { id: req.params.id },
      include: {
        assessment: { include: { topics: { include: { topic: true } }, user: true, skillRole: true } },
        proctoringEvents: true,
        photos: true,
        certificate: true,
      },
    });
    if (!attempt) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const user = (req as { user: { id: string; role: string } }).user;
    const canView =
      user.role === Role.ADMIN ||
      attempt.assessment.userId === user.id ||
      (user.role === Role.CAPABILITY_MANAGER &&
        attempt.assessment.assignedById === user.id);
    if (!canView) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    if (attempt.status === "in_progress") {
      const limit = attempt.assessment.timeLimitMinutes;
      if (limit > 0) {
        const expires = new Date(attempt.startedAt.getTime() + limit * 60 * 1000);
        if (new Date() > expires) {
          const { autoSubmit } = await import("./assessments.js");
          const submitted = await autoSubmit(attempt.id);
          res.json(submitted);
          return;
        }
      }
      const questions = await prisma.question.findMany({
        where: { id: { in: attempt.questionOrder as string[] } },
      });
      const orderIds = uniqueQuestionOrder(attempt.questionOrder as string[]);
      const ordered = orderIds
        .map((id) => questions.find((q) => q.id === id))
        .filter((q): q is NonNullable<typeof q> => q != null);
      res.json({
        ...attempt,
        questions: ordered.map(stripQuestion),
        timeLimitMinutes: attempt.assessment.timeLimitMinutes,
      });
      return;
    }

    const answers = await prisma.attemptAnswer.findMany({
      where: { attemptId: attempt.id },
      include: { question: true },
    });
    res.json({ ...attempt, answers });
  } catch (e) {
    next(e);
  }
});

attemptsRouter.put("/:id/answers", async (req, res, next) => {
  try {
    const user = (req as { user: { id: string } }).user;
    const attempt = await prisma.assessmentAttempt.findUnique({
      where: { id: req.params.id },
      include: { assessment: true },
    });
    if (!attempt || attempt.assessment.userId !== user.id) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (attempt.status !== "in_progress") {
      res.status(400).json({ error: "Attempt not in progress" });
      return;
    }
    const { answers } = req.body as { answers: Record<string, number | number[]> };
    await prisma.assessmentAttempt.update({
      where: { id: attempt.id },
      data: { currentAnswers: answers },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

attemptsRouter.post("/:id/submit", async (req, res, next) => {
  try {
    const user = (req as { user: { id: string } }).user;
    const attempt = await prisma.assessmentAttempt.findUnique({
      where: { id: req.params.id },
      include: { assessment: true },
    });
    if (!attempt || attempt.assessment.userId !== user.id) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (attempt.status !== "in_progress") {
      res.status(400).json({ error: "Already submitted" });
      return;
    }

    const orderIds = uniqueQuestionOrder(attempt.questionOrder as string[]);
    const questions = await prisma.question.findMany({
      where: { id: { in: orderIds } },
    });
    const misconfigured = questions.filter((q) => q.correctIndices.length === 0);
    if (misconfigured.length > 0) {
      res.status(500).json({
        error: "Question bank misconfigured",
        message: `${misconfigured.length} question(s) are missing correct answers. Contact your administrator.`,
      });
      return;
    }
    const answers = (attempt.currentAnswers as Record<string, number | number[]>) || {};
    const { score, results } = scoreAttempt(
      orderIds,
      answers,
      questions,
      attempt.assessment.multiSelectScoringMode
    );
    const passed = score >= attempt.assessment.passMark;

    await prisma.$transaction(async (tx) => {
      await tx.attemptAnswer.deleteMany({ where: { attemptId: attempt.id } });
      await tx.attemptAnswer.createMany({
        data: results.map((r) => ({
          attemptId: attempt.id,
          questionId: r.questionId,
          selectedIndices: r.selectedIndices,
          pointsEarned: r.points,
          isFullyCorrect: r.isFullyCorrect,
        })),
      });
      await tx.assessmentAttempt.update({
        where: { id: attempt.id },
        data: {
          score,
          status: AttemptStatus.completed,
          completedAt: new Date(),
        },
      });
      await tx.assessment.update({
        where: { id: attempt.assessmentId },
        data: { status: AssessmentStatus.completed },
      });
    });

    if (passed) await issueCertificateIfEligible(attempt.id);

    const updated = await prisma.assessmentAttempt.findUnique({
      where: { id: attempt.id },
      include: { certificate: true, assessment: true },
    });
    res.json({ attempt: updated, passed, passMark: attempt.assessment.passMark });
  } catch (e) {
    next(e);
  }
});

attemptsRouter.patch("/:id/abandon", async (req, res, next) => {
  try {
    const user = (req as { user: { id: string; role: string } }).user;
    const attempt = await prisma.assessmentAttempt.findUnique({
      where: { id: req.params.id },
      include: { assessment: true },
    });
    if (!attempt) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const canAbandon =
      user.role === Role.ADMIN ||
      (user.role === Role.CAPABILITY_MANAGER &&
        attempt.assessment.assignedById === user.id);
    if (!canAbandon) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await prisma.$transaction([
      prisma.assessmentAttempt.update({
        where: { id: attempt.id },
        data: { status: AttemptStatus.abandoned },
      }),
      prisma.assessment.update({
        where: { id: attempt.assessmentId },
        data: { status: AssessmentStatus.assigned },
      }),
    ]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

attemptsRouter.post("/:id/proctor", async (req, res, next) => {
  try {
    const user = (req as { user: { id: string } }).user;
    const attempt = await prisma.assessmentAttempt.findUnique({
      where: { id: req.params.id },
      include: { assessment: true },
    });
    if (!attempt || attempt.assessment.userId !== user.id) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (attempt.status !== "in_progress") {
      res.status(400).json({ error: "Not in progress" });
      return;
    }
    const { eventType, metadata } = req.body;
    if (!VALID_PROCTOR_EVENTS.has(eventType)) {
      res.status(400).json({ error: `Invalid eventType: ${eventType}` });
      return;
    }
    const event = await prisma.proctoringEvent.create({
      data: {
        attemptId: attempt.id,
        eventType,
        metadata: metadata || {},
      },
    });
    res.status(201).json(event);
  } catch (e) {
    next(e);
  }
});
