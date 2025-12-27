import { useEffect, useState, useCallback } from "react";
import api from "../services/api";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function AuditsPage() {
  const [type, setType] = useState("");
  const [actor, setActor] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [total, setTotal] = useState(0);
  type AuditRow = {
    id: number;
    ts: number | string;
    type: string;
    actor: string;
    details?: unknown;
  };
  const [rows, setRows] = useState<AuditRow[]>([]);
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
  const canCompliance = roles.includes("compliance") || roles.includes("admin");

  const onFilter = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = {
        page,
        per_page: perPage,
      };
      if (type) params.type = type;
      if (actor) params.actor = actor;
      if (from) params.from = from;
      if (to) params.to = to;
      if (debouncedQ) params.q = debouncedQ;
      const { data } = await api.get("/api/audits", { params });
      setRows(Array.isArray(data?.data) ? (data.data as AuditRow[]) : []);
      setTotal(
        typeof data?.meta?.total === "number"
          ? data.meta.total
          : Array.isArray(data?.data)
          ? data.data.length
          : 0
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to fetch audits";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [page, perPage, type, actor, from, to, debouncedQ]);

  const exportAuditCSV = () => {
    const header = ["id", "ts", "type", "actor", "details"];
    const lines = [header.join(",")].concat(
      rows.map((r) =>
        [
          r.id,
          r.ts,
          r.type,
          r.actor,
          typeof r.details === "string" ? r.details : JSON.stringify(r.details),
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
    a.download = "audits.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportAuditXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(
      rows.map((r) => ({
        id: r.id,
        ts: r.ts,
        type: r.type,
        actor: r.actor,
        details:
          typeof r.details === "string" ? r.details : JSON.stringify(r.details),
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Audits");
    XLSX.writeFile(wb, "audits.xlsx");
  };
  const exportAuditPDF = () => {
    const doc = new jsPDF();
    autoTable(doc, {
      head: [["ID", "Timestamp", "Type", "Actor", "Details"]],
      body: rows.map((r) => [
        String(r.id ?? ""),
        new Date((Number(r.ts) || 0) * 1000).toLocaleString(),
        String(r.type ?? ""),
        String(r.actor ?? ""),
        String(
          typeof r.details === "string"
            ? r.details
            : JSON.stringify(r.details ?? "")
        ),
      ]),
    });
    doc.save("audits.pdf");
  };
  const exportCompliancePDF = async () => {
    const doc = new jsPDF();
    doc.text("Compliance Report", 14, 16);
    try {
      const [
        { data: verify },
        { data: stats },
        { data: alerts },
        { data: audits },
      ] = await Promise.all([
        api.get("/api/logs", { params: { verify: 1 } }),
        api.get("/api/stats", { params: { window: 86400 } }),
        api.get("/api/alerts", { params: { per_page: 100 } }),
        api.get("/api/audits", { params: { page: 1, per_page: 100 } }),
      ]);
      autoTable(doc, {
        startY: 22,
        head: [["Section", "Key", "Value"]],
        body: [
          ["Integrity", "Valid", String(!!verify?.valid)],
          ["Integrity", "Break at ID", String(verify?.break_at_id ?? "")],
          ["Stats", "Total (24h)", String(stats?.total ?? 0)],
          [
            "Alerts",
            "Count",
            String(alerts?.meta?.total ?? alerts?.rules?.length ?? 0),
          ],
          ["Audits", "Recent entries", String(audits?.meta?.total ?? 0)],
        ],
      });
      doc.save("compliance.pdf");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      alert("Compliance export failed: " + msg);
    }
  };

  useEffect(() => {
    onFilter();
  }, [onFilter]);

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold">Audits</h2>
      <div className="mt-4 grid gap-3 grid-cols-1 md:grid-cols-4 lg:grid-cols-6">
        <div className="space-y-2">
          <label className="block text-sm">Type</label>
          <input
            type="text"
            className="border rounded px-3 py-2 w-full"
            placeholder="e.g. integrity.verify"
            value={type}
            onChange={(e) => setType(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm">Actor</label>
          <input
            type="text"
            className="border rounded px-3 py-2 w-full"
            placeholder="actor"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
          />
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
        <div className="space-y-2 md:col-span-2 lg:col-span-2">
          <label className="block text-sm">Search</label>
          <input
            type="text"
            className="border rounded px-3 py-2 w-full"
            placeholder="Search type, actor or details"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
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
            setType("");
            setActor("");
            setQ("");
            setFrom("");
            setTo("");
            setPage(1);
            setPerPage(20);
          }}
        >
          Reset
        </button>
        <button
          className="bg-slate-200 px-3 py-2 rounded"
          onClick={exportAuditCSV}
        >
          Export CSV
        </button>
        <button
          className="bg-slate-200 px-3 py-2 rounded"
          onClick={exportAuditXLSX}
        >
          Export XLSX
        </button>
        <button
          className="bg-slate-200 px-3 py-2 rounded"
          onClick={exportAuditPDF}
        >
          Export PDF
        </button>
        {canCompliance && (
          <button
            className="bg-indigo-600 text-white px-3 py-2 rounded"
            onClick={exportCompliancePDF}
          >
            Compliance PDF
          </button>
        )}
      </div>
      <div className="mt-6">
        <div className="border rounded shadow-sm">
          <div className="p-3 border-b bg-gray-50 font-medium flex items-center justify-between">
            <span>Audits</span>
          </div>
          <div className="p-3 text-sm text-gray-600">
            {loading && <div className="text-gray-500">Loading...</div>}
            {error && <div className="text-red-600">{error}</div>}
            {!loading &&
              !error &&
              (rows.length === 0 ? (
                <div>No audits yet. Use Filter to fetch.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="p-2">ID</th>
                      <th className="p-2">Timestamp</th>
                      <th className="p-2">Type</th>
                      <th className="p-2">Actor</th>
                      <th className="p-2">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t hover:bg-gray-50">
                        <td className="p-2">{r.id}</td>
                        <td className="p-2">{r.ts}</td>
                        <td className="p-2">{r.type}</td>
                        <td className="p-2">{r.actor}</td>
                        <td className="p-2">
                          <pre className="whitespace-pre-wrap">
                            {typeof r.details === "object"
                              ? JSON.stringify(r.details, null, 2)
                              : String(r.details ?? "")}
                          </pre>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
          </div>
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
