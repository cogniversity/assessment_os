import { Router } from "express";
import { prisma } from "../../db.js";
import { z } from "zod";
import { provisionCandidateUser } from "../../services/userProvision.js";

const roleEnum = z.enum(["admin", "capability_manager", "candidate"]);

export const usersRouter = Router();

usersRouter.get("/", async (req, res) => {
  const q = (req.query.q as string) || "";
  const role = req.query.role as string | undefined;
  res.json(
    await prisma.user.findMany({
      where: {
        ...(role && { roles: { has: role as never } }),
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
        roles: { has: "candidate" },
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
        role: roleEnum.default("candidate"),
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

usersRouter.patch("/:id/roles", async (req, res, next) => {
  try {
    const { roles } = z
      .object({
        roles: z.array(roleEnum).min(1),
      })
      .parse(req.body);
    res.json(
      await prisma.user.update({
        where: { id: req.params.id },
        data: { roles },
      })
    );
  } catch (e) {
    next(e);
  }
});

/** @deprecated use PATCH /:id/roles */
usersRouter.patch("/:id/role", async (req, res, next) => {
  try {
    const { role } = z.object({ role: roleEnum }).parse(req.body);
    res.json(
      await prisma.user.update({
        where: { id: req.params.id },
        data: { roles: [role] },
      })
    );
  } catch (e) {
    next(e);
  }
});
