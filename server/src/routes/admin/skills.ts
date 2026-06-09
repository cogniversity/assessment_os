import { Router } from "express";
import { skillSchema, skillUpdateSchema, skillRoleSchema, Role } from "@assessment-os/shared";
import { prisma } from "../../db.js";
import { getUser } from "../../middleware/auth.js";
import { getManagerSkillIds } from "../../services/managerSkills.js";

export const skillsRouter = Router();

function normalizeSkillCode(code: string): string {
  return code.trim();
}

// ── Skills ────────────────────────────────────────────────────────────────────

skillsRouter.get("/", async (req, res) => {
  const user = getUser(req);
  let where = {};
  if (user.role === Role.CAPABILITY_MANAGER) {
    const skillIds = await getManagerSkillIds(user.id);
    where = { id: { in: skillIds } };
  }
  res.json(
    await prisma.skill.findMany({
      where,
      orderBy: { code: "asc" },
      include: { _count: { select: { roles: true, questions: true } } },
    })
  );
});

skillsRouter.post("/", async (req, res, next) => {
  try {
    const data = skillSchema.parse(req.body);
    res.status(201).json(await prisma.skill.create({ data }));
  } catch (e) {
    next(e);
  }
});

skillsRouter.get("/:id", async (req, res) => {
  const skill = await prisma.skill.findUnique({
    where: { id: req.params.id },
    include: {
      _count: { select: { roles: true, questions: true, blueprints: true, assessments: true } },
    },
  });
  if (!skill) {
    res.status(404).json({ error: "Skill not found" });
    return;
  }
  res.json(skill);
});

skillsRouter.put("/:id", async (req, res, next) => {
  try {
    const data = skillSchema.parse(req.body);
    res.json(await prisma.skill.update({ where: { id: req.params.id }, data }));
  } catch (e) {
    next(e);
  }
});

/** Partial update — change skill code (Skill ID), name, or description */
skillsRouter.patch("/:id", async (req, res, next) => {
  try {
    const data = skillUpdateSchema.parse(req.body);
    const id = req.params.id;

    const existing = await prisma.skill.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Skill not found" });
      return;
    }

    const update: { code?: string; name?: string; description?: string | null } = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.description !== undefined) update.description = data.description ?? null;

    if (data.code !== undefined) {
      const code = normalizeSkillCode(data.code);
      if (code !== existing.code) {
        const conflict = await prisma.skill.findFirst({
          where: { code, NOT: { id } },
        });
        if (conflict) {
          res.status(409).json({ error: `Skill code "${code}" is already used by another skill` });
          return;
        }
      }
      update.code = code;
    }

    if (Object.keys(update).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const updated = await prisma.skill.update({ where: { id }, data: update });
    res.json({
      ...updated,
      _message:
        update.code && update.code !== existing.code
          ? `Skill ID updated from ${existing.code} to ${update.code}. Questions, blueprints, and assignments stay linked (by internal id). Re-download the question import template if you use ${existing.code} in spreadsheets.`
          : undefined,
    });
  } catch (e) {
    next(e);
  }
});

skillsRouter.delete("/:id", async (req, res) => {
  const id = req.params.id;
  const counts = await prisma.skill.findUnique({
    where: { id },
    include: {
      _count: { select: { questions: true, blueprints: true, assessments: true } },
    },
  });
  if (!counts) {
    res.status(404).json({ error: "Skill not found" });
    return;
  }
  const { questions, blueprints, assessments } = counts._count;
  if (questions + blueprints + assessments > 0) {
    res.status(409).json({
      error: `Cannot delete skill: ${questions} question(s), ${blueprints} blueprint(s), ${assessments} assignment(s) still reference it`,
    });
    return;
  }
  await prisma.skill.delete({ where: { id } });
  res.json({ ok: true });
});

// ── Skill roles (per skill) ───────────────────────────────────────────────────

skillsRouter.get("/:skillId/roles", async (req, res) => {
  const user = getUser(req);
  if (user.role === Role.CAPABILITY_MANAGER) {
    const skillIds = await getManagerSkillIds(user.id);
    if (!skillIds.includes(req.params.skillId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }
  const roles = await prisma.skillRole.findMany({
    where: { skillId: req.params.skillId },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  // Attach question count per role via a separate aggregate query (avoids
  // the _count.questionRoles junction type which is not reliably in the
  // generated Prisma client count output type).
  const counts = await prisma.questionSkillRole.groupBy({
    by: ["skillRoleId"],
    where: { skillRoleId: { in: roles.map((r) => r.id) } },
    _count: { skillRoleId: true },
  });
  const countMap = Object.fromEntries(counts.map((c) => [c.skillRoleId, c._count.skillRoleId]));
  res.json(roles.map((r) => ({ ...r, questionCount: countMap[r.id] ?? 0 })));
});

skillsRouter.post("/:skillId/roles", async (req, res, next) => {
  try {
    const data = skillRoleSchema.parse({ ...req.body, skillId: req.params.skillId });
    res.status(201).json(await prisma.skillRole.create({ data }));
  } catch (e) {
    next(e);
  }
});

skillsRouter.patch("/:skillId/roles/:roleId", async (req, res, next) => {
  try {
    const data = skillRoleSchema.partial().omit({ skillId: true }).parse(req.body);
    const role = await prisma.skillRole.findFirst({
      where: { id: req.params.roleId, skillId: req.params.skillId },
    });
    if (!role) {
      res.status(404).json({ error: "Skill role not found" });
      return;
    }
    if (data.code !== undefined && data.code !== role.code) {
      const conflict = await prisma.skillRole.findFirst({
        where: {
          skillId: req.params.skillId,
          code: data.code,
          NOT: { id: req.params.roleId },
        },
      });
      if (conflict) {
        res.status(409).json({ error: `Role code "${data.code}" already exists for this skill` });
        return;
      }
    }
    res.json(
      await prisma.skillRole.update({
        where: { id: req.params.roleId },
        data,
      })
    );
  } catch (e) {
    next(e);
  }
});

skillsRouter.put("/:skillId/roles/:roleId", async (req, res, next) => {
  try {
    const data = skillRoleSchema.partial().omit({ skillId: true }).parse(req.body);
    res.json(
      await prisma.skillRole.update({
        where: { id: req.params.roleId },
        data,
      })
    );
  } catch (e) {
    next(e);
  }
});

skillsRouter.delete("/:skillId/roles/:roleId", async (req, res, next) => {
  try {
    await prisma.skillRole.delete({ where: { id: req.params.roleId } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
