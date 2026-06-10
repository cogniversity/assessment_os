import { Router } from "express";
import { z } from "zod";
import {
  isAppIdConfigured,
  listCdUsersEnriched,
  createCdUser,
  bulkImportCdUsers,
  listAppIdRoleDefinitions,
  setUserAppIdRolesByNames,
  type BulkImportUser,
} from "../../services/appidManagement.js";
import { syncAppIdUsersToLocal } from "../../services/appIdUserSync.js";

export const appidUsersRouter = Router();

// ── Status ────────────────────────────────────────────────────────────────────

appidUsersRouter.get("/status", (_req, res) => {
  res.json({ configured: isAppIdConfigured() });
});

appidUsersRouter.get("/role-definitions", async (_req, res, next) => {
  if (!isAppIdConfigured()) {
    res.status(503).json({ error: "App ID not configured." });
    return;
  }
  try {
    res.json(await listAppIdRoleDefinitions());
  } catch (e) {
    next(e);
  }
});

// ── List ──────────────────────────────────────────────────────────────────────

appidUsersRouter.get("/", async (req, res, next) => {
  if (!isAppIdConfigured()) {
    res.status(503).json({ error: "App ID not configured. Set APPID_IAM_APIKEY and APPID_TENANT_ID." });
    return;
  }
  try {
    const query      = typeof req.query.query === "string" ? req.query.query : undefined;
    const startIndex = req.query.startIndex ? parseInt(req.query.startIndex as string, 10) : 1;
    const count      = req.query.count      ? parseInt(req.query.count as string, 10) : 50;
    res.json(await listCdUsersEnriched({ query, startIndex, count }));
  } catch (e) {
    next(e);
  }
});

// ── Create single ─────────────────────────────────────────────────────────────

const createSchema = z.object({
  email:       z.string().email(),
  displayName: z.string().min(1).optional(),
  password:    z.string().min(8, "Password must be at least 8 characters"),
  active:      z.boolean().default(true),
  /** IBM App ID Profiles & roles (optional; requires profile after create) */
  appIdRoleNames: z.array(z.string().min(1)).optional(),
});

appidUsersRouter.post("/", async (req, res, next) => {
  if (!isAppIdConfigured()) {
    res.status(503).json({ error: "App ID not configured." });
    return;
  }
  try {
    const data = createSchema.parse(req.body);
    const user = await createCdUser({
      email: data.email,
      displayName: data.displayName,
      password: data.password,
      active: data.active,
    });
    let appIdRoles: string[] | undefined;
    if (data.appIdRoleNames?.length) {
      try {
        appIdRoles = await setUserAppIdRolesByNames(data.email, data.appIdRoleNames);
      } catch (roleErr) {
        res.status(201).json({
          ...user,
          appIdRoles: [],
          _warning:
            roleErr instanceof Error
              ? `User created but IBM roles not assigned: ${roleErr.message}`
              : "User created but IBM roles not assigned",
        });
        return;
      }
    }
    res.status(201).json({ ...user, appIdRoles });
  } catch (e) {
    next(e);
  }
});

// ── Bulk import ───────────────────────────────────────────────────────────────

const bulkSchema = z.object({
  users: z.array(
    z.object({
      email:       z.string().email(),
      displayName: z.string().optional(),
      password:    z.string().min(8),
    })
  ).min(1).max(500),
});

appidUsersRouter.patch("/by-email/:email/ibm-roles", async (req, res, next) => {
  if (!isAppIdConfigured()) {
    res.status(503).json({ error: "App ID not configured." });
    return;
  }
  try {
    const email = decodeURIComponent(req.params.email).trim().toLowerCase();
    const { roleNames } = z.object({ roleNames: z.array(z.string()) }).parse(req.body);
    const appIdRoles = await setUserAppIdRolesByNames(email, roleNames);
    res.json({ email, appIdRoles });
  } catch (e) {
    next(e);
  }
});

const syncSchema = z.object({
  emails: z.array(z.string().email()).optional(),
});

/** Create or update local User records from App ID (role from IBM roles + email fallbacks). */
appidUsersRouter.post("/sync", async (req, res, next) => {
  if (!isAppIdConfigured()) {
    res.status(503).json({ error: "App ID not configured." });
    return;
  }
  try {
    const body = syncSchema.parse(req.body ?? {});
    const summary = await syncAppIdUsersToLocal({ emails: body.emails });
    res.json(summary);
  } catch (e) {
    next(e);
  }
});

appidUsersRouter.post("/bulk", async (req, res, next) => {
  if (!isAppIdConfigured()) {
    res.status(503).json({ error: "App ID not configured." });
    return;
  }
  try {
    const { users } = bulkSchema.parse(req.body);
    const result = await bulkImportCdUsers(users as BulkImportUser[]);
    res.json(result);
  } catch (e) {
    next(e);
  }
});
