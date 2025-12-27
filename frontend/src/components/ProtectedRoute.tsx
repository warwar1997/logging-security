import React, { useEffect, useState } from "react";
import api from "../services/api";

export default function ProtectedRoute({
  children,
  apiKey,
}: {
  children: React.ReactNode;
  apiKey: string;
}) {
  type State = { allowed: boolean; loading: boolean; err: string | null };
  const [state, setState] = useState<State>({
    allowed: false,
    loading: true,
    err: null,
  });
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      setState((s) => ({ ...s, loading: true, err: null }));
      if (!apiKey) {
        if (!cancelled) setState({ allowed: false, loading: false, err: null });
        return;
      }
      try {
        const { data } = await api.get("/api/auth");
        const roles: string[] = Array.isArray(data?.roles) ? data.roles : [];
        const canRead =
          roles.includes("admin") ||
          roles.includes("compliance") ||
          roles.includes("viewer");
        if (!cancelled)
          setState({ allowed: canRead, loading: false, err: null });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Network Error";
        if (!cancelled) setState({ allowed: false, loading: false, err: msg });
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [apiKey]);
  if (state.loading)
    return (
      <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-slate-600">
        Loading...
      </div>
    );
  if (!apiKey)
    return (
      <div className="p-6 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
        No API key: Paste a valid key in the Topbar to fetch roles and unlock Logs.
      </div>
    );
  if (state.err)
    return (
      <div className="p-6 rounded-xl bg-red-50 border border-red-200 text-red-700">
        Network Error: {state.err}
      </div>
    );
  if (!state.allowed)
    return (
      <div className="p-6 rounded-xl bg-red-50 border border-red-200 text-red-700">
        Unauthorized: You do not have permission to view logs.
      </div>
    );
  return <>{children}</>;
}
