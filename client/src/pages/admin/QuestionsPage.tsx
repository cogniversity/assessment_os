import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { Pencil, Trash2 } from "lucide-react";
import { Card, Button, Input, Select } from "../../components/Layout";

interface SkillRole {
  id: string;
  code: string;
  name: string;
}

interface Question {
  id: string;
  stem: string;
  status: "draft" | "published";
  difficulty: string;
  questionType: "single" | "multi";
  topic: { id: string; name: string };
  skill: { id: string; code: string; name: string };
  skillRoles: { skillRole: SkillRole }[];
  options: string[];
  correctIndices: number[];
  explanation?: string;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "published"
      ? "bg-green-100 text-green-700 border-green-300"
      : "bg-yellow-100 text-yellow-700 border-yellow-300";
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full border font-medium ${cls}`}>
      {status}
    </span>
  );
}

type QuestionBankGrant = {
  skillId: string;
  topicId: string;
  skill: { id: string; code: string; name: string };
  topic: { id: string; name: string };
};

export default function QuestionsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isManager = user?.role === "capability_manager";
  const [toast, setToast] = useState("");
  const [editingRolesId, setEditingRolesId] = useState<string | null>(null);
  const [editingRoleIds, setEditingRoleIds] = useState<string[]>([]);
  const [filters, setFilters] = useState({ topicId: "", skillId: "", status: "", skillRoleId: "", difficulty: "" });
  const [missingRolesOnly, setMissingRolesOnly] = useState(false);
  const [form, setForm] = useState({
    topicId: "",
    skillId: "",
    skillRoleIds: [] as string[],
    questionType: "single" as "single" | "multi",
    difficulty: "medium",
    stem: "",
    options: "",
    correctIndices: [] as number[],
    explanation: "",
    status: "draft",
  });

  const grants = useQuery({
    queryKey: ["manager-question-banks"],
    queryFn: () => api<QuestionBankGrant[]>("/manager/question-banks"),
    enabled: isManager,
  });

  const skills = useQuery({ queryKey: ["skills"], queryFn: () => api<{ id: string; code: string; name: string }[]>("/admin/skills") });
  const topics = useQuery({ queryKey: ["topics"], queryFn: () => api<{ id: string; name: string; category: { name: string } }[]>("/admin/topics") });

  const grantPairs = grants.data ?? [];
  const hasGrants = !isManager || grantPairs.length > 0;

  const createSkills = useMemo(() => {
    if (!isManager) return skills.data ?? [];
    const ids = new Set(grantPairs.map((g) => g.skillId));
    return (skills.data ?? []).filter((s) => ids.has(s.id));
  }, [isManager, grantPairs, skills.data]);

  const createTopics = useMemo(() => {
    if (!form.skillId) return [];
    if (!isManager) return topics.data ?? [];
    const ids = new Set(grantPairs.filter((g) => g.skillId === form.skillId).map((g) => g.topicId));
    return (topics.data ?? []).filter((t) => ids.has(t.id));
  }, [isManager, grantPairs, form.skillId, topics.data]);
  const skillRoles = useQuery({
    queryKey: ["skill-roles", form.skillId],
    queryFn: () => api<SkillRole[]>(`/admin/skills/${form.skillId}/roles`),
    enabled: !!form.skillId,
  });

  const filterSkillRoles = useQuery({
    queryKey: ["skill-roles", filters.skillId],
    queryFn: () => api<SkillRole[]>(`/admin/skills/${filters.skillId}/roles`),
    enabled: !!filters.skillId,
  });

  const parsedOptions = useMemo(
    () => form.options.split("\n").map((s) => s.trim()).filter(Boolean),
    [form.options]
  );

  const qParams = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) qParams.set(k, v); });
  const questions = useQuery({
    queryKey: ["questions", filters],
    queryFn: () => api<Question[]>(`/admin/questions?${qParams}`),
  });

  const editingQuestion = questions.data?.find((q) => q.id === editingRolesId);
  const editSkillRoles = useQuery({
    queryKey: ["skill-roles", editingQuestion?.skill.id],
    queryFn: () => api<SkillRole[]>(`/admin/skills/${editingQuestion!.skill.id}/roles`),
    enabled: !!editingQuestion?.skill.id,
  });

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  const toggleCorrect = (index: number) => {
    if (form.questionType === "single") {
      setForm({ ...form, correctIndices: [index] });
      return;
    }
    const set = new Set(form.correctIndices);
    if (set.has(index)) set.delete(index);
    else set.add(index);
    setForm({ ...form, correctIndices: [...set].sort((a, b) => a - b) });
  };

  const create = useMutation({
    mutationFn: () =>
      api("/admin/questions", {
        method: "POST",
        json: {
          topicId: form.topicId,
          skillId: form.skillId,
          skillRoleIds: form.skillRoleIds,
          questionType: form.questionType,
          difficulty: form.difficulty,
          stem: form.stem,
          options: parsedOptions,
          correctIndices: form.correctIndices,
          explanation: form.explanation || undefined,
          status: form.status,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["questions"] });
      setForm({ ...form, stem: "", options: "", correctIndices: [], explanation: "" });
      showToast("Question created successfully");
    },
  });

  const publish = useMutation({
    mutationFn: (id: string) => api<Question>(`/admin/questions/${id}/publish`, { method: "PATCH" }),
    onSuccess: (data) => {
      qc.setQueryData<Question[]>(["questions", filters], (old) =>
        old?.map((q) => (q.id === data.id ? { ...q, status: "published" } : q))
      );
      showToast(`"${data.stem.slice(0, 40)}..." published`);
    },
  });

  const unpublish = useMutation({
    mutationFn: (id: string) =>
      api<Question>(`/admin/questions/${id}`, { method: "PUT", json: { status: "draft" } }),
    onSuccess: (data) => {
      qc.setQueryData<Question[]>(["questions", filters], (old) =>
        old?.map((q) => (q.id === data.id ? { ...q, status: "draft" } : q))
      );
      showToast("Question moved back to draft");
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/questions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["questions"] });
      showToast("Question deleted");
    },
  });

  const updateRoles = useMutation({
    mutationFn: ({ id, skillRoleIds }: { id: string; skillRoleIds: string[] }) =>
      api<Question>(`/admin/questions/${id}`, { method: "PUT", json: { skillRoleIds } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["questions"] });
      setEditingRolesId(null);
      showToast("Skill roles updated");
    },
  });

  function startEditRoles(q: Question) {
    setEditingRolesId(q.id);
    setEditingRoleIds(q.skillRoles.map((r) => r.skillRole.id));
  }

  const publishAll = () => {
    const drafts = questions.data?.filter((q) => q.status === "draft") ?? [];
    for (const q of drafts) publish.mutate(q.id);
  };

  const visibleQuestions = useMemo(() => {
    const rows = questions.data ?? [];
    if (!missingRolesOnly) return rows;
    return rows.filter((q) => q.skillRoles.length === 0);
  }, [questions.data, missingRolesOnly]);

  const missingRolesCount = questions.data?.filter((q) => q.skillRoles.length === 0).length ?? 0;

  const grouped = visibleQuestions.reduce<Record<string, Question[]>>((acc, q) => {
    const key = `${q.topic.name} · ${q.skill.name}`;
    (acc[key] = acc[key] || []).push(q);
    return acc;
  }, {});

  const canCreate =
    form.topicId &&
    form.skillId &&
    form.skillRoleIds.length > 0 &&
    form.stem &&
    parsedOptions.length >= 2 &&
    (form.questionType === "single" ? form.correctIndices.length === 1 : form.correctIndices.length >= 2);

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm">
          {toast}
        </div>
      )}

      <h1 className="text-2xl font-semibold">Question Bank</h1>

      {isManager && !hasGrants && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          You have no question bank grants yet. Ask an admin to assign skill + topic banks on{" "}
          <strong>Manager Question Banks</strong>.
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
        <strong>How it works:</strong> Every question needs at least one <strong>skill role</strong> (e.g. ASSOC, SR_DEV) in
        addition to topic and skill. Roles are defined per skill under{" "}
        <Link to="/admin/skills" className="underline font-medium">Skills</Link>.
        Assignments only count published questions that match skill + topics + skill role.
      </div>

      {missingRolesCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-900">
          <strong>{missingRolesCount} question{missingRolesCount !== 1 ? "s" : ""} missing skill roles.</strong>{" "}
          Click <strong>Assign roles</strong> on each row, or enable the filter below. If the role list is empty, add roles
          first on the <Link to="/admin/skills" className="underline font-medium">Skills</Link> page.
        </div>
      )}

      <Card title="Filter questions">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Select
            value={filters.skillId}
            onChange={(e) => setFilters({ ...filters, skillId: e.target.value, skillRoleId: "" })}
          >
            <option value="">All skills</option>
            {skills.data?.map((s) => <option key={s.id} value={s.id}>{s.code} – {s.name}</option>)}
          </Select>
          <Select value={filters.topicId} onChange={(e) => setFilters({ ...filters, topicId: e.target.value })}>
            <option value="">All topics</option>
            {topics.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          <Select
            value={filters.skillRoleId}
            onChange={(e) => setFilters({ ...filters, skillRoleId: e.target.value })}
            disabled={!filters.skillId}
          >
            <option value="">All roles</option>
            {filterSkillRoles.data?.map((r) => <option key={r.id} value={r.id}>{r.code} – {r.name}</option>)}
          </Select>
          <Select value={filters.difficulty} onChange={(e) => setFilters({ ...filters, difficulty: e.target.value })}>
            <option value="">All difficulties</option>
            {["easy", "medium", "hard"].map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
          <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All statuses</option>
            <option value="draft">Draft only</option>
            <option value="published">Published only</option>
          </Select>
        </div>
        <label className="flex items-center gap-2 mt-3 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={missingRolesOnly}
            onChange={(e) => setMissingRolesOnly(e.target.checked)}
            className="rounded border-slate-300 accent-indigo-600"
          />
          Show only questions missing skill roles
        </label>
      </Card>

      {(questions.data?.filter((q) => q.status === "draft").length ?? 0) > 0 && (
        <div className="flex justify-end">
          <Button onClick={publishAll}>
            Publish all {questions.data?.filter((q) => q.status === "draft").length} drafts
          </Button>
        </div>
      )}

      {visibleQuestions.length === 0 && !questions.isLoading && (
        <p className="text-sm text-slate-500">
          {missingRolesOnly ? "No questions missing skill roles." : "No questions match these filters."}
        </p>
      )}

      {Object.entries(grouped).map(([group, qs]) => (
        <Card key={group} title={group}>
          <div className="divide-y">
            {qs.map((q) => (
              <div key={q.id} className="py-3 flex items-start gap-3">
                <div className="flex-1">
                  <div className="flex flex-wrap gap-2 mb-1">
                    <StatusBadge status={q.status} />
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">{q.questionType}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${q.skillRoles.length === 0 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                      {q.skillRoles.length === 0
                        ? "No skill roles"
                        : q.skillRoles.map((r) => r.skillRole.code).join(", ")}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded ${q.difficulty === "hard" ? "bg-red-100 text-red-700" : q.difficulty === "medium" ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>{q.difficulty}</span>
                  </div>
                  <p className="text-sm font-medium">{q.stem}</p>
                  <ol className="text-xs text-slate-500 mt-1 list-none pl-0 grid grid-cols-2 gap-0.5">
                    {(q.options as string[]).map((opt, i) => (
                      <li key={i} className={q.correctIndices.includes(i) ? "text-green-700 font-medium" : ""}>
                        {String.fromCharCode(65 + i)}. {opt}{q.correctIndices.includes(i) ? " ✓" : ""}
                      </li>
                    ))}
                  </ol>
                  {editingRolesId === q.id && (
                    <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                      <p className="text-xs font-semibold text-slate-700">
                        Skill roles for {q.skill.code} – {q.skill.name}
                      </p>
                      {editSkillRoles.isLoading && (
                        <p className="text-xs text-slate-500">Loading roles…</p>
                      )}
                      {!editSkillRoles.isLoading && (editSkillRoles.data?.length ?? 0) === 0 && (
                        <p className="text-xs text-amber-800">
                          No roles exist for this skill yet. Open{" "}
                          <Link to="/admin/skills" className="underline font-medium">Skills</Link>, expand{" "}
                          <strong>{q.skill.name}</strong>, and add a role (e.g. ASSOC, SR_DEV), then return here.
                        </p>
                      )}
                      {(editSkillRoles.data?.length ?? 0) > 0 && (
                        <div className="space-y-1.5">
                          {editSkillRoles.data!.map((r) => (
                            <label key={r.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editingRoleIds.includes(r.id)}
                                onChange={(e) => {
                                  setEditingRoleIds((prev) =>
                                    e.target.checked ? [...prev, r.id] : prev.filter((id) => id !== r.id)
                                  );
                                }}
                                className="rounded border-slate-300 accent-indigo-600"
                              />
                              <span className="font-mono text-xs text-indigo-700">{r.code}</span>
                              <span>{r.name}</span>
                            </label>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button
                          disabled={
                            editingRoleIds.length === 0 ||
                            updateRoles.isPending ||
                            (editSkillRoles.data?.length ?? 0) === 0
                          }
                          onClick={() => updateRoles.mutate({ id: q.id, skillRoleIds: editingRoleIds })}
                        >
                          Save roles
                        </Button>
                        <Button variant="secondary" onClick={() => setEditingRolesId(null)}>
                          Cancel
                        </Button>
                      </div>
                      {updateRoles.isError && (
                        <p className="text-xs text-red-600">{(updateRoles.error as Error).message}</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 shrink-0 items-end">
                  {q.skillRoles.length === 0 && (
                    <Button
                      variant="primary"
                      onClick={() => (editingRolesId === q.id ? setEditingRolesId(null) : startEditRoles(q))}
                    >
                      Assign roles
                    </Button>
                  )}
                  <div className="flex gap-1">
                  {q.status === "draft" ? (
                    <Button variant="primary" onClick={() => publish.mutate(q.id)} disabled={publish.isPending}>
                      Publish
                    </Button>
                  ) : (
                    <Button variant="secondary" onClick={() => unpublish.mutate(q.id)} disabled={unpublish.isPending}>
                      Unpublish
                    </Button>
                  )}
                  {q.skillRoles.length > 0 && (
                    <Button
                      variant="secondary"
                      onClick={() => (editingRolesId === q.id ? setEditingRolesId(null) : startEditRoles(q))}
                      title="Edit skill roles"
                    >
                      <Pencil size={14} />
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    disabled={remove.isPending}
                    onClick={() => {
                      const preview = q.stem.length > 60 ? `${q.stem.slice(0, 60)}…` : q.stem;
                      if (confirm(`Delete this question?\n\n"${preview}"`)) {
                        remove.mutate(q.id);
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Card title="Add a new question">
        <div className="grid md:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Skill *</label>
            <Select
              value={form.skillId}
              onChange={(e) => setForm({ ...form, skillId: e.target.value, topicId: "", skillRoleIds: [], correctIndices: [] })}
              disabled={isManager && !hasGrants}
            >
              <option value="">Select skill</option>
              {createSkills.map((s) => <option key={s.id} value={s.id}>{s.code} – {s.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Topic *</label>
            <Select
              value={form.topicId}
              onChange={(e) => setForm({ ...form, topicId: e.target.value })}
              disabled={isManager && !hasGrants}
            >
              <option value="">Select topic</option>
              {createTopics.map((t) => <option key={t.id} value={t.id}>{t.category.name} → {t.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Skill roles * <span className="font-normal">(hold Ctrl/Cmd to multi-select)</span></label>
            <Select
              multiple
              className="h-24"
              value={form.skillRoleIds}
              onChange={(e) =>
                setForm({ ...form, skillRoleIds: Array.from(e.target.selectedOptions, (o) => o.value) })
              }
              disabled={!form.skillId}
            >
              {!form.skillId && <option disabled>— select a skill first —</option>}
              {form.skillId && skillRoles.isLoading && <option disabled>Loading…</option>}
              {form.skillId && !skillRoles.isLoading && (skillRoles.data?.length ?? 0) === 0 && (
                <option disabled>No roles for this skill — add them in Skills admin</option>
              )}
              {skillRoles.data?.map((r) => (
                <option key={r.id} value={r.id}>{r.code} – {r.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Question type</label>
            <Select
              value={form.questionType}
              onChange={(e) =>
                setForm({ ...form, questionType: e.target.value as "single" | "multi", correctIndices: [] })
              }
            >
              <option value="single">Single answer</option>
              <option value="multi">Multi-select (select all that apply)</option>
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Difficulty</label>
            <Select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
              {["easy", "medium", "hard"].map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </div>
        </div>
        <div className="mb-2">
          <label className="text-xs text-slate-500 block mb-1">Question stem *</label>
          <Input value={form.stem} onChange={(e) => setForm({ ...form, stem: e.target.value })} />
        </div>
        <div className="mb-2">
          <label className="text-xs text-slate-500 block mb-1">Options (one per line) *</label>
          <textarea
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm h-24 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={form.options}
            onChange={(e) => setForm({ ...form, options: e.target.value, correctIndices: [] })}
          />
        </div>
        {parsedOptions.length >= 2 && (
          <div className="mb-3">
            <label className="text-xs text-slate-500 block mb-1">
              Correct answer{form.questionType === "multi" ? "s" : ""} *
            </label>
            <div className="space-y-1">
              {parsedOptions.map((opt, i) => (
                <label key={i} className="flex items-center gap-2 text-sm">
                  <input
                    type={form.questionType === "multi" ? "checkbox" : "radio"}
                    name="correct"
                    checked={form.correctIndices.includes(i)}
                    onChange={() => toggleCorrect(i)}
                  />
                  {String.fromCharCode(65 + i)}. {opt}
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="mb-3">
          <label className="text-xs text-slate-500 block mb-1">Explanation (optional)</label>
          <Input value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} />
        </div>
        <div className="flex gap-2 items-center">
          <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-32">
            <option value="draft">Save as draft</option>
            <option value="published">Publish immediately</option>
          </Select>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !canCreate}>
            {create.isPending ? "Creating..." : "Create question"}
          </Button>
          {create.isError && <p className="text-red-600 text-xs">{(create.error as Error).message}</p>}
        </div>
      </Card>
    </div>
  );
}
