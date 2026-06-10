import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { Card, Button, Input, Select, Badge, SectionHeader } from "../../components/Layout";
import {
  Plus, Pencil, Trash2, CheckCircle2, Award,
  X, BookOpen, Users, Timer,
  Target, BarChart3, Info
} from "lucide-react";

interface Skill { id: string; code: string; name: string }
interface Topic { id: string; name: string; category?: { name: string } }
interface SkillRole { id: string; code: string; name: string }
interface Blueprint {
  id: string;
  name: string;
  description?: string;
  skillId: string;
  skillRoleId: string;
  easyCount: number;
  mediumCount: number;
  hardCount: number;
  questionCount: number;
  timeLimitMinutes: number;
  passMark: number;
  issueCertificate: boolean;
  showProficiencyOnCert: boolean;
  certValidityDays: number;
  revealAnswersAfterTest: boolean;
  multiSelectScoringMode: "all_or_nothing" | "partial_credit";
  proficiencyThresholds: number[];
  proctoringPhotoIntervalMinutes: number;
  proctoringInstructions?: string | null;
  skill: { id: string; code: string; name: string };
  skillRole: { id: string; code: string; name: string };
  topics: { topicId: string; topic: { id: string; name: string; category: { name: string } } }[];
  createdBy?: { id: string; name: string };
  _count?: { assessments: number };
}

const DEFAULT_THRESHOLDS = [40, 55, 70, 85, 95];

const THRESHOLD_LABELS = [
  { level: "Entry → Beginner",           key: 0 },
  { level: "Beginner → Adv. Beginner",   key: 1 },
  { level: "Adv. Beginner → Competent",  key: 2 },
  { level: "Competent → Proficient",     key: 3 },
  { level: "Proficient → Expert",        key: 4 },
];

const emptyForm = {
  name: "",
  description: "",
  skillId: "",
  skillRoleId: "",
  topicIds: [] as string[],
  easyCount: "2",
  mediumCount: "3",
  hardCount: "1",
  timeLimitMinutes: "60",
  passMark: "60",
  issueCertificate: false,
  showProficiencyOnCert: false,
  certValidityDays: "365",
  revealAnswersAfterTest: false,
  multiSelectScoringMode: "all_or_nothing" as "all_or_nothing" | "partial_credit",
  proctoringPhotoIntervalMinutes: "5",
  proctoringInstructions: "",
  proficiencyThresholds: DEFAULT_THRESHOLDS.map(String),
};

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 text-xs text-blue-700">
      <Info size={13} className="shrink-0 mt-0.5" />
      <p>{children}</p>
    </div>
  );
}

type ManagerSkillRow = { skillId: string; skill: Skill };

export default function BlueprintsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isManager = user?.role === "capability_manager";
  const [editing, setEditing] = useState<string | null>(null); // blueprint id, or "new", or null
  const [form, setForm] = useState(emptyForm);
  const [toast, setToast] = useState("");

  const blueprints = useQuery({ queryKey: ["blueprints"], queryFn: () => api<Blueprint[]>("/admin/blueprints") });
  const skills = useQuery({ queryKey: ["skills"], queryFn: () => api<Skill[]>("/admin/skills") });
  const managerSkills = useQuery({
    queryKey: ["manager-assigned-skills"],
    queryFn: () => api<ManagerSkillRow[]>("/manager/skills"),
    enabled: isManager,
  });

  const blueprintSkills = useMemo(() => {
    if (!isManager) return skills.data ?? [];
    return managerSkills.data?.map((r) => r.skill) ?? [];
  }, [isManager, skills.data, managerSkills.data]);

  const canManageBlueprints = !isManager || blueprintSkills.length > 0;
  const topics = useQuery({ queryKey: ["topics"], queryFn: () => api<Topic[]>("/admin/topics") });
  const skillRoles = useQuery({
    queryKey: ["skill-roles", form.skillId],
    queryFn: () => api<SkillRole[]>(`/admin/skills/${form.skillId}/roles`),
    enabled: !!form.skillId,
  });

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  function openNew() {
    setForm(emptyForm);
    setEditing("new");
  }

  function openEdit(bp: Blueprint) {
    const raw = Array.isArray(bp.proficiencyThresholds) ? bp.proficiencyThresholds : DEFAULT_THRESHOLDS;
    const thresholds = DEFAULT_THRESHOLDS.map((def, i) => String(raw[i] ?? def));
    setForm({
      name: bp.name,
      description: bp.description ?? "",
      skillId: bp.skillId,
      skillRoleId: bp.skillRoleId,
      topicIds: bp.topics.map((t) => t.topicId),
      easyCount: String(bp.easyCount),
      mediumCount: String(bp.mediumCount),
      hardCount: String(bp.hardCount),
      timeLimitMinutes: String(bp.timeLimitMinutes),
      passMark: String(bp.passMark),
      issueCertificate: bp.issueCertificate,
      showProficiencyOnCert: bp.showProficiencyOnCert,
      certValidityDays: String(bp.certValidityDays),
      revealAnswersAfterTest: bp.revealAnswersAfterTest,
      multiSelectScoringMode: bp.multiSelectScoringMode,
      proctoringPhotoIntervalMinutes: String(bp.proctoringPhotoIntervalMinutes ?? 5),
      proctoringInstructions: bp.proctoringInstructions ?? "",
      proficiencyThresholds: thresholds,
    });
    setEditing(bp.id);
  }

  function closeForm() {
    setEditing(null);
    setForm(emptyForm);
  }

  const payload = () => ({
    name: form.name,
    description: form.description || undefined,
    skillId: form.skillId,
    skillRoleId: form.skillRoleId,
    topicIds: form.topicIds,
    easyCount: parseInt(form.easyCount, 10) || 0,
    mediumCount: parseInt(form.mediumCount, 10) || 0,
    hardCount: parseInt(form.hardCount, 10) || 0,
    timeLimitMinutes: parseInt(form.timeLimitMinutes, 10) || 0,
    passMark: parseInt(form.passMark, 10) || 60,
    issueCertificate: form.issueCertificate,
    showProficiencyOnCert: form.showProficiencyOnCert,
    certValidityDays: parseInt(form.certValidityDays, 10) || 0,
    revealAnswersAfterTest: form.revealAnswersAfterTest,
    multiSelectScoringMode: form.multiSelectScoringMode,
    proctoringPhotoIntervalMinutes: parseInt(form.proctoringPhotoIntervalMinutes, 10) ?? 5,
    proctoringInstructions: form.proctoringInstructions || null,
    proficiencyThresholds: form.proficiencyThresholds.map((v, i) => {
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? Math.min(Math.max(n, 0), 100) : DEFAULT_THRESHOLDS[i];
    }),
  });

  const createMutation = useMutation({
    mutationFn: () => api("/admin/blueprints", { method: "POST", json: payload() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blueprints"] });
      showToast("Blueprint created!");
      closeForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => api(`/admin/blueprints/${editing}`, { method: "PUT", json: payload() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blueprints"] });
      showToast("Blueprint updated!");
      closeForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/admin/blueprints/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blueprints"] });
      showToast("Blueprint deleted.");
    },
  });

  const totalQ = (parseInt(form.easyCount) || 0) + (parseInt(form.mediumCount) || 0) + (parseInt(form.hardCount) || 0);
  const canSave =
    form.name.trim().length > 0 &&
    form.skillId &&
    form.skillRoleId &&
    form.topicIds.length > 0 &&
    totalQ > 0;

  const isNew = editing === "new";
  const saving = createMutation.isPending || updateMutation.isPending;
  const saveError = createMutation.error || updateMutation.error;

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 bg-green-600 text-white px-4 py-2.5 rounded-lg shadow-lg z-50 text-sm flex items-center gap-2">
          <CheckCircle2 size={15} /> {toast}
        </div>
      )}

      <div className="flex items-start justify-between">
        <SectionHeader
          title="Blueprints"
          description="Reusable assessment templates. Apply a blueprint when assigning to pre-fill all settings."
        />
        {!editing && canManageBlueprints && (
          <Button onClick={openNew} className="shrink-0 mt-1">
            <Plus size={15} /> New Blueprint
          </Button>
        )}
      </div>

      {isManager && !canManageBlueprints && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          You have no assigned skills yet. Ask an admin to assign skills on <strong>Manager Skills</strong> before
          creating blueprints.
        </div>
      )}

      <div className={`grid gap-6 ${editing ? "lg:grid-cols-[1fr_420px]" : ""}`}>
        {/* ── Blueprint list ── */}
        <div className="space-y-3">
          {blueprints.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
          {blueprints.data?.length === 0 && (
            <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
              <BookOpen size={32} className="mx-auto text-slate-300 mb-3" />
              <p className="font-medium text-slate-600">No blueprints yet</p>
              <p className="text-xs text-slate-400 mt-1">Create your first blueprint to speed up assessment assignment.</p>
              <Button className="mt-4" onClick={openNew}><Plus size={14} /> New Blueprint</Button>
            </div>
          )}
          {blueprints.data?.map((bp) => {
            const isEditingThis = editing === bp.id;
            return (
              <div
                key={bp.id}
                className={`bg-white rounded-xl border shadow-sm transition-all ${
                  isEditingThis ? "border-indigo-400 ring-2 ring-indigo-100" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="p-4 flex items-start gap-4">
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                    <Target size={18} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-900 text-sm">{bp.name}</p>
                      {bp._count && bp._count.assessments > 0 && (
                        <Badge color="indigo">{bp._count.assessments} use{bp._count.assessments !== 1 ? "s" : ""}</Badge>
                      )}
                      {bp.issueCertificate && <Badge color="green"><Award size={10} className="mr-0.5 inline" />Cert</Badge>}
                    </div>
                    {bp.description && (
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{bp.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                        <BookOpen size={12} className="text-indigo-500" />
                        {bp.skill.code} · {bp.skillRole.name}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                        <Users size={12} className="text-slate-400" />
                        {bp.topics.map((t) => t.topic.name).join(", ")}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                        <BarChart3 size={12} className="text-slate-400" />
                        {bp.easyCount}E {bp.mediumCount}M {bp.hardCount}H = {bp.questionCount}Q
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                        <Timer size={12} className="text-slate-400" />
                        {bp.timeLimitMinutes > 0 ? `${bp.timeLimitMinutes} min` : "No limit"}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                        <CheckCircle2 size={12} className="text-slate-400" />
                        Pass {bp.passMark}%
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => (isEditingThis ? closeForm() : openEdit(bp))}
                      className={`p-2 rounded-lg text-sm transition-colors ${
                        isEditingThis
                          ? "bg-indigo-100 text-indigo-700"
                          : "text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                      }`}
                      title={isEditingThis ? "Cancel edit" : "Edit"}
                    >
                      {isEditingThis ? <X size={15} /> : <Pencil size={15} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete "${bp.name}"?`)) deleteMutation.mutate(bp.id);
                      }}
                      className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Create / Edit form ── */}
        {editing && (
          <div className="sticky top-4 h-fit">
            <Card
              title={isNew ? "New Blueprint" : "Edit Blueprint"}
              subtitle={isNew ? "Define a reusable assessment template." : "Changes apply to future assignments only."}
              actions={
                <button type="button" onClick={closeForm} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100">
                  <X size={16} />
                </button>
              }
            >
              <div className="space-y-4">
                {/* Name */}
                <div>
                  <FieldLabel label="Blueprint name" required />
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. JavaScript — Senior Developer"
                  />
                </div>

                {/* Description */}
                <div>
                  <FieldLabel label="Description" />
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Optional notes about this blueprint…"
                    rows={2}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none placeholder:text-slate-400"
                  />
                </div>

                {/* Skill */}
                <div>
                  <FieldLabel label="Skill" required />
                  <Select
                    value={form.skillId}
                    onChange={(e) => setForm((f) => ({ ...f, skillId: e.target.value, skillRoleId: "" }))}
                  >
                    <option value="">Select a skill…</option>
                    {blueprintSkills.map((s) => (
                      <option key={s.id} value={s.id}>{s.code} – {s.name}</option>
                    ))}
                  </Select>
                </div>

                {/* Skill role */}
                <div>
                  <FieldLabel label="Skill role" required />
                  <Select
                    value={form.skillRoleId}
                    onChange={(e) => setForm((f) => ({ ...f, skillRoleId: e.target.value }))}
                    disabled={!form.skillId}
                  >
                    <option value="">Select a role…</option>
                    {skillRoles.data?.map((r) => (
                      <option key={r.id} value={r.id}>{r.code} – {r.name}</option>
                    ))}
                  </Select>
                  {!form.skillId && (
                    <p className="text-xs text-slate-400 mt-1">Choose a skill first.</p>
                  )}
                </div>

                {/* Topics */}
                <div>
                  <FieldLabel label="Topics" required />
                  <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 max-h-48 overflow-y-auto">
                    {topics.data?.map((t) => (
                      <label
                        key={t.id}
                        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={form.topicIds.includes(t.id)}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              topicIds: e.target.checked
                                ? [...f.topicIds, t.id]
                                : f.topicIds.filter((id) => id !== t.id),
                            }))
                          }
                          className="rounded border-slate-300 accent-indigo-600"
                        />
                        <span className="text-sm text-slate-700 truncate">{t.name}</span>
                        {t.category && (
                          <span className="ml-auto text-xs text-slate-400 shrink-0">{t.category.name}</span>
                        )}
                      </label>
                    ))}
                  </div>
                  {form.topicIds.length > 0 && (
                    <p className="text-xs text-indigo-600 mt-1">{form.topicIds.length} topic{form.topicIds.length !== 1 ? "s" : ""} selected</p>
                  )}
                </div>

                {/* Difficulty mix */}
                <div>
                  <FieldLabel label="Questions by difficulty" required />
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: "easyCount", label: "Easy", color: "text-green-700 bg-green-50 border-green-200" },
                      { key: "mediumCount", label: "Med", color: "text-orange-700 bg-orange-50 border-orange-200" },
                      { key: "hardCount", label: "Hard", color: "text-red-700 bg-red-50 border-red-200" },
                    ].map(({ key, label, color }) => (
                      <div key={key}>
                        <span className={`block text-[10px] font-bold mb-1 px-1.5 py-0.5 rounded border w-fit ${color}`}>{label}</span>
                        <Input
                          type="number"
                          min="0"
                          value={(form as Record<string, unknown>)[key] as string}
                          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                  {totalQ > 0 && (
                    <p className="text-xs text-slate-500 mt-1.5">Total: <strong>{totalQ} questions</strong></p>
                  )}
                </div>

                {/* Timer + pass mark */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel label="Time limit (min)" />
                    <Input
                      type="number"
                      min="0"
                      value={form.timeLimitMinutes}
                      onChange={(e) => setForm((f) => ({ ...f, timeLimitMinutes: e.target.value }))}
                      placeholder="0 = no limit"
                    />
                  </div>
                  <div>
                    <FieldLabel label="Pass mark (%)" />
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={form.passMark}
                      onChange={(e) => setForm((f) => ({ ...f, passMark: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Scoring mode */}
                <div>
                  <FieldLabel label="Multi-select scoring" />
                  <Select
                    value={form.multiSelectScoringMode}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, multiSelectScoringMode: e.target.value as "all_or_nothing" | "partial_credit" }))
                    }
                  >
                    <option value="all_or_nothing">
                      All-or-nothing (multi-select only: must pick exact correct set)
                    </option>
                    <option value="partial_credit">Partial credit</option>
                  </Select>
                </div>

                {/* Toggles */}
                <div className="space-y-2">
                  {[
                    { key: "revealAnswersAfterTest", label: "Reveal answers after test" },
                    { key: "issueCertificate", label: "Issue certificate on pass" },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100">
                      <input
                        type="checkbox"
                        checked={(form as Record<string, unknown>)[key] as boolean}
                        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                        className="accent-indigo-600"
                      />
                      <span className="text-sm text-slate-700">{label}</span>
                    </label>
                  ))}
                </div>

                {/* Certificate extras */}
                {form.issueCertificate && (
                  <div className="space-y-3 pl-3 border-l-2 border-indigo-200">
                    <label className="flex items-center gap-3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100">
                      <input
                        type="checkbox"
                        checked={form.showProficiencyOnCert}
                        onChange={(e) => setForm((f) => ({ ...f, showProficiencyOnCert: e.target.checked }))}
                        className="accent-indigo-600"
                      />
                      <span className="text-sm text-slate-700">Show proficiency on certificate</span>
                    </label>
                    <div>
                      <FieldLabel label="Certificate validity (days)" />
                      <Input
                        type="number"
                        min="0"
                        value={form.certValidityDays}
                        onChange={(e) => setForm((f) => ({ ...f, certValidityDays: e.target.value }))}
                        placeholder="0 = no expiry"
                      />
                    </div>
                  </div>
                )}

                {/* Proficiency thresholds */}
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Proficiency thresholds (%)</p>
                  <p className="text-[11px] text-slate-400 mb-3">
                    Minimum score to reach each level. Six bands: Entry → Beginner → Adv. Beginner → Competent → Proficient → Expert.
                  </p>
                  <div className="space-y-2">
                    {THRESHOLD_LABELS.map(({ level, key }) => (
                      <div key={key} className="flex items-center gap-3">
                        <span className="text-xs text-slate-600 w-48 shrink-0">{level}</span>
                        <Input
                          type="number"
                          min="1"
                          max="99"
                          value={form.proficiencyThresholds[key]}
                          onChange={(e) => {
                            const next = [...form.proficiencyThresholds];
                            next[key] = e.target.value;
                            setForm((f) => ({ ...f, proficiencyThresholds: next }));
                          }}
                          className="w-20"
                        />
                        <span className="text-xs text-slate-400">%</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">
                    Scores below {form.proficiencyThresholds[0] || "—"}% → Entry &nbsp;|&nbsp;
                    {form.proficiencyThresholds[4] || "—"}%+ → Expert
                  </p>
                </div>

                {/* Proctoring section */}
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Proctoring</p>
                  <div className="space-y-3">
                    <div>
                      <FieldLabel label="Periodic photo interval (minutes)" />
                      <Input
                        type="number"
                        min="0"
                        value={form.proctoringPhotoIntervalMinutes}
                        onChange={(e) => setForm((f) => ({ ...f, proctoringPhotoIntervalMinutes: e.target.value }))}
                        placeholder="0 = start photo only"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">Set to 0 to take only a start photo.</p>
                    </div>
                    <div>
                      <FieldLabel label="Custom instructions (optional)" />
                      <textarea
                        rows={3}
                        value={form.proctoringInstructions}
                        onChange={(e) => setForm((f) => ({ ...f, proctoringInstructions: e.target.value }))}
                        placeholder="Additional rules shown to candidates before they start (appended to system defaults)"
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none resize-y"
                      />
                    </div>
                  </div>
                </div>

                {!isNew && (
                  <InfoBox>Editing a blueprint does not affect assessments that have already been assigned.</InfoBox>
                )}

                {saveError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 text-sm">
                    {(saveError as Error).message}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button onClick={() => (isNew ? createMutation.mutate() : updateMutation.mutate())} disabled={!canSave || saving}>
                    <CheckCircle2 size={15} />
                    {saving ? "Saving…" : isNew ? "Create Blueprint" : "Save Changes"}
                  </Button>
                  <Button variant="secondary" onClick={closeForm}>
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
