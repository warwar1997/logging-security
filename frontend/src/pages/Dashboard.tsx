import { useEffect, useState, useCallback } from "react";
import api from "../services/api";
import { FiEye, FiCheckCircle, FiXCircle, FiPercent } from "react-icons/fi";
import TrendLineChart from "../components/charts/TrendLineChart";
import BarsChart from "../components/charts/BarsChart";

export default function Dashboard({ apiKey }: { apiKey: string }) {
  type LogRow = {
    id?: number;
    ts: number | string;
    module: string;
    action: string;
    user: string;
    success?: number | string;
    severity?: string;
    ip?: string;
    ua?: string;
    details?: unknown;
  };
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [severityCounts, setSeverityCounts] = useState<{
    info: number;
    warning: number;
    danger: number;
  }>({ info: 0, warning: 0, danger: 0 });
  const [moduleD] = useState<string>("");
  const [monthD] = useState<string>("");
  const [fromD] = useState<string>("");
  const [toD] = useState<string>("");
  const [severityD] = useState<string>("");
  const [actionD] = useState<string>("");
  const [qD] = useState<string>("");
  const [debouncedQD, setDebouncedQD] = useState<string>("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQD(qD), 300);
    return () => clearTimeout(t);
  }, [qD]);
  const [successD] = useState<string>("");
  const [userD] = useState<string>("");
  const [ipD] = useState<string>("");
  const [sortByD] = useState<string>("ts");
  const [orderD] = useState<string>("desc");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (!apiKey) {
      setLoading(false);
      return;
    }
    try {
      const params: Record<string, string | number> = { per_page: 50, page: 1 };
      if (moduleD) params.module = moduleD;
      if (actionD) params.action = actionD;
      if (monthD) params.month = monthD;
      if (fromD) params.from = fromD;
      if (toD) params.to = toD;
      if (severityD) params.severity = severityD;
      if (debouncedQD) params.q = debouncedQD;
      if (successD !== "") params.success = successD;
      if (userD) params.user = userD;
      if (ipD) params.ip = ipD;
      if (sortByD) params.sort_by = sortByD;
      if (orderD) params.order = orderD;
      const { data } = await api.get("/api/logs", { params });
      const list: LogRow[] = Array.isArray(data?.data)
        ? (data.data as LogRow[])
        : [];
      setRows(list);
      const counts = list.reduce(
        (acc: { info: number; warning: number; danger: number }, r: LogRow) => {
          const sev = (r.severity ??
            (Number(r.success) === 1 ? "info" : "danger")) as
            | "info"
            | "warning"
            | "danger";
          acc[sev] = acc[sev] + 1;
          return acc;
        },
        { info: 0, warning: 0, danger: 0 }
      );
      setSeverityCounts(counts);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load dashboard";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [
    apiKey,
    moduleD,
    actionD,
    monthD,
    fromD,
    toD,
    severityD,
    debouncedQD,
    successD,
    userD,
    ipD,
    sortByD,
    orderD,
  ]);
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const total = rows.length;
  const succ = rows.filter((r) => Number(r.success) === 1).length;
  const fail = total - succ;
  const rate = total ? Math.round((succ / total) * 100) : 0;
  const modCounts: Record<string, number> = {};
  rows.forEach((r) => {
    modCounts[r.module] = (modCounts[r.module] || 0) + 1;
  });
  const modules = Object.entries(modCounts).sort((a, b) => b[1] - a[1]);
  const byDay: Record<string, number> = {};
  rows.forEach((r) => {
    const d = String(r.ts).slice(0, 10);
    byDay[d] = (byDay[d] || 0) + 1;
  });
  const daysSorted = Object.entries(byDay).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  const daySeries = daysSorted.map(([, c]) => c);

  return (
    <div className="p-6 bg-gray-50 text-gray-900">
      <div className="w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-gray-600 mt-1">
            Real-time logging and security overview
          </p>
          {error && <div className="mt-2 text-red-600 text-sm">{error}</div>}
          <div className="mt-3 flex gap-2">
            <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded text-xs bg-blue-100 text-blue-700">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              Info: {severityCounts.info}
            </span>
            <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded text-xs bg-amber-100 text-amber-700">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              Warning: {severityCounts.warning}
            </span>
            <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded text-xs bg-red-100 text-red-700">
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
              Danger: {severityCounts.danger}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-lg p-5 ring-1 ring-white/10">
            <div className="flex items-center gap-2 text-xs opacity-80">
              <FiEye /> <span>Total Logs</span>
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {loading ? "..." : total}
            </div>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-lg p-5 ring-1 ring-white/10">
            <div className="flex items-center gap-2 text-xs opacity-80">
              <FiCheckCircle /> <span>Successful</span>
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {loading ? "..." : succ}
            </div>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-lg p-5 ring-1 ring-white/10">
            <div className="flex items-center gap-2 text-xs opacity-80">
              <FiXCircle /> <span>Failed</span>
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {loading ? "..." : fail}
            </div>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-lg p-5 ring-1 ring-white/10">
            <div className="flex items-center gap-2 text-xs opacity-80">
              <FiPercent /> <span>Success Rate</span>
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {loading ? "..." : rate}%
            </div>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white p-4 text-gray-900 shadow-md border border-slate-200">
            <div className="font-medium mb-3">Daily Activity</div>
            {daySeries.length ? (
              <TrendLineChart points={daySeries} />
            ) : (
              <div className="text-sm text-gray-500">No activity data yet</div>
            )}
          </div>
          <div className="rounded-xl bg-white p-4 text-gray-900 shadow-lg">
            <div className="font-medium mb-3">Module Distribution</div>
            {modules.length ? (
              <BarsChart
                data={modules.map(([m, c]) => ({
                  label: m,
                  value: c as number,
                }))}
              />
            ) : (
              <div className="text-sm text-gray-500">No module data yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
