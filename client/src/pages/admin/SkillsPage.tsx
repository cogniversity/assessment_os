import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import { Card, Button, Input } from "../../components/Layout";
import { Pencil, Save, X, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";

interface SkillRole {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
  questionCount: number;
}

interface Skill {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  _count?: { roles: number; questions: number };
}

const emptyRoleForm = { code: "", name: "", description: "", sortOrder: "0" };

function RolesPanel({ skill }: { skill: Skill }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [addForm, setAddForm] = useState(emptyRoleForm);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editRoleForm, setEditRoleForm] = useState(emptyRoleForm);
  const [roleError, setRoleError] = useState("");

  const roles = useQuery({
    queryKey: ["skill-roles-detail", skill.id],
    queryFn: () => api<SkillRole[]>(`/admin/skills/${skill.id}/roles`),
    enabled: expanded,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["skill-roles-detail", skill.id] });
    qc.invalidateQueries({ queryKey: ["skill-roles", skill.id] });
    qc.invalidateQueries({ queryKey: ["skills-detail"] });
    qc.invalidateQueries({ queryKey: ["skills"] });
  };

  const addRole = useMutation({
    mutationFn: () =>
      api(`/admin/skills/${skill.id}/roles`, {
        method: "POST",
        json: {
          code: addForm.code.toUpperCase(),
          name: addForm.name,
          description: addForm.description || undefined,
          sortOrder: parseInt(addForm.sortOrder, 10) || 0,
        },
      }),
    onSuccess: () => { setAddForm(emptyRoleForm); setRoleError(""); invalidate(); },
    onError: (e: Error) => setRoleError(e.message),
  });

  const updateRole = useMutation({
    mutationFn: (roleId: string) =>
      api(`/admin/skills/${skill.id}/roles/${roleId}`, {
        method: "PATCH",
        json: {
          code: editRoleForm.code.toUpperCase(),
          name: editRoleForm.name,
          description: editRoleForm.description || undefined,
          sortOrder: parseInt(editRoleForm.sortOrder, 10) || 0,
        },
      }),
    onSuccess: () => { setEditingRoleId(null); setRoleError(""); invalidate(); },
    onError: (e: Error) => setRoleError(e.message),
  });

  const deleteRole = useMutation({
    mutationFn: (roleId: string) =>
      api(`/admin/skills/${skill.id}/roles/${roleId}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); },
    onError: (e: Error) => setRoleError(e.message),
  });

  function startEditRole(r: SkillRole) {
    setEditingRoleId(r.id);
    setEditRoleForm({ code: r.code, name: r.name, description: r.description ?? "", sortOrder: String(r.sortOrder) });
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <button
        type="button"
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {skill._count?.roles ?? 0} skill role{(skill._count?.roles ?? 0) !== 1 ? "s" : ""}
        {(skill._count?.roles ?? 0) === 0 && (
          <span className="ml-1 text-amber-600 font-medium">(required before you can create questions)</span>
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 pl-2">
          {roles.isLoading && <p className="text-xs text-slate-400">Loading…</p>}

          {/* Role list */}
          {roles.data && roles.data.length > 0 && (
            <div className="space-y-1.5">
              {roles.data.map((r) =>
                editingRoleId === r.id ? (
                  <div key={r.id} className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-2">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Code *</label>
                        <Input
                          value={editRoleForm.code}
                          onChange={(e) => setEditRoleForm((f) => ({ ...f, code: e.target.value }))}
                          placeholder="e.g. SR_DEV"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Name *</label>
                        <Input
                          value={editRoleForm.name}
                          onChange={(e) => setEditRoleForm((f) => ({ ...f, name: e.target.value }))}
                          placeholder="e.g. Senior Developer"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Description</label>
                        <Input
                          value={editRoleForm.description}
                          onChange={(e) => setEditRoleForm((f) => ({ ...f, description: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Sort order</label>
                        <Input
                          type="number"
                          value={editRoleForm.sortOrder}
                          onChange={(e) => setEditRoleForm((f) => ({ ...f, sortOrder: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="secondary" onClick={() => setEditingRoleId(null)}>
                        <X size={13} /> Cancel
                      </Button>
                      <Button
                        variant="primary"
                        disabled={!editRoleForm.code || !editRoleForm.name || updateRole.isPending}
                        onClick={() => updateRole.mutate(r.id)}
                      >
                        <Save size={13} />
                        {updateRole.isPending ? "Saving…" : "Save"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div key={r.id} className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-xs font-bold text-indigo-700 shrink-0">{r.code}</span>
                      <span className="text-sm font-medium text-slate-800 truncate">{r.name}</span>
                      {r.description && (
                        <span className="text-xs text-slate-400 truncate hidden sm:block">— {r.description}</span>
                      )}
                      <span className="text-[10px] text-slate-400 shrink-0">
                        sort: {r.sortOrder} · {r.questionCount} q
                      </span>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button variant="secondary" onClick={() => startEditRole(r)}>
                        <Pencil size={12} />
                      </Button>
                      <Button
                        variant="danger"
                        disabled={deleteRole.isPending}
                        onClick={() => {
                          if (confirm(`Delete role "${r.code}"? This will fail if it has questions.`)) {
                            deleteRole.mutate(r.id);
                          }
                        }}
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          {roles.data?.length === 0 && (
            <p className="text-xs text-slate-400 italic">No roles yet — add one below.</p>
          )}

          {/* Add role form */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-600">Add role</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Code *</label>
                <Input
                  value={addForm.code}
                  onChange={(e) => setAddForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="e.g. SR_DEV"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Name *</label>
                <Input
                  value={addForm.name}
                  onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Senior Developer"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Description</label>
                <Input
                  value={addForm.description}
                  onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Sort order</label>
                <Input
                  type="number"
                  value={addForm.sortOrder}
                  onChange={(e) => setAddForm((f) => ({ ...f, sortOrder: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>
            {roleError && <p className="text-xs text-red-600">{roleError}</p>}
            <Button
              onClick={() => addRole.mutate()}
              disabled={!addForm.code || !addForm.name || addRole.isPending}
            >
              <Plus size={13} />
              {addRole.isPending ? "Adding…" : "Add role"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface Concept {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
  questionCount: number;
}

const emptyConceptForm = { code: "", name: "", description: "", sortOrder: "0" };

function ConceptsPanel({ skill }: { skill: Skill }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [addForm, setAddForm] = useState(emptyConceptForm);
  const [conceptError, setConceptError] = useState("");

  const concepts = useQuery({
    queryKey: ["skill-concepts", skill.id],
    queryFn: () => api<Concept[]>(`/admin/skills/${skill.id}/concepts`),
    enabled: expanded,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["skill-concepts", skill.id] });
  };

  const addConcept = useMutation({
    mutationFn: () =>
      api(`/admin/skills/${skill.id}/concepts`, {
        method: "POST",
        json: {
          code: addForm.code.toUpperCase(),
          name: addForm.name,
          description: addForm.description || undefined,
          sortOrder: parseInt(addForm.sortOrder, 10) || 0,
        },
      }),
    onSuccess: () => {
      setAddForm(emptyConceptForm);
      setConceptError("");
      invalidate();
    },
    onError: (e: Error) => setConceptError(e.message),
  });

  const deleteConcept = useMutation({
    mutationFn: (conceptId: string) =>
      api(`/admin/skills/${skill.id}/concepts/${conceptId}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (e: Error) => setConceptError(e.message),
  });

  return (
    <div className="mt-2 border-t border-slate-100 pt-2">
      <button
        type="button"
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        Concepts (optional tags for capability reports)
      </button>
      {expanded && (
        <div className="mt-2 space-y-2 pl-4">
          {concepts.data?.map((c) => (
            <div key={c.id} className="flex items-center justify-between text-xs gap-2">
              <span>
                <span className="font-mono text-indigo-700">{c.code}</span> — {c.name}
                <span className="text-slate-400 ml-1">({c.questionCount} q)</span>
              </span>
              <button
                type="button"
                className="text-red-600 hover:underline"
                onClick={() => deleteConcept.mutate(c.id)}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          <div className="grid md:grid-cols-3 gap-2 pt-2">
            <Input
              value={addForm.code}
              onChange={(e) => setAddForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="Code e.g. CLOSURES"
            />
            <Input
              value={addForm.name}
              onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Display name"
            />
            <Button
              onClick={() => addConcept.mutate()}
              disabled={!addForm.code || !addForm.name || addConcept.isPending}
            >
              <Plus size={13} /> Add
            </Button>
          </div>
          {conceptError && <p className="text-xs text-red-600">{conceptError}</p>}
        </div>
      )}
    </div>
  );
}

export default function SkillsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["skills-detail"],
    queryFn: () => api<Skill[]>("/admin/skills"),
  });
  const [form, setForm] = useState({ code: "", name: "", description: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ code: "", name: "", description: "" });
  const [toast, setToast] = useState("");

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 5000);
  }

  const create = useMutation({
    mutationFn: () => api("/admin/skills", { method: "POST", json: form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills-detail"] });
      qc.invalidateQueries({ queryKey: ["skills"] });
      setForm({ code: "", name: "", description: "" });
      showToast("Skill created");
    },
  });

  const update = useMutation({
    mutationFn: ({ id, json }: { id: string; json: Record<string, string> }) =>
      api<Skill & { _message?: string }>(`/admin/skills/${id}`, { method: "PATCH", json }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["skills-detail"] });
      qc.invalidateQueries({ queryKey: ["skills"] });
      setEditingId(null);
      showToast(res._message ?? "Skill updated");
    },
    onError: (e: Error) => showToast(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/skills/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills-detail"] });
      qc.invalidateQueries({ queryKey: ["skills"] });
      showToast("Skill deleted");
    },
    onError: (e: Error) => showToast(e.message),
  });

  function startEdit(s: Skill) {
    setEditingId(s.id);
    setEditForm({ code: s.code, name: s.name, description: s.description ?? "" });
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 max-w-md bg-indigo-600 text-white px-4 py-2.5 rounded-lg shadow-lg z-50 text-sm">
          {toast}
        </div>
      )}
      <h1 className="text-2xl font-semibold">Skills</h1>
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
        <strong>Skill ID</strong> is the unique <code>code</code> (e.g. <code>JS001</code>). Questions,
        blueprints, and assignments link by internal UUID — you can rename the Skill ID and everything stays
        connected. Each skill needs at least one <strong>role</strong> before you can create questions for it.
      </div>

      <Card title="Add skill">
        <div className="grid md:grid-cols-3 gap-2 mb-2">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Skill ID (code) *</label>
            <Input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="e.g. JS001"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Name *</label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. JavaScript"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Description</label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Brief description"
            />
          </div>
        </div>
        <Button onClick={() => create.mutate()} disabled={!form.code || !form.name || create.isPending}>
          {create.isPending ? "Creating..." : "Create skill"}
        </Button>
        {create.isError && <p className="text-red-600 text-xs mt-1">{(create.error as Error).message}</p>}
      </Card>

      <Card title={`Skills (${data?.length ?? 0})`}>
        {isLoading ? (
          <p className="text-slate-500">Loading...</p>
        ) : (
          <div className="divide-y">
            {data?.map((s) => (
              <div key={s.id} className="py-4">
                {editingId === s.id ? (
                  <div className="space-y-3 bg-slate-50 rounded-lg p-4 border border-slate-200">
                    <div className="grid md:grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs font-medium text-slate-600 block mb-1">Skill ID (code)</label>
                        <Input
                          value={editForm.code}
                          onChange={(e) => setEditForm((f) => ({ ...f, code: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 block mb-1">Name</label>
                        <Input
                          value={editForm.name}
                          onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 block mb-1">Description</label>
                        <Input
                          value={editForm.description}
                          onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="secondary" onClick={() => setEditingId(null)}>
                        <X size={14} /> Cancel
                      </Button>
                      <Button
                        variant="primary"
                        disabled={!editForm.code || !editForm.name || update.isPending}
                        onClick={() =>
                          update.mutate({ id: s.id, json: { code: editForm.code, name: editForm.name, description: editForm.description } })
                        }
                      >
                        <Save size={14} />
                        {update.isPending ? "Saving…" : "Save"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <span className="font-mono text-indigo-700 font-semibold">{s.code}</span>
                        <span className="ml-2 font-medium">{s.name}</span>
                        {s.description && (
                          <span className="ml-2 text-slate-500 text-sm">— {s.description}</span>
                        )}
                        <p className="text-xs text-slate-400 mt-0.5">
                          {s._count?.roles ?? 0} roles · {s._count?.questions ?? 0} questions
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button variant="secondary" onClick={() => startEdit(s)}>
                          <Pencil size={14} /> Edit
                        </Button>
                        <Button variant="danger" onClick={() => remove.mutate(s.id)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                    <RolesPanel skill={s} />
                    <ConceptsPanel skill={s} />
                  </div>
                )}
              </div>
            ))}
            {data?.length === 0 && <p className="text-slate-500 text-sm py-2">No skills yet.</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
