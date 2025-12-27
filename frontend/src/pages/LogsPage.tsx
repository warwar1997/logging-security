import { useEffect, useState, useCallback } from "react";
import api from "../services/api";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function LogsPage() {
  const [module, setModule] = useState("");
  const [action, setAction] = useState("");
  const [user, setUser] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [success, setSuccess] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [total, setTotal] = useState(0);
  type LogRow = {
    id: number;
    ts: number | string;
    module: string;
    action: string;
    user: string;
    success: number | string;
    severity?: string;
    ip?: string;
    ua?: string;
    details?: unknown;
  };
  const [rows, setRows] = useState<LogRow[]>([]);
  const [selected, setSelected] = useState<LogRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    valid: boolean;
    break_at_id: number | null;
    checked: number;
  } | null>(null);
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
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshMs, setRefreshMs] = useState(10000);

  const onFilter = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = {
        page,
        per_page: perPage,
      };
      if (module) params.module = module;
      if (action) params.action = action;
      if (from) params.from = from;
      if (to) params.to = to;
      if (debouncedQ) params.q = debouncedQ;
      if (user) params.user = user;
      if (success !== "") params.success = success;
      const { data } = await api.get("/api/logs", { params });
      setRows(Array.isArray(data?.data) ? (data.data as LogRow[]) : []);
      setTotal(
        typeof data?.meta?.total === "number"
          ? data.meta.total
          : Array.isArray(data?.data)
          ? data.data.length
          : 0
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to fetch logs";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [page, perPage, module, action, from, to, debouncedQ, user, success]);

  useEffect(() => {
    if (!autoRefresh) return;
    onFilter();
    const id = window.setInterval(onFilter, refreshMs);
    return () => window.clearInterval(id);
  }, [autoRefresh, refreshMs, onFilter]);

  const generateSampleData = async () => {
    setGenerating(true);
    try {
      const samples = [
        {
          module: "Authentication",
          action: "login",
          user: "alice",
          success: 1,
          severity: "info",
          details: { agent: "web" },
        },
        {
          module: "Payroll",
          action: "run",
          user: "system",
          success: 0,
          severity: "danger",
          details: { reason: "missing account" },
        },
        {
          module: "Employees",
          action: "update",
          user: "bob",
          success: 1,
          severity: "warning",
          details: { fields: ["email"] },
        },
      ];
      for (const s of samples) {
        await api.post("/api/logs", s);
      }
      await onFilter();
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Failed to generate sample data";
      setError(msg);
    } finally {
      setGenerating(false);
    }
  };

  const exportCSV = () => {
    const header = [
      "id",
      "ts",
      "module",
      "action",
      "user",
      "success",
      "severity",
      "ip",
      "ua",
      "details",
    ];
    const lines = [header.join(",")].concat(
      rows.map((r) =>
        [
          r.id,
          r.ts,
          r.module,
          r.action,
          r.user,
          r.success,
          r.severity,
          r.ip,
          r.ua,
          JSON.stringify(r.details ?? ""),
        ]
          .map((v) => JSON.stringify(v ?? ""))
          .join(",")
      )
    );
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "logs.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(
      rows.map((r) => ({
        id: r.id,
        ts: r.ts,
        module: r.module,
        action: r.action,
        user: r.user,
        success: r.success,
        severity: r.severity,
        ip: r.ip,
        ua: r.ua,
        details: JSON.stringify(r.details ?? ""),
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Logs");
    XLSX.writeFile(wb, "logs.xlsx");
  };
  const exportPDF = () => {
    const doc = new jsPDF();
    autoTable(doc, {
      head: [
        [
          "ID",
          "Timestamp",
          "Module",
          "Action",
          "User",
          "Result",
          "Severity",
          "IP",
          "UA",
        ],
      ],
      body: rows.map((r) => [
        String(r.id ?? ""),
        new Date((Number(r.ts) || 0) * 1000).toLocaleString(),
        String(r.module ?? ""),
        String(r.action ?? ""),
        String(r.user ?? ""),
        String(r.success ?? ""),
        String(r.severity ?? ""),
        String(r.ip ?? ""),
        String(r.ua ?? ""),
      ]),
    });
    doc.save("logs.pdf");
  };
  const verifyIntegrity = async () => {
    try {
      const { data } = await api.get("/api/logs", { params: { verify: 1 } });
      if (typeof data?.valid !== "undefined")
        setVerifyResult({
          valid: !!data.valid,
          break_at_id: data.break_at_id ?? null,
          checked: Number(data.checked || 0),
        });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      alert("Verify failed: " + msg);
    }
  };

  useEffect(() => {
    onFilter();
  }, [onFilter]);

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold">Logs</h2>
      <div className="mt-4 grid gap-3 grid-cols-1 md:grid-cols-4 lg:grid-cols-6">
        <div className="space-y-2">
          <label className="block text-sm">Module</label>
          <select
            className="border rounded px-3 py-2 w-full"
            value={module}
            onChange={(e) => setModule(e.target.value)}
          >
            <option value="">All</option>
            <option value="Authentication">Authentication</option>
            <option value="Employees">Employees</option>
            <option value="Payroll">Payroll</option>
          </select>
        </div>
        <div className="space-y-2 md:col-span-2 lg:col-span-2">
          <label className="block text-sm">Date range</label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="border rounded px-3 py-2 w-full"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
            <input
              type="date"
              className="border rounded px-3 py-2 w-full"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="block text-sm">Action</label>
          <select
            className="border rounded px-3 py-2 w-full"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="">All</option>
            <option value="login">Login</option>
            <option value="logout">Logout</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="run">Run</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="block text-sm">Search</label>
          <input
            type="text"
            className="border rounded px-3 py-2 w-full"
            placeholder="Search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm">User</label>
          <input
            type="text"
            className="border rounded px-3 py-2 w-full"
            placeholder="User"
            value={user}
            onChange={(e) => setUser(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm">Result</label>
          <select
            className="border rounded px-3 py-2 w-full"
            value={success}
            onChange={(e) => {
              setSuccess(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            <option value="1">Success</option>
            <option value="0">Failed</option>
          </select>
        </div>
      </div>
      <div className="mt-4 flex gap-2 items-center flex-wrap">
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded"
          onClick={onFilter}
        >
          Filter
        </button>
        <button
          className="bg-gray-200 px-4 py-2 rounded"
          onClick={() => {
            setModule("");
            setFrom("");
            setTo("");
            setAction("");
            setUser("");
            setQ("");
            setSuccess("");
            setPage(1);
            setPerPage(20);
          }}
        >
          Reset
        </button>
        <button className="bg-slate-200 px-3 py-2 rounded" onClick={exportCSV}>
          Export CSV
        </button>
        <button className="bg-slate-200 px-3 py-2 rounded" onClick={exportXLSX}>
          Export XLSX
        </button>
        <button className="bg-slate-200 px-3 py-2 rounded" onClick={exportPDF}>
          Export PDF
        </button>
        <button
          className="bg-amber-200 px-3 py-2 rounded"
          onClick={verifyIntegrity}
        >
          Verify Integrity
        </button>
        {verifyResult && (
          <span
            className={`px-3 py-2 rounded text-sm ${
              verifyResult.valid
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            Chain{" "}
            {verifyResult.valid
              ? "valid"
              : `broken at ID ${verifyResult.break_at_id}`}{" "}
            (checked {verifyResult.checked})
          </span>
        )}
        {isAdmin && (
          <button
            className="bg-emerald-600 text-white px-4 py-2 rounded"
            onClick={generateSampleData}
            disabled={generating}
          >
            Generate sample data
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span>Auto-refresh</span>
          </label>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={refreshMs}
            onChange={(e) => setRefreshMs(Number(e.target.value))}
            disabled={!autoRefresh}
          >
            <option value={5000}>5s</option>
            <option value={10000}>10s</option>
            <option value={30000}>30s</option>
            <option value={60000}>60s</option>
          </select>
        </div>
      </div>
      <div className="mt-6">
        <div className="border rounded shadow-sm">
          <div className="p-3 border-b bg-gray-50 font-medium flex items-center justify-between">
            <span>Logs</span>
          </div>
          <div className="p-3 text-sm text-gray-600">
            {loading && <div className="text-gray-500">Loading...</div>}
            {error && <div className="text-red-600">{error}</div>}
            {!loading &&
              !error &&
              (rows.length === 0 ? (
                <div>No data yet. Use Filter to fetch.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="p-2">ID</th>
                      <th className="p-2">Module</th>
                      <th className="p-2">Action</th>
                      <th className="p-2">User</th>
                      <th className="p-2">Timestamp</th>
                      <th className="p-2">Severity</th>
                      <th className="p-2">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.id}
                        className="border-t hover:bg-gray-50 cursor-pointer"
                        onClick={() => setSelected(r)}
                      >
                        <td className="p-2">{r.id}</td>
                        <td className="p-2">{r.module}</td>
                        <td className="p-2">{r.action}</td>
                        <td className="p-2">{r.user}</td>
                        <td className="p-2">{r.ts}</td>
                        <td className="p-2">
                          <span
                            className={
                              "inline-block px-2 py-1 text-xs rounded " +
                              ((r.severity ||
                                (Number(r.success) === 1
                                  ? "info"
                                  : "danger")) === "info"
                                ? "bg-blue-100 text-blue-700"
                                : (r.severity ||
                                    (Number(r.success) === 1
                                      ? "info"
                                      : "danger")) === "warning"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-red-100 text-red-700")
                            }
                          >
                            {r.severity ||
                              (Number(r.success) === 1 ? "info" : "danger")}
                          </span>
                        </td>
                        <td className="p-2">
                          {Number(r.success) === 1 ? (
                            <span className="inline-block px-2 py-1 text-xs rounded bg-green-100 text-green-700">
                              Success
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-1 text-xs rounded bg-red-100 text-red-700">
                              Failed
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
          </div>
          {selected && (
            <div className="border-t p-3 text-sm">
              <div className="font-medium mb-2">Selected Log Details</div>
              <pre className="bg-gray-100 p-2 rounded overflow-auto">
                {JSON.stringify(selected, null, 2)}
              </pre>
              <div className="mt-2">
                <button
                  className="px-3 py-1.5 rounded bg-gray-700 text-white"
                  onClick={() => setSelected(null)}
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm">Page size</label>
          <select
            className="border rounded px-2 py-1"
            value={perPage}
            onChange={(e) => {
              setPerPage(Number(e.target.value));
              setPage(1);
            }}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            className="px-3 py-1.5 rounded bg-gray-200"
            disabled={page <= 1}
            onClick={() => {
              setPage((p) => Math.max(1, p - 1));
              onFilter();
            }}
          >
            Prev
          </button>
          <div className="text-sm">
            Page {page} of {Math.max(1, Math.ceil(total / perPage))}
          </div>
          <button
            className="px-3 py-1.5 rounded bg-gray-200"
            disabled={page >= Math.ceil(total / perPage)}
            onClick={() => {
              setPage((p) => p + 1);
              onFilter();
            }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
