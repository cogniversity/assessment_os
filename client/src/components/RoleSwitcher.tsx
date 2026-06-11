import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Check } from "lucide-react";
import { ROLE_LABELS, ROLE_PRIORITY, normalizeGrantedRoles, type Role } from "@assessment-os/shared";
import { useAuth } from "../context/AuthContext";

function homeForRole(role: Role): string {
  if (role === "admin") return "/admin";
  if (role === "capability_manager") return "/manager";
  return "/dashboard";
}

export function RoleSwitcher({ compact = false }: { compact?: boolean }) {
  const { user, switchRole } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);

  const grantedRoles = user ? normalizeGrantedRoles(user.roles) : [];
  const activeRole = user?.activeRole ?? user?.role ?? "candidate";

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const menuWidth = 192;
    setMenuPos({
      top: rect.bottom + 4,
      left: Math.min(Math.max(8, rect.right - menuWidth), window.innerWidth - menuWidth - 8),
    });
  }, [open, compact]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!user || grantedRoles.length <= 1) {
    const label = ROLE_LABELS[normalizeGrantedRoles(activeRole)[0] ?? "candidate"];
    return (
      <span className="bg-indigo-100 text-indigo-700 text-xs font-semibold px-2 py-0.5 rounded-full">
        {label}
      </span>
    );
  }

  const ordered = ROLE_PRIORITY.filter((r) => grantedRoles.includes(r));

  const onSelect = async (role: Role) => {
    if (role === activeRole) {
      setOpen(false);
      return;
    }
    await switchRole(role);
    setOpen(false);
    navigate(homeForRole(role));
  };

  const menu = open ? (
    <div
      className="fixed w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-[9999] py-1"
      style={{ top: menuPos.top, left: menuPos.left }}
    >
      <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        Switch role
      </p>
      {ordered.map((role) => (
        <button
          key={role}
          type="button"
          onClick={() => onSelect(role)}
          className="w-full flex items-center justify-between px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          {ROLE_LABELS[role]}
          {role === activeRole && <Check size={14} className="text-indigo-600" />}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 font-semibold rounded-full hover:bg-indigo-200 transition-colors ${
          compact ? "text-xs px-2 py-0.5" : "text-xs px-2.5 py-1"
        }`}
      >
        {ROLE_LABELS[activeRole]}
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {menu && createPortal(menu, document.body)}
    </div>
  );
}
