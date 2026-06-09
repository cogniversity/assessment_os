import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Card, SectionHeader } from "../../components/Layout";
import { Trash2, Plus } from "lucide-react";

type ManagerSkillRow = {
  id: string;
  userId: string;
  skillId: string;
  user: { id: string; name: string; email: string };
  skill: { id: string; name: string; code: string };
};

type User = { id: string; name: string; email: string; role: string };
type Skill = { id: string; name: string; code: string };

export default function ManagerSkillsPage() {
  const qc = useQueryClient();

  const { data: rows = [], isLoading } = useQuery<ManagerSkillRow[]>({
    queryKey: ["manager-skills"],
    queryFn: () => api("/admin/manager-skills"),
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: () => api("/admin/users"),
  });

  const { data: skills = [] } = useQuery<Skill[]>({
    queryKey: ["skills"],
    queryFn: () => api("/admin/skills"),
  });

  const managers = users.filter((u) => u.role === "capability_manager");

  const assign = useMutation({
    mutationFn: (body: { userId: string; skillId: string }) =>
      api("/admin/manager-skills", { method: "POST", json: body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manager-skills"] });
      setForm({ userId: "", skillId: "" });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/manager-skills/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["manager-skills"] }),
  });

  const [form, setForm] = useState({ userId: "", skillId: "" });

  // Group rows by manager for display
  const byManager = managers.map((manager) => ({
    manager,
    assignments: rows.filter((r) => r.userId === manager.id),
  }));

  const assignedPairs = new Set(rows.map((r) => `${r.userId}:${r.skillId}`));
  const availableSkills = form.userId
    ? skills.filter((s) => !assignedPairs.has(`${form.userId}:${s.id}`))
    : skills;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Manager Skills</h1>
      <p className="text-sm text-slate-500 mb-6 max-w-2xl">
        Assign specific skills to Capability Managers. A manager can only see skills, blueprints,
        assignments, and results for their assigned skills. Managers with no skills assigned get
        read-only catalog access only.
      </p>

      {/* Assign form */}
      <Card className="mb-6">
        <SectionHeader title="Assign Skill to Manager" />
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Manager</label>
            <select
              className="border border-slate-300 rounded-md px-3 py-2 text-sm min-w-[200px]"
              value={form.userId}
              onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value, skillId: "" }))}
            >
              <option value="">Select manager…</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.email})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Skill</label>
            <select
              className="border border-slate-300 rounded-md px-3 py-2 text-sm min-w-[200px]"
              value={form.skillId}
              onChange={(e) => setForm((f) => ({ ...f, skillId: e.target.value }))}
              disabled={!form.userId}
            >
              <option value="">Select skill…</option>
              {availableSkills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => assign.mutate({ userId: form.userId, skillId: form.skillId })}
            disabled={!form.userId || !form.skillId || assign.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            <Plus size={14} />
            Assign
          </button>

          {assign.isError && (
            <p className="text-xs text-red-600 self-center">
              {(assign.error as Error).message}
            </p>
          )}
        </div>
      </Card>

      {/* Manager list */}
      {isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : managers.length === 0 ? (
        <p className="text-sm text-slate-500">
          No Capability Managers found. Change a user's role to <strong>Capability Manager</strong>{" "}
          on the Users page first.
        </p>
      ) : (
        <div className="space-y-4">
          {byManager.map(({ manager, assignments }) => (
            <Card key={manager.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-slate-800">{manager.name}</p>
                  <p className="text-xs text-slate-500">{manager.email}</p>
                </div>
                {assignments.length === 0 && (
                  <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">
                    No skills assigned — read-only catalog
                  </span>
                )}
              </div>

              {assignments.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {assignments.map((a) => (
                    <span
                      key={a.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200"
                    >
                      {a.skill.name}
                      <button
                        onClick={() => remove.mutate(a.id)}
                        disabled={remove.isPending}
                        className="text-indigo-400 hover:text-red-500 transition-colors"
                        title="Remove"
                      >
                        <Trash2 size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
