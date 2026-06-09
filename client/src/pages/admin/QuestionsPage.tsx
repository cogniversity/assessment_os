import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { api } from "../../api/client";
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

export default function QuestionsPage() {
  const qc = useQueryClient();
  const [toast, setToast] = useState("");
  const [filters, setFilters] = useState({ topicId: "", skillId: "", status: "", skillRoleId: "", difficulty: "" });
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

  const skills = useQuery({ queryKey: ["skills"], queryFn: () => api<{ id: string; code: string; name: string }[]>("/admin/skills") });
  const topics = useQuery({ queryKey: ["topics"], queryFn: () => api<{ id: string; name: string; category: { name: string } }[]>("/admin/topics") });
  const skillRoles = useQuery({
    queryKey: ["skill-roles", form.skillId],
    queryFn: () => api<SkillRole[]>(`/admin/skills/${form.skillId}/roles`),
    enabled: !!form.skillId,
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

  const publishAll = () => {
    const drafts = questions.data?.filter((q) => q.status === "draft") ?? [];
    for (const q of drafts) publish.mutate(q.id);
  };

  const grouped = questions.data
    ? questions.data.reduce<Record<string, Question[]>>((acc, q) => {
        const key = `${q.topic.name} · ${q.skill.name}`;
        (acc[key] = acc[key] || []).push(q);
        return acc;
      }, {})
    : {};

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

      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
        <strong>How it works:</strong> Questions are tagged to a Topic, Skill, and one or more Skill Roles.
        Use <strong>single</strong> for one correct answer, or <strong>multi</strong> for select-all-that-apply.
        Multi-select scoring (all-or-nothing vs partial credit) is configured on the assessment blueprint.
      </div>

      <Card title="Filter questions">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Select value={filters.skillId} onChange={(e) => setFilters({ ...filters, skillId: e.target.value })}>
            <option value="">All skills</option>
            {skills.data?.map((s) => <option key={s.id} value={s.id}>{s.code} – {s.name}</option>)}
          </Select>
          <Select value={filters.topicId} onChange={(e) => setFilters({ ...filters, topicId: e.target.value })}>
            <option value="">All topics</option>
            {topics.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
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
      </Card>

      {(questions.data?.filter((q) => q.status === "draft").length ?? 0) > 0 && (
        <div className="flex justify-end">
          <Button onClick={publishAll}>
            Publish all {questions.data?.filter((q) => q.status === "draft").length} drafts
          </Button>
        </div>
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
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                      {q.skillRoles.map((r) => r.skillRole.code).join(", ")}
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
                </div>
                <div className="flex gap-1 shrink-0">
                  {q.status === "draft" ? (
                    <Button variant="primary" onClick={() => publish.mutate(q.id)} disabled={publish.isPending}>
                      Publish
                    </Button>
                  ) : (
                    <Button variant="secondary" onClick={() => unpublish.mutate(q.id)} disabled={unpublish.isPending}>
                      Unpublish
                    </Button>
                  )}
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
              onChange={(e) => setForm({ ...form, skillId: e.target.value, skillRoleIds: [], correctIndices: [] })}
            >
              <option value="">Select skill</option>
              {skills.data?.map((s) => <option key={s.id} value={s.id}>{s.code} – {s.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Topic *</label>
            <Select value={form.topicId} onChange={(e) => setForm({ ...form, topicId: e.target.value })}>
              <option value="">Select topic</option>
              {topics.data?.map((t) => <option key={t.id} value={t.id}>{t.category.name} → {t.name}</option>)}
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
