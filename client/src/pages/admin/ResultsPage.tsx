import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { api, downloadUrl } from "../../api/client";
import { Card, Button, SectionHeader } from "../../components/Layout";
import { assessmentTopicLabel } from "../../utils/assessment";
import { ShieldAlert, ExternalLink } from "lucide-react";

interface AttemptRow {
  id: string;
  score: number | null;
  status: string;
  completedAt: string | null;
  assessment: {
    passMark: number;
    user: { name: string };
    displayName?: string | null;
    topics?: { topic: { name: string } }[];
  };
  proctoringEvents: { eventType: string }[];
  photos: { id: string }[];
}

export default function ResultsPage() {
  const location = useLocation();
  const basePath = location.pathname.startsWith("/admin") ? "/admin/results" : "/manager/results";

  const attempts = useQuery({
    queryKey: ["manager-results"],
    queryFn: () => api<AttemptRow[]>("/manager/results"),
  });

  const flagged = (row: AttemptRow) =>
    row.proctoringEvents.filter((e) =>
      ["tab_switch", "fullscreen_exit", "copy_attempt", "paste_attempt", "context_menu"].includes(e.eventType)
    ).length;

  return (
    <div>
      <SectionHeader title="Results" description="All completed attempts" />
      <div className="flex flex-wrap gap-2 mb-5">
        <a href={downloadUrl("/admin/export/results")}>
          <Button size="sm">Export results (CSV)</Button>
        </a>
        <a href={downloadUrl("/admin/export/capability-concepts")}>
          <Button size="sm" variant="secondary">
            Export concept breakdown (CSV)
          </Button>
        </a>
      </div>
      <Card>
        {attempts.isLoading && (
          <p className="text-sm text-slate-400 py-6 text-center">Loading results…</p>
        )}
        {!attempts.isLoading && (!attempts.data || attempts.data.length === 0) && (
          <p className="text-sm text-slate-400 py-6 text-center">No completed attempts yet.</p>
        )}
        {attempts.data && attempts.data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-100">
                  <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Candidate</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Assessment</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Score</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Proctoring</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Completed</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attempts.data.map((a) => {
                  const passed = a.score !== null && a.score >= a.assessment.passMark;
                  const flags = flagged(a);
                  return (
                    <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-3 font-medium text-slate-800">{a.assessment.user.name}</td>
                      <td className="px-3 py-3 text-slate-600 max-w-48 truncate">{assessmentTopicLabel(a.assessment)}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`font-semibold ${passed ? "text-green-600" : "text-red-500"}`}>
                          {a.score ?? "—"}%
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {flags > 0 ? (
                          <span className="inline-flex items-center gap-1 bg-red-50 text-red-600 text-xs font-semibold px-2 py-0.5 rounded-full">
                            <ShieldAlert size={11} />
                            {flags}
                          </span>
                        ) : (
                          <span className="text-green-600 text-xs">Clean</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-400 text-xs whitespace-nowrap">
                        {a.completedAt ? new Date(a.completedAt).toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`${basePath}/${a.id}`}
                            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            <ExternalLink size={12} />
                            View
                          </Link>
                          <a href={downloadUrl(`/admin/export/attempt/${a.id}/pdf`)} className="text-xs text-slate-400 hover:text-slate-600">
                            PDF
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
