import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { formatAppIdSyncMessage, useAppIdUserSync } from "../../hooks/useAppIdUserSync";
import { Card, SectionHeader, Button } from "../../components/Layout";
import { Trash2, Plus, RefreshCw } from "lucide-react";

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
  const [syncNotice, setSyncNotice] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const statusQ = useQuery({
    queryKey: ["appid-status"],
    queryFn: () => api<{ configured: boolean }>("/admin/appid-users/status"),
  });

  const syncUsers = useAppIdUserSync({
    onSuccess: (summary) =>
      setSyncNotice({ msg: formatAppIdSyncMessage(summary), type: "success" }),
    onError: (e) => setSyncNotice({ msg: e.message, type: "error" }),
  });

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

  const appIdConfigured = statusQ.data?.configured === true;

  return (
    <div>
      <SectionHeader
        title="Manager Skills"
        description={
          <>
            Assign operational skills to Capability Managers. Question bank editing is on{" "}
            <strong>Manager Question Banks</strong>. Managers only appear here after they exist in the app — use{" "}
            <strong>Sync from App ID</strong> to import App ID users with the Capability_Manager role before first login.
          </>
        }
        actions={
          <Button
            variant="primary"
            onClick={() => syncUsers.mutate(undefined)}
            disabled={!appIdConfigured || syncUsers.isPending}
            title={
              appIdConfigured
                ? "Import all App ID users into the app"
                : "Configure APPID_IAM_APIKEY and APPID_TENANT_ID first"
            }
          >
            <RefreshCw size={16} className={syncUsers.isPending ? "animate-spin" : ""} />
            {syncUsers.isPending ? "Syncing…" : "Sync from App ID"}
          </Button>
        }
      />

      {syncNotice && (
        <p className={`text-sm mb-4 ${syncNotice.type === "error" ? "text-red-600" : "text-green-700"}`}>
          {syncNotice.msg}
        </p>
      )}

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

          <Button
            variant="secondary"
            onClick={() => syncUsers.mutate(undefined)}
            disabled={!appIdConfigured || syncUsers.isPending}
            title={
              appIdConfigured
                ? "Create local app users from App ID (capability managers before first login)"
                : "Configure APPID_IAM_APIKEY and APPID_TENANT_ID first"
            }
          >
            {syncUsers.isPending ? "Syncing…" : "Sync from App ID"}
          </Button>

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
        <Card>
          <p className="text-sm text-slate-600 mb-4">
            No Capability Managers in the app yet. App ID users are not imported automatically — sync them into
            Assessment OS first (IBM <strong>Capability_Manager</strong> role required).
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="primary"
              onClick={() => syncUsers.mutate(undefined)}
              disabled={!appIdConfigured || syncUsers.isPending}
            >
              {syncUsers.isPending ? "Syncing…" : "Sync from App ID"}
            </Button>
            <Link
              to="/admin/appid-users"
              className="inline-flex items-center px-3.5 py-2 text-sm font-medium text-indigo-600 hover:underline"
            >
              Open App ID Users
            </Link>
          </div>
        </Card>
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
