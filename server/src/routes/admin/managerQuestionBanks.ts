import { Router } from "express";
import { prisma } from "../../db.js";

export const managerQuestionBanksRouter = Router();

const includeAll = {
  user: { select: { id: true, name: true, email: true } },
  skill: { select: { id: true, name: true, code: true } },
  topic: { select: { id: true, name: true, category: { select: { name: true } } } },
} as const;

managerQuestionBanksRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.managerQuestionBank.findMany({
      include: includeAll,
      orderBy: [{ user: { name: "asc" } }, { skill: { name: "asc" } }, { topic: { name: "asc" } }],
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

managerQuestionBanksRouter.post("/", async (req, res, next) => {
  try {
    const { userId, skillId, topicId } = req.body as {
      userId?: string;
      skillId?: string;
      topicId?: string;
    };
    if (!userId || !skillId || !topicId) {
      res.status(400).json({ error: "userId, skillId, and topicId are required" });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== "capability_manager") {
      res.status(400).json({ error: "userId must be a capability manager" });
      return;
    }
    const row = await prisma.managerQuestionBank.create({
      data: { userId, skillId, topicId },
      include: includeAll,
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

managerQuestionBanksRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.managerQuestionBank.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
