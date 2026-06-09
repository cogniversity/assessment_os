import { Router } from "express";
import { topicSchema } from "@assessment-os/shared";
import { prisma } from "../../db.js";

export const topicsRouter = Router();

topicsRouter.get("/", async (req, res) => {
  const categoryId = req.query.categoryId as string | undefined;
  res.json(
    await prisma.topic.findMany({
      where: categoryId ? { categoryId } : undefined,
      include: { category: true, _count: { select: { questions: true } } },
    })
  );
});

topicsRouter.post("/", async (req, res, next) => {
  try {
    const data = topicSchema.parse(req.body);
    res.status(201).json(
      await prisma.topic.create({
        data: {
          ...data,
          proficiencyThresholds: data.proficiencyThresholds ?? [40, 55, 70, 85, 95],
        },
      })
    );
  } catch (e) {
    next(e);
  }
});

topicsRouter.put("/:id", async (req, res, next) => {
  try {
    const data = topicSchema.parse(req.body);
    res.json(await prisma.topic.update({ where: { id: req.params.id }, data }));
  } catch (e) {
    next(e);
  }
});

topicsRouter.delete("/:id", async (req, res) => {
  await prisma.topic.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
