import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Card, SectionHeader } from "../../components/Layout";
import { Trash2, Plus } from "lucide-react";

type ManagerQuestionBankRow = {
  id: string;
  userId: string;
  skillId: string;
  topicId: string;
  user: { id: string; name: string; email: string };
  skill: { id: string; name: string; code: string };
  topic: { id: string; name: string; category: { name: string } };
};

type User = { id: string; name: string; email: string; roles: string[] };
type Skill = { id: string; name: string; code: string };
type Topic = { id: string; name: string; category: { name: string } };

export default function ManagerQuestionBanksPage() {
  const qc = useQueryClient();

  const { data: rows = [], isLoading } = useQuery<ManagerQuestionBankRow[]>({
    queryKey: ["manager-question-banks"],
    queryFn: () => api("/admin/manager-question-banks"),
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: () => api("/admin/users"),
  });

  const { data: skills = [] } = useQuery<Skill[]>({
    queryKey: ["skills"],
    queryFn: () => api("/admin/skills"),
  });

  const { data: topics = [] } = useQuery<Topic[]>({
    queryKey: ["topics"],
    queryFn: () => api("/admin/topics"),
  });

  const managers = users.filter((u) => u.roles.includes("capability_manager"));

  const assign = useMutation({
    mutationFn: (body: { userId: string; skillId: string; topicId: string }) =>
      api("/admin/manager-question-banks", { method: "POST", json: body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manager-question-banks"] });
      setForm({ userId: "", skillId: "", topicId: "" });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/manager-question-banks/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["manager-question-banks"] }),
  });

  const [form, setForm] = useState({ userId: "", skillId: "", topicId: "" });

  const byManager = managers.map((manager) => ({
    manager,
    assignments: rows.filter((r) => r.userId === manager.id),
  }));

  const assignedTriples = new Set(rows.map((r) => `${r.userId}:${r.skillId}:${r.topicId}`));

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Manager Question Banks</h1>
      <p className="text-sm text-slate-500 mb-6 max-w-2xl">
        Grant Capability Managers edit access to specific question banks (skill + topic pairs).
        Managers can read the full skills/topics catalog but may only create or update questions
        in banks you assign here. This is separate from Manager Skills, which controls assignments,
        results, and blueprints.
      </p>

      <Card className="mb-6">
        <SectionHeader title="Grant question bank access" />
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Manager</label>
            <select
              className="border border-slate-300 rounded-md px-3 py-2 text-sm min-w-[200px]"
              value={form.userId}
              onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value, skillId: "", topicId: "" }))}
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
              onChange={(e) => setForm((f) => ({ ...f, skillId: e.target.value, topicId: "" }))}
              disabled={!form.userId}
            >
              <option value="">Select skill…</option>
              {skills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Topic</label>
            <select
              className="border border-slate-300 rounded-md px-3 py-2 text-sm min-w-[200px]"
              value={form.topicId}
              onChange={(e) => setForm((f) => ({ ...f, topicId: e.target.value }))}
              disabled={!form.skillId}
            >
              <option value="">Select topic…</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.category.name})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => assign.mutate(form)}
            disabled={
              !form.userId ||
              !form.skillId ||
              !form.topicId ||
              assign.isPending ||
              assignedTriples.has(`${form.userId}:${form.skillId}:${form.topicId}`)
            }
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            <Plus size={14} />
            Grant access
          </button>

          {assign.isError && (
            <p className="text-xs text-red-600 self-center">{(assign.error as Error).message}</p>
          )}
        </div>
      </Card>

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : managers.length === 0 ? (
        <p className="text-sm text-slate-500">No Capability Managers found.</p>
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
                    No question banks — cannot edit questions
                  </span>
                )}
              </div>

              {assignments.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {assignments.map((a) => (
                    <span
                      key={a.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200"
                    >
                      {a.skill.name} · {a.topic.name}
                      <button
                        onClick={() => remove.mutate(a.id)}
                        disabled={remove.isPending}
                        className="text-emerald-500 hover:text-red-500 transition-colors"
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
