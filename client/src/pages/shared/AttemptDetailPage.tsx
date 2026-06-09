import { useState } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, downloadUrl } from "../../api/client";
import { assessmentTopicLabel } from "../../utils/assessment";
import { AttemptProctoringPanel } from "../../components/proctoring/AttemptProctoringPanel";
import { Badge } from "../../components/Layout";
import { CheckCircle, XCircle, Download, User, Clock, BarChart2, ShieldAlert } from "lucide-react";

type Tab = "overview" | "proctoring";

interface AttemptDetail {
  id: string;
  score: number | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
  assessment: {
    id: string;
    passMark: number;
    displayName?: string | null;
    issueCertificate: boolean;
    proctoringPhotoIntervalMinutes: number;
    topics?: { topic: { name: string } }[];
    user: { id: string; name: string; email: string };
  };
  proctoringEvents: { id: string; eventType: string; occurredAt: string }[];
  photos: { id: string; kind: string; capturedAt: string }[];
  certificate?: { certNumber: string; proficiency?: string } | null;
}

export default function AttemptDetailPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const location = useLocation();
  const [tab, setTab] = useState<Tab>("overview");

  // Infer base path for back link (admin vs manager)
  const basePath = location.pathname.startsWith("/admin") ? "/admin/results" : "/manager/results";

  const { data, isLoading, isError } = useQuery<AttemptDetail>({
    queryKey: ["attempt-detail", attemptId],
    queryFn: () => api(`/attempts/${attemptId}`),
    enabled: !!attemptId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-slate-400">Loading attempt…</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-red-500 mb-4">Failed to load attempt details.</p>
        <Link to={basePath} className="text-sm text-indigo-600 hover:underline">Back to results</Link>
      </div>
    );
  }

  const passed = data.score !== null && data.score >= data.assessment.passMark;
  const proctoringIssues = data.proctoringEvents.filter((e) =>
    ["tab_switch", "fullscreen_exit", "copy_attempt", "paste_attempt", "context_menu"].includes(e.eventType)
  ).length;

  const label = assessmentTopicLabel(data.assessment);

  return (
    <div>
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <Link to={basePath} className="text-xs text-slate-400 hover:text-indigo-600 transition-colors">
            ← Back to results
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">{label}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Candidate: <span className="font-medium text-slate-700">{data.assessment.user.name}</span>
            <span className="mx-1.5 text-slate-300">·</span>
            {data.assessment.user.email}
          </p>
        </div>
        <a href={downloadUrl(`/admin/export/attempt/${data.id}/pdf`)} className="shrink-0">
          <button type="button" className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-4 py-2 rounded-xl text-sm transition-colors">
            <Download size={15} />
            Export PDF
          </button>
        </a>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <BarChart2 size={14} className="text-slate-400" />
            <p className="text-xs text-slate-500 font-medium">Score</p>
          </div>
          <p className="text-2xl font-bold text-slate-900">{data.score ?? "—"}%</p>
          <p className={`text-xs font-medium mt-0.5 ${passed ? "text-green-600" : "text-red-500"}`}>
            {passed ? "Passed" : `Failed (pass ${data.assessment.passMark}%)`}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            {passed ? <CheckCircle size={14} className="text-green-500" /> : <XCircle size={14} className="text-red-400" />}
            <p className="text-xs text-slate-500 font-medium">Result</p>
          </div>
          <Badge color={passed ? "green" : "red"}>{passed ? "Pass" : "Fail"}</Badge>
          {data.certificate && (
            <p className="text-[11px] text-green-600 font-mono mt-1">{data.certificate.certNumber}</p>
          )}
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock size={14} className="text-slate-400" />
            <p className="text-xs text-slate-500 font-medium">Completed</p>
          </div>
          <p className="text-sm font-semibold text-slate-700">
            {data.completedAt ? new Date(data.completedAt).toLocaleDateString() : "—"}
          </p>
          <p className="text-[11px] text-slate-400">
            {data.completedAt ? new Date(data.completedAt).toLocaleTimeString() : ""}
          </p>
        </div>
        <div className={`border rounded-xl p-4 ${proctoringIssues > 0 ? "bg-red-50 border-red-200" : "bg-white border-slate-200"}`}>
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert size={14} className={proctoringIssues > 0 ? "text-red-500" : "text-slate-400"} />
            <p className="text-xs text-slate-500 font-medium">Proctoring flags</p>
          </div>
          <p className={`text-2xl font-bold ${proctoringIssues > 0 ? "text-red-600" : "text-slate-900"}`}>
            {proctoringIssues}
          </p>
          <p className="text-[11px] text-slate-400">{data.photos.length} photo{data.photos.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 mb-6">
        <div className="flex gap-0">
          {(["overview", "proctoring"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
                tab === t
                  ? "border-indigo-500 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              {t === "proctoring" && (
                <ShieldAlert size={14} className={proctoringIssues > 0 ? "text-red-500" : ""} />
              )}
              {t === "overview" && <User size={14} />}
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {t === "proctoring" && proctoringIssues > 0 && (
                <span className="ml-1 bg-red-100 text-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {proctoringIssues}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Assessment</p>
              <p className="text-slate-800">{label}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Candidate</p>
              <p className="text-slate-800">{data.assessment.user.name}</p>
              <p className="text-xs text-slate-400">{data.assessment.user.email}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Status</p>
              <Badge color={data.status === "completed" ? "green" : "yellow"}>{data.status}</Badge>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Score / Pass mark</p>
              <p className="text-slate-800">{data.score ?? "—"}% / {data.assessment.passMark}%</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Started</p>
              <p className="text-slate-800">{new Date(data.startedAt).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Completed</p>
              <p className="text-slate-800">{data.completedAt ? new Date(data.completedAt).toLocaleString() : "—"}</p>
            </div>
          </div>
          {data.certificate && (
            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Certificate</p>
              <p className="text-sm font-mono text-green-700">{data.certificate.certNumber}</p>
              {data.certificate.proficiency && (
                <p className="text-xs text-slate-500 mt-0.5 capitalize">
                  Proficiency: {data.certificate.proficiency.replace(/_/g, " ")}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "proctoring" && attemptId && (
        <AttemptProctoringPanel attemptId={attemptId} />
      )}
    </div>
  );
}
