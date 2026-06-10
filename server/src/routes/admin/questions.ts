import { Router } from "express";
import { questionSchema, Role } from "@assessment-os/shared";
import { prisma } from "../../db.js";
import { getUser } from "../../middleware/auth.js";
import {
  getManagerQuestionBankGrants,
  hasQuestionBankAccess,
  questionBankWhereClause,
} from "../../services/managerQuestionBanks.js";

export const questionsRouter = Router();

const includeRoles = {
  topic: { include: { category: true } },
  skill: true,
  skillRoles: { include: { skillRole: true } },
} as const;

async function assertQuestionAccess(
  userId: string,
  role: string,
  skillId: string,
  topicId: string
): Promise<boolean> {
  if (role === Role.ADMIN) return true;
  return hasQuestionBankAccess(userId, skillId, topicId);
}

questionsRouter.get("/", async (req, res) => {
  const user = getUser(req);
  const { topicId, skillId, skillRoleId, status, difficulty } = req.query;

  const filters = {
    ...(topicId && { topicId: String(topicId) }),
    ...(skillId && { skillId: String(skillId) }),
    ...(skillRoleId && { skillRoles: { some: { skillRoleId: String(skillRoleId) } } }),
    ...(status && { status: status as "draft" | "published" }),
    ...(difficulty && { difficulty: difficulty as never }),
  };

  let where = { ...filters };
  if (user.role === Role.CAPABILITY_MANAGER) {
    const grants = await getManagerQuestionBankGrants(user.id);
    where = { AND: [questionBankWhereClause(grants), filters] };
  }

  res.json(
    await prisma.question.findMany({
      where,
      include: includeRoles,
      orderBy: { createdAt: "desc" },
    })
  );
});

questionsRouter.post("/", async (req, res, next) => {
  try {
    const user = getUser(req);
    const { skillRoleIds, ...fields } = questionSchema.parse(req.body);
    if (!(await assertQuestionAccess(user.id, user.role, fields.skillId, fields.topicId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (fields.correctIndices.some((i) => i >= fields.options.length)) {
      res.status(400).json({ error: "correctIndices out of range" });
      return;
    }
    const roles = await prisma.skillRole.findMany({ where: { id: { in: skillRoleIds } } });
    const invalid = roles.filter((r) => r.skillId !== fields.skillId);
    if (invalid.length || roles.length !== skillRoleIds.length) {
      res.status(400).json({ error: "One or more skillRoleIds do not belong to the given skillId" });
      return;
    }
    res.status(201).json(
      await prisma.question.create({
        data: {
          ...fields,
          skillRoles: { create: skillRoleIds.map((skillRoleId) => ({ skillRoleId })) },
        },
        include: includeRoles,
      })
    );
  } catch (e) {
    next(e);
  }
});

questionsRouter.put("/:id", async (req, res, next) => {
  try {
    const user = getUser(req);
    const existing = await prisma.question.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { skillRoleIds, ...fields } = questionSchema.partial().parse(req.body);
    const targetSkillId = fields.skillId ?? existing.skillId;
    const targetTopicId = fields.topicId ?? existing.topicId;
    if (!(await assertQuestionAccess(user.id, user.role, targetSkillId, targetTopicId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const roleUpdate = skillRoleIds
      ? {
          skillRoles: {
            deleteMany: {},
            create: skillRoleIds.map((skillRoleId) => ({ skillRoleId })),
          },
        }
      : {};

    res.json(
      await prisma.question.update({
        where: { id: req.params.id },
        data: { ...fields, ...roleUpdate } as never,
        include: includeRoles,
      })
    );
  } catch (e) {
    next(e);
  }
});

questionsRouter.patch("/:id/publish", async (req, res, next) => {
  try {
    const user = getUser(req);
    const existing = await prisma.question.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!(await assertQuestionAccess(user.id, user.role, existing.skillId, existing.topicId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    res.json(
      await prisma.question.update({
        where: { id: req.params.id },
        data: { status: "published" },
        include: includeRoles,
      })
    );
  } catch (e) {
    next(e);
  }
});

questionsRouter.delete("/:id", async (req, res, next) => {
  try {
    const user = getUser(req);
    const existing = await prisma.question.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!(await assertQuestionAccess(user.id, user.role, existing.skillId, existing.topicId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await prisma.question.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
