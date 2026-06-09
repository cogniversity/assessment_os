import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { prisma } from "../../db.js";

export const questionImportRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

const COL_MAP: Record<string, string> = {
  skillcode:      "skillCode",
  topicname:      "topicName",
  skillrolecodes: "skillRoleCodes", // comma-separated, e.g. "ASSOC,SR_DEV"
  difficulty:     "difficulty",
  questionstem:   "questionStem",
  optiona:        "optionA",
  optionb:        "optionB",
  optionc:        "optionC",
  optiond:        "optionD",
  optione:        "optionE",
  correctoption:  "correctOption", // single: "B"  multi: "A,C,D"
  questiontype:   "questionType",
  explanation:    "explanation",
  status:         "status",
};

function normalizeHeader(h: string) {
  return COL_MAP[h.toLowerCase().replace(/\s/g, "")] ?? h;
}

function optionLetterToIndex(letter: string): number {
  return "ABCDE".indexOf(letter.toUpperCase());
}

function parseCorrectOptions(raw: string, optionCount: number): { indices: number[]; error?: string } {
  const letters = (raw || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (letters.length === 0) return { indices: [], error: "correctOption is required" };
  const indices: number[] = [];
  for (const letter of letters) {
    const idx = optionLetterToIndex(letter);
    if (idx < 0 || idx >= optionCount) return { indices: [], error: `Invalid correctOption letter: ${letter}` };
    if (!indices.includes(idx)) indices.push(idx);
  }
  indices.sort((a, b) => a - b);
  return { indices };
}

questionImportRouter.post("/validate", upload.single("file"), async (req, res) => {
  const rows = parseFile(req.file!);
  const result = await validateRows(rows);
  res.json(result);
});

questionImportRouter.post("/commit", upload.single("file"), async (req, res) => {
  const user = (req as { user: { id: string } }).user;
  const rows = parseFile(req.file!);
  const { valid } = await validateRows(rows);
  let imported = 0;
  for (const row of valid) {
    const { skillRoleIds, ...data } = row.data as { skillRoleIds: string[]; [k: string]: unknown };
    await prisma.question.create({
      data: {
        ...(data as never),
        skillRoles: { create: skillRoleIds.map((skillRoleId) => ({ skillRoleId })) },
      },
    });
    imported++;
  }
  const job = await prisma.questionImportJob.create({
    data: {
      uploadedById: user.id,
      filename: req.file!.originalname,
      importedRowCount: imported,
      rejectedRowCount: rows.length - imported,
    },
  });
  res.json({ job, imported });
});

function parseFile(file: Express.Multer.File) {
  const wb = XLSX.read(file.buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
  return raw.map((row) => {
    const normalized: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      normalized[normalizeHeader(k)] = String(v).trim();
    }
    return normalized;
  });
}

async function validateRows(rows: Record<string, string>[]) {
  const skills = await prisma.skill.findMany();
  const topics = await prisma.topic.findMany();
  const roles  = await prisma.skillRole.findMany();

  const skillByCode = new Map(skills.map((s) => [s.code.toLowerCase(), s]));
  const topicByName = new Map(topics.map((t) => [t.name.toLowerCase(), t]));
  // key: `${skillId}::${CODE}`
  const roleByKey   = new Map(roles.map((r) => [`${r.skillId}::${r.code.toUpperCase()}`, r]));

  const valid: { row: number; data: object }[] = [];
  const errors: { row: number; reason: string }[] = [];

  rows.forEach((row, i) => {
    const rowNum = i + 2;
    const skill = skillByCode.get((row.skillCode || "").toLowerCase());
    const topic = topicByName.get((row.topicName || "").toLowerCase());

    if (!skill) { errors.push({ row: rowNum, reason: `Unknown skillCode: ${row.skillCode}` }); return; }
    if (!topic) { errors.push({ row: rowNum, reason: `Unknown topicName: ${row.topicName}` }); return; }

    // skillRoleCodes is comma-separated, e.g. "ASSOC,SR_DEV"
    const rawCodes = (row.skillRoleCodes || "").split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
    if (rawCodes.length === 0) {
      errors.push({ row: rowNum, reason: "skillRoleCodes is required (e.g. ASSOC or ASSOC,SR_DEV)" });
      return;
    }
    const resolvedRoles = rawCodes.map((code) => roleByKey.get(`${skill.id}::${code}`));
    const missing = rawCodes.filter((_, idx) => !resolvedRoles[idx]);
    if (missing.length) {
      errors.push({ row: rowNum, reason: `Unknown skillRoleCode(s) for ${skill.code}: ${missing.join(", ")}` });
      return;
    }

    const options = [row.optionA, row.optionB, row.optionC, row.optionD, row.optionE].filter(Boolean);
    if (options.length < 2) { errors.push({ row: rowNum, reason: "Need at least 2 options" }); return; }

    const parsedCorrect = parseCorrectOptions(row.correctOption, options.length);
    if (parsedCorrect.error) {
      errors.push({ row: rowNum, reason: parsedCorrect.error });
      return;
    }

    const questionTypeRaw = (row.questionType || "single").toLowerCase();
    if (!["single", "multi"].includes(questionTypeRaw)) {
      errors.push({ row: rowNum, reason: `Invalid questionType: ${row.questionType}` });
      return;
    }
    const questionType = questionTypeRaw as "single" | "multi";
    if (questionType === "single" && parsedCorrect.indices.length !== 1) {
      errors.push({ row: rowNum, reason: "Single-select questions must have exactly one correctOption (e.g. B)" });
      return;
    }
    if (questionType === "multi" && parsedCorrect.indices.length < 2) {
      errors.push({ row: rowNum, reason: "Multi-select questions need at least two correctOption letters (e.g. A,C)" });
      return;
    }
    if (!["easy", "medium", "hard"].includes(row.difficulty.toLowerCase())) {
      errors.push({ row: rowNum, reason: `Invalid difficulty: ${row.difficulty}` });
      return;
    }

    valid.push({
      row: rowNum,
      data: {
        skillId:    skill.id,
        topicId:    topic.id,
        skillRoleIds: resolvedRoles.map((r) => r!.id),
        difficulty: row.difficulty.toLowerCase(),
        stem:       row.questionStem,
        options,
        questionType,
        correctIndices: parsedCorrect.indices,
        explanation: row.explanation || null,
        status: row.status === "published" ? "published" : "draft",
      },
    });
  });

  return { valid, errors, total: rows.length };
}

questionImportRouter.get("/template.xlsx", async (_req, res) => {
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
    ["JS001", "JavaScript Basics", "SR_DEV",       "medium", "What is typeof null?", "object", "null", "undefined", "number", "", "single", "A", "typeof null returns object (legacy bug)", "draft"],
    ["JS001", "JavaScript Basics", "ASSOC,SR_DEV", "easy",   "Which keywords declare block-scoped variables?", "var", "let", "const", "function", "", "multi", "B,C", "", "draft"],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Questions");

  // Reference sheet: skills and their roles
  const skills = await prisma.skill.findMany({ include: { roles: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } } });
  const refRows = skills.flatMap((s) =>
    s.roles.map((r) => ({ skillCode: s.code, skillName: s.name, roleCode: r.code, roleName: r.name }))
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(refRows.length ? refRows : [{ info: "No roles defined yet" }]), "Skills & Roles");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=question-import-template.xlsx");
  res.send(buf);
});
