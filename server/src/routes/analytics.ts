import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Role } from "@assessment-os/shared";
import { prisma } from "../db.js";
import { getManagerSkillIds } from "../services/managerSkills.js";

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
