import { Router } from "express";
import * as XLSX from "xlsx";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Role } from "@assessment-os/shared";
import { prisma } from "../db.js";

export const questionImportTemplateRouter = Router();

questionImportTemplateRouter.get(
  "/template.xlsx",
  requireAuth,
  requireRole(Role.ADMIN, Role.CAPABILITY_MANAGER),
  async (_req, res) => {
    const wb = XLSX.utils.book_new();
    const headers = [
      "skillCode",
      "topicName",
      "skillRoleCodes",
      "difficulty",
      "questionStem",
      "optionA",
      "optionB",
      "optionC",
      "optionD",
      "optionE",
      "questionType",
      "correctOption",
      "explanation",
      "status",
    ];
    const ws = XLSX.utils.aoa_to_sheet([
      headers,
      ["JS001", "JavaScript Basics", "ASSOC,SR_DEV", "medium", "What is typeof null?", "object", "null", "undefined", "number", "", "single", "A", "typeof null returns object due to a legacy bug", "draft"],
      ["JS001", "JavaScript Basics", "ASSOC,SR_DEV", "easy", "Which keywords declare block-scoped variables?", "var", "let", "const", "function", "", "multi", "B,C", "", "draft"],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Questions");

    const skills = await prisma.skill.findMany({ include: { roles: { orderBy: { sortOrder: "asc" } } } });
    const refRows = skills.flatMap((s) =>
      s.roles.map((r) => ({ skillCode: s.code, skillName: s.name, roleCode: r.code, roleName: r.name }))
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(refRows.length ? refRows : [{ info: "No roles defined yet" }]), "Skills & Roles");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=question-import-template.xlsx");
    res.send(buf);
  }
);
