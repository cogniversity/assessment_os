import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { formatAppIdSyncMessage, useAppIdUserSync } from "../../hooks/useAppIdUserSync";
import { Card, Button, Input, Badge, SectionHeader } from "../../components/Layout";
import {
  UserPlus, Users, Upload, Search, CheckCircle2,
  AlertTriangle, X, Info, Download,
  Eye, EyeOff, FileText
} from "lucide-react";

interface CdUser {
  id: string;
  userName?: string;
  displayName?: string;
  active: boolean;
  emails: { value: string; primary: boolean }[];
  status?: string;
  meta?: { created?: string; lastModified?: string };
  appIdRoles?: string[];
  appUserId?: string | null;
  appRole?: string | null;
}

interface CdUserList {
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: CdUser[];
  listMode?: "search" | "directory_export" | "profiles_export";
}

interface BulkImportResult {
  created: number;
  failed: { email: string; error: string }[];
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function PasswordInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-9 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder:text-slate-400"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        tabIndex={-1}
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

/** Parse CSV text → array of {email, displayName, password} */
function parseCsvText(text: string): { email: string; displayName?: string; password: string }[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];

  // Detect if first line is a header
  const firstLower = lines[0].toLowerCase();
  const hasHeader = firstLower.includes("email") || firstLower.includes("password");
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.map((line) => {
    const cols = line.split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
    return {
      email:       cols[0] ?? "",
      displayName: cols[1] || undefined,
      password:    cols[2] ?? "",
    };
  }).filter((r) => r.email && r.password);
}

type Tab = "list" | "create" | "bulk";

interface AppIdRoleDef {
  id: string;
  name: string;
}

function AppIdRoleEditor({
  email,
  currentRoles,
  roleDefs,
  onSaved,
}: {
  email: string;
  currentRoles: string[];
  roleDefs: AppIdRoleDef[];
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(currentRoles);
  const save = useMutation({
    mutationFn: () =>
      api(`/admin/appid-users/by-email/${encodeURIComponent(email)}/ibm-roles`, {
        method: "PATCH",
        json: { roleNames: selected },
      }),
    onSuccess: () => onSaved(),
  });

  return (
    <div className="mt-2 p-2 bg-slate-50 rounded-lg border border-slate-200 text-xs">
      <p className="font-medium text-slate-600 mb-1.5">IBM App ID roles</p>
      <div className="flex flex-wrap gap-2 mb-2">
        {roleDefs.map((r) => (
          <label key={r.id} className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              className="accent-indigo-600"
              checked={selected.includes(r.name)}
              onChange={(e) => {
                setSelected((prev) =>
                  e.target.checked ? [...prev, r.name] : prev.filter((n) => n !== r.name)
                );
              }}
            />
            {r.name}
          </label>
        ))}
      </div>
      <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? "Saving…" : "Save IBM roles"}
      </Button>
      {save.isError && (
        <p className="text-red-600 mt-1">{(save.error as Error).message}</p>
      )}
    </div>
  );
}

export default function AppIdUsersPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("list");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // Create form
  const [form, setForm] = useState({
    email: "",
    displayName: "",
    password: "",
    active: true,
    appIdRoleNames: [] as string[],
  });
  const [editingRolesEmail, setEditingRolesEmail] = useState<string | null>(null);

  // Bulk import
  const [csvText, setCsvText] = useState("");
  const [parsedRows, setParsedRows] = useState<{ email: string; displayName?: string; password: string }[]>([]);
  const [bulkResult, setBulkResult] = useState<BulkImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  // Configured?
  const statusQ = useQuery({
    queryKey: ["appid-status"],
    queryFn: () => api<{ configured: boolean }>("/admin/appid-users/status"),
  });

  // List users
  const listQ = useQuery({
    queryKey: ["appid-users", search],
    queryFn: () =>
      api<CdUserList>(`/admin/appid-users${search ? `?query=${encodeURIComponent(search)}` : ""}`),
    enabled: statusQ.data?.configured === true,
  });

  const roleDefsQ = useQuery({
    queryKey: ["appid-role-defs"],
    queryFn: () => api<AppIdRoleDef[]>("/admin/appid-users/role-definitions"),
    enabled: statusQ.data?.configured === true,
  });

  const syncUsers = useAppIdUserSync({
    onSuccess: (summary) => {
      const msg = formatAppIdSyncMessage(summary);
      showToast(msg, summary.skipped.length && !summary.synced.length ? "error" : "success");
    },
    onError: (e) => showToast(e.message, "error"),
  });

  function syncVisibleUsers() {
    const emails = listQ.data?.Resources.map((u) => primaryEmail(u)).filter((e) => e !== "—") ?? [];
    syncUsers.mutate(emails.length ? emails : undefined);
  }

  function syncOneUser(u: CdUser) {
    const email = primaryEmail(u);
    if (email === "—") {
      showToast("No email on user", "error");
      return;
    }
    syncUsers.mutate([email]);
  }

  // Create single
  const createMutation = useMutation({
    mutationFn: () =>
      api<CdUser & { _warning?: string }>("/admin/appid-users", {
        method: "POST",
        json: {
          email: form.email,
          displayName: form.displayName || undefined,
          password: form.password,
          active: form.active,
          appIdRoleNames: form.appIdRoleNames.length ? form.appIdRoleNames : undefined,
        },
      }),
    onSuccess: (user) => {
      qc.invalidateQueries({ queryKey: ["appid-users"] });
      const warn = user._warning;
      showToast(
        warn ?? `User ${user.emails?.[0]?.value ?? form.email} created in App ID.`,
        warn ? "error" : "success"
      );
      setForm({ email: "", displayName: "", password: "", active: true, appIdRoleNames: [] });
      setTab("list");
    },
    onError: (e) => showToast((e as Error).message, "error"),
  });

  // Bulk import
  const bulkMutation = useMutation({
    mutationFn: () =>
      api<BulkImportResult>("/admin/appid-users/bulk", {
        method: "POST",
        json: { users: parsedRows },
      }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["appid-users"] });
      setBulkResult(result);
      showToast(`${result.created} user${result.created !== 1 ? "s" : ""} created${result.failed.length > 0 ? `, ${result.failed.length} failed` : ""}.`, result.failed.length > 0 ? "error" : "success");
    },
    onError: (e) => showToast((e as Error).message, "error"),
  });

  function handleCsvChange(text: string) {
    setCsvText(text);
    setBulkResult(null);
    setParsedRows(parseCsvText(text));
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => handleCsvChange(ev.target?.result as string ?? "");
    reader.readAsText(file);
  }

  function downloadTemplate() {
    const csv = "email,displayName,password\nuser1@example.com,User One,SecurePass1!\nuser2@example.com,User Two,SecurePass2!\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "appid_users_template.csv";
    a.click();
  }

  const primaryEmail = (u: CdUser) => u.emails?.find((e) => e.primary)?.value ?? u.emails?.[0]?.value ?? "—";
  const canCreate = form.email && form.password.length >= 8;

  // Not configured banner
  const notConfigured = statusQ.data?.configured === false;

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 px-4 py-2.5 rounded-lg shadow-lg z-50 text-sm flex items-center gap-2 text-white ${toast.type === "error" ? "bg-red-600" : "bg-green-600"}`}>
          {toast.type === "error" ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
          {toast.msg}
        </div>
      )}

      <SectionHeader
        title="IBM App ID Users"
        description="IBM Cloud Directory accounts. Use Sync to app to create local users (including capability managers) before their first login."
        actions={
          <Button
            variant="primary"
            onClick={syncVisibleUsers}
            disabled={notConfigured || syncUsers.isPending || listQ.isLoading}
            title={
              notConfigured
                ? "Configure App ID first"
                : "Create or update local app users from App ID (no login required)"
            }
          >
            {syncUsers.isPending ? "Syncing…" : "Sync to app"}
          </Button>
        }
      />

      {/* Not configured banner */}
      {notConfigured && (
        <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800">
          <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-500" />
          <div className="text-sm">
            <p className="font-semibold mb-1">IBM App ID not configured</p>
            <p>
              Set <code className="bg-amber-100 px-1 rounded text-xs">APPID_IAM_APIKEY</code> and{" "}
              <code className="bg-amber-100 px-1 rounded text-xs">APPID_TENANT_ID</code> in{" "}
              <code className="bg-amber-100 px-1 rounded text-xs">.env</code> or{" "}
              <code className="bg-amber-100 px-1 rounded text-xs">server/.env</code>, then restart the API server.
            </p>
            <p className="mt-1 text-xs text-amber-600">
              Obtain an IBM Cloud API key at{" "}
              <a href="https://cloud.ibm.com/iam/apikeys" target="_blank" rel="noreferrer" className="underline">
                cloud.ibm.com/iam/apikeys
              </a>{" "}
              and grant it the <em>Manager</em> service role on your App ID instance.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {([
          { id: "list"   as Tab, label: "Users",         icon: <Users size={14} /> },
          { id: "create" as Tab, label: "Create user",   icon: <UserPlus size={14} /> },
          { id: "bulk"   as Tab, label: "Bulk import",   icon: <Upload size={14} /> },
        ] as const).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setTab(t.id); setBulkResult(null); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === t.id ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── List tab ── */}
      {tab === "list" && (
        <Card
          title="Cloud Directory users"
          subtitle={listQ.data ? `${listQ.data.totalResults} total` : undefined}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={syncVisibleUsers}
                disabled={notConfigured || syncUsers.isPending || listQ.isLoading}
                title="Create local User + profile in Assessment OS from App ID"
              >
                {syncUsers.isPending ? "Syncing…" : "Sync to app"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => qc.invalidateQueries({ queryKey: ["appid-users"] })}
                disabled={notConfigured || listQ.isFetching}
                title="Reload IBM directory only — does not create app users"
              >
                {listQ.isFetching ? "Loading…" : "Reload App ID list"}
              </Button>
            </div>
          }
        >
          {!notConfigured && (
            <div className="flex gap-2.5 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 text-sm text-indigo-950 mb-4">
              <Info size={16} className="shrink-0 mt-0.5 text-indigo-600" />
              <p>
                <strong>Sync to app</strong> writes users into Assessment OS (Manager Skills, Users, etc.) before their
                first login. <strong>Reload App ID list</strong> only fetches the IBM directory — it does not create
                local accounts.
              </p>
            </div>
          )}

          {/* Search */}
          <div className="relative mb-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="search"
              placeholder="Search by email (e.g. user@company.com) — or leave empty to load all via export"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {notConfigured && (
            <p className="text-sm text-slate-400 text-center py-8">Configure App ID to see users.</p>
          )}

          {!notConfigured && listQ.isLoading && (
            <p className="text-sm text-slate-400 text-center py-8">Loading users…</p>
          )}

          {!notConfigured && listQ.isError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {(listQ.error as Error).message}
            </div>
          )}

          {listQ.data && listQ.data.Resources.length === 0 && (
            <div className="text-sm text-slate-500 text-center py-8 space-y-2">
              <p>No users in this response.</p>
              {listQ.data.totalResults > 0 && (
                <p className="text-xs text-amber-700 max-w-md mx-auto">
                  IBM reports {listQ.data.totalResults} user(s) here but did not return rows in this response.
                  Search by email above (e.g. <code className="bg-slate-100 px-1 rounded">user@company.com</code>), or restart the API after setting{" "}
                  <code className="bg-slate-100 px-1 rounded">APPID_EXPORT_SECRET</code> in <code className="bg-slate-100 px-1 rounded">server/.env</code>.
                </p>
              )}
            </div>
          )}

          {listQ.data && listQ.data.Resources.length > 0 && listQ.data.listMode && listQ.data.listMode !== "search" && (
            <p className="text-xs text-slate-500 mb-3">
              Loaded via {listQ.data.listMode === "directory_export" ? "Cloud Directory export" : "user profiles export"}.
              Use search for a specific email.
            </p>
          )}

          <p className="text-xs text-slate-500 mb-3">
            Use <strong>Sync to app</strong> to create or update local users from App ID (including capability managers
            before their first login). Roles come from IBM App ID roles and your <code className="bg-slate-100 px-1 rounded">APPID_ROLE_*</code> mapping.
          </p>

          {listQ.data && listQ.data.Resources.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Email</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Display name</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">App ID roles</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">App user</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Actions</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Status</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {listQ.data.Resources.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">{primaryEmail(u)}</td>
                      <td className="px-4 py-3 text-slate-600">{u.displayName ?? u.userName ?? "—"}</td>
                      <td className="px-4 py-3">
                        {u.appIdRoles?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {u.appIdRoles.map((r) => (
                              <Badge key={r} color="indigo">
                                {r}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {u.appUserId ? u.appRole ?? "—" : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm align-top">
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            className="text-left text-indigo-600 hover:underline disabled:opacity-50"
                            disabled={syncUsers.isPending || primaryEmail(u) === "—"}
                            onClick={() => syncOneUser(u)}
                          >
                            {u.appUserId ? "Re-sync to app" : "Sync to app"}
                          </button>
                          {u.appUserId && u.appRole === "candidate" && (
                            <Link
                              to={`/admin/candidates/${u.appUserId}`}
                              className="text-slate-500 hover:text-indigo-600 text-xs"
                            >
                              Staffing profile
                            </Link>
                          )}
                          {roleDefsQ.data && primaryEmail(u) !== "—" && (
                            <button
                              type="button"
                              className="text-left text-slate-500 hover:text-indigo-600 text-xs"
                              onClick={() =>
                                setEditingRolesEmail((cur) =>
                                  cur === primaryEmail(u) ? null : primaryEmail(u)
                                )
                              }
                            >
                              {editingRolesEmail === primaryEmail(u) ? "Hide IBM roles" : "Edit IBM roles"}
                            </button>
                          )}
                        </div>
                        {editingRolesEmail === primaryEmail(u) && roleDefsQ.data && primaryEmail(u) !== "—" && (
                          <AppIdRoleEditor
                            email={primaryEmail(u)}
                            currentRoles={u.appIdRoles ?? []}
                            roleDefs={roleDefsQ.data}
                            onSaved={() => {
                              qc.invalidateQueries({ queryKey: ["appid-users"] });
                              setEditingRolesEmail(null);
                              syncUsers.mutate([primaryEmail(u)]);
                            }}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge color={u.active ? "green" : "slate"}>
                          {u.active ? "Active" : "Inactive"}
                        </Badge>
                        {u.status && u.status !== "CONFIRMED" && (
                          <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">{u.status}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {u.meta?.created ? new Date(u.meta.created).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ── Create single tab ── */}
      {tab === "create" && (
        <div className="max-w-md">
          <Card title="Create Cloud Directory user" subtitle="The user will be able to log in immediately with the email and password you set.">
            <p className="text-xs text-slate-500 mb-4 -mt-2">
              Login uses the <strong>email</strong> as the Cloud Directory username (not display name).
              If creation fails, check App ID password policy and whether the email already exists.
            </p>
            <div className="space-y-4">
              <div>
                <FieldLabel label="Email address" required />
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <FieldLabel label="Display name" />
                <Input
                  value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                  placeholder="Jane Doe"
                />
              </div>
              <div>
                <FieldLabel label="Password" required />
                <PasswordInput
                  value={form.password}
                  onChange={(v) => setForm((f) => ({ ...f, password: v }))}
                  placeholder="Min. 8 characters"
                />
                <p className="text-xs text-slate-400 mt-1">IBM App ID requires mixed case + a number (e.g. SecurePass1!).</p>
              </div>
              <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <input
                  type="checkbox"
                  id="active"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                  className="accent-indigo-600"
                />
                <label htmlFor="active" className="text-sm text-slate-700 cursor-pointer">Active (can log in immediately)</label>
              </div>

              {roleDefsQ.data && roleDefsQ.data.length > 0 && (
                <div>
                  <FieldLabel label="IBM App ID roles (optional)" />
                  <p className="text-xs text-slate-400 mb-2">
                    Profiles & roles in IBM console (e.g. Admin, Capability_Manager, Candidate). Applied after user is created.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {roleDefsQ.data.map((r) => (
                      <label key={r.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          className="accent-indigo-600"
                          checked={form.appIdRoleNames.includes(r.name)}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              appIdRoleNames: e.target.checked
                                ? [...f.appIdRoleNames, r.name]
                                : f.appIdRoleNames.filter((n) => n !== r.name),
                            }))
                          }
                        />
                        {r.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {createMutation.isError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 text-sm flex gap-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  {(createMutation.error as Error).message}
                </div>
              )}

              <Button
                onClick={() => createMutation.mutate()}
                disabled={!canCreate || createMutation.isPending || notConfigured}
              >
                <UserPlus size={15} />
                {createMutation.isPending ? "Creating…" : "Create user"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ── Bulk import tab ── */}
      {tab === "bulk" && (
        <div className="space-y-4">
          <Card
            title="Bulk import users"
            subtitle="Upload or paste a CSV file. Processed in batches of 50."
            actions={
              <Button size="sm" variant="secondary" onClick={downloadTemplate}>
                <Download size={13} /> Template
              </Button>
            }
          >
            <div className="space-y-4">
              {/* Info */}
              <div className="flex gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 text-xs text-blue-700">
                <Info size={13} className="shrink-0 mt-0.5" />
                <p>
                  CSV format: <code className="bg-blue-100 px-1 rounded">email, displayName (optional), password</code>.
                  Header row is optional. Max 500 users per import.
                </p>
              </div>

              {/* File upload */}
              <div>
                <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileUpload} />
                <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
                  <Upload size={13} /> Choose CSV file
                </Button>
              </div>

              {/* Paste area */}
              <div>
                <FieldLabel label="Or paste CSV data" />
                <textarea
                  value={csvText}
                  onChange={(e) => handleCsvChange(e.target.value)}
                  rows={8}
                  placeholder={"email,displayName,password\nuser1@example.com,User One,SecurePass1!\nuser2@example.com,User Two,SecurePass2!"}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y placeholder:text-slate-400"
                />
              </div>

              {/* Preview */}
              {parsedRows.length > 0 && !bulkResult && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <FileText size={13} />
                    Preview — {parsedRows.length} row{parsedRows.length !== 1 ? "s" : ""} parsed
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-white border-b border-slate-100">
                        <tr>
                          <th className="text-left px-4 py-2 text-slate-500">#</th>
                          <th className="text-left px-4 py-2 text-slate-500">Email</th>
                          <th className="text-left px-4 py-2 text-slate-500">Display name</th>
                          <th className="text-left px-4 py-2 text-slate-500">Password</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {parsedRows.map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-4 py-1.5 text-slate-400">{i + 1}</td>
                            <td className="px-4 py-1.5 text-slate-700">{r.email}</td>
                            <td className="px-4 py-1.5 text-slate-500">{r.displayName ?? "—"}</td>
                            <td className="px-4 py-1.5 text-slate-400">{"•".repeat(Math.min(r.password.length, 8))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Bulk result */}
              {bulkResult && (
                <div className={`rounded-xl border p-4 space-y-2 ${bulkResult.failed.length === 0 ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    {bulkResult.failed.length === 0
                      ? <><CheckCircle2 size={16} className="text-green-600" /> All {bulkResult.created} users created successfully!</>
                      : <><AlertTriangle size={16} className="text-amber-600" /> {bulkResult.created} created, {bulkResult.failed.length} failed</>
                    }
                  </div>
                  {bulkResult.failed.length > 0 && (
                    <ul className="space-y-1 text-xs text-red-700">
                      {bulkResult.failed.map((f, i) => (
                        <li key={i}><span className="font-medium">{f.email}</span>: {f.error}</li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    onClick={() => { setBulkResult(null); setCsvText(""); setParsedRows([]); }}
                    className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
                  >
                    <X size={12} /> Clear and start over
                  </button>
                </div>
              )}

              {!bulkResult && (
                <Button
                  onClick={() => bulkMutation.mutate()}
                  disabled={parsedRows.length === 0 || bulkMutation.isPending || notConfigured}
                >
                  <Upload size={15} />
                  {bulkMutation.isPending ? `Importing ${parsedRows.length} users…` : `Import ${parsedRows.length} user${parsedRows.length !== 1 ? "s" : ""}`}
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
