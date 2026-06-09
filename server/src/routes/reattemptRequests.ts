import { Router } from "express";
import { reattemptRequestCreateSchema, reattemptRequestReviewSchema, Role } from "@assessment-os/shared";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { prisma } from "../db.js";
import {
  createReattemptRequest,
  getLatestReattemptRequest,
  reviewReattemptRequest,
} from "../services/reattemptService.js";
import { getManagerSkillIds } from "../services/managerSkills.js";

export const reattemptRequestsRouter = Router();

reattemptRequestsRouter.use(requireAuth);

/** Candidate: my reattempt requests */
reattemptRequestsRouter.get("/my", requireRole(Role.CANDIDATE), async (req, res, next) => {
  try {
    const user = (req as { user: { id: string } }).user;
    const list = await prisma.reattemptRequest.findMany({
      where: { candidateId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        assessment: {
          include: {
            skill: true,
            topics: { include: { topic: true } },
          },
        },
        reviewedBy: { select: { name: true } },
      },
    });
    res.json(list);
  } catch (e) {
    next(e);
  }
});

/** Candidate: request reattempt for a completed assessment */
reattemptRequestsRouter.post(
  "/assessments/:assessmentId",
  requireRole(Role.CANDIDATE),
  async (req, res, next) => {
    try {
      const user = (req as { user: { id: string } }).user;
      const body = reattemptRequestCreateSchema.parse(req.body);
      const created = await createReattemptRequest(
        req.params.assessmentId,
        user.id,
        body.message
      );
      res.status(201).json(created);
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(e);
    }
  }
);

/** Latest request for one assessment (candidate or staff) */
reattemptRequestsRouter.get("/assessments/:assessmentId", async (req, res, next) => {
  try {
    const user = (req as { user: { id: string; role: string } }).user;
    const assessment = await prisma.assessment.findUnique({
      where: { id: req.params.assessmentId },
    });
    if (!assessment) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const isOwner = assessment.userId === user.id;
    let isStaff = user.role === Role.ADMIN;
    if (!isStaff && user.role === Role.CAPABILITY_MANAGER) {
      const skillIds = await getManagerSkillIds(user.id);
      isStaff = skillIds.includes(assessment.skillId);
    }
    if (!isOwner && !isStaff) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const latest = await getLatestReattemptRequest(req.params.assessmentId);
    res.json(latest);
  } catch (e) {
    next(e);
  }
});

const managerRouter = Router();
managerRouter.use(requireRole(Role.ADMIN, Role.CAPABILITY_MANAGER));

/** Manager/admin: pending reattempt queue */
managerRouter.get("/", async (req, res, next) => {
  try {
    const user = (req as { user: { id: string; role: string } }).user;
    const status = (req.query.status as string) || "pending";
    let assessmentScope = {};
    if (user.role === Role.CAPABILITY_MANAGER) {
      const skillIds = await getManagerSkillIds(user.id);
      assessmentScope = { assessment: { skillId: { in: skillIds } } };
    }
    const list = await prisma.reattemptRequest.findMany({
      where: {
        status: status as "pending" | "approved" | "rejected",
        ...assessmentScope,
      },
      orderBy: { createdAt: "asc" },
      include: {
        candidate: { select: { id: true, name: true, email: true } },
        assessment: {
          include: {
            skill: true,
            topics: { include: { topic: true } },
            attempts: {
              where: { status: { in: ["completed", "timed_out"] } },
              orderBy: { completedAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });
    res.json(list);
  } catch (e) {
    next(e);
  }
});

managerRouter.patch("/:id", async (req, res, next) => {
  try {
    const user = (req as { user: { id: string; role: string } }).user;
    const body = reattemptRequestReviewSchema.parse(req.body);
    const updated = await reviewReattemptRequest(
      req.params.id,
      user.id,
      user.role,
      body.action,
      body.managerNote
    );
    res.json(updated);
  } catch (e) {
    const err = e as Error & { status?: number };
    if (err.status) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    next(e);
  }
});

reattemptRequestsRouter.use("/manager", managerRouter);
