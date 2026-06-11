import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Input } from "../components/Layout";
import { Logo } from "../components/Logo";
import { LogIn, Shield, Loader2 } from "lucide-react";

const AUTH_ERRORS: Record<string, string> = {
  auth_failed:
    "IBM sign-in failed. Check server logs. OIDC_CALLBACK_URL must match your app URL plus /api/auth/callback (Docker: http://localhost/api/auth/callback; Vite dev: http://localhost:5173/api/auth/callback). Add the same URI in IBM App ID.",
  session_lost:
    "Sign-in session was lost before callback. Use the same host for the whole flow: Docker → http://localhost and OIDC_CALLBACK_URL=http://localhost/api/auth/callback; dev → port 5173. On HTTP, set SESSION_COOKIE_SECURE=false. Register the exact callback URI in IBM App ID.",
  email_link_failed:
    "Could not link your IBM account to an existing app user (duplicate email). Contact an admin or try again after a server update.",
  oidc_not_configured: "OIDC is not configured on the server.",
};

type AuthConfig = { devAuth: boolean; oidcConfigured: boolean };

export default function LoginPage() {
  const [email, setEmail] = useState("admin@example.com");
  const [name, setName] = useState("Admin User");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const callbackError = searchParams.get("error");

  useEffect(() => {
    if (callbackError && AUTH_ERRORS[callbackError]) {
      setError(AUTH_ERRORS[callbackError]);
    }
  }, [callbackError]);

  const oidcLogin = useCallback(async () => {
    setError("");
    setRedirecting(true);
    try {
      const res = await api<{ url?: string; devAuth?: boolean }>("/auth/login");
      if (res.url) {
        window.location.href = res.url;
        return;
      }
      if (res.devAuth) {
        setRedirecting(false);
        setError("OIDC not configured. Use dev login below.");
        return;
      }
      setRedirecting(false);
      setError("OIDC not configured on the server.");
    } catch (e) {
      setRedirecting(false);
      setError(e instanceof Error ? e.message : "Login failed");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await api<AuthConfig>("/auth/config");
        if (cancelled) return;
        setConfig(cfg);
        if (!cfg.devAuth && cfg.oidcConfigured && !callbackError) {
          await oidcLogin();
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load login options");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [callbackError, oidcLogin]);

  const devLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const user = await api<{ role: string }>("/auth/dev-login", {
        method: "POST",
        json: { email, name },
      });
      await refresh();
      if (user.role === "admin") navigate("/admin");
      else if (user.role === "capability_manager") navigate("/manager");
      else navigate("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const showDevLogin = config?.devAuth === true;
  const oidcOnly = config && !config.devAuth && config.oidcConfigured;
  const nothingConfigured = config && !config.devAuth && !config.oidcConfigured;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-white rounded-2xl p-5 mb-5 shadow-md ring-1 ring-slate-200">
            <Logo className="h-20 w-auto" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Assessment OS</h1>
          <p className="text-slate-600 text-sm mt-1">Skills evaluation platform</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg ring-1 ring-slate-200 overflow-hidden">
          {oidcOnly && redirecting && !error ? (
            <div className="px-8 py-12 flex flex-col items-center gap-3 text-center">
              <Loader2 size={28} className="text-indigo-600 animate-spin" />
              <p className="text-sm font-medium text-slate-700">Redirecting to IBM App ID…</p>
            </div>
          ) : (
            <>
              {(showDevLogin || error || nothingConfigured) && (
                <button
                  type="button"
                  onClick={oidcLogin}
                  disabled={redirecting || !!nothingConfigured}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-4 text-sm transition-colors"
                >
                  {redirecting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Shield size={16} />
                  )}
                  Sign in with IBM App ID (OIDC)
                </button>
              )}

              <div className="px-8 py-6">
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
                    {error}
                  </div>
                )}

                {nothingConfigured && (
                  <p className="text-sm text-slate-600 text-center">
                    Sign-in is not configured. Set IBM App ID (OIDC) or enable{" "}
                    <code className="text-xs bg-slate-100 px-1 rounded">DEV_AUTH_ENABLED=true</code> for local
                    development.
                  </p>
                )}

                {oidcOnly && error && (
                  <button
                    type="button"
                    onClick={oidcLogin}
                    disabled={redirecting}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
                  >
                    <Shield size={16} />
                    Try IBM App ID again
                  </button>
                )}

                {showDevLogin && (
                  <>
                    <div className="flex items-center gap-3 mb-5">
                      <div className="flex-1 h-px bg-slate-200" />
                      <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">Dev login</span>
                      <div className="flex-1 h-px bg-slate-200" />
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">Email</label>
                        <Input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && devLogin()}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">Display name</label>
                        <Input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && devLogin()}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={devLogin}
                        disabled={loading || !email}
                        className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
                      >
                        <LogIn size={16} />
                        {loading ? "Signing in…" : "Dev Sign in"}
                      </button>
                    </div>

                    <p className="text-xs text-slate-400 mt-5 text-center leading-relaxed">
                      Try: <span className="font-mono">admin@example.com</span> ·{" "}
                      <span className="font-mono">manager@example.com</span> · or any email as candidate
                    </p>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
