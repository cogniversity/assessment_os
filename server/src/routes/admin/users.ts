import { Router } from "express";
import { prisma } from "../../db.js";
import { z } from "zod";
import { provisionCandidateUser } from "../../services/userProvision.js";

export const usersRouter = Router();

usersRouter.get("/", async (req, res) => {
  const q = (req.query.q as string) || "";
  const role = req.query.role as string | undefined;
  res.json(
    await prisma.user.findMany({
      where: {
        ...(role && { role: role as never }),
        ...(q && {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        }),
      },
      include: { profile: true },
      orderBy: { name: "asc" },
    })
  );
});

usersRouter.get("/candidates", async (req, res) => {
  const q = (req.query.q as string) || "";
  res.json(
    await prisma.user.findMany({
      where: {
        role: "candidate",
        ...(q && {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { profile: { employeeId: { contains: q, mode: "insensitive" } } },
            { profile: { employeeName: { contains: q, mode: "insensitive" } } },
            { profile: { country: { contains: q, mode: "insensitive" } } },
          ],
        }),
      },
      include: { profile: true },
    })
  );
});

/** Create or link local user + empty staffing profile (before first login). */
usersRouter.post("/provision", async (req, res, next) => {
  try {
    const { email, name, role } = z
      .object({
        email: z.string().email(),
        name: z.string().min(1).optional(),
        role: z.enum(["admin", "capability_manager", "candidate"]).default("candidate"),
      })
      .parse(req.body);

    if (role !== "candidate") {
      res.status(400).json({ error: "Use Users page to change non-candidate roles." });
      return;
    }
    const user = await provisionCandidateUser({ email, name });
    res.status(201).json(user);
  } catch (e) {
    next(e);
  }
});

usersRouter.patch("/:id/role", async (req, res, next) => {
  try {
    const { role } = z.object({ role: z.enum(["admin", "capability_manager", "candidate"]) }).parse(req.body);
    res.json(await prisma.user.update({ where: { id: req.params.id }, data: { role } }));
  } catch (e) {
    next(e);
  }
});
