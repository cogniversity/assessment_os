import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { EXPORT_SECTIONS } from "../../services/dataTransfer/types.js";
import { buildExportBundle } from "../../services/dataTransfer/export.js";
import {
  commitImport,
  parseExportBundle,
  parseSections,
  previewImport,
} from "../../services/dataTransfer/import.js";

export const dataTransferRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const sectionsSchema = z.object({
  sections: z.array(z.enum(EXPORT_SECTIONS)).min(1, "Select at least one section"),
});

function parseBodySections(body: unknown): z.infer<typeof sectionsSchema>["sections"] {
  const raw = typeof body === "object" && body && "sections" in body ? (body as { sections: unknown }).sections : body;
  if (typeof raw === "string") {
    try {
      return sectionsSchema.parse({ sections: JSON.parse(raw) }).sections;
    } catch {
      return parseSections(raw.split(",").map((s) => s.trim()));
    }
  }
  return sectionsSchema.parse({ sections: raw }).sections;
}

function readBundleFile(file: Express.Multer.File) {
  const text = file.buffer.toString("utf8");
  return parseExportBundle(JSON.parse(text));
}

dataTransferRouter.get("/sections", (_req, res) => {
  res.json({ sections: EXPORT_SECTIONS });
});

dataTransferRouter.post("/export", async (req, res, next) => {
  try {
    const sections = parseBodySections(req.body);
    const bundle = await buildExportBundle(sections);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename=assessment-os-export-${stamp}.json`);
    res.send(JSON.stringify(bundle, null, 2));
  } catch (e) {
    next(e);
  }
});

dataTransferRouter.post("/import/preview", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Upload a JSON export file" });
      return;
    }
    const sections = parseBodySections(req.body);
    const bundle = readBundleFile(req.file);
    res.json(previewImport(bundle, sections));
  } catch (e) {
    next(e);
  }
});

dataTransferRouter.post("/import/commit", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Upload a JSON export file" });
      return;
    }
    const sections = parseBodySections(req.body);
    const bundle = readBundleFile(req.file);
    const preview = previewImport(bundle, sections);
    if (!preview.valid) {
      res.status(400).json({ error: "Import validation failed", details: preview.errors });
      return;
    }
    const result = await commitImport(bundle, sections);
    res.json(result);
  } catch (e) {
    next(e);
  }
});
