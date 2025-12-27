import { useEffect, useState, useCallback } from "react";
import api from "../services/api";
import { NavLink } from "react-router-dom";
import { FiSearch, FiBell } from "react-icons/fi";

export default function Topbar({
  apiKey,
  setApiKey,
}: {
  apiKey: string;
  setApiKey: (v: string) => void;
}) {
  const [roles, setRoles] = useState<string[]>([]);
  const [authErr, setAuthErr] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [alertCount, setAlertCount] = useState<number>(0);
  const [alertChecking, setAlertChecking] = useState<boolean>(false);

  const refreshAuth = async () => {
    setChecking(true);
    setAuthErr(null);
    try {
      const { data } = await api.get("/api/auth");
      setRoles(Array.isArray(data?.roles) ? data.roles : []);
    } catch (e: unknown) {
      setRoles([]);
      const msg = e instanceof Error ? e.message : "Network Error";
      setAuthErr(msg);
    } finally {
      setChecking(false);
    }
  };

  const checkAlerts = useCallback(async () => {
    if (!apiKey) {
      setAlertCount(0);
      return;
    }
    setAlertChecking(true);
    try {
      const { data } = await api.get("/api/alerts", {
        params: { evaluate: 1 },
      });
      const evals: { triggered?: boolean }[] = Array.isArray(data?.evaluation)
        ? (data.evaluation as { triggered?: boolean }[])
        : [];
      const triggered = evals.filter((e) => !!e?.triggered);
      setAlertCount(triggered.length);
    } catch {
      void 0;
    } finally {
      setAlertChecking(false);
    }
  }, [apiKey]);

  useEffect(() => {
    if (apiKey) refreshAuth();
    else {
      setRoles([]);
      setAuthErr(null);
    }
  }, [apiKey]);

  useEffect(() => {
    let timer: number | null = null;
    if (apiKey) {
      checkAlerts();
      timer = window.setInterval(checkAlerts, 15000);
    }
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [apiKey, checkAlerts]);

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b">
      <div className="px-6 py-3 flex items-center gap-6">
        <div className="text-indigo-700 font-semibold text-xl tracking-wide">
          HRMS
        </div>
        <div className="flex-1">
          <div className="relative">
            <input
              type="text"
              className="w-full border border-slate-200 rounded-full pl-11 pr-4 py-2.5 text-sm"
              placeholder="Search"
            />
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-600">API Key</label>
          <input
            type="password"
            className="border rounded px-2 py-1 text-sm"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste key"
          />
          <button
            className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200"
            onClick={() => {
              setApiKey("test-read");
              try {
                localStorage.setItem("apiKey", "test-read");
              } catch {
                void 0;
              }
              refreshAuth();
            }}
          >
            Use test-read
          </button>
          <button
            className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200"
            onClick={() => {
              setApiKey("test-write");
              try {
                localStorage.setItem("apiKey", "test-write");
              } catch {
                void 0;
              }
              refreshAuth();
            }}
          >
            Use test-write
          </button>
          <div className="ml-2 flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs border ${
                authErr
                  ? "bg-red-50 text-red-700 border-red-200"
                  : roles.length
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-slate-50 text-slate-600 border-slate-200"
              }`}
            >
              {checking ? (
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-pulse" />
              ) : authErr ? (
                <span className="w-2 h-2 rounded-full bg-red-500" />
              ) : roles.length ? (
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-slate-400" />
              )}
              {authErr
                ? `Auth: ${authErr}`
                : roles.length
                ? `Roles: ${roles.join(", ")}`
                : "Auth: idle"}
            </span>
            <button
              className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200"
              onClick={refreshAuth}
            >
              Refresh
            </button>
          </div>
          <div className="ml-2 flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs border ${
                alertCount > 0
                  ? "bg-red-50 text-red-700 border-red-200"
                  : "bg-slate-50 text-slate-600 border-slate-200"
              }`}
            >
              {alertChecking ? (
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-pulse" />
              ) : alertCount > 0 ? (
                <span className="w-2 h-2 rounded-full bg-red-500" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-slate-400" />
              )}
              <FiBell /> Alerts: {alertCount}
            </span>
            <button
              className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200"
              onClick={checkAlerts}
            >
              Check
            </button>
            <NavLink
              to="/alerts"
              className="text-xs px-2 py-1 rounded bg-indigo-600 text-white"
            >
              View
            </NavLink>
          </div>
        </div>
      </div>
    </header>
  );
}
