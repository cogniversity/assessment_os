import { config } from "../config.js";
import { Role, highestRole, mergeRoles, type Role as AppRole } from "@assessment-os/shared";

/** Extract IBM App ID / OIDC role names from token or userinfo claims. */
export function appIdRolesFromClaims(claims: Record<string, unknown> | undefined): string[] {
  if (!claims) return [];
  const out: string[] = [];
  const add = (v: unknown) => {
    if (typeof v === "string" && v.trim()) out.push(v.trim());
    else if (Array.isArray(v)) v.forEach(add);
  };
  add(claims.roles);
  add(claims.role);
  add(claims.groupIds);
  add(claims.groups);
  if (claims.realm_access && typeof claims.realm_access === "object") {
    add((claims.realm_access as { roles?: unknown }).roles);
  }
  return [...new Set(out)];
}

export function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
  try {
    const part = token.split(".")[1];
    if (!part) return undefined;
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export function matchesRoleName(configured: string[], appIdRoles: string[]): boolean {
  if (!configured.length || !appIdRoles.length) return false;
  const lower = appIdRoles.map((r) => r.toLowerCase());
  return configured.some((name) => lower.includes(name.toLowerCase()));
}

/** Whether a user may appear in the assessment assignment candidate picker. */
export function isAssignmentEligible(opts: {
  localRoles?: AppRole[];
  /** @deprecated use localRoles */
  localRole?: string | null;
  appIdRoles?: string[];
}): boolean {
  const { localRoles, appIdRoles = [] } = opts;
  const roles =
    localRoles ??
    (opts.localRole ? [opts.localRole as AppRole] : []);

  if (roles.includes(Role.ADMIN)) return false;
  if (matchesRoleName(config.appIdRoleAdmin, appIdRoles)) return false;

  if (roles.includes(Role.CANDIDATE) || roles.includes(Role.CAPABILITY_MANAGER)) return true;
  if (matchesRoleName(config.appIdRoleCandidate, appIdRoles)) return true;
  if (matchesRoleName(config.appIdRoleManager, appIdRoles)) return true;

  // Unlinked Cloud Directory user with no admin IBM role
  if (roles.length === 0) return true;

  return false;
}

/**
 * Map login to all app RBAC roles the user holds.
 * When IBM App ID returns roles, all matching app roles are included.
 * Otherwise falls back to ADMIN_EMAILS / CAPABILITY_MANAGER_EMAILS / OIDC sub lists.
 */
export function resolveAppRoles(
  email: string,
  oidcSub: string | undefined,
  appIdRoles: string[]
): AppRole[] {
  const roles = new Set<AppRole>();

  if (appIdRoles.length > 0) {
    if (matchesRoleName(config.appIdRoleAdmin, appIdRoles)) roles.add(Role.ADMIN);
    if (matchesRoleName(config.appIdRoleManager, appIdRoles)) roles.add(Role.CAPABILITY_MANAGER);
    if (matchesRoleName(config.appIdRoleCandidate, appIdRoles)) roles.add(Role.CANDIDATE);
  }

  if (roles.size === 0) {
    const normalized = email.trim().toLowerCase();
    if (config.adminEmails.includes(normalized)) roles.add(Role.ADMIN);
    if (config.managerEmails.includes(normalized)) roles.add(Role.CAPABILITY_MANAGER);
    if (oidcSub && config.adminOidcSubs.includes(oidcSub)) roles.add(Role.ADMIN);
    if (oidcSub && config.managerOidcSubs.includes(oidcSub)) roles.add(Role.CAPABILITY_MANAGER);
  }

  if (roles.size === 0) roles.add(Role.CANDIDATE);
  return [...roles];
}

/** Highest-privilege role (admin > capability_manager > candidate). */
export function resolveAppRole(
  email: string,
  oidcSub: string | undefined,
  appIdRoles: string[]
): AppRole {
  return highestRole(resolveAppRoles(email, oidcSub, appIdRoles));
}

/** Union persisted roles with roles resolved at login. */
export function mergeUserRoles(existing: AppRole[] | undefined, fromLogin: AppRole[]): AppRole[] {
  return mergeRoles(existing ?? [], fromLogin);
}
