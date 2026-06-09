import { Router } from "express";
import { categorySchema } from "@assessment-os/shared";
import { prisma } from "../../db.js";

export const categoriesRouter = Router();

categoriesRouter.get("/", async (_req, res) => {
  res.json(await prisma.category.findMany({ include: { _count: { select: { topics: true } } } }));
});

categoriesRouter.post("/", async (req, res, next) => {
  try {
    const data = categorySchema.parse(req.body);
    res.status(201).json(await prisma.category.create({ data }));
  } catch (e) {
    next(e);
  }
});

categoriesRouter.put("/:id", async (req, res, next) => {
  try {
    const data = categorySchema.parse(req.body);
    res.json(await prisma.category.update({ where: { id: req.params.id }, data }));
  } catch (e) {
    next(e);
  }
});

categoriesRouter.delete("/:id", async (req, res) => {
  await prisma.category.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
