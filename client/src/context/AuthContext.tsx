import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "../api/client";
import { normalizeGrantedRoles, type Role } from "@assessment-os/shared";

export interface User {
  id: string;
  email: string;
  name: string;
  roles: Role[];
  activeRole: Role;
  /** Effective role alias from API */
  role: Role;
}

const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  switchRole: (role: Role) => Promise<void>;
  logout: () => Promise<void>;
}>({
  user: null,
  loading: true,
  refresh: async () => {},
  switchRole: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const normalizeUser = (u: User): User => {
    const roles = normalizeGrantedRoles(u.roles ?? (u as { grantedRoles?: Role[] }).grantedRoles);
    const activeRole = (u.activeRole ?? u.role) as Role;
    const effective = roles.includes(activeRole) ? activeRole : roles[0] ?? "candidate";
    return { ...u, roles, activeRole: effective, role: effective };
  };

  const refresh = async () => {
    try {
      const u = await api<User>("/auth/me");
      setUser(normalizeUser(u));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const switchRole = async (role: Role) => {
    const u = await api<User>("/auth/switch-role", { method: "POST", json: { role } });
    setUser(normalizeUser(u));
  };

  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, refresh, switchRole, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
