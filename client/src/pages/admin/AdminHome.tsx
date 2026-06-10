import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { SectionHeader } from "../../components/Layout";
import { Tag, HelpCircle, Users, ClipboardList, BarChart2, ArrowRight, RotateCcw } from "lucide-react";

const quickLinks = [
  { to: "/admin/questions", label: "Question Bank", description: "Manage and publish questions", icon: <HelpCircle size={20} />, color: "bg-indigo-50 text-indigo-600" },
  { to: "/admin/assignments", label: "Assignments", description: "View and assign assessments", icon: <ClipboardList size={20} />, color: "bg-green-50 text-green-600" },
  { to: "/admin/reattempts", label: "Reattempt requests", description: "Approve candidate retakes", icon: <RotateCcw size={20} />, color: "bg-amber-50 text-amber-600" },
  { to: "/admin/results", label: "View Results", description: "Review candidate scores", icon: <BarChart2 size={20} />, color: "bg-orange-50 text-orange-600" },
  { to: "/admin/users", label: "Manage Users", description: "Candidates and managers", icon: <Users size={20} />, color: "bg-purple-50 text-purple-600" },
];

export default function AdminHome() {
  const skills = useQuery({ queryKey: ["skills"], queryFn: () => api<{ id: string }[]>("/admin/skills") });
  const questions = useQuery({ queryKey: ["questions-count"], queryFn: () => api<{ id: string }[]>("/admin/questions") });
  const candidates = useQuery({ queryKey: ["candidates-count"], queryFn: () => api<{ id: string }[]>("/admin/users/candidates") });
  const pendingReattempts = useQuery({
    queryKey: ["reattempt-requests", "pending"],
    queryFn: () => api<{ id: string }[]>("/reattempt-requests/manager?status=pending"),
  });

  const stats = [
    { label: "Skills", value: skills.data?.length ?? "—", icon: <Tag size={18} />, color: "text-indigo-600 bg-indigo-50" },
    { label: "Questions", value: questions.data?.length ?? "—", icon: <HelpCircle size={18} />, color: "text-purple-600 bg-purple-50" },
    { label: "Candidates", value: candidates.data?.length ?? "—", icon: <Users size={18} />, color: "text-green-600 bg-green-50" },
  ];

  return (
    <div className="space-y-8">
      <SectionHeader title="Admin Dashboard" description="Manage your assessment platform from here." />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}>
              {s.icon}
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-500 font-medium">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Quick actions</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {quickLinks.map((q) => {
            const pending =
              q.to === "/admin/reattempts" ? (pendingReattempts.data?.length ?? 0) : 0;
            const description =
              pending > 0 ? `${pending} pending request${pending !== 1 ? "s" : ""}` : q.description;
            return (
            <Link
              key={q.to}
              to={q.to}
              className="flex items-center gap-4 bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:border-indigo-300 hover:shadow-md transition-all group"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${q.color} shrink-0`}>
                {q.icon}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 text-sm">{q.label}</p>
                <p className="text-xs text-slate-500">{description}</p>
              </div>
              <ArrowRight size={16} className="ml-auto text-slate-300 group-hover:text-indigo-500 transition-colors shrink-0" />
            </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
