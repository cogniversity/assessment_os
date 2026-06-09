import { Router } from "express";
import { questionSchema } from "@assessment-os/shared";
import { prisma } from "../../db.js";

export const questionsRouter = Router();

const includeRoles = {
  topic: { include: { category: true } },
  skill: true,
  skillRoles: { include: { skillRole: true } },
} as const;

questionsRouter.get("/", async (req, res) => {
  const { topicId, skillId, skillRoleId, status, difficulty } = req.query;
  res.json(
    await prisma.question.findMany({
      where: {
        ...(topicId    && { topicId:    String(topicId) }),
        ...(skillId    && { skillId:    String(skillId) }),
        ...(skillRoleId && { skillRoles: { some: { skillRoleId: String(skillRoleId) } } }),
        ...(status     && { status:     status as "draft" | "published" }),
        ...(difficulty && { difficulty: difficulty as never }),
      },
      include: includeRoles,
      orderBy: { createdAt: "desc" },
    })
  );
});

questionsRouter.post("/", async (req, res, next) => {
  try {
    const { skillRoleIds, ...fields } = questionSchema.parse(req.body);
    if (fields.correctIndices.some((i) => i >= fields.options.length)) {
      res.status(400).json({ error: "correctIndices out of range" });
      return;
    }
    // Validate all skillRoleIds belong to skillId
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
    const { skillRoleIds, ...fields } = questionSchema.partial().parse(req.body);

    // If roles are being updated, replace the entire set
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

questionsRouter.patch("/:id/publish", async (req, res) => {
  res.json(
    await prisma.question.update({
      where: { id: req.params.id },
      data: { status: "published" },
      include: includeRoles,
    })
  );
});

questionsRouter.delete("/:id", async (req, res) => {
  await prisma.question.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
