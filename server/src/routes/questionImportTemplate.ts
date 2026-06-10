import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Role } from "@assessment-os/shared";
import { prisma } from "../db.js";
import { buildQuestionImportTemplateBuffer } from "../services/questionSpreadsheet.js";

export const questionImportTemplateRouter = Router();

questionImportTemplateRouter.get(
  "/template.xlsx",
  requireAuth,
  requireRole(Role.ADMIN, Role.CAPABILITY_MANAGER),
  async (_req, res) => {
    const skills = await prisma.skill.findMany({
      include: { roles: { orderBy: { sortOrder: "asc" } } },
    });
    const refRows = skills.flatMap((s) =>
      s.roles.map((r) => ({ skillCode: s.code, skillName: s.name, roleCode: r.code, roleName: r.name }))
    );
    const buf = await buildQuestionImportTemplateBuffer(refRows);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=question-import-template.xlsx");
    res.send(buf);
  }
);
