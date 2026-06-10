import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";

const TEMPLATE_HEADERS = [
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
] as const;

const SAMPLE_ROWS: string[][] = [
  [
    "JS001",
    "JavaScript Basics",
    "SR_DEV",
    "medium",
    "What is typeof null?",
    "object",
    "null",
    "undefined",
    "number",
    "",
    "single",
    "A",
    "typeof null returns object (legacy bug)",
    "draft",
  ],
  [
    "JS001",
    "JavaScript Basics",
    "ASSOC,SR_DEV",
    "easy",
    "Which keywords declare block-scoped variables?",
    "var",
    "let",
    "const",
    "function",
    "",
    "multi",
    "B,C",
    "",
    "draft",
  ],
];

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object" && "text" in value && typeof value.text === "string") {
    return value.text.trim();
  }
  if (typeof value === "object" && "result" in value) {
    return cellText(value.result as ExcelJS.CellValue);
  }
  return String(value).trim();
}

function sheetToRecords(sheet: ExcelJS.Worksheet): Record<string, string>[] {
  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell, col) => {
    headers[col - 1] = cellText(cell.value);
  });

  const rows: Record<string, string>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, string> = {};
    let hasValue = false;
    row.eachCell((cell, col) => {
      const key = headers[col - 1];
      if (!key) return;
      const text = cellText(cell.value);
      if (text) hasValue = true;
      record[key] = text;
    });
    if (hasValue) rows.push(record);
  });
  return rows;
}

export async function parseQuestionSpreadsheet(
  buffer: Buffer,
  filename: string,
  mimetype?: string
): Promise<Record<string, string>[]> {
  const isCsv =
    filename.toLowerCase().endsWith(".csv") ||
    mimetype === "text/csv" ||
    mimetype === "application/csv";

  if (isCsv) {
    const raw = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as Record<string, string>[];
    return raw.map((row) => {
      const normalized: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) {
        normalized[k] = String(v ?? "").trim();
      }
      return normalized;
    });
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  return sheetToRecords(sheet);
}

export async function buildQuestionImportTemplateBuffer(
  refRows: { skillCode: string; skillName: string; roleCode: string; roleName: string }[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const questions = workbook.addWorksheet("Questions");
  questions.addRow([...TEMPLATE_HEADERS]);
  for (const row of SAMPLE_ROWS) questions.addRow(row);

  const ref = workbook.addWorksheet("Skills & Roles");
  if (refRows.length === 0) {
    ref.addRow(["info"]);
    ref.addRow(["No roles defined yet"]);
  } else {
    ref.addRow(["skillCode", "skillName", "roleCode", "roleName"]);
    for (const row of refRows) {
      ref.addRow([row.skillCode, row.skillName, row.roleCode, row.roleName]);
    }
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
