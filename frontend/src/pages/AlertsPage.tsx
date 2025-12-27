import { useEffect, useState, useCallback } from "react";
import api from "../services/api";
import { FiCheckCircle, FiXCircle } from "react-icons/fi";

export default function AlertsPage() {
  const [type, setType] = useState<string>("");
  const [enabled, setEnabled] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [debouncedQ, setDebouncedQ] = useState<string>("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const [page, setPage] = useState<number>(1);
  const [perPage, setPerPage] = useState<number>(20);
  const [total, setTotal] = useState<number>(0);
  type Rule = {
    id: number;
    type: "threshold" | "pattern";
    module?: string;
    action?: string;
    user?: string;
    severity?: string;
    window: number;
    enabled: number | string;
    threshold?: number;
    pattern?: string;
  };
  type Sample = {
    id: number;
    ts: number;
    module: string;
    action: string;
    user: string;
    severity: string;
    success: number;
  };
  type Evaluation = {
    rule_id: number;
    triggered: boolean;
    count: number;
    type: "threshold" | "pattern";
    matches?: number;
    samples?: Sample[];
  };
  const [rules, setRules] = useState<Rule[]>([]);
  const [evaluation, setEvaluation] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/api/auth");
        setRoles(Array.isArray(data?.roles) ? data.roles : []);
      } catch {
        void 0;
      }
    })();
  }, []);
  const isAdmin = roles.includes("admin");

  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get("/api/alerts", {
        params: {
          type,
          enabled,
          q: debouncedQ,
          page,
          per_page: perPage,
          evaluate: 1,
        },
      });
      setRules(Array.isArray(data?.rules) ? (data.rules as Rule[]) : []);
      setTotal(Number(data?.meta?.total || 0));
      setEvaluation(
        Array.isArray(data?.evaluation) ? (data.evaluation as Evaluation[]) : []
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Network Error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [type, enabled, debouncedQ, page, perPage]);
  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const onToggle = async (rule: Rule, en: boolean) => {
    try {
      const payload: { id: number; enabled: 0 | 1 } = {
        id: rule.id,
        enabled: en ? 1 : 0,
      };
      await api.put(`/api/alerts/${rule.id}`, payload);
      fetchRules();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      alert("Update failed: " + msg);
    }
  };
  const onInlineEdit = async (rule: Rule, updates: Partial<Rule>) => {
    try {
      const payload = { id: rule.id, ...updates };
      await api.put(`/api/alerts/${rule.id}`, payload);
      fetchRules();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      alert("Update failed: " + msg);
    }
  };
  const evalMap: Record<number, Evaluation | undefined> = {};
  for (const ev of evaluation) {
    if (typeof ev?.rule_id === "number") evalMap[ev.rule_id] = ev;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div>
          <label className="block text-xs text-slate-600">Type</label>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">All</option>
            <option value="threshold">threshold</option>
            <option value="pattern">pattern</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-600">Enabled</label>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={enabled}
            onChange={(e) => setEnabled(e.target.value)}
          >
            <option value="">All</option>
            <option value="1">Enabled</option>
            <option value="0">Disabled</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs text-slate-600">Search</label>
          <input
            className="w-full border rounded px-2 py-1 text-sm"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="module, action, user, severity, pattern"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600">Per Page</label>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={perPage}
            onChange={(e) => {
              setPerPage(Number(e.target.value));
              setPage(1);
            }}
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </div>
        <button
          className="self-start mt-5 px-3 py-2 text-sm rounded bg-slate-100 hover:bg-slate-200"
          onClick={() => fetchRules()}
        >
          Apply
        </button>
      </div>

      <div className="rounded-xl bg-white border border-slate-200">
        <div className="p-3 flex items-center justify-between">
          <div className="font-medium">Alert Rules</div>
          <div className="text-xs text-slate-500">Total: {total}</div>
        </div>
        <div className="divide-y">
          {loading ? (
            <div className="p-4 text-slate-500">Loading...</div>
          ) : error ? (
            <div className="p-4 text-red-600">{error}</div>
          ) : rules.length === 0 ? (
            <div className="p-4 text-slate-500">No rules</div>
          ) : (
            rules.map((r) => {
              const ev = evalMap[r.id] || null;
              const trig = !!ev?.triggered;
              return (
                <div
                  key={r.id}
                  className="p-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-center"
                >
                  <div className="md:col-span-2">
                    <div className="text-xs text-slate-500">Type</div>
                    <div className="text-sm font-medium">{r.type}</div>
                  </div>
                  <div className="md:col-span-3">
                    <div className="text-xs text-slate-500">Filters</div>
                    <div className="text-sm">
                      {[r.module, r.action, r.user, r.severity]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-xs text-slate-500">Window</div>
                    <div className="text-sm">{r.window}s</div>
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-xs text-slate-500">Evaluation</div>
                    <div className="text-sm inline-flex items-center gap-1">
                      {trig ? (
                        <FiCheckCircle className="text-green-600" />
                      ) : (
                        <FiXCircle className="text-slate-400" />
                      )}
                      <span>
                        {ev
                          ? `${ev.count} evt${
                              ev.type === "pattern"
                                ? ` / ${ev.matches} match`
                                : ""
                            }`
                          : "n/a"}
                      </span>
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Number(r.enabled) === 1}
                        onChange={(e) => onToggle(r, e.target.checked)}
                        disabled={!isAdmin}
                      />
                      <span>
                        Enabled{" "}
                        {!isAdmin && (
                          <span className="text-[10px] text-slate-400">
                            (admin only)
                          </span>
                        )}
                      </span>
                    </label>
                  </div>
                  <div className="md:col-span-1 text-right">
                    <button
                      className="px-2 py-1 text-xs rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
                      onClick={() => {
                        const nv = prompt(
                          "Update threshold/pattern (json):",
                          JSON.stringify(
                            r.type === "threshold"
                              ? { threshold: r.threshold }
                              : { pattern: r.pattern }
                          )
                        );
                        if (!nv) return;
                        try {
                          const obj = JSON.parse(nv);
                          onInlineEdit(r, obj);
                        } catch {
                          alert("Invalid JSON");
                        }
                      }}
                      disabled={!isAdmin}
                    >
                      Edit
                    </button>
                  </div>
                  {Array.isArray(ev?.samples) && ev.samples.length > 0 && (
                    <div className="md:col-span-12">
                      <div className="rounded bg-slate-50 p-2 text-xs text-slate-600">
                        Recent samples:
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-1">
                          {ev.samples.map((s: Sample) => (
                            <div key={s.id} className="border rounded p-2">
                              <div className="font-mono">
                                {new Date(s.ts * 1000).toLocaleString()}
                              </div>
                              <div>
                                {s.module} · {s.action} · {s.user}
                              </div>
                              <div className="text-slate-500">
                                {s.severity} · success={s.success}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        <div className="p-3 flex items-center justify-between">
          <div className="text-xs text-slate-600">
            Page {page} / {Math.max(1, Math.ceil(total / perPage))}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1 text-sm rounded bg-slate-100"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <button
              className="px-3 py-1 text-sm rounded bg-slate-100"
              disabled={page >= Math.ceil(total / perPage)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
