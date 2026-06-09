import { Router } from "express";
import { prisma } from "../../db.js";

export const managerSkillsRouter = Router();

/** List all manager–skill assignments with user and skill names */
managerSkillsRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.managerSkill.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
        skill: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ user: { name: "asc" } }, { skill: { name: "asc" } }],
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

/** Assign a skill to a manager */
managerSkillsRouter.post("/", async (req, res, next) => {
  try {
    const { userId, skillId } = req.body as { userId: string; skillId: string };
    if (!userId || !skillId) {
      res.status(400).json({ error: "userId and skillId are required" });
      return;
    }
    const row = await prisma.managerSkill.create({
      data: { userId, skillId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        skill: { select: { id: true, name: true, code: true } },
      },
    });
    res.status(201).json(row);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "P2002") {
      res.status(409).json({ error: "This skill is already assigned to this manager" });
      return;
    }
    next(e);
  }
});

/** Remove a manager–skill link */
managerSkillsRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.managerSkill.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
