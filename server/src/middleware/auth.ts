import { Request, Response, NextFunction } from "express";
import type { User } from "@prisma/client";
import { prisma } from "../db.js";
import { Role } from "@assessment-os/shared";

export type AuthedRequest = Request & { user: User };

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as AuthedRequest).user = user;
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
export const requireAnyAuth = [requireAuth] as const;

export function getUser(req: Request): User {
  return (req as AuthedRequest).user;
}
