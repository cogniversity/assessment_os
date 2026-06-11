import "express-session";
import type { Role } from "@assessment-os/shared";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    activeRole?: Role;
    oidcState?: string;
    oidcNonce?: string;
    oidcCodeVerifier?: string;
  }
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  roles: Role[];
  activeRole: Role;
  /** Effective role alias for backward compatibility */
  role: Role;
}
