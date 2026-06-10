import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, requireRole, getUser } from "../middleware/auth.js";
import { Role } from "@assessment-os/shared";
import { validateQuestionPool } from "../services/questionSelector.js";
import { listAssignmentCandidates } from "../services/assignmentCandidates.js";
import { provisionCandidateUser } from "../services/userProvision.js";
import { createAssignmentSchema } from "../schemas/createAssignment.js";
import { getManagerSkillIds } from "../services/managerSkills.js";

export const assignmentsRouter = Router();

assignmentsRouter.use(requireAuth);
assignmentsRouter.use(requireRole(Role.ADMIN, Role.CAPABILITY_MANAGER));

assignmentsRouter.get("/candidates", async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    res.json(await listAssignmentCandidates({ q }));
  } catch (e) {
    next(e);
  }
});

assignmentsRouter.post("/validate-pool", async (req, res, next) => {
  try {
    const { skillId, topicIds, skillRoleId, easyCount, mediumCount, hardCount } = req.body;
    const result = await validateQuestionPool(
      prisma,
      { skillId, topicIds: Array.isArray(topicIds) ? topicIds : [topicIds].filter(Boolean), skillRoleId },
      { easy: easyCount ?? 0, medium: mediumCount ?? 0, hard: hardCount ?? 0 }
    );
    res.json(result);
  } catch (e) {
    next(e);
  }
});

assignmentsRouter.post("/", async (req, res, next) => {
  try {
    const data = createAssignmentSchema.parse({
      ...req.body,
      userIds: Array.isArray(req.body?.userIds) ? req.body.userIds : [],
      provisionCandidates: Array.isArray(req.body?.provisionCandidates)
        ? req.body.provisionCandidates
        : undefined,
    });
    const user = getUser(req);
    const counts = { easy: data.easyCount, medium: data.mediumCount, hard: data.hardCount };
    const questionCount = counts.easy + counts.medium + counts.hard;

    // Validate manager is scoped to this skill
    if (user.role === Role.CAPABILITY_MANAGER) {
      const skillIds = await getManagerSkillIds(user.id);
      if (!skillIds.includes(data.skillId)) {
        res.status(403).json({ error: "You are not assigned to this skill" });
        return;
      }
    }

    // Validate skillRoleId belongs to skillId
    const role = await prisma.skillRole.findUnique({ where: { id: data.skillRoleId } });
    if (!role || role.skillId !== data.skillId) {
      res.status(400).json({ error: "skillRoleId does not belong to the given skillId" });
      return;
    }

    const pool = await validateQuestionPool(
      prisma,
      { skillId: data.skillId, topicIds: data.topicIds, skillRoleId: data.skillRoleId },
      counts
    );
    if (!pool.sufficient) {
      const hint =
        pool.diagnostics.publishedInTopics > 0 && pool.available.total === 0
          ? `${pool.diagnostics.publishedInTopics} published question(s) exist in the selected topics, but none are tagged for this skill role. Edit questions in Question Bank and assign skill roles, or re-import with skillRoleCodes.`
          : pool.diagnostics.publishedWithoutRoles > 0
            ? `${pool.diagnostics.publishedWithoutRoles} published question(s) in these topics have no skill roles assigned.`
            : undefined;
      res.status(400).json({
        error: "Insufficient published questions",
        hint,
        shortfalls: pool.shortfalls,
        available: pool.available,
        diagnostics: pool.diagnostics,
      });
      return;
    }

    const { topicIds, userIds, provisionCandidates, proficiencyThresholds, ...rest } = data;

    const resolvedIds: string[] = [...userIds];
    for (const p of provisionCandidates ?? []) {
      const user = await provisionCandidateUser({
        email: p.email,
        name: p.name,
        assignOnly: true,
      });
      if (!resolvedIds.includes(user.id)) resolvedIds.push(user.id);
    }

    const created = await prisma.$transaction(
      resolvedIds.map((userId) =>
        prisma.assessment.create({
          data: {
            userId,
            skillId: rest.skillId,
            skillRoleId: rest.skillRoleId,
            assignedById: user.id,
            blueprintId: rest.blueprintId ?? null,
            displayName: rest.displayName ?? null,
            questionCount,
            easyCount: counts.easy,
            mediumCount: counts.medium,
            hardCount: counts.hard,
            timeLimitMinutes: rest.timeLimitMinutes,
            deadline: rest.deadline ? new Date(rest.deadline) : null,
            // Snapshot cert/pass settings so they never change after assignment
            passMark:               rest.passMark,
            issueCertificate:       rest.issueCertificate,
            showProficiencyOnCert:  rest.showProficiencyOnCert,
            certValidityDays:       rest.certValidityDays,
            revealAnswersAfterTest: rest.revealAnswersAfterTest,
            proficiencyThresholds:  proficiencyThresholds ?? [40, 55, 70, 85, 95],
            multiSelectScoringMode: rest.multiSelectScoringMode,
            proctoringPhotoIntervalMinutes: rest.proctoringPhotoIntervalMinutes,
            proctoringInstructions: rest.proctoringInstructions ?? null,
            topics: { create: topicIds.map((topicId) => ({ topicId })) },
          },
          include: {
            topics: { include: { topic: { include: { category: true } } } },
            skill: true,
            skillRole: true,
            user: { select: { id: true, name: true, email: true } },
          },
        })
      )
    );
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

assignmentsRouter.get("/", async (req, res, next) => {
  try {
    const user = getUser(req);
    let where = {};
    if (user.role === Role.CAPABILITY_MANAGER) {
      const skillIds = await getManagerSkillIds(user.id);
      where = { skillId: { in: skillIds } };
    }
    const list = await prisma.assessment.findMany({
      where,
      include: {
        topics: { include: { topic: { include: { category: true } } } },
        skill: true,
        skillRole: true,
        user: { select: { id: true, name: true, email: true } },
        assignedBy: { select: { id: true, name: true } },
        blueprint: { select: { id: true, name: true } },
        attempts: { orderBy: { startedAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(list);
  } catch (e) {
    next(e);
  }
});
