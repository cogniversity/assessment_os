import { Router } from "express";
import { profileFieldDefSchema } from "@assessment-os/shared";
import { prisma } from "../../db.js";

export const profileFieldsRouter = Router();

profileFieldsRouter.get("/", async (_req, res) => {
  res.json(await prisma.profileFieldDefinition.findMany({ orderBy: { displayOrder: "asc" } }));
});

profileFieldsRouter.post("/", async (req, res, next) => {
  try {
    const data = profileFieldDefSchema.parse(req.body);
    res.status(201).json(await prisma.profileFieldDefinition.create({ data: { ...data, options: data.options ?? undefined } }));
  } catch (e) {
    next(e);
  }
});

profileFieldsRouter.put("/:id", async (req, res, next) => {
  try {
    const data = profileFieldDefSchema.partial().parse(req.body);
    res.json(await prisma.profileFieldDefinition.update({ where: { id: req.params.id }, data }));
  } catch (e) {
    next(e);
  }
});

profileFieldsRouter.delete("/:id", async (req, res) => {
  await prisma.profileFieldDefinition.update({
    where: { id: req.params.id },
    data: { active: false },
  });
  res.json({ ok: true });
});
