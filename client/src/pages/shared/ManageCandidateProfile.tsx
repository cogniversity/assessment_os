import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Card, Button, Input, Select } from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { PROFICIENCY_LABELS } from "@assessment-os/shared";
import { Save } from "lucide-react";

const STAFFING_FIELDS: [string, string][] = [
  ["country", "Country"],
  ["employeeId", "Employee ID"],
  ["employeeName", "Employee Name"],
  ["band", "Band"],
  ["subBand", "Sub Band"],
  ["reportingManagerCode", "Manager Code"],
  ["reportingManagerName", "Manager Name"],
  ["projectCode", "Project Code"],
  ["projectName", "Project Name"],
  ["allocationPercentage", "Allocation %"],
  ["status", "Status"],
];

type SkillProficiency = {
  id: string;
  proficiency: string | null;
  proficiencyOverridden: boolean;
  updatedAt: string | null;
  skill: { id: string; code: string; name: string };
  skillRole: { id: string; code: string; name: string };
};

type ProfilePayload = {
  id: string;
  name: string;
  email: string;
  role: string;
  profile: Record<string, unknown> | null;
  skillProficiencies?: SkillProficiency[];
  assessments?: { skillId: string; skillRoleId: string; skill: { name: string }; skillRole: { name: string } }[];
  remarksReceived?: { comment: string; visibility: string; author?: { name: string } }[];
  auditLog?: { fieldName: string; oldValue: string | null; newValue: string | null; changedAt: string; actor?: { name: string } }[];
};

type Props = {
  userId: string;
  backTo: string;
  backLabel?: string;
};

const PROFICIENCY_OPTIONS = Object.entries(PROFICIENCY_LABELS);

export default function ManageCandidateProfile({ userId, backTo, backLabel = "Back" }: Props) {
  const { user: actor } = useAuth();
  const qc = useQueryClient();
  const canManage = actor?.role === "admin" || actor?.role === "capability_manager";

  const { data, isLoading } = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => api<ProfilePayload>(`/profile/${userId}`),
    enabled: !!userId,
  });

  const [form, setForm] = useState<Record<string, string>>({});
  const [remark, setRemark] = useState("");
  const [skillId, setSkillId] = useState("");
  const [skillRoleId, setSkillRoleId] = useState("");
  const [proficiency, setProficiency] = useState("competent");
  const [reason, setReason] = useState("");

  const save = useMutation({
    mutationFn: () => api(`/profile/${userId}`, { method: "PATCH", json: form }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile", userId] }),
  });

  const addRemark = useMutation({
    mutationFn: () =>
      api(`/manager/candidates/${userId}/remarks`, {
        method: "POST",
        json: { comment: remark, visibility: "normal" },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile", userId] });
      setRemark("");
    },
  });

  const setProf = useMutation({
    mutationFn: () =>
      api(`/manager/candidates/${userId}/proficiency`, {
        method: "POST",
        json: { skillId, skillRoleId, proficiency, changeReason: reason },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile", userId] }),
  });

  if (isLoading || !data) return <p className="text-sm text-slate-500">Loading profile…</p>;

  const p = (data.profile ?? {}) as Record<string, unknown>;
  const skillProficiencies = data.skillProficiencies ?? [];
  const assessmentPairs = [
    ...new Map(
      (data.assessments ?? []).map((a) => [
        `${a.skillId}:${a.skillRoleId}`,
        { skillId: a.skillId, skillRoleId: a.skillRoleId, label: `${a.skill.name} / ${a.skillRole.name}` },
      ])
    ).values(),
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link to={backTo} className="text-sm text-indigo-600 hover:underline">
          ← {backLabel}
        </Link>
        <h1 className="text-2xl font-semibold mt-2">{data.name}</h1>
        <p className="text-sm text-slate-500">
          {data.email} · App role: <span className="font-medium text-slate-700">{data.role}</span>
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Staffing profile" subtitle={canManage ? "Edits are audited when you save." : undefined}>
          {STAFFING_FIELDS.map(([key, label]) => (
            <div key={key} className="mb-3">
              <label className="text-xs font-medium text-slate-600">{label}</label>
              <Input
                defaultValue={String(p[key] ?? form[key] ?? "")}
                disabled={!canManage}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
          <p className="text-xs text-slate-500">FTE (computed): {String(p.fte ?? "—")}</p>
          {canManage && (
            <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
              <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
                <Save size={16} />
                {save.isPending ? "Saving…" : "Save profile"}
              </Button>
            </div>
          )}
        </Card>

        <Card title="Skill proficiencies" subtitle="One proficiency band per skill + role.">
          {skillProficiencies.length === 0 ? (
            <p className="text-sm text-slate-500">No skill-role proficiencies recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b">
                    <th className="pb-2 pr-3">Skill</th>
                    <th className="pb-2 pr-3">Role</th>
                    <th className="pb-2 pr-3">Proficiency</th>
                    <th className="pb-2">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {skillProficiencies.map((row) => (
                    <tr key={row.id} className="border-b border-slate-50">
                      <td className="py-2 pr-3">{row.skill.name}</td>
                      <td className="py-2 pr-3">{row.skillRole.name}</td>
                      <td className="py-2 pr-3">
                        {row.proficiency
                          ? PROFICIENCY_LABELS[row.proficiency] ?? row.proficiency
                          : "—"}
                      </td>
                      <td className="py-2 text-xs text-slate-500">
                        {row.proficiencyOverridden ? "Manual override" : "Assessment"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {canManage && data.role === "candidate" && (
          <>
            <Card title="Override proficiency">
              <Select
                value={skillId}
                onChange={(e) => {
                  setSkillId(e.target.value);
                  setSkillRoleId("");
                }}
                className="mb-2"
              >
                <option value="">Select skill…</option>
                {assessmentPairs.map((pair) => (
                  <option key={pair.skillId} value={pair.skillId}>
                    {pair.label.split(" / ")[0]}
                  </option>
                ))}
              </Select>
              <Select
                value={skillRoleId}
                onChange={(e) => setSkillRoleId(e.target.value)}
                className="mb-2"
              >
                <option value="">Select role…</option>
                {assessmentPairs
                  .filter((pair) => !skillId || pair.skillId === skillId)
                  .map((pair) => (
                    <option key={`${pair.skillId}:${pair.skillRoleId}`} value={pair.skillRoleId}>
                      {pair.label}
                    </option>
                  ))}
              </Select>
              <Select value={proficiency} onChange={(e) => setProficiency(e.target.value)} className="mb-2">
                {PROFICIENCY_OPTIONS.map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </Select>
              <Input
                placeholder="Reason (required)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mb-2"
              />
              <Button
                onClick={() => setProf.mutate()}
                disabled={!reason || !skillId || !skillRoleId || setProf.isPending}
              >
                Update proficiency
              </Button>
            </Card>

            <Card title="Remarks">
              <Input value={remark} onChange={(e) => setRemark(e.target.value)} className="mb-2" />
              <Button onClick={() => addRemark.mutate()} disabled={!remark.trim()}>
                Add remark
              </Button>
              <ul className="mt-4 text-sm space-y-2">
                {data.remarksReceived?.map((r, i) => (
                  <li key={i} className="border-b border-slate-100 pb-2">
                    {r.comment}
                    <span className="text-xs text-slate-400 ml-2">
                      ({r.visibility}
                      {r.author?.name ? ` · ${r.author.name}` : ""})
                    </span>
                  </li>
                ))}
                {!data.remarksReceived?.length && (
                  <p className="text-slate-400">No remarks yet</p>
                )}
              </ul>
            </Card>
          </>
        )}

        {canManage && (data.auditLog?.length ?? 0) > 0 && (
          <Card title="Recent profile changes" className="lg:col-span-2">
            <ul className="text-xs space-y-2 max-h-48 overflow-y-auto">
              {data.auditLog!.map((a, i) => (
                <li key={i} className="text-slate-600">
                  <span className="font-medium">{a.fieldName}</span>: {a.oldValue ?? "—"} → {a.newValue ?? "—"}
                  <span className="text-slate-400">
                    {" "}
                    · {new Date(a.changedAt).toLocaleString()}
                    {a.actor?.name ? ` · ${a.actor.name}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
