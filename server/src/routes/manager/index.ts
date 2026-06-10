import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { Role } from "@assessment-os/shared";
import { prisma } from "../../db.js";
import { remarkSchema, proficiencyOverrideSchema } from "@assessment-os/shared";
import { updateProfile, overrideProficiency, ensureProfile } from "../../services/profileService.js";
import { getManagerSkillIds } from "../../services/managerSkills.js";
import { getManagerQuestionBankGrants } from "../../services/managerQuestionBanks.js";

export const managerRouter = Router();
managerRouter.use(requireAuth, requireRole(Role.ADMIN, Role.CAPABILITY_MANAGER));

managerRouter.get("/skills", async (req, res, next) => {
  try {
    const user = (req as { user: { id: string; role: string } }).user;
    if (user.role === Role.ADMIN) {
      res.json(await prisma.managerSkill.findMany({
        include: { skill: { select: { id: true, name: true, code: true } } },
        orderBy: { skill: { name: "asc" } },
      }));
      return;
    }
    const rows = await prisma.managerSkill.findMany({
      where: { userId: user.id },
      include: { skill: { select: { id: true, name: true, code: true } } },
      orderBy: { skill: { name: "asc" } },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

managerRouter.get("/question-banks", async (req, res, next) => {
  try {
    const user = (req as { user: { id: string; role: string } }).user;
    const rows = await prisma.managerQuestionBank.findMany({
      where: user.role === Role.ADMIN ? {} : { userId: user.id },
      include: {
        skill: { select: { id: true, name: true, code: true } },
        topic: { select: { id: true, name: true, category: { select: { name: true } } } },
      },
      orderBy: [{ skill: { name: "asc" } }, { topic: { name: "asc" } }],
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

managerRouter.get("/candidates", async (req, res) => {
  const user = (req as { user: { id: string; role: string } }).user;
  const q = (req.query.q as string) || "";

  let assessmentSkillFilter: object | undefined;
  if (user.role === Role.CAPABILITY_MANAGER) {
    const skillIds = await getManagerSkillIds(user.id);
    assessmentSkillFilter = { some: { skillId: { in: skillIds } } };
  }

  res.json(
    await prisma.user.findMany({
      where: {
        role: "candidate",
        ...(assessmentSkillFilter ? { assessments: assessmentSkillFilter } : {}),
        ...(q && {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { profile: { employeeId: { contains: q, mode: "insensitive" } } },
          ],
        }),
      },
      include: {
        profile: true,
        assessments: {
          include: {
            skill: true,
            topics: { include: { topic: true } },
            attempts: { where: { status: { in: ["completed", "timed_out"] } } },
          },
        },
      },
    })
  );
});

managerRouter.get("/candidates/:userId", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.userId },
    include: {
      profile: true,
      externalCertificates: true,
      assessments: {
        include: {
          skill: true,
          skillRole: true,
          topics: { include: { topic: true } },
          attempts: true,
        },
      },
      remarksReceived: {
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const actor = (req as { user: { id: string; role: string } }).user;
  const remarks = user.remarksReceived.filter(
    (r) => r.visibility === "normal" || actor.role === Role.ADMIN || actor.role === Role.CAPABILITY_MANAGER
  );
  res.json({ ...user, remarksReceived: remarks });
});

managerRouter.patch("/candidates/:userId/profile", async (req, res, next) => {
  try {
    const actor = (req as { user: { id: string } }).user;
    const profile = await updateProfile(req.params.userId, actor.id, req.body, req.body.changeReason);
    res.json(profile);
  } catch (e) {
    next(e);
  }
});

managerRouter.post("/candidates/:userId/proficiency", async (req, res, next) => {
  try {
    const actor = (req as { user: { id: string } }).user;
    const { proficiency, changeReason } = proficiencyOverrideSchema.parse(req.body);
    const profile = await overrideProficiency(req.params.userId, actor.id, proficiency, changeReason);
    res.json(profile);
  } catch (e) {
    next(e);
  }
});

managerRouter.post("/candidates/:userId/remarks", async (req, res, next) => {
  try {
    const actor = (req as { user: { id: string } }).user;
    const data = remarkSchema.parse(req.body);
    const remark = await prisma.candidateRemark.create({
      data: {
        candidateUserId: req.params.userId,
        authorUserId: actor.id,
        visibility: data.visibility,
        comment: data.comment,
      },
      include: { author: { select: { name: true } } },
    });
    res.status(201).json(remark);
  } catch (e) {
    next(e);
  }
});

managerRouter.get("/results", async (req, res) => {
  const user = (req as { user: { id: string; role: string } }).user;
  let where = {};
  if (user.role === Role.CAPABILITY_MANAGER) {
    const skillIds = await getManagerSkillIds(user.id);
    where = { skillId: { in: skillIds } };
  }
  const attempts = await prisma.assessmentAttempt.findMany({
    where: {
      status: { in: ["completed", "timed_out"] },
      assessment: where,
    },
    include: {
      assessment: {
        include: {
          skill: true,
          topics: { include: { topic: true } },
          user: { include: { profile: true } },
        },
      },
      proctoringEvents: true,
      photos: true,
    },
    orderBy: { completedAt: "desc" },
  });
  res.json(attempts);
});
