import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { api } from "../../api/client";
import { Card, Button, Input, Select, Badge, SectionHeader } from "../../components/Layout";
import {
  Wand2, Users, SlidersHorizontal,
  Award, CheckCircle2, ChevronRight, Info, Search, LayoutList
} from "lucide-react";
import AssignmentsOverview from "./AssignmentsOverview";

interface Blueprint {
  id: string;
  name: string;
  skillId: string;
  skillRoleId: string;
  easyCount: number;
  mediumCount: number;
  hardCount: number;
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
  topics: { topicId: string }[];
  skill: { id: string; name: string; code: string };
  skillRole: { id: string; name: string; code: string };
}

interface SkillRole { id: string; code: string; name: string }
interface AssignmentCandidate {
  key: string;
  userId: string | null;
  email: string;
  name: string;
  employeeId?: string | null;
  employeeName?: string | null;
  sources: ("local" | "appid")[];
  linked: boolean;
  needsProvision: boolean;
  appIdRoles?: string[];
}

/** Snapshot kept when selected — assign must not rely on the live search query. */
type SelectedCandidate = Pick<
  AssignmentCandidate,
  "key" | "userId" | "email" | "name" | "needsProvision"
>;
interface Skill { id: string; code: string; name: string }
interface Topic { id: string; name: string }

type PageTab = "overview" | "assign";
type Step = "blueprint" | "candidates" | "config" | "scoring" | "review";

const STEPS: { id: Step; label: string; icon: React.ReactNode }[] = [
  { id: "blueprint", label: "Blueprint", icon: <Wand2 size={14} /> },
  { id: "candidates", label: "Candidates", icon: <Users size={14} /> },
  { id: "config", label: "Configuration", icon: <SlidersHorizontal size={14} /> },
  { id: "scoring", label: "Scoring & Cert", icon: <Award size={14} /> },
  { id: "review", label: "Review", icon: <CheckCircle2 size={14} /> },
];

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
      <Info size={14} className="shrink-0 mt-0.5" />
      <p>{children}</p>
    </div>
  );
}

export default function AssignmentsPage() {
  const qc = useQueryClient();
  const skills = useQuery({ queryKey: ["skills"], queryFn: () => api<Skill[]>("/admin/skills") });
  const topics = useQuery({ queryKey: ["topics"], queryFn: () => api<Topic[]>("/admin/topics") });
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateSearchDebounced, setCandidateSearchDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setCandidateSearchDebounced(candidateSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [candidateSearch]);

  const candidates = useQuery({
    queryKey: ["assignment-candidates", candidateSearchDebounced],
    queryFn: () => {
      const params = candidateSearchDebounced
        ? `?q=${encodeURIComponent(candidateSearchDebounced)}`
        : "";
      return api<{
        candidates: AssignmentCandidate[];
        appIdConfigured: boolean;
        listMode?: string;
      }>(`/assignments/candidates${params}`);
    },
  });
  const blueprints = useQuery({ queryKey: ["blueprints"], queryFn: () => api<Blueprint[]>("/admin/blueprints") });

  const [pageTab, setPageTab] = useState<PageTab>("overview");
  const [step, setStep] = useState<Step>("blueprint");
  const [toast, setToast] = useState("");

  const [form, setForm] = useState({
    candidateKeys: [] as string[],
    selectedCandidates: [] as SelectedCandidate[],
    blueprintId: "",
    topicIds: [] as string[],
    skillId: "",
    skillRoleId: "",
    easyCount: "2",
    mediumCount: "2",
    hardCount: "1",
    timeLimitMinutes: "60",
    passMark: "60",
    issueCertificate: false,
    showProficiencyOnCert: false,
    certValidityDays: "365",
    revealAnswersAfterTest: false,
    multiSelectScoringMode: "all_or_nothing" as "all_or_nothing" | "partial_credit",
    proficiencyThresholds: [40, 55, 70, 85, 95] as number[],
    displayName: "",
    proctoringPhotoIntervalMinutes: "5",
    proctoringInstructions: "",
  });

  const skillRoles = useQuery({
    queryKey: ["skill-roles", form.skillId],
    queryFn: () => api<SkillRole[]>(`/admin/skills/${form.skillId}/roles`),
    enabled: !!form.skillId,
  });

  type PoolCheck = {
    available: { total: number; easy: number; medium: number; hard: number };
    sufficient: boolean;
    shortfalls: string[];
    diagnostics: { publishedInTopics: number; publishedWithoutRoles: number };
  };

  const poolCheck = useQuery({
    queryKey: [
      "validate-pool",
      form.skillId,
      form.skillRoleId,
      form.topicIds,
      form.easyCount,
      form.mediumCount,
      form.hardCount,
    ],
    queryFn: () =>
      api<PoolCheck>("/assignments/validate-pool", {
        method: "POST",
        json: {
          skillId: form.skillId,
          skillRoleId: form.skillRoleId,
          topicIds: form.topicIds,
          easyCount: parseInt(form.easyCount, 10) || 0,
          mediumCount: parseInt(form.mediumCount, 10) || 0,
          hardCount: parseInt(form.hardCount, 10) || 0,
        },
      }),
    enabled: !!form.skillId && !!form.skillRoleId && form.topicIds.length > 0,
  });

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  }

  const applyBlueprint = (blueprintId: string) => {
    const bp = blueprints.data?.find((b) => b.id === blueprintId);
    if (!bp) {
      setForm((f) => ({ ...f, blueprintId: "" }));
      return;
    }
    setForm((f) => ({
      ...f,
      blueprintId,
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
      proficiencyThresholds: Array.isArray(bp.proficiencyThresholds) ? bp.proficiencyThresholds : [40, 55, 70, 85, 95],
      proctoringPhotoIntervalMinutes: String(bp.proctoringPhotoIntervalMinutes ?? 5),
      proctoringInstructions: bp.proctoringInstructions ?? "",
      displayName: bp.name,
    }));
  };

  const assign = useMutation({
    mutationFn: () => {
      const selected = form.selectedCandidates;
      if (selected.length === 0) {
        throw new Error("Select at least one candidate");
      }
      const userIds = selected.map((c) => c.userId).filter((id): id is string => Boolean(id));
      const provisionCandidates = selected
        .filter((c) => c.needsProvision)
        .map((c) => ({ email: c.email, name: c.name }));
      if (userIds.length === 0 && provisionCandidates.length === 0) {
        throw new Error("Selected candidates could not be resolved — go back and re-select them");
      }
      return api("/assignments", {
        method: "POST",
        json: {
          userIds,
          provisionCandidates,
          blueprintId: form.blueprintId || null,
          displayName: form.displayName || undefined,
          topicIds: form.topicIds,
          skillId: form.skillId,
          skillRoleId: form.skillRoleId,
          easyCount: parseInt(form.easyCount, 10),
          mediumCount: parseInt(form.mediumCount, 10),
          hardCount: parseInt(form.hardCount, 10),
          timeLimitMinutes: parseInt(form.timeLimitMinutes, 10),
          passMark: parseInt(form.passMark, 10),
          issueCertificate: form.issueCertificate,
          showProficiencyOnCert: form.showProficiencyOnCert,
          certValidityDays: parseInt(form.certValidityDays, 10),
          revealAnswersAfterTest: form.revealAnswersAfterTest,
          multiSelectScoringMode: form.multiSelectScoringMode,
          proficiencyThresholds: form.proficiencyThresholds,
          proctoringPhotoIntervalMinutes: parseInt(form.proctoringPhotoIntervalMinutes, 10) || 5,
          proctoringInstructions: form.proctoringInstructions || null,
        },
      });
    },
    onSuccess: () => {
      const n = form.selectedCandidates.length;
      showToast(`Assessment assigned to ${n} candidate${n > 1 ? "s" : ""}!`);
      qc.invalidateQueries({ queryKey: ["assignments"] });
      qc.invalidateQueries({ queryKey: ["analytics-status-breakdown"] });
      setPageTab("overview");
      setStep("blueprint");
      setForm((f) => ({
        ...f,
        candidateKeys: [],
        selectedCandidates: [],
        blueprintId: "",
        displayName: "",
      }));
    },
  });

  const candidateList = candidates.data?.candidates ?? [];
  const selectedCandidates = form.selectedCandidates;
  const selectedTopics = topics.data?.filter((t) => form.topicIds.includes(t.id)) ?? [];
  const selectedSkill = skills.data?.find((s) => s.id === form.skillId);
  const selectedRole = skillRoles.data?.find((r) => r.id === form.skillRoleId);
  const selectedBp = blueprints.data?.find((b) => b.id === form.blueprintId);
  const totalQ = parseInt(form.easyCount || "0") + parseInt(form.mediumCount || "0") + parseInt(form.hardCount || "0");

  const canAdvance: Record<Step, boolean> = {
    blueprint: true,
    candidates: form.selectedCandidates.length > 0,
    config: !!form.skillId && !!form.skillRoleId && form.topicIds.length > 0 && totalQ > 0,
    scoring: true,
    review: form.selectedCandidates.length > 0 && !!form.skillId && !!form.skillRoleId && form.topicIds.length > 0 && totalQ > 0,
  };

  const stepOrder = STEPS.map((s) => s.id);
  const currentIdx = stepOrder.indexOf(step);
  const goNext = () => setStep(stepOrder[currentIdx + 1]);
  const goPrev = () => setStep(stepOrder[currentIdx - 1]);

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm flex items-center gap-2">
          <CheckCircle2 size={16} /> {toast}
        </div>
      )}

      <SectionHeader
        title="Assignments"
        description={
          pageTab === "overview"
            ? "View all assigned assessments and their statuses."
            : "Select a blueprint or configure manually, then assign to candidates."
        }
      />

      <div className="flex gap-0 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm w-fit">
        <button
          type="button"
          onClick={() => setPageTab("overview")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${
            pageTab === "overview"
              ? "bg-indigo-600 text-white"
              : "text-slate-500 hover:bg-slate-50"
          }`}
        >
          <LayoutList size={14} />
          Overview
        </button>
        <button
          type="button"
          onClick={() => setPageTab("assign")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-l border-slate-200 ${
            pageTab === "assign"
              ? "bg-indigo-600 text-white"
              : "text-slate-500 hover:bg-slate-50"
          }`}
        >
          <Wand2 size={14} />
          Assign new
        </button>
      </div>

      {pageTab === "overview" && (
        <AssignmentsOverview onAssignNew={() => setPageTab("assign")} />
      )}

      {pageTab === "assign" && (
        <>
      {/* Step indicator */}
      <div className="flex items-center gap-0 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        {STEPS.map((s) => {
          const isActive = s.id === step;
          const isDone = stepOrder.indexOf(s.id) < currentIdx;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors border-r border-slate-200 last:border-r-0 ${
                isActive
                  ? "bg-indigo-600 text-white"
                  : isDone
                    ? "bg-indigo-50 text-indigo-600"
                    : "text-slate-400 hover:bg-slate-50"
              }`}
            >
              {s.icon}
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Step panels */}
      {step === "blueprint" && (
        <Card title="Start from a blueprint" subtitle="Pre-fill all settings from a saved blueprint, or configure manually.">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, blueprintId: "" }))}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                !form.blueprintId ? "border-indigo-600 bg-indigo-50" : "border-slate-200 hover:border-indigo-300"
              }`}
            >
              <p className="font-semibold text-sm text-slate-800">Custom</p>
              <p className="text-xs text-slate-500 mt-0.5">Configure all fields manually</p>
            </button>
            {blueprints.data?.map((bp) => (
              <button
                key={bp.id}
                type="button"
                onClick={() => applyBlueprint(bp.id)}
                className={`text-left p-4 rounded-xl border-2 transition-all ${
                  form.blueprintId === bp.id ? "border-indigo-600 bg-indigo-50" : "border-slate-200 hover:border-indigo-300"
                }`}
              >
                <p className="font-semibold text-sm text-slate-800 truncate">{bp.name}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  <Badge color="indigo">{bp.skill?.code}</Badge>
                  <Badge color="slate">{bp.easyCount}E {bp.mediumCount}M {bp.hardCount}H</Badge>
                  {bp.issueCertificate && <Badge color="green">Cert</Badge>}
                </div>
              </button>
            ))}
          </div>
          {form.blueprintId && (
            <InfoBox>Blueprint applied — you can still adjust any field in later steps.</InfoBox>
          )}
        </Card>
      )}

      {step === "candidates" && (
        <Card
          title="Select candidates"
          subtitle="Local accounts and IBM App ID directory users (merged by email). Search by name, email, employee ID, or profile fields."
        >
          <div className="mb-3">
            <FieldLabel label="Search" />
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={candidateSearch}
                onChange={(e) => setCandidateSearch(e.target.value)}
                placeholder="Name, email, employee ID, country, project…"
                className="pl-9"
              />
            </div>
          </div>
          {!candidates.data?.appIdConfigured && (
            <InfoBox>
              IBM App ID is not configured — only local candidate accounts are listed. Set APPID_IAM_APIKEY and
              APPID_TENANT_ID to include Cloud Directory users.
            </InfoBox>
          )}
          <div className="mb-3">
            <FieldLabel label="Candidates" required />
            <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {candidates.isLoading && (
                <p className="px-4 py-6 text-sm text-slate-500 text-center">Loading candidates…</p>
              )}
              {!candidates.isLoading && candidateList.length === 0 && (
                <p className="px-4 py-6 text-sm text-slate-500 text-center">
                  {candidateSearchDebounced
                    ? "No matches. Try another search or clear the filter."
                    : "No candidates yet. Add users in App ID or provision them from App ID Users."}
                </p>
              )}
              {candidateList.map((c) => (
                <label
                  key={c.key}
                  className="flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={form.candidateKeys.includes(c.key)}
                    onChange={(e) =>
                      setForm((f) => {
                        if (e.target.checked) {
                          const snapshot: SelectedCandidate = {
                            key: c.key,
                            userId: c.userId,
                            email: c.email,
                            name: c.name,
                            needsProvision: c.needsProvision,
                          };
                          return {
                            ...f,
                            candidateKeys: [...f.candidateKeys, c.key],
                            selectedCandidates: [...f.selectedCandidates, snapshot],
                          };
                        }
                        return {
                          ...f,
                          candidateKeys: f.candidateKeys.filter((k) => k !== c.key),
                          selectedCandidates: f.selectedCandidates.filter((s) => s.key !== c.key),
                        };
                      })
                    }
                    className="rounded border-slate-300 accent-indigo-600 mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                      {c.linked && <Badge color="indigo">App ID + local</Badge>}
                      {!c.linked && c.sources.includes("appid") && (
                        <Badge color="orange">App ID only</Badge>
                      )}
                      {c.needsProvision && (
                        <Badge color="slate">Creates profile on assign</Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate">{c.email}</p>
                    {(c.employeeId || c.employeeName) && (
                      <p className="text-xs text-slate-500 truncate">
                        {[c.employeeId, c.employeeName].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
          {form.selectedCandidates.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-indigo-700 font-medium">
              <CheckCircle2 size={15} />
              {form.selectedCandidates.length} candidate{form.selectedCandidates.length > 1 ? "s" : ""} selected
            </div>
          )}
        </Card>
      )}

      {step === "config" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card title="Assessment details">
            <div className="space-y-4">
              <div>
                <FieldLabel label="Display name" />
                <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="e.g. JS Senior Developer Screen" />
              </div>
              <div>
                <FieldLabel label="Skill" required />
                <Select value={form.skillId} onChange={(e) => setForm({ ...form, skillId: e.target.value, skillRoleId: "" })}>
                  <option value="">Select a skill…</option>
                  {skills.data?.map((s) => <option key={s.id} value={s.id}>{s.code} – {s.name}</option>)}
                </Select>
              </div>
              <div>
                <FieldLabel label="Skill role" required />
                <Select value={form.skillRoleId} onChange={(e) => setForm({ ...form, skillRoleId: e.target.value })} disabled={!form.skillId}>
                  <option value="">Select a role…</option>
                  {skillRoles.data?.map((r) => <option key={r.id} value={r.id}>{r.code} – {r.name}</option>)}
                </Select>
              </div>
              <div>
                <FieldLabel label="Topics" required />
                <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
                  {topics.data?.map((t) => (
                    <label key={t.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={form.topicIds.includes(t.id)}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            topicIds: e.target.checked ? [...f.topicIds, t.id] : f.topicIds.filter((id) => id !== t.id),
                          }))
                        }
                        className="rounded border-slate-300 accent-indigo-600"
                      />
                      <span className="text-sm text-slate-700 truncate">{t.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card title="Difficulty mix & timer">
            <div className="space-y-4">
              <div>
                <FieldLabel label="Questions by difficulty" required />
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: "easyCount", label: "Easy", color: "text-green-700 bg-green-50 border-green-200" },
                    { key: "mediumCount", label: "Medium", color: "text-orange-700 bg-orange-50 border-orange-200" },
                    { key: "hardCount", label: "Hard", color: "text-red-700 bg-red-50 border-red-200" },
                  ].map(({ key, label, color }) => (
                    <div key={key}>
                      <label className={`block text-xs font-semibold mb-1.5 px-2 py-0.5 rounded border w-fit ${color}`}>{label}</label>
                      <Input
                        type="number"
                        min="0"
                        value={(form as never)[key]}
                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
                {totalQ > 0 && (
                  <p className="text-xs text-slate-500 mt-2">Total: <strong>{totalQ} questions</strong></p>
                )}
              </div>
              {poolCheck.isFetching && (
                <p className="text-xs text-slate-500">Checking question pool…</p>
              )}
              {poolCheck.data && (
                <div
                  className={`rounded-lg border px-3 py-2.5 text-xs ${
                    poolCheck.data.sufficient
                      ? "bg-green-50 border-green-200 text-green-800"
                      : "bg-amber-50 border-amber-200 text-amber-900"
                  }`}
                >
                  <p className="font-medium">
                    Published pool: {poolCheck.data.available.total} question
                    {poolCheck.data.available.total !== 1 ? "s" : ""} (
                    {poolCheck.data.available.easy} easy, {poolCheck.data.available.medium} medium,{" "}
                    {poolCheck.data.available.hard} hard)
                  </p>
                  {!poolCheck.data.sufficient && poolCheck.data.shortfalls.length > 0 && (
                    <p className="mt-1">Shortfall: {poolCheck.data.shortfalls.join("; ")}</p>
                  )}
                  {poolCheck.data.diagnostics.publishedInTopics > 0 &&
                    poolCheck.data.available.total === 0 && (
                      <p className="mt-1">
                        {poolCheck.data.diagnostics.publishedInTopics} published in selected topics, but none
                        match this skill role. Tag questions in Question Bank (pencil icon) or re-import with
                        skillRoleCodes.
                      </p>
                    )}
                  {poolCheck.data.diagnostics.publishedWithoutRoles > 0 && (
                    <p className="mt-1">
                      {poolCheck.data.diagnostics.publishedWithoutRoles} published question
                      {poolCheck.data.diagnostics.publishedWithoutRoles !== 1 ? "s" : ""} in these topics
                      have no skill roles.
                    </p>
                  )}
                </div>
              )}
              <div>
                <FieldLabel label="Time limit" />
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    value={form.timeLimitMinutes}
                    onChange={(e) => setForm({ ...form, timeLimitMinutes: e.target.value })}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">min (0 = no limit)</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {step === "scoring" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card title="Pass mark & review">
            <div className="space-y-4">
              <div>
                <FieldLabel label="Pass mark (%)" />
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={form.passMark}
                    onChange={(e) => setForm({ ...form, passMark: e.target.value })}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                </div>
              </div>
              <div>
                <FieldLabel label="Multi-select scoring" />
                <Select
                  value={form.multiSelectScoringMode}
                  onChange={(e) => setForm({ ...form, multiSelectScoringMode: e.target.value as "all_or_nothing" | "partial_credit" })}
                >
                  <option value="all_or_nothing">
                    All-or-nothing (per multi-select question: exact correct set required)
                  </option>
                  <option value="partial_credit">Partial credit (+1 correct, −1 wrong per option)</option>
                </Select>
                <p className="text-xs text-slate-400 mt-1">Single-answer questions are always all-or-nothing.</p>
              </div>
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <input
                  type="checkbox"
                  id="reveal"
                  checked={form.revealAnswersAfterTest}
                  onChange={(e) => setForm({ ...form, revealAnswersAfterTest: e.target.checked })}
                  className="accent-indigo-600"
                />
                <label htmlFor="reveal" className="text-sm text-slate-700 cursor-pointer">Reveal correct answers after test</label>
              </div>
            </div>
          </Card>

          <Card title="Certificate settings">
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <input
                  type="checkbox"
                  id="cert"
                  checked={form.issueCertificate}
                  onChange={(e) => setForm({ ...form, issueCertificate: e.target.checked })}
                  className="accent-indigo-600"
                />
                <label htmlFor="cert" className="text-sm font-medium text-slate-700 cursor-pointer">Issue certificate on pass</label>
              </div>
              {form.issueCertificate && (
                <>
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <input
                      type="checkbox"
                      id="prof"
                      checked={form.showProficiencyOnCert}
                      onChange={(e) => setForm({ ...form, showProficiencyOnCert: e.target.checked })}
                      className="accent-indigo-600"
                    />
                    <label htmlFor="prof" className="text-sm text-slate-700 cursor-pointer">Show proficiency on certificate</label>
                  </div>
                  <div>
                    <FieldLabel label="Certificate validity (days)" />
                    <div className="relative">
                      <Input
                        type="number"
                        min="0"
                        value={form.certValidityDays}
                        onChange={(e) => setForm({ ...form, certValidityDays: e.target.value })}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">days (0 = no expiry)</span>
                    </div>
                  </div>
                </>
              )}
              {!form.issueCertificate && (
                <InfoBox>Enable certificate issuance above to configure certificate options.</InfoBox>
              )}
            </div>
          </Card>
        </div>
      )}

      {step === "review" && (
        <Card title="Review & confirm" subtitle="Check the summary below before sending.">
          <div className="grid sm:grid-cols-2 gap-6 mb-6">
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Assessment</p>
                <p className="font-semibold text-slate-900">{form.displayName || selectedBp?.name || "Custom"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Skill · Role</p>
                <p className="text-sm text-slate-800">
                  {selectedSkill?.code} {selectedSkill?.name} · {selectedRole?.name ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Topics</p>
                <div className="flex flex-wrap gap-1">
                  {selectedTopics.map((t) => <Badge key={t.id} color="indigo">{t.name}</Badge>)}
                  {selectedTopics.length === 0 && <span className="text-sm text-red-500">None selected</span>}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Difficulty mix</p>
                <div className="flex gap-2">
                  <Badge color="green">{form.easyCount} easy</Badge>
                  <Badge color="orange">{form.mediumCount} medium</Badge>
                  <Badge color="red">{form.hardCount} hard</Badge>
                  <Badge color="slate">= {totalQ} total</Badge>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Candidates ({form.selectedCandidates.length})</p>
                <div className="flex flex-wrap gap-1">
                  {selectedCandidates.map((c) => <Badge key={c.key} color="slate">{c.name}</Badge>)}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Pass mark</p>
                <p className="text-sm text-slate-800">{form.passMark}%</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Timer</p>
                <p className="text-sm text-slate-800">{parseInt(form.timeLimitMinutes) > 0 ? `${form.timeLimitMinutes} min` : "No limit"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Scoring · Certificate</p>
                <div className="flex flex-wrap gap-1">
                  <Badge color="slate">{form.multiSelectScoringMode === "partial_credit" ? "Partial credit" : "All-or-nothing"}</Badge>
                  {form.issueCertificate && <Badge color="green">Certificate on pass</Badge>}
                  {form.revealAnswersAfterTest && <Badge color="indigo">Answers revealed</Badge>}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Proctoring</p>
                <p className="text-sm text-slate-800">
                  {parseInt(form.proctoringPhotoIntervalMinutes) > 0
                    ? `Photos every ${form.proctoringPhotoIntervalMinutes} min`
                    : "Start photo only"}
                </p>
                {form.proctoringInstructions && (
                  <p className="text-xs text-slate-500 mt-1 italic">Custom instructions added</p>
                )}
              </div>
            </div>
          </div>

          {assign.isError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
              {(assign.error as Error).message}
            </div>
          )}

          <Button
            size="lg"
            onClick={() => assign.mutate()}
            disabled={assign.isPending || !canAdvance.review}
          >
            <CheckCircle2 size={16} />
            {assign.isPending ? "Assigning…" : `Assign to ${form.selectedCandidates.length} candidate${form.selectedCandidates.length !== 1 ? "s" : ""}`}
          </Button>
        </Card>
      )}

      {/* Navigation footer */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="secondary" onClick={goPrev} disabled={currentIdx === 0}>
          Previous
        </Button>
        {step !== "review" && (
          <Button onClick={goNext} disabled={!canAdvance[step]}>
            Continue <ChevronRight size={16} />
          </Button>
        )}
      </div>
        </>
      )}
    </div>
  );
}
