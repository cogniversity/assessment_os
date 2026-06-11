import { Router } from "express";
import {
  questionSchema,
  questionUpdateSchema,
  questionBulkPublishSchema,
  questionBulkDraftSchema,
  questionBulkSkillRolesSchema,
  questionBulkConceptsSchema,
  questionBulkDeleteSchema,
  Role,
} from "@assessment-os/shared";
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
  concepts: { include: { concept: true } },
} as const;

async function assertConceptIdsForSkill(skillId: string, conceptIds: string[] | undefined) {
  if (!conceptIds?.length) return;
  const concepts = await prisma.concept.findMany({ where: { id: { in: conceptIds } } });
  if (concepts.length !== conceptIds.length || concepts.some((c) => c.skillId !== skillId)) {
    throw new Error("CONCEPT_SKILL_MISMATCH");
  }
}

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
  const { topicId, skillId, skillRoleId, conceptId, status, difficulty } = req.query;

  const filters = {
    ...(topicId && { topicId: String(topicId) }),
    ...(skillId && { skillId: String(skillId) }),
    ...(skillRoleId && { skillRoles: { some: { skillRoleId: String(skillRoleId) } } }),
    ...(conceptId && { concepts: { some: { conceptId: String(conceptId) } } }),
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
    const { skillRoleIds, conceptIds, ...fields } = questionSchema.parse(req.body);
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
    try {
      await assertConceptIdsForSkill(fields.skillId, conceptIds);
    } catch {
      res.status(400).json({ error: "One or more conceptIds do not belong to the given skillId" });
      return;
    }
    res.status(201).json(
      await prisma.question.create({
        data: {
          ...fields,
          skillRoles: { create: skillRoleIds.map((skillRoleId) => ({ skillRoleId })) },
          ...(conceptIds?.length
            ? { concepts: { create: conceptIds.map((conceptId) => ({ conceptId })) } }
            : {}),
        },
        include: includeRoles,
      })
    );
  } catch (e) {
    next(e);
  }
});

questionsRouter.post("/bulk/publish", async (req, res, next) => {
  try {
    const user = getUser(req);
    const { questionIds } = questionBulkPublishSchema.parse(req.body);
    const rows = await prisma.question.findMany({
      where: { id: { in: questionIds } },
      select: { id: true, skillId: true, topicId: true, status: true },
    });
    if (rows.length !== questionIds.length) {
      res.status(400).json({ error: "One or more questionIds not found" });
      return;
    }
    let published = 0;
    let skipped = 0;
    for (const row of rows) {
      if (!(await assertQuestionAccess(user.id, user.role, row.skillId, row.topicId))) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (row.status === "published") {
        skipped++;
        continue;
      }
      await prisma.question.update({
        where: { id: row.id },
        data: { status: "published" },
      });
      published++;
    }
    res.json({ published, skipped, total: rows.length });
  } catch (e) {
    next(e);
  }
});

questionsRouter.post("/bulk/draft", async (req, res, next) => {
  try {
    const user = getUser(req);
    const { questionIds } = questionBulkDraftSchema.parse(req.body);
    const rows = await prisma.question.findMany({
      where: { id: { in: questionIds } },
      select: { id: true, skillId: true, topicId: true, status: true },
    });
    if (rows.length !== questionIds.length) {
      res.status(400).json({ error: "One or more questionIds not found" });
      return;
    }
    let drafted = 0;
    let skipped = 0;
    for (const row of rows) {
      if (!(await assertQuestionAccess(user.id, user.role, row.skillId, row.topicId))) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (row.status === "draft") {
        skipped++;
        continue;
      }
      await prisma.question.update({
        where: { id: row.id },
        data: { status: "draft" },
      });
      drafted++;
    }
    res.json({ drafted, skipped, total: rows.length });
  } catch (e) {
    next(e);
  }
});

questionsRouter.post("/bulk/skill-roles", async (req, res, next) => {
  try {
    const user = getUser(req);
    const { questionIds, skillRoleIds, mode } = questionBulkSkillRolesSchema.parse(req.body);
    const rows = await prisma.question.findMany({
      where: { id: { in: questionIds } },
      include: { skillRoles: { select: { skillRoleId: true } } },
    });
    if (rows.length !== questionIds.length) {
      res.status(400).json({ error: "One or more questionIds not found" });
      return;
    }

    const skillIds = new Set(rows.map((r) => r.skillId));
    if (skillIds.size !== 1) {
      res.status(400).json({ error: "All questions in a bulk role update must belong to the same skill" });
      return;
    }
    const skillId = rows[0]!.skillId;

    for (const row of rows) {
      if (!(await assertQuestionAccess(user.id, user.role, row.skillId, row.topicId))) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const roles = await prisma.skillRole.findMany({ where: { id: { in: skillRoleIds } } });
    if (roles.length !== skillRoleIds.length || roles.some((r) => r.skillId !== skillId)) {
      res.status(400).json({ error: "One or more skillRoleIds do not belong to the questions' skill" });
      return;
    }

    let updated = 0;
    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const targetRoleIds =
          mode === "add"
            ? [...new Set([...row.skillRoles.map((r) => r.skillRoleId), ...skillRoleIds])]
            : skillRoleIds;
        await tx.questionSkillRole.deleteMany({ where: { questionId: row.id } });
        if (targetRoleIds.length > 0) {
          await tx.questionSkillRole.createMany({
            data: targetRoleIds.map((skillRoleId) => ({ questionId: row.id, skillRoleId })),
          });
        }
        updated++;
      }
    });

    res.json({ updated, mode, skillRoleIds });
  } catch (e) {
    next(e);
  }
});

questionsRouter.post("/bulk/concepts", async (req, res, next) => {
  try {
    const user = getUser(req);
    const { questionIds, conceptIds, mode } = questionBulkConceptsSchema.parse(req.body);
    if (mode === "add" && conceptIds.length === 0) {
      res.status(400).json({ error: "conceptIds required for add mode" });
      return;
    }
    const rows = await prisma.question.findMany({
      where: { id: { in: questionIds } },
      include: { concepts: { select: { conceptId: true } } },
    });
    if (rows.length !== questionIds.length) {
      res.status(400).json({ error: "One or more questionIds not found" });
      return;
    }

    const skillIds = new Set(rows.map((r) => r.skillId));
    if (skillIds.size !== 1) {
      res.status(400).json({ error: "All questions in a bulk concept update must belong to the same skill" });
      return;
    }
    const skillId = rows[0]!.skillId;

    for (const row of rows) {
      if (!(await assertQuestionAccess(user.id, user.role, row.skillId, row.topicId))) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    try {
      await assertConceptIdsForSkill(skillId, conceptIds);
    } catch {
      res.status(400).json({ error: "One or more conceptIds do not belong to the questions' skill" });
      return;
    }

    let updated = 0;
    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const targetConceptIds =
          mode === "add"
            ? [...new Set([...row.concepts.map((c) => c.conceptId), ...conceptIds])]
            : conceptIds;
        await tx.questionConcept.deleteMany({ where: { questionId: row.id } });
        if (targetConceptIds.length > 0) {
          await tx.questionConcept.createMany({
            data: targetConceptIds.map((conceptId) => ({ questionId: row.id, conceptId })),
          });
        }
        updated++;
      }
    });

    res.json({ updated, mode, conceptIds });
  } catch (e) {
    next(e);
  }
});

questionsRouter.post("/bulk/delete", async (req, res, next) => {
  try {
    const user = getUser(req);
    const { questionIds } = questionBulkDeleteSchema.parse(req.body);
    const rows = await prisma.question.findMany({
      where: { id: { in: questionIds } },
      select: { id: true, skillId: true, topicId: true },
    });
    if (rows.length !== questionIds.length) {
      res.status(400).json({ error: "One or more questionIds not found" });
      return;
    }

    for (const row of rows) {
      if (!(await assertQuestionAccess(user.id, user.role, row.skillId, row.topicId))) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    let deleted = 0;
    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        await tx.questionSkillRole.deleteMany({ where: { questionId: row.id } });
        await tx.attemptAnswer.deleteMany({ where: { questionId: row.id } });
        await tx.question.delete({ where: { id: row.id } });
        deleted++;
      }
    });

    res.json({ deleted });
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
    const { skillRoleIds, conceptIds, ...fields } = questionUpdateSchema.parse(req.body);
    const targetSkillId = fields.skillId ?? existing.skillId;
    const targetTopicId = fields.topicId ?? existing.topicId;
    if (!(await assertQuestionAccess(user.id, user.role, targetSkillId, targetTopicId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    if (skillRoleIds) {
      const roles = await prisma.skillRole.findMany({ where: { id: { in: skillRoleIds } } });
      const invalid = roles.filter((r) => r.skillId !== targetSkillId);
      if (invalid.length || roles.length !== skillRoleIds.length) {
        res.status(400).json({ error: "One or more skillRoleIds do not belong to the question's skill" });
        return;
      }
    }

    if (conceptIds) {
      try {
        await assertConceptIdsForSkill(targetSkillId, conceptIds);
      } catch {
        res.status(400).json({ error: "One or more conceptIds do not belong to the question's skill" });
        return;
      }
    }

    const roleUpdate = skillRoleIds
      ? {
          skillRoles: {
            deleteMany: {},
            create: skillRoleIds.map((skillRoleId) => ({ skillRoleId })),
          },
        }
      : {};

    const conceptUpdate = conceptIds
      ? {
          concepts: {
            deleteMany: {},
            create: conceptIds.map((conceptId) => ({ conceptId })),
          },
        }
      : {};

    res.json(
      await prisma.question.update({
        where: { id: req.params.id },
        data: { ...fields, ...roleUpdate, ...conceptUpdate } as never,
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
    await prisma.$transaction([
      prisma.questionSkillRole.deleteMany({ where: { questionId: req.params.id } }),
      prisma.attemptAnswer.deleteMany({ where: { questionId: req.params.id } }),
      prisma.question.delete({ where: { id: req.params.id } }),
    ]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
