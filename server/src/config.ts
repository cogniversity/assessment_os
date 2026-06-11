import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Local dev: root .env is primary; server/.env supplements (e.g. APPID_* only in server/.env).
// Docker: set LOAD_DOTENV=false in compose so all config comes from container environment.
if (process.env.LOAD_DOTENV !== "false") {
  const rootEnvPath = path.resolve(__dirname, "../../.env");
  const serverEnvPath = path.resolve(__dirname, "../.env");
  dotenv.config({ path: rootEnvPath });
  dotenv.config({ path: serverEnvPath });
}

function parseEmailList(raw: string | undefined, fallback: string): string[] {
  const list = (raw || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : [fallback];
}

function parseIdList(raw: string | undefined): string[] {
  return (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Comma-separated IBM App ID role names; uses defaults when env unset */
function parseRoleNameList(raw: string | undefined, defaults: string[]): string[] {
  const list = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : defaults;
}

function normalizeContextRoot(raw?: string): string {
  return (raw ?? "").replace(/^\/+|\/+$/g, "");
}

function withContextRoot(baseUrl: string, contextRoot: string): string {
  const origin = baseUrl.replace(/\/$/, "");
  return contextRoot ? `${origin}/${contextRoot}` : origin;
}

const contextRoot = normalizeContextRoot(process.env.CONTEXT_ROOT);
const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
const serverUrl = process.env.SERVER_URL || "http://localhost:3001";

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  databaseUrl: process.env.DATABASE_URL!,
  sessionSecret: process.env.SESSION_SECRET || "dev-secret-change-me",
  contextRoot,
  clientUrl,
  serverUrl,
  apiBasePath: contextRoot ? `/${contextRoot}/api` : "/api",
  clientBaseUrl: withContextRoot(clientUrl, contextRoot),
  serverBaseUrl: withContextRoot(serverUrl, contextRoot),
  oidc: {
    issuer: process.env.OIDC_ISSUER || "",
    clientId: process.env.OIDC_CLIENT_ID || "",
    clientSecret: process.env.OIDC_CLIENT_SECRET || "",
    /** Must match browser origin (use CLIENT_URL in dev so session cookie works with Vite proxy). */
    callbackUrl:
      process.env.OIDC_CALLBACK_URL ||
      `${withContextRoot(clientUrl, contextRoot)}/api/auth/callback`,
  },
  adminEmails: parseEmailList(process.env.ADMIN_EMAILS, "admin@example.com"),
  managerEmails: parseEmailList(process.env.CAPABILITY_MANAGER_EMAILS, "manager@example.com"),
  /** OIDC `sub` values that should receive admin (when email list does not match) */
  adminOidcSubs: parseIdList(process.env.ADMIN_OIDC_SUBS),
  managerOidcSubs: parseIdList(process.env.MANAGER_OIDC_SUBS),
  /** IBM App ID role names → app RBAC (used only when IBM returns roles on login) */
  appIdRoleAdmin: parseRoleNameList(process.env.APPID_ROLE_ADMIN, ["Admin"]),
  appIdRoleManager: parseRoleNameList(process.env.APPID_ROLE_MANAGER, ["Capability_Manager"]),
  appIdRoleCandidate: parseRoleNameList(process.env.APPID_ROLE_CANDIDATE, ["Candidate"]),
  photoStoragePath: process.env.PHOTO_STORAGE_PATH || "./uploads",
  orgName: process.env.ORG_NAME || "",
  logoPath: process.env.LOGO_PATH || path.resolve(__dirname, "../../client/public/assessment_os_logo.png"),
  devAuthEnabled: process.env.DEV_AUTH_ENABLED === "true",
  appId: {
    // IBM Cloud API key used to obtain IAM tokens for the management API
    iamApiKey: process.env.APPID_IAM_APIKEY || "",
    // App ID tenant ID — parsed from oAuthServerUrl if not set explicitly
    tenantId: process.env.APPID_TENANT_ID || "",
    // Management API base URL (no trailing slash, no /management/v4/... path)
    managementBaseUrl: process.env.APPID_MANAGEMENT_URL || "https://us-east.appid.cloud.ibm.com",
    /** 16+ chars — used for GET cloud_directory/export when listing all users */
    exportSecret:
      process.env.APPID_EXPORT_SECRET ||
      process.env.SESSION_SECRET ||
      "assessment-os-export-secret",
    /** Cloud Directory sign-in identity: `email` (userName = email) or `username` */
    cdIdentityField:
      (process.env.APPID_CD_IDENTITY_FIELD || "email").toLowerCase() === "username"
        ? ("username" as const)
        : ("email" as const),
  },
};

function isValidOidcIssuer(issuer: string): boolean {
  try {
    const url = new URL(issuer);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export const oidcConfigured =
  isValidOidcIssuer(config.oidc.issuer) &&
  !!config.oidc.clientId &&
  !!config.oidc.clientSecret;

/** Human-facing app link for certificate PDF footers (uses CLIENT_URL + CONTEXT_ROOT). */
export function certificateVerifyUrl(certNumber: string): string {
  return `${config.clientBaseUrl}/verify/${certNumber}`;
}
