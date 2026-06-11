import type { CapabilitySummary, ConceptBreakdown } from "@assessment-os/shared";
import { Badge } from "./Layout";
import { Download } from "lucide-react";

function statusBadge(status: ConceptBreakdown["status"]) {
  if (status === "strength") return <Badge color="green">Strength</Badge>;
  if (status === "gap") return <Badge color="red">Gap</Badge>;
  return <Badge color="slate">Neutral</Badge>;
}

export function CapabilityBreakdownTable({
  summary,
  concepts,
  reportNumber,
  pdfHref,
}: {
  summary: CapabilitySummary;
  concepts: ConceptBreakdown[];
  reportNumber?: string;
  pdfHref?: string;
}) {
  return (
    <div className="space-y-3">
      {(reportNumber || pdfHref) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {reportNumber && (
            <p className="text-sm font-mono text-emerald-800">{reportNumber}</p>
          )}
          {pdfHref && (
            <a
              href={pdfHref}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:underline"
            >
              <Download size={14} />
              Download PDF
            </a>
          )}
        </div>
      )}
      <p className="text-xs text-slate-500">
        {summary.skillName} ({summary.skillCode}) · {summary.skillRoleName} — {summary.overallScore}%
        (pass {summary.passMark}%)
      </p>
      {concepts.length === 0 ? (
        <p className="text-sm text-slate-500">No concepts were tagged on questions in this attempt.</p>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Concept</th>
                <th className="text-right px-3 py-2 font-medium text-slate-600">Questions</th>
                <th className="text-right px-3 py-2 font-medium text-slate-600">Correct</th>
                <th className="text-right px-3 py-2 font-medium text-slate-600">Accuracy</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {concepts.map((c) => (
                <tr key={c.conceptId}>
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-800">{c.name}</span>
                    <span className="text-xs text-slate-400 ml-1">({c.code})</span>
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600">{c.questionCount}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{c.correctCount}</td>
                  <td className="px-3 py-2 text-right text-slate-800 font-medium">{c.accuracy}%</td>
                  <td className="px-3 py-2">{statusBadge(c.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {summary.untaggedQuestionCount > 0 && (
        <p className="text-xs text-slate-500">
          {summary.untaggedQuestionCount} question{summary.untaggedQuestionCount !== 1 ? "s" : ""}{" "}
          had no concept tags.
        </p>
      )}
      <p className="text-[11px] text-slate-400">
        Strength ≥ {summary.strengthThreshold}% · Gap &lt; {summary.gapThreshold}%
      </p>
    </div>
  );
}
