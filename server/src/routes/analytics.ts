import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Role } from "@assessment-os/shared";
import { prisma } from "../db.js";
import { getManagerSkillIds } from "../services/managerSkills.js";
import { aggregateConceptTrends } from "../services/conceptAnalyticsService.js";

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth, requireRole(Role.ADMIN, Role.CAPABILITY_MANAGER));

async function assessmentFilter(user: { id: string; role: string }): Promise<object> {
  if (user.role !== Role.CAPABILITY_MANAGER) return {};
  const skillIds = await getManagerSkillIds(user.id);
  return { skillId: { in: skillIds } };
}

analyticsRouter.get("/summary", async (req, res) => {
  const user = (req as { user: { id: string; role: string } }).user;
  const af = await assessmentFilter(user);
  const assessments = await prisma.assessment.count({ where: af });
  const attempts = await prisma.assessmentAttempt.findMany({
    where: {
      status: { in: ["completed", "timed_out"] },
      assessment: af,
    },
    include: { assessment: true },
  });
  const passed = attempts.filter(
    (a) => a.score !== null && a.score >= a.assessment.passMark
  ).length;
  const avg =
    attempts.length > 0
      ? Math.round(attempts.reduce((s, a) => s + (a.score || 0), 0) / attempts.length)
      : 0;
  const candidates = new Set(attempts.map((a) => a.assessment.userId)).size;
  res.json({
    totalAssessments: assessments,
    candidatesAssessed: candidates,
    passRate: attempts.length ? Math.round((passed / attempts.length) * 100) : 0,
    averageScore: avg,
  });
});

analyticsRouter.get("/pass-rates", async (req, res) => {
  const user = (req as { user: { id: string; role: string } }).user;
  const af = await assessmentFilter(user);
  const topics = await prisma.topic.findMany();
  const data = [];
  for (const topic of topics) {
    const attempts = await prisma.assessmentAttempt.findMany({
      where: {
        status: { in: ["completed", "timed_out"] },
        assessment: {
          ...af,
          topics: { some: { topicId: topic.id } },
        },
      },
      include: { assessment: true },
    });
    if (!attempts.length) continue;
    const passed = attempts.filter((a) => (a.score || 0) >= a.assessment.passMark).length;
    data.push({ topic: topic.name, passRate: Math.round((passed / attempts.length) * 100) });
  }
  res.json(data);
});

analyticsRouter.get("/score-distribution", async (req, res) => {
  const user = (req as { user: { id: string; role: string } }).user;
  const af = await assessmentFilter(user);
  const attempts = await prisma.assessmentAttempt.findMany({
    where: { status: { in: ["completed", "timed_out"] }, assessment: af },
    select: { score: true },
  });
  const buckets = [0, 0, 0, 0, 0];
  for (const a of attempts) {
    const s = a.score ?? 0;
    const i = Math.min(4, Math.floor(s / 20));
    buckets[i]++;
  }
  res.json(
    ["0-19", "20-39", "40-59", "60-79", "80-100"].map((range, i) => ({ range, count: buckets[i] }))
  );
});

analyticsRouter.get("/scores-over-time", async (req, res) => {
  const user = (req as { user: { id: string; role: string } }).user;
  const af = await assessmentFilter(user);
  const attempts = await prisma.assessmentAttempt.findMany({
    where: { status: { in: ["completed", "timed_out"] }, assessment: af, completedAt: { not: null } },
    select: { score: true, completedAt: true },
    orderBy: { completedAt: "asc" },
  });
  const byWeek = new Map<string, number[]>();
  for (const a of attempts) {
    const d = a.completedAt!;
    const week = `${d.getFullYear()}-W${Math.ceil(d.getDate() / 7)}`;
    if (!byWeek.has(week)) byWeek.set(week, []);
    byWeek.get(week)!.push(a.score || 0);
  }
  res.json(
    [...byWeek.entries()].map(([period, scores]) => ({
      period,
      average: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    }))
  );
});

function parseDateRange(from?: unknown, to?: unknown) {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: new Date(String(from)) } : {}),
    ...(to ? { lte: new Date(String(to)) } : {}),
  };
}

analyticsRouter.get("/pass-rates-by-role", async (req, res) => {
  const user = (req as { user: { id: string; role: string } }).user;
  const af = await assessmentFilter(user);
  const roles = await prisma.skillRole.findMany({ orderBy: { name: "asc" } });
  const data = [];
  for (const role of roles) {
    const attempts = await prisma.assessmentAttempt.findMany({
      where: {
        status: { in: ["completed", "timed_out"] },
        assessment: { ...af, skillRoleId: role.id },
      },
      include: { assessment: true },
    });
    if (!attempts.length) continue;
    const passed = attempts.filter((a) => (a.score || 0) >= a.assessment.passMark).length;
    data.push({
      role: role.name,
      roleCode: role.code,
      passRate: Math.round((passed / attempts.length) * 100),
      attempts: attempts.length,
    });
  }
  res.json(data);
});

analyticsRouter.get("/pass-rates-by-blueprint", async (req, res) => {
  const user = (req as { user: { id: string; role: string } }).user;
  const af = await assessmentFilter(user);
  const blueprints = await prisma.assessmentBlueprint.findMany({ orderBy: { name: "asc" } });
  const data: { blueprint: string; passRate: number; attempts: number }[] = [];

  const adHocAttempts = await prisma.assessmentAttempt.findMany({
    where: {
      status: { in: ["completed", "timed_out"] },
      assessment: { ...af, blueprintId: null },
    },
    include: { assessment: true },
  });
  if (adHocAttempts.length) {
    const passed = adHocAttempts.filter((a) => (a.score || 0) >= a.assessment.passMark).length;
    data.push({
      blueprint: "Ad hoc",
      passRate: Math.round((passed / adHocAttempts.length) * 100),
      attempts: adHocAttempts.length,
    });
  }

  for (const bp of blueprints) {
    const attempts = await prisma.assessmentAttempt.findMany({
      where: {
        status: { in: ["completed", "timed_out"] },
        assessment: { ...af, blueprintId: bp.id },
      },
      include: { assessment: true },
    });
    if (!attempts.length) continue;
    const passed = attempts.filter((a) => (a.score || 0) >= a.assessment.passMark).length;
    data.push({
      blueprint: bp.name,
      passRate: Math.round((passed / attempts.length) * 100),
      attempts: attempts.length,
    });
  }
  res.json(data);
});

analyticsRouter.get("/blueprint-summary", async (req, res) => {
  const user = (req as { user: { id: string; role: string } }).user;
  const af = await assessmentFilter(user);
  const blueprints = await prisma.assessmentBlueprint.findMany({ orderBy: { name: "asc" } });
  const rows: {
    blueprint: string;
    attempts: number;
    candidates: number;
    averageScore: number;
    passRate: number;
  }[] = [];

  async function summarize(label: string, blueprintId: string | null) {
    const attempts = await prisma.assessmentAttempt.findMany({
      where: {
        status: { in: ["completed", "timed_out"] },
        assessment: { ...af, blueprintId },
      },
      include: { assessment: true },
    });
    if (!attempts.length) return;
    const passed = attempts.filter((a) => (a.score || 0) >= a.assessment.passMark).length;
    const avg =
      attempts.reduce((s, a) => s + (a.score || 0), 0) / attempts.length;
    rows.push({
      blueprint: label,
      attempts: attempts.length,
      candidates: new Set(attempts.map((a) => a.assessment.userId)).size,
      averageScore: Math.round(avg),
      passRate: Math.round((passed / attempts.length) * 100),
    });
  }

  await summarize("Ad hoc", null);
  for (const bp of blueprints) {
    await summarize(bp.name, bp.id);
  }
  res.json(rows);
});

analyticsRouter.get("/concept-trends", async (req, res) => {
  const user = (req as { user: { id: string; role: string } }).user;
  const af = await assessmentFilter(user);
  const { skillId, from, to } = req.query;
  const data = await aggregateConceptTrends(
    { assessmentFilter: af, completedAt: parseDateRange(from, to) },
    skillId ? String(skillId) : undefined
  );
  res.json(data);
});

analyticsRouter.get("/status-breakdown", async (req, res) => {
  const user = (req as { user: { id: string; role: string } }).user;
  const af = await assessmentFilter(user);
  const statuses = ["assigned", "in_progress", "completed", "expired", "abandoned"] as const;
  const data = await Promise.all(
    statuses.map(async (status) => ({
      status,
      count: await prisma.assessment.count({ where: { ...af, status } }),
    }))
  );
  res.json(data);
});
