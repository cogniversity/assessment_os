import { Router } from "express";
import { blueprintSchema, Role } from "@assessment-os/shared";
import { prisma } from "../../db.js";
import { getUser } from "../../middleware/auth.js";
import { getManagerSkillIds } from "../../services/managerSkills.js";

export const blueprintsRouter = Router();

const includeAll = {
  skill: true,
  topics: { include: { topic: { include: { category: true } } } },
  skillRole: true,
  createdBy: { select: { id: true, name: true } },
  _count: { select: { assessments: true } },
} as const;

async function managerHasSkill(userId: string, skillId: string): Promise<boolean> {
  const skillIds = await getManagerSkillIds(userId);
  return skillIds.includes(skillId);
}

async function assertBlueprintWriteAccess(
  user: { id: string; role: string },
  skillId: string
): Promise<boolean> {
  if (user.role === Role.ADMIN) return true;
  return managerHasSkill(user.id, skillId);
}

blueprintsRouter.get("/", async (req, res, next) => {
  try {
    const user = getUser(req);
    let where = {};
    if (user.role === Role.CAPABILITY_MANAGER) {
      const skillIds = await getManagerSkillIds(user.id);
      where = { skillId: { in: skillIds } };
    }
    res.json(await prisma.assessmentBlueprint.findMany({ where, include: includeAll, orderBy: { name: "asc" } }));
  } catch (e) {
    next(e);
  }
});

blueprintsRouter.get("/:id", async (req, res, next) => {
  try {
    const user = getUser(req);
    const bp = await prisma.assessmentBlueprint.findUnique({ where: { id: req.params.id }, include: includeAll });
    if (!bp) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (user.role === Role.CAPABILITY_MANAGER && !(await managerHasSkill(user.id, bp.skillId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    res.json(bp);
  } catch (e) {
    next(e);
  }
});

blueprintsRouter.post("/", async (req, res, next) => {
  try {
    const data = blueprintSchema.parse(req.body);
    const user = getUser(req);

    if (!(await assertBlueprintWriteAccess(user, data.skillId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const role = await prisma.skillRole.findUnique({ where: { id: data.skillRoleId } });
    if (!role || role.skillId !== data.skillId) {
      res.status(400).json({ error: "skillRoleId does not belong to the given skillId" });
      return;
    }

    const { topicIds, proficiencyThresholds, ...rest } = data;
    const questionCount = rest.easyCount + rest.mediumCount + rest.hardCount;

    const bp = await prisma.assessmentBlueprint.create({
      data: {
        ...rest,
        questionCount,
        proficiencyThresholds: proficiencyThresholds ?? [40, 55, 70, 85, 95],
        createdById: user.id,
        topics: { create: topicIds.map((topicId) => ({ topicId })) },
      },
      include: includeAll,
    });
    res.status(201).json(bp);
  } catch (e) {
    next(e);
  }
});

blueprintsRouter.put("/:id", async (req, res, next) => {
  try {
    const user = getUser(req);
    const existing = await prisma.assessmentBlueprint.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const raw = blueprintSchema.partial().parse(req.body);
    const targetSkillId = raw.skillId ?? existing.skillId;
    if (!(await assertBlueprintWriteAccess(user, targetSkillId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { topicIds, proficiencyThresholds, easyCount, mediumCount, hardCount, ...rest } = raw;

    let questionCount: number | undefined;
    if (easyCount !== undefined || mediumCount !== undefined || hardCount !== undefined) {
      const easy = easyCount ?? existing.easyCount;
      const medium = mediumCount ?? existing.mediumCount;
      const hard = hardCount ?? existing.hardCount;
      questionCount = easy + medium + hard;
    }

    const updateData: Record<string, unknown> = {
      ...rest,
      ...(easyCount !== undefined && { easyCount }),
      ...(mediumCount !== undefined && { mediumCount }),
      ...(hardCount !== undefined && { hardCount }),
      ...(questionCount !== undefined && { questionCount }),
      ...(proficiencyThresholds !== undefined && { proficiencyThresholds }),
    };

    if (topicIds !== undefined) {
      await prisma.blueprintTopic.deleteMany({ where: { blueprintId: req.params.id } });
      await prisma.blueprintTopic.createMany({
        data: topicIds.map((topicId) => ({ blueprintId: req.params.id, topicId })),
      });
    }

    res.json(
      await prisma.assessmentBlueprint.update({
        where: { id: req.params.id },
        data: updateData,
        include: includeAll,
      })
    );
  } catch (e) {
    next(e);
  }
});

blueprintsRouter.delete("/:id", async (req, res, next) => {
  try {
    const user = getUser(req);
    const existing = await prisma.assessmentBlueprint.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!(await assertBlueprintWriteAccess(user, existing.skillId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await prisma.assessmentBlueprint.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
