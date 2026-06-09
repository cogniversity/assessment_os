import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiForm, downloadUrl } from "../../api/client";
import { Card, Button, SectionHeader } from "../../components/Layout";
import { Download, Upload, FileJson, AlertTriangle, CheckCircle2 } from "lucide-react";

const EXPORT_SECTIONS = [
  { id: "users", label: "Users & profiles", hint: "Users, candidate profiles, custom field defs, remarks, audit logs" },
  { id: "taxonomy", label: "Categories, skills, roles & topics", hint: "Full taxonomy hierarchy" },
  { id: "questions", label: "Questions", hint: "Question bank + skill role tags" },
  { id: "blueprints", label: "Blueprints", hint: "Assessment templates and topic links" },
  { id: "assignments", label: "Assignments / assessments", hint: "Assigned assessments and reattempt requests" },
  { id: "results", label: "Results", hint: "Attempts, answers, scores, certificates, proctoring events & photo metadata" },
] as const;

type SectionId = (typeof EXPORT_SECTIONS)[number]["id"];

type ImportPreview = {
  valid: boolean;
  exportedAt: string | null;
  counts: Record<string, number>;
  warnings: string[];
  errors: string[];
};

type ImportResult = {
  imported: Record<string, number>;
  skipped: Record<string, number>;
  warnings: string[];
};

function SectionPicker({
  selected,
  onChange,
}: {
  selected: SectionId[];
  onChange: (ids: SectionId[]) => void;
}) {
  const toggle = (id: SectionId) => {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  };

  return (
    <div className="space-y-2">
      {EXPORT_SECTIONS.map((s) => (
        <label
          key={s.id}
          className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer"
        >
          <input
            type="checkbox"
            checked={selected.includes(s.id)}
            onChange={() => toggle(s.id)}
            className="mt-1 rounded border-slate-300 accent-indigo-600"
          />
          <div>
            <p className="text-sm font-medium text-slate-800">{s.label}</p>
            <p className="text-xs text-slate-500">{s.hint}</p>
          </div>
        </label>
      ))}
    </div>
  );
}

async function downloadBundle(sections: SectionId[]) {
  const res = await fetch("/api/admin/data-transfer/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ sections }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Export failed");
  }
  const blob = await res.blob();
  const stamp = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `assessment-os-export-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function QuestionSpreadsheetImport() {
  const [result, setResult] = useState<{ imported?: number } | null>(null);
  const commit = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return apiForm<{ imported: number }>("/admin/question-import/commit", fd);
    },
    onSuccess: (data) => setResult({ imported: data.imported }),
  });

  return (
    <div>
      <input
        type="file"
        accept=".xlsx,.csv"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) commit.mutate(f);
        }}
        className="block text-sm"
      />
      {result?.imported != null && (
        <p className="mt-2 text-sm text-green-700">Imported {result.imported} question rows.</p>
      )}
      {commit.isError && (
        <p className="mt-2 text-sm text-red-600">{(commit.error as Error).message}</p>
      )}
    </div>
  );
}

export default function DataTransferPage() {
  const [exportSections, setExportSections] = useState<SectionId[]>([
    "taxonomy",
    "questions",
    "blueprints",
  ]);
  const [importSections, setImportSections] = useState<SectionId[]>([
    "taxonomy",
    "questions",
    "blueprints",
  ]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const exportMut = useMutation({
    mutationFn: () => downloadBundle(exportSections),
  });

  const previewMut = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("sections", JSON.stringify(importSections));
      return apiForm<ImportPreview>("/admin/data-transfer/import/preview", fd);
    },
    onSuccess: (data) => {
      setPreview(data);
      setImportResult(null);
    },
  });

  const commitMut = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("sections", JSON.stringify(importSections));
      return apiForm<ImportResult>("/admin/data-transfer/import/commit", fd);
    },
    onSuccess: setImportResult,
  });

  return (
    <div className="space-y-8 max-w-3xl">
      <SectionHeader
        title="Export / Import"
        description="Move data between environments. Choose which sections to include. Proctoring photos and uploaded files export as path metadata only."
      />

      <Card title="Question import (spreadsheet)" subtitle="Bulk upload questions from XLSX/CSV">
        <a href={downloadUrl("/question-import/template.xlsx")} className="inline-block mb-3">
          <Button variant="secondary" size="sm">
            <Download size={14} /> Download question template
          </Button>
        </a>
        <QuestionSpreadsheetImport />
      </Card>

      <Card title="Export data" subtitle="Download a JSON bundle with selected sections">
        <SectionPicker selected={exportSections} onChange={setExportSections} />
        {exportMut.isError && (
          <p className="text-sm text-red-600 mt-3">{(exportMut.error as Error).message}</p>
        )}
        <Button
          className="mt-4"
          onClick={() => exportMut.mutate()}
          disabled={exportSections.length === 0 || exportMut.isPending}
        >
          <FileJson size={16} />
          {exportMut.isPending ? "Exporting…" : "Export JSON"}
        </Button>
      </Card>

      <Card title="Import data" subtitle="Upload a bundle and choose which sections to restore">
        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-600 mb-2">Bundle file (.json)</label>
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setImportFile(f);
              setPreview(null);
              setImportResult(null);
              if (f) previewMut.mutate(f);
            }}
            className="block text-sm w-full"
          />
        </div>

        <SectionPicker selected={importSections} onChange={setImportSections} />

        <div className="flex flex-wrap gap-2 mt-4">
          <Button
            variant="secondary"
            disabled={!importFile || importSections.length === 0 || previewMut.isPending}
            onClick={() => importFile && previewMut.mutate(importFile)}
          >
            Preview import
          </Button>
          <Button
            disabled={!importFile || !preview?.valid || importSections.length === 0 || commitMut.isPending}
            onClick={() => importFile && commitMut.mutate(importFile)}
          >
            <Upload size={16} />
            {commitMut.isPending ? "Importing…" : "Import selected sections"}
          </Button>
        </div>

        {preview && (
          <div className="mt-4 space-y-2">
            {preview.exportedAt && (
              <p className="text-xs text-slate-500">Bundle exported: {new Date(preview.exportedAt).toLocaleString()}</p>
            )}
            {Object.keys(preview.counts).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(preview.counts).map(([k, n]) => (
                  <span key={k} className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">
                    {k}: {n}
                  </span>
                ))}
              </div>
            )}
            {preview.warnings.map((w) => (
              <div key={w} className="flex gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                {w}
              </div>
            ))}
            {preview.errors.map((e) => (
              <div key={e} className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {e}
              </div>
            ))}
          </div>
        )}

        {importResult && (
          <div className="mt-4 bg-green-50 border border-green-100 rounded-lg px-4 py-3 text-sm text-green-800">
            <div className="flex items-center gap-2 font-medium mb-2">
              <CheckCircle2 size={16} /> Import complete
            </div>
            {Object.entries(importResult.imported).map(([k, n]) => (
              <p key={k} className="text-xs">
                {k}: {n} imported
                {importResult.skipped[k] ? `, ${importResult.skipped[k]} skipped (already exist)` : ""}
              </p>
            ))}
            {importResult.warnings.map((w) => (
              <p key={w} className="text-xs text-amber-700 mt-1">{w}</p>
            ))}
          </div>
        )}

        {(previewMut.isError || commitMut.isError) && (
          <p className="text-sm text-red-600 mt-3">
            {((previewMut.error ?? commitMut.error) as Error).message}
          </p>
        )}
      </Card>
    </div>
  );
}
