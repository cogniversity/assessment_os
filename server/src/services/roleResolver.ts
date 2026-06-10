import { config } from "../config.js";
import { Role } from "@assessment-os/shared";

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
  localRole?: string | null;
  appIdRoles?: string[];
}): boolean {
  const { localRole, appIdRoles = [] } = opts;

  if (localRole === Role.ADMIN) return false;
  if (matchesRoleName(config.appIdRoleAdmin, appIdRoles)) return false;

  if (localRole === Role.CANDIDATE || localRole === Role.CAPABILITY_MANAGER) return true;
  if (matchesRoleName(config.appIdRoleCandidate, appIdRoles)) return true;
  if (matchesRoleName(config.appIdRoleManager, appIdRoles)) return true;

  // Unlinked Cloud Directory user with no admin IBM role
  if (!localRole) return true;

  return false;
}

/**
 * Map login to app RBAC.
 * When IBM App ID returns roles, those are checked first (admin → manager → candidate).
 * Otherwise falls back to ADMIN_EMAILS / CAPABILITY_MANAGER_EMAILS / OIDC sub lists.
 */
export function resolveAppRole(
  email: string,
  oidcSub: string | undefined,
  appIdRoles: string[]
): "admin" | "capability_manager" | "candidate" {
  if (appIdRoles.length > 0) {
    if (matchesRoleName(config.appIdRoleAdmin, appIdRoles)) {
      return Role.ADMIN as "admin";
    }
    if (matchesRoleName(config.appIdRoleManager, appIdRoles)) {
      return Role.CAPABILITY_MANAGER as "capability_manager";
    }
    if (matchesRoleName(config.appIdRoleCandidate, appIdRoles)) {
      return Role.CANDIDATE as "candidate";
    }
  }

  const normalized = email.trim().toLowerCase();
  if (config.adminEmails.includes(normalized)) return Role.ADMIN as "admin";
  if (config.managerEmails.includes(normalized)) {
    return Role.CAPABILITY_MANAGER as "capability_manager";
  }
  if (oidcSub && config.adminOidcSubs.includes(oidcSub)) return Role.ADMIN as "admin";
  if (oidcSub && config.managerOidcSubs.includes(oidcSub)) {
    return Role.CAPABILITY_MANAGER as "capability_manager";
  }
  return Role.CANDIDATE as "candidate";
}
