import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Logo } from "./Logo";
import { RoleSwitcher } from "./RoleSwitcher";
import { LogOut, ChevronDown, Menu, X } from "lucide-react";
import { useState } from "react";

export function Layout({ nav, children }: { nav: { to: string; label: string }[]; children?: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
          {/* Logo + nav */}
          <div className="flex items-center gap-6 min-w-0">
            <Link to="/" className="flex items-center shrink-0">
              <Logo className="h-8 w-auto" />
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1">
              {nav.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to.split("/").length <= 2}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-indigo-50 text-indigo-700"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    }`
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>
          </div>

          {/* Right: user + logout */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-sm">
              <span className="text-slate-500 font-medium">{user?.name}</span>
              <RoleSwitcher />
            </div>
            <button
              type="button"
              onClick={async () => { await logout(); navigate("/login"); }}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-red-600 transition-colors px-2 py-1 rounded-md hover:bg-red-50"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">Logout</span>
            </button>
            {/* Mobile hamburger */}
            <button
              type="button"
              className="md:hidden p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
              onClick={() => setMobileOpen((v) => !v)}
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="md:hidden border-t border-slate-100 px-4 py-3 flex flex-col gap-1 bg-white">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to.split("/").length <= 2}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-md text-sm font-medium ${
                    isActive ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-100"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </div>
        )}
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {children ?? <Outlet />}
      </main>
    </div>
  );
}

/** Admin/manager shell with a collapsible sidebar instead of a top nav */
export function SidebarLayout({
  groups,
  children,
}: {
  groups: { label: string; items: { to: string; label: string; icon: React.ReactNode }[] }[];
  children?: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 py-4 border-b border-slate-200 ${collapsed ? "justify-center" : ""}`}>
        <Link to="/" onClick={() => setMobileOpen(false)}>
          <Logo className={collapsed ? "h-7 w-auto" : "h-8 w-auto"} />
        </Link>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-800 truncate">Assessment OS</p>
            <div className="relative">
              <RoleSwitcher compact />
            </div>
          </div>
        )}
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {groups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-2 mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to.split("/").length <= 2}
                  onClick={() => setMobileOpen(false)}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    } ${collapsed ? "justify-center" : ""}`
                  }
                >
                  <span className="shrink-0">{item.icon}</span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className={`px-3 py-3 border-t border-slate-200 ${collapsed ? "flex justify-center" : ""}`}>
        {!collapsed && (
          <p className="text-xs text-slate-500 font-medium truncate mb-2 px-1">{user?.name}</p>
        )}
        <button
          type="button"
          onClick={async () => { await logout(); navigate("/login"); }}
          title="Logout"
          className="flex items-center gap-2 text-xs text-slate-500 hover:text-red-600 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors w-full"
        >
          <LogOut size={14} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col shrink-0 bg-white border-r border-slate-200 transition-all duration-200 relative ${
          collapsed ? "w-14" : "w-56"
        }`}
      >
        <SidebarContent />
        {/* Collapse toggle */}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="absolute -right-3 top-16 bg-white border border-slate-200 rounded-full p-0.5 shadow-sm text-slate-400 hover:text-slate-600 z-50"
        >
          <ChevronDown size={12} className={`transition-transform ${collapsed ? "-rotate-90" : "rotate-90"}`} />
        </button>
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-56 bg-white border-r border-slate-200 flex flex-col">
            <SidebarContent />
          </div>
          <div className="flex-1 bg-black/30" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile topbar */}
        <header className="md:hidden bg-white border-b border-slate-200 px-4 h-12 flex items-center justify-between sticky top-0 z-40">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
          >
            <Menu size={18} />
          </button>
          <Logo className="h-7 w-auto" />
          <span className="text-xs text-slate-500">{user?.name}</span>
        </header>

        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-6xl mx-auto">
            {children ?? <Outlet />}
          </div>
        </main>
      </div>
    </div>
  );
}

export function Card({
  title,
  subtitle,
  children,
  actions,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-start gap-4">
          <div>
            {title && <h2 className="font-semibold text-slate-800">{title}</h2>}
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}) {
  const variantCls =
    variant === "primary"
      ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
      : variant === "danger"
        ? "bg-red-600 text-white hover:bg-red-700 shadow-sm"
        : variant === "ghost"
          ? "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 shadow-sm";
  const sizeCls = size === "sm" ? "px-2.5 py-1 text-xs" : size === "lg" ? "px-5 py-2.5 text-base" : "px-3.5 py-2 text-sm";
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${variantCls} ${sizeCls} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder:text-slate-400 transition"
      {...props}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
      {...props}
    />
  );
}

export function Badge({
  children,
  color = "slate",
}: {
  children: React.ReactNode;
  color?: "slate" | "indigo" | "green" | "yellow" | "red" | "purple" | "orange";
}) {
  const cls: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700",
    indigo: "bg-indigo-100 text-indigo-700",
    green: "bg-green-100 text-green-700",
    yellow: "bg-yellow-100 text-yellow-700",
    red: "bg-red-100 text-red-700",
    purple: "bg-purple-100 text-purple-700",
    orange: "bg-orange-100 text-orange-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls[color]}`}>
      {children}
    </span>
  );
}

export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {description && <p className="text-slate-500 text-sm mt-1">{description}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
