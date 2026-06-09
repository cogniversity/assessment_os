/**
 * IBM App ID — Cloud Directory management service.
 *
 * Uses an IBM Cloud IAM API key to obtain a bearer token and calls the
 * App ID Management API v4 endpoints for Cloud Directory users.
 *
 * All calls are no-ops (returning empty results) when APPID_IAM_APIKEY or
 * APPID_TENANT_ID are absent — the feature gracefully degrades to "not
 * configured" in the admin UI.
 */

import { config } from "../config.js";

// ── IAM token cache ──────────────────────────────────────────────────────────

interface IamTokenCache {
  token: string;
  expiresAt: number; // ms epoch
}

let iamCache: IamTokenCache | null = null;
const IAM_TOKEN_URL = "https://iam.cloud.ibm.com/identity/token";
// Refresh 5 minutes before expiry
const IAM_REFRESH_BUFFER_MS = 5 * 60 * 1000;

async function getIamToken(): Promise<string> {
  if (iamCache && Date.now() < iamCache.expiresAt - IAM_REFRESH_BUFFER_MS) {
    return iamCache.token;
  }

  const body = new URLSearchParams({
    grant_type: "urn:ibm:params:oauth:grant-type:apikey",
    apikey: config.appId.iamApiKey,
  });

  const res = await fetch(IAM_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`IBM IAM token request failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  iamCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return iamCache.token;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export class AppIdManagementError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly hint?: string
  ) {
    super(message);
    this.name = "AppIdManagementError";
  }
}

const APPID_FORBIDDEN_HINT =
  "The API key identity needs the Manager role on this App ID instance. In IBM Cloud: IAM → Access (Policies) → add policy for your user or service ID: Service = App ID, Role = Manager, resource = your instance. Prefer the apiKey from App ID → Credentials, or a Cloud IAM API key with that policy.";

const APPID_CREATE_USER_HINT =
  "Common causes: user already exists, password does not meet App ID password policy (Cloud Directory → Password strength), or Cloud Directory is set to Email sign-in (userName must be the email — set APPID_CD_IDENTITY_FIELD=email, default).";

function appIdError(action: string, status: number, body: string): AppIdManagementError {
  let hint: string | undefined;
  if (status === 403) hint = APPID_FORBIDDEN_HINT;
  else if (status === 400 || status === 409) hint = APPID_CREATE_USER_HINT;
  return new AppIdManagementError(`${action}: ${body || resStatusText(status)}`, status, hint);
}

function resStatusText(status: number): string {
  return status === 400 ? "Bad request" : status === 409 ? "Conflict" : `HTTP ${status}`;
}

async function readMgmtErrorBody(res: Response): Promise<string> {
  const text = await res.text();
  if (!text) return res.statusText;
  try {
    const data = JSON.parse(text) as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof data.message === "string") parts.push(data.message);
    if (typeof data.errorDescription === "string") parts.push(data.errorDescription);
    if (typeof data.error === "string") parts.push(data.error);
    if (typeof data.description === "string") parts.push(data.description);
    if (typeof data.detail === "string") parts.push(data.detail);
    if (Array.isArray(data.errors)) {
      for (const e of data.errors) {
        if (typeof e === "string") parts.push(e);
        else if (e && typeof e === "object") {
          const o = e as Record<string, unknown>;
          if (typeof o.message === "string") parts.push(o.message);
          if (typeof o.description === "string") parts.push(o.description);
        }
      }
    }
    if (Array.isArray(data.failed)) {
      for (const f of data.failed) {
        if (f && typeof f === "object") {
          const row = f as { email?: string; error?: string };
          parts.push([row.email, row.error].filter(Boolean).join(": "));
        }
      }
    }
    return parts.length ? parts.join("; ") : text;
  } catch {
    return text;
  }
}

export function isAppIdConfigured(): boolean {
  return !!(config.appId.iamApiKey && config.appId.tenantId);
}

function roleNamesFromPayload(data: { roles?: Array<{ id?: string; name?: string }> }): string[] {
  const names: string[] = [];
  for (const r of data.roles ?? []) {
    if (r.name) names.push(r.name);
  }
  return [...new Set(names)];
}

/** Resolve App ID profile subject (identity token sub) from email when possible. */
export async function resolveAppIdSubjectByEmail(email: string): Promise<string | null> {
  if (!isAppIdConfigured() || !email.includes("@")) return null;
  const res = await mgmtFetch(`/users?email=${encodeURIComponent(email)}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { users?: Array<{ id?: string }> };
  const id = data.users?.[0]?.id;
  return typeof id === "string" && id ? id : null;
}

export interface AppIdRoleDef {
  id: string;
  name: string;
}

/** Role names configured for RBAC mapping (fallback when GET /roles is unavailable). */
export function configuredAppIdRoleNames(): string[] {
  return [
    ...config.appIdRoleAdmin,
    ...config.appIdRoleManager,
    ...config.appIdRoleCandidate,
  ];
}

/** Roles defined in App ID → Profiles & roles. */
export async function listAppIdRoleDefinitions(): Promise<AppIdRoleDef[]> {
  if (!isAppIdConfigured()) return [];
  const res = await mgmtFetch("/roles");
  if (res.ok) {
    const data = (await res.json()) as { roles?: Array<{ id?: string; name?: string }> };
    const defs = (data.roles ?? []).filter(
      (r): r is AppIdRoleDef => typeof r.id === "string" && typeof r.name === "string"
    );
    if (defs.length) return defs;
  }
  return configuredAppIdRoleNames().map((name) => ({ id: name, name }));
}

/** Replace IBM App ID roles on a user profile (by profile subject id). */
export async function setUserAppIdRoles(subject: string, roleIds: string[]): Promise<string[]> {
  if (!isAppIdConfigured() || !subject) {
    throw new AppIdManagementError("App ID not configured", 503);
  }
  const res = await mgmtFetch(`/users/${encodeURIComponent(subject)}/roles`, {
    method: "PUT",
    body: JSON.stringify({ roles: roleIds.map((id) => ({ id })) }),
  });
  if (!res.ok) {
    const detail = await readMgmtErrorBody(res);
    throw appIdError("App ID update user roles failed", res.status, detail);
  }
  return getUserAppIdRoles(subject);
}

/** Assign IBM roles by role name (resolves ids from GET /roles). */
export async function setUserAppIdRolesByNames(email: string, roleNames: string[]): Promise<string[]> {
  const normalized = email.trim().toLowerCase();
  const subject = await resolveAppIdSubjectByEmail(normalized);
  if (!subject) {
    throw new AppIdManagementError(
      `No App ID profile for ${normalized}. Create the user in Cloud Directory with profile (sign_up / import), then assign roles.`,
      404
    );
  }
  const defs = await listAppIdRoleDefinitions();
  const roleIds: string[] = [];
  for (const name of roleNames) {
    const def = defs.find((d) => d.name.toLowerCase() === name.toLowerCase());
    if (!def) {
      throw new AppIdManagementError(`Unknown App ID role: ${name}`, 400);
    }
    if (def.id === def.name && !/^[0-9a-f-]{36}$/i.test(def.id)) {
      throw new AppIdManagementError(
        `Cannot assign "${name}": App ID role id not available. Ensure APPID_IAM_APIKEY has Manager role and GET /roles succeeds.`,
        502
      );
    }
    roleIds.push(def.id);
  }
  return setUserAppIdRoles(subject, roleIds);
}

/** Roles assigned in IBM App ID → Profiles & roles (management API). */
export async function getUserAppIdRoles(subject: string): Promise<string[]> {
  if (!isAppIdConfigured() || !subject) return [];

  const res = await mgmtFetch(`/users/${encodeURIComponent(subject)}/roles`);
  if (!res.ok) {
    return [];
  }

  const data = (await res.json()) as { roles?: Array<{ id?: string; name?: string }> };
  return roleNamesFromPayload(data);
}

/** Roles for a Cloud Directory row (tries profile subject by email, then directory id). */
export async function getUserAppIdRolesForCdUser(user: CdUser): Promise<string[]> {
  const email =
    user.emails.find((e) => e.primary)?.value ?? user.emails[0]?.value ?? "";
  const subject = (email && (await resolveAppIdSubjectByEmail(email))) || user.id;
  return getUserAppIdRoles(subject);
}

/** List Cloud Directory users with IBM roles and optional link to local app users. */
export async function listCdUsersEnriched(opts: {
  query?: string;
  startIndex?: number;
  count?: number;
}): Promise<CdUserListResponse> {
  const list = await listCdUsers(opts);
  const { prisma } = await import("../db.js");

  const Resources = await Promise.all(
    list.Resources.map(async (u) => {
      const email = (
        u.emails.find((e) => e.primary)?.value ??
        u.emails[0]?.value ??
        ""
      ).toLowerCase();
      const [appIdRoles, appUser] = await Promise.all([
        getUserAppIdRolesForCdUser(u),
        email
          ? prisma.user.findUnique({
              where: { email },
              select: { id: true, role: true },
            })
          : Promise.resolve(null),
      ]);
      return {
        ...u,
        appIdRoles,
        appUserId: appUser?.id ?? null,
        appRole: appUser?.role ?? null,
      };
    })
  );

  return { ...list, Resources };
}

function mgmtUrl(path: string): string {
  return `${config.appId.managementBaseUrl}/management/v4/${config.appId.tenantId}${path}`;
}

async function mgmtFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getIamToken();
  return fetch(mgmtUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers as Record<string, string>),
    },
  });
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface CdUserEmail {
  value: string;
  primary: boolean;
}

export interface CdUser {
  id: string;
  userName?: string;
  displayName?: string;
  active: boolean;
  emails: CdUserEmail[];
  status?: string;
  meta?: { created?: string; lastModified?: string };
  /** IBM App ID Profiles & roles (when enrich=true on list) */
  appIdRoles?: string[];
  /** Linked Assessment OS user (after first login), if any */
  appUserId?: string | null;
  appRole?: string | null;
}

export interface CdUserListResponse {
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: CdUser[];
  /** How the list was loaded (for UI hints) */
  listMode?: "search" | "directory_export" | "profiles_export";
}

export interface CreateCdUserInput {
  email: string;
  displayName?: string;
  password: string;
  active?: boolean;
}

export interface BulkImportUser {
  email: string;
  displayName?: string;
  password: string;
}

export interface BulkImportResult {
  created: number;
  failed: { email: string; error: string }[];
}

// ── API calls ────────────────────────────────────────────────────────────────

function emptyList(startIndex = 1): CdUserListResponse {
  return { totalResults: 0, startIndex, itemsPerPage: 0, Resources: [] };
}

function unwrapScimUser(entry: unknown): Record<string, unknown> | null {
  if (!entry || typeof entry !== "object") return null;
  const obj = entry as Record<string, unknown>;
  if (obj.scimUser && typeof obj.scimUser === "object") {
    return obj.scimUser as Record<string, unknown>;
  }
  return obj;
}

function normalizeCdUser(raw: Record<string, unknown>): CdUser | null {
  const id =
    (typeof raw.id === "string" && raw.id) ||
    (typeof raw.originalId === "string" && raw.originalId) ||
    "";
  if (!id) return null;

  let emails: CdUserEmail[] = [];
  if (Array.isArray(raw.emails)) {
    emails = raw.emails
      .map((e) => {
        const entry = e as Record<string, unknown>;
        const value = entry.value;
        if (typeof value !== "string" || !value) return null;
        return { value, primary: entry.primary === true };
      })
      .filter((e): e is CdUserEmail => e !== null);
  } else if (typeof raw.email === "string" && raw.email.includes("@")) {
    emails = [{ value: raw.email, primary: true }];
  }

  let displayName: string | undefined;
  if (Array.isArray(raw.identities)) {
    for (const ident of raw.identities) {
      const entry = ident as {
        id?: string;
        idpUserInfo?: {
          displayName?: string;
          userName?: string;
          emails?: { value?: string; primary?: boolean }[];
        };
      };
      const info = entry.idpUserInfo;
      if (!info) continue;
      if (!displayName && info.displayName) displayName = info.displayName;
      if (emails.length === 0 && Array.isArray(info.emails)) {
        emails = info.emails
          .map((e) => {
            if (typeof e.value !== "string" || !e.value) return null;
            return { value: e.value, primary: e.primary === true };
          })
          .filter((e): e is CdUserEmail => e !== null);
      }
    }
  }

  const name = displayName ?? raw.displayName ?? raw.userName;
  const formatted =
    raw.name && typeof raw.name === "object"
      ? (raw.name as { formatted?: string }).formatted
      : undefined;

  return {
    id,
    userName: typeof raw.userName === "string" ? raw.userName : undefined,
    displayName:
      typeof name === "string" ? name : typeof formatted === "string" ? formatted : undefined,
    active: raw.active !== false,
    emails,
    status: typeof raw.status === "string" ? raw.status : undefined,
    meta:
      raw.meta && typeof raw.meta === "object"
        ? {
            created: (raw.meta as { created?: string }).created,
            lastModified: (raw.meta as { lastModified?: string }).lastModified,
          }
        : undefined,
  };
}

function extractRawUserEntries(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  const rawList = Array.isArray(obj.Resources)
    ? obj.Resources
    : Array.isArray(obj.users)
      ? obj.users
      : Array.isArray(obj.Users)
        ? obj.Users
        : Array.isArray(data)
          ? data
          : [];
  return rawList
    .map((entry) => unwrapScimUser(entry))
    .filter((u): u is Record<string, unknown> => u !== null);
}

function usersFromPayload(data: unknown): CdUser[] {
  return extractRawUserEntries(data)
    .map((u) => normalizeCdUser(u))
    .filter((u): u is CdUser => u !== null);
}

/** IBM search API — requires `query` (e.g. email). Without query, Resources is often empty. */
async function searchCdUsers(opts: {
  query: string;
  startIndex?: number;
  count?: number;
}): Promise<CdUserListResponse> {
  const params = new URLSearchParams();
  params.set("query", opts.query);
  if (opts.startIndex) params.set("startIndex", String(opts.startIndex));
  if (opts.count) params.set("count", String(opts.count ?? 50));

  const res = await mgmtFetch(`/cloud_directory/Users?${params}`);
  if (!res.ok) {
    const text = await res.text();
    throw appIdError("App ID search users failed", res.status, text);
  }
  const data = (await res.json()) as CdUserListResponse;
  const Resources = usersFromPayload(data);
  return {
    totalResults: data.totalResults ?? Resources.length,
    startIndex: data.startIndex ?? opts.startIndex ?? 1,
    itemsPerPage: Resources.length,
    Resources,
    listMode: "search",
  };
}

/** Small tenants: synchronous Cloud Directory export (GET). */
async function listCdUsersFromDirectoryExport(): Promise<CdUserListResponse | null> {
  const secret = config.appId.exportSecret;
  if (!secret || secret.length < 16) return null;

  const res = await mgmtFetch(
    `/cloud_directory/export?encryption_secret=${encodeURIComponent(secret)}`
  );
  if (!res.ok) {
    console.warn(`App ID directory export failed: ${res.status} ${await res.text().catch(() => "")}`);
    return null;
  }

  const data = await res.json().catch(() => null);
  const Resources = usersFromPayload(data);
  if (Resources.length === 0) {
    console.warn("App ID directory export returned no parseable users", data);
    return null;
  }

  return {
    totalResults: Resources.length,
    startIndex: 1,
    itemsPerPage: Resources.length,
    Resources,
    listMode: "directory_export",
  };
}

/** App ID user profiles export — includes email/name when Cloud Directory list is empty. */
async function listCdUsersFromProfilesExport(): Promise<CdUserListResponse | null> {
  const res = await mgmtFetch("/users/export");
  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  const Resources = usersFromPayload(data);
  if (Resources.length === 0) return null;

  return {
    totalResults:
      (data && typeof data === "object" && "totalResults" in data
        ? Number((data as { totalResults?: number }).totalResults)
        : null) ?? Resources.length,
    startIndex: 1,
    itemsPerPage: Resources.length,
    Resources,
    listMode: "profiles_export",
  };
}

/**
 * List Cloud Directory users.
 * - With `query`: IBM search by email/username.
 * - Without `query`: export APIs (IBM does not return Resources on bare GET /Users).
 */
export async function listCdUsers(opts: {
  query?: string;
  startIndex?: number;
  count?: number;
}): Promise<CdUserListResponse> {
  const q = opts.query?.trim();
  if (q) {
    return searchCdUsers({ query: q, startIndex: opts.startIndex, count: opts.count });
  }

  const fromDir = await listCdUsersFromDirectoryExport();
  if (fromDir) return fromDir;

  const fromProfiles = await listCdUsersFromProfilesExport();
  if (fromProfiles) return fromProfiles;

  // Bare SCIM list — often totalResults > 0 but Resources: []
  const params = new URLSearchParams();
  if (opts.startIndex) params.set("startIndex", String(opts.startIndex));
  if (opts.count) params.set("count", String(opts.count ?? 50));
  const qs = params.toString();
  const res = await mgmtFetch(`/cloud_directory/Users${qs ? `?${qs}` : ""}`);
  if (!res.ok) {
    const text = await res.text();
    throw appIdError("App ID list users failed", res.status, text);
  }
  const data = (await res.json()) as CdUserListResponse;
  const Resources = usersFromPayload(data);
  return {
    totalResults: data.totalResults ?? Resources.length,
    startIndex: data.startIndex ?? 1,
    itemsPerPage: Resources.length,
    Resources,
  };
}

function cdUserNameForCreate(email: string, displayName?: string): string {
  if (config.appId.cdIdentityField === "email") {
    return email;
  }
  const name = displayName?.trim();
  if (name) return name;
  return email.split("@")[0] || email;
}

/** SCIM body for Cloud Directory user create (sign_up or import). */
function buildCdUserScimBody(input: CreateCdUserInput): Record<string, unknown> {
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName?.trim() || email.split("@")[0];
  const body: Record<string, unknown> = {
    active: input.active ?? true,
    emails: [{ value: email, primary: true }],
    userName: cdUserNameForCreate(email, input.displayName),
    displayName,
    password: input.password,
    status: "CONFIRMED",
  };
  if (displayName) {
    body.name = { formatted: displayName };
  }
  return body;
}

async function createCdUserViaImport(scimUser: Record<string, unknown>): Promise<CdUser> {
  const email =
    (scimUser.emails as { value?: string }[] | undefined)?.[0]?.value?.toLowerCase() ?? "";

  const res = await mgmtFetch("/cloud_directory/Users/import", {
    method: "POST",
    body: JSON.stringify({ users: [{ scimUser }] }),
  });

  if (!res.ok) {
    const detail = await readMgmtErrorBody(res);
    throw appIdError("App ID import user failed", res.status, detail);
  }

  const data = (await res.json()) as {
    added?: number;
    failed?: { email?: string; error?: string }[];
  };

  if ((data.failed ?? []).length > 0) {
    const detail = data.failed!.map((f) => `${f.email ?? email}: ${f.error ?? "failed"}`).join("; ");
    throw appIdError("App ID import user failed", 400, detail);
  }

  if (email) {
    const listed = await searchCdUsers({ query: email, count: 5 });
    const found = listed.Resources.find((u) =>
      u.emails.some((e) => e.value.toLowerCase() === email)
    );
    if (found) return found;
  }

  return {
    id: "",
    active: scimUser.active !== false,
    emails: (scimUser.emails as CdUserEmail[]) ?? [],
    displayName: typeof scimUser.displayName === "string" ? scimUser.displayName : undefined,
  };
}

/**
 * Create a single Cloud Directory user (admin).
 * Tries sign_up, then Users/import. Sets userName to email when CD uses email sign-in.
 */
export async function createCdUser(input: CreateCdUserInput): Promise<CdUser> {
  const email = input.email.trim().toLowerCase();
  const scimUser = buildCdUserScimBody({ ...input, email });

  const trySignUp = async (body: Record<string, unknown>) => {
    return mgmtFetch("/cloud_directory/sign_up?shouldCreateProfile=true&language=en", {
      method: "POST",
      body: JSON.stringify(body),
    });
  };

  let res = await trySignUp(scimUser);

  if (!res.ok && res.status === 400 && scimUser.status === "CONFIRMED") {
    const { status: _s, ...withoutStatus } = scimUser;
    res = await trySignUp(withoutStatus);
  }

  if (res.ok) {
    const raw = (await res.json()) as Record<string, unknown>;
    return normalizeCdUser(raw) ?? (raw as unknown as CdUser);
  }

  const signUpDetail = await readMgmtErrorBody(res);

  try {
    return await createCdUserViaImport(scimUser);
  } catch (importErr) {
    const importMsg =
      importErr instanceof AppIdManagementError ? importErr.message : String(importErr);
    throw appIdError(
      "App ID create user failed",
      res.status,
      `${signUpDetail}${importMsg ? ` (import: ${importMsg})` : ""}`
    );
  }
}

/**
 * Bulk import up to 50 users per request using the import endpoint.
 * Automatically batches if more than 50 users are supplied.
 */
export async function bulkImportCdUsers(users: BulkImportUser[]): Promise<BulkImportResult> {
  const BATCH = 50;
  const result: BulkImportResult = { created: 0, failed: [] };

  for (let i = 0; i < users.length; i += BATCH) {
    const batch = users.slice(i, i + BATCH);
    const payload = {
      users: batch.map((u) => {
        const email = u.email.trim().toLowerCase();
        return {
          scimUser: buildCdUserScimBody({
            email,
            displayName: u.displayName,
            password: u.password,
            active: true,
          }),
        };
      }),
    };

    const res = await mgmtFetch("/cloud_directory/Users/import", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      // Mark whole batch as failed if the request itself failed
      const text = await res.text().catch(() => res.statusText);
      batch.forEach((u) => result.failed.push({ email: u.email, error: `HTTP ${res.status}: ${text}` }));
      continue;
    }

    const data = (await res.json()) as {
      added?: number;
      failed?: { email?: string; error?: string }[];
    };
    result.created += data.added ?? 0;
    (data.failed ?? []).forEach((f) =>
      result.failed.push({ email: f.email ?? "unknown", error: f.error ?? "Unknown error" })
    );
  }

  return result;
}
