import { Router } from "express";
import multer from "multer";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../db.js";
import { photoPath } from "../services/storage.js";

export const photosRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

photosRouter.post("/attempts/:attemptId", requireAuth, upload.single("photo"), async (req, res, next) => {
  try {
    const user = (req as { user: { id: string } }).user;
    const attemptId = String(req.params.attemptId);
    const attempt = await prisma.assessmentAttempt.findUnique({
      where: { id: attemptId },
      include: { assessment: true },
    });
    if (!attempt || attempt.assessment.userId !== user.id) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (attempt.status !== "in_progress") {
      res.status(400).json({ error: "Not in progress" });
      return;
    }
    const filename = `${attempt.id}-${uuidv4()}.jpg`;
    await fs.writeFile(photoPath(filename), req.file!.buffer);
    const rawKind = req.body?.kind;
    const kind = rawKind === "periodic" ? "periodic" : "start";
    const photo = await prisma.attemptPhoto.create({
      data: { attemptId: attempt.id, filePath: filename, kind },
    });
    res.status(201).json(photo);
  } catch (e) {
    next(e);
  }
});

photosRouter.get("/:filename", requireAuth, async (req, res, next) => {
  try {
    const filename = String(req.params.filename);
    const photo = await prisma.attemptPhoto.findFirst({
      where: { filePath: filename },
      include: { attempt: { include: { assessment: true } } },
    });
    if (!photo) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const user = (req as { user: { id: string; role: string } }).user;
    const can =
      user.role === "admin" ||
      photo.attempt.assessment.userId === user.id ||
      (user.role === "capability_manager" &&
        photo.attempt.assessment.assignedById === user.id);
    if (!can) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const buf = await fs.readFile(photoPath(photo.filePath));
    res.type(path.extname(photo.filePath) === ".png" ? "image/png" : "image/jpeg");
    res.send(buf);
  } catch (e) {
    next(e);
  }
});
