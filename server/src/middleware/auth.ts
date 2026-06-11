import { Request, Response, NextFunction } from "express";
import type { User } from "@prisma/client";
import { prisma } from "../db.js";
import { Role, highestRole, type Role as AppRole } from "@assessment-os/shared";

export type AuthedRequest = Request & {
  user: User & { role: AppRole };
  grantedRoles: AppRole[];
};

function resolveActiveRole(sessionActive: AppRole | undefined, granted: AppRole[]): AppRole {
  if (sessionActive && granted.includes(sessionActive)) return sessionActive;
  return highestRole(granted);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const dbUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!dbUser) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const grantedRoles = dbUser.roles as AppRole[];
  const activeRole = resolveActiveRole(req.session.activeRole as AppRole | undefined, grantedRoles);
  req.session.activeRole = activeRole;
  (req as AuthedRequest).grantedRoles = grantedRoles;
  (req as AuthedRequest).user = { ...dbUser, role: activeRole };
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthedRequest).user;
    if (!user || !roles.includes(user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

/** Admins: full access. Capability managers: GET only (catalog reads for assignments). */
export function requireAdminOrManagerRead(req: Request, res: Response, next: NextFunction) {
  const user = (req as AuthedRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (user.role === Role.ADMIN) {
    next();
    return;
  }
  if (user.role === Role.CAPABILITY_MANAGER && req.method === "GET") {
    next();
    return;
  }
  res.status(403).json({ error: "Forbidden" });
}

export const requireAdmin = [requireAuth, requireRole(Role.ADMIN)] as const;
export const requireManagerOrAdmin = [
  requireAuth,
  requireRole(Role.ADMIN, Role.CAPABILITY_MANAGER),
] as const;

/** Admins and capability managers (all HTTP methods). */
export const requireAdminOrManager = [
  requireAuth,
  requireRole(Role.ADMIN, Role.CAPABILITY_MANAGER),
] as const;
export const requireAnyAuth = [requireAuth] as const;

export function getUser(req: Request): User & { role: AppRole } {
  return (req as AuthedRequest).user;
}

export function getGrantedRoles(req: Request): AppRole[] {
  return (req as AuthedRequest).grantedRoles;
}
