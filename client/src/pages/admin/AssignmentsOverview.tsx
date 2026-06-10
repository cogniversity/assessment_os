import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { Card, Button, Input, Select, Badge } from "../../components/Layout";
import { assessmentTopicLabel } from "../../utils/assessment";
import { ExternalLink, Plus, Search } from "lucide-react";

interface AssignmentRow {
  id: string;
  status: string;
  displayName?: string | null;
  passMark: number;
  deadline: string | null;
  createdAt: string;
  skill: { id: string; code: string; name: string };
  skillRole: { code: string; name: string };
  user: { id: string; name: string; email: string };
  assignedBy: { id: string; name: string };
  blueprint?: { id: string; name: string } | null;
  topics: { topic: { name: string } }[];
  attempts: {
    id: string;
    status: string;
    score: number | null;
    completedAt: string | null;
  }[];
}

interface Skill {
  id: string;
  code: string;
  name: string;
}

const STATUSES = ["assigned", "in_progress", "completed", "expired", "abandoned"] as const;

function statusBadgeColor(status: string): "slate" | "indigo" | "green" | "yellow" | "red" {
  switch (status) {
    case "in_progress":
      return "indigo";
    case "completed":
      return "green";
    case "expired":
      return "yellow";
    case "abandoned":
      return "red";
    default:
      return "slate";
  }
}

function formatStatus(status: string): string {
  return status.replace(/_/g, " ");
}

type Props = {
  onAssignNew: () => void;
};

export default function AssignmentsOverview({ onAssignNew }: Props) {
  const { user } = useAuth();
  const location = useLocation();
  const isAdmin = location.pathname.startsWith("/admin");
  const basePath = isAdmin ? "/admin" : "/manager";
  const resultsBase = `${basePath}/results`;
  const candidatesBase = `${basePath}/candidates`;

  const [filters, setFilters] = useState({
    status: "",
    skillId: "",
    q: "",
    assignedByMe: false,
  });
  const [searchDebounced, setSearchDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(filters.q.trim()), 300);
    return () => clearTimeout(t);
  }, [filters.q]);

  const skills = useQuery({
    queryKey: ["skills"],
    queryFn: () => api<Skill[]>("/admin/skills"),
  });

  const managerSkills = useQuery({
    queryKey: ["manager-assigned-skills"],
    queryFn: () => api<{ skillId: string; skill: Skill }[]>("/manager/skills"),
    enabled: user?.role === "capability_manager",
  });

  const filterSkills =
    user?.role === "capability_manager"
      ? (managerSkills.data?.map((r) => r.skill) ?? [])
      : (skills.data ?? []);

  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.skillId) params.set("skillId", filters.skillId);
  if (searchDebounced) params.set("q", searchDebounced);
  if (filters.assignedByMe) params.set("assignedByMe", "true");

  const assignments = useQuery({
    queryKey: ["assignments", filters.status, filters.skillId, searchDebounced, filters.assignedByMe],
    queryFn: () => api<AssignmentRow[]>(`/assignments?${params}`),
  });

  const statusBreakdown = useQuery({
    queryKey: ["analytics-status-breakdown"],
    queryFn: () => api<{ status: string; count: number }[]>("/analytics/status-breakdown"),
  });

  const latestFinishedAttempt = (row: AssignmentRow) =>
    row.attempts.find((a) => a.status === "completed" || a.status === "timed_out");

  return (
    <div className="space-y-4">
      {statusBreakdown.data && statusBreakdown.data.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {statusBreakdown.data.map(({ status, count }) => (
            <button
              key={status}
              type="button"
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  status: f.status === status ? "" : status,
                }))
              }
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                filters.status === status
                  ? "border-indigo-400 bg-indigo-50 text-indigo-800"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              <Badge color={statusBadgeColor(status)}>{formatStatus(status)}</Badge>
              <span>{count}</span>
            </button>
          ))}
        </div>
      )}

      <Card title="Filters">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Status</label>
            <Select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {formatStatus(s)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Skill</label>
            <Select
              value={filters.skillId}
              onChange={(e) => setFilters({ ...filters, skillId: e.target.value })}
            >
              <option value="">All skills</option>
              {filterSkills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} – {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Candidate search</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={filters.q}
                onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                placeholder="Name or email…"
                className="pl-9"
              />
            </div>
          </div>
        </div>
        <label className="flex items-center gap-2 mt-3 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.assignedByMe}
            onChange={(e) => setFilters({ ...filters, assignedByMe: e.target.checked })}
            className="rounded border-slate-300 accent-indigo-600"
          />
          Assigned by me only
        </label>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onAssignNew}>
          <Plus size={16} />
          Assign new
        </Button>
      </div>

      <Card>
        {assignments.isLoading && (
          <p className="text-sm text-slate-500 py-8 text-center">Loading assignments…</p>
        )}
        {!assignments.isLoading && (assignments.data?.length ?? 0) === 0 && (
          <p className="text-sm text-slate-500 py-8 text-center">
            No assignments match these filters.
          </p>
        )}
        {assignments.data && assignments.data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-100">
                  <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Candidate
                  </th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Assessment
                  </th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Skill · Role
                  </th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">
                    Status
                  </th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Deadline
                  </th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Latest attempt
                  </th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Assigned
                  </th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assignments.data.map((row) => {
                  const finished = latestFinishedAttempt(row);
                  const inProgress = row.attempts.find((a) => a.status === "in_progress");
                  const passed =
                    finished?.score != null && finished.score >= row.passMark;
                  return (
                    <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-3">
                        <p className="font-medium text-slate-800">{row.user.name}</p>
                        <p className="text-xs text-slate-400 truncate max-w-[10rem]">{row.user.email}</p>
                      </td>
                      <td className="px-3 py-3 text-slate-700 max-w-[12rem]">
                        <p className="truncate font-medium">{assessmentTopicLabel(row)}</p>
                        {row.blueprint && (
                          <p className="text-xs text-slate-400 truncate">{row.blueprint.name}</p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-600 text-xs">
                        <p>{row.skill.code}</p>
                        <p className="text-slate-400">{row.skillRole.code}</p>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Badge color={statusBadgeColor(row.status)}>
                          {formatStatus(row.status)}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {row.deadline ? new Date(row.deadline).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {finished ? (
                          <span className={passed ? "text-green-700 font-medium" : "text-red-600 font-medium"}>
                            {finished.score ?? "—"}%
                            {passed ? " pass" : " fail"}
                          </span>
                        ) : inProgress ? (
                          <span className="text-indigo-600">In progress</span>
                        ) : (
                          <span className="text-slate-400">Not started</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-500">
                        <p>{row.assignedBy.name}</p>
                        <p>{new Date(row.createdAt).toLocaleDateString()}</p>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1 items-start">
                          {finished && (
                            <Link
                              to={`${resultsBase}/${finished.id}`}
                              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                            >
                              <ExternalLink size={12} />
                              Result
                            </Link>
                          )}
                          <Link
                            to={`${candidatesBase}/${row.user.id}`}
                            className="text-xs text-slate-500 hover:text-slate-700"
                          >
                            Profile
                          </Link>
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
