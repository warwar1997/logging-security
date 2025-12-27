import { useEffect, useState } from "react";
import api from "../services/api";
import { FiPlay } from "react-icons/fi";

export default function ActionsPage() {
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [msg, setMsg] = useState<string>("");

  const [user, setUser] = useState<string>("alice");
  const [loginSuccess, setLoginSuccess] = useState<boolean>(true);

  const [updateModule, setUpdateModule] = useState<string>("Employees");
  const [updateResource, setUpdateResource] = useState<string>("employee:123");
  const [updateFields, setUpdateFields] = useState<string>("email");
  const [updateSuccess, setUpdateSuccess] = useState<boolean>(true);

  const [deleteModule, setDeleteModule] = useState<string>("Employees");
  const [deleteResource, setDeleteResource] = useState<string>("employee:123");
  const [deleteReason, setDeleteReason] = useState<string>("cleanup");
  const [deleteSuccess, setDeleteSuccess] = useState<boolean>(true);

  const [runUser, setRunUser] = useState<string>("system");
  const [runAmount, setRunAmount] = useState<number>(5000);
  const [runCurrency, setRunCurrency] = useState<string>("USD");
  const [runSuccess, setRunSuccess] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/api/auth");
        setRoles(Array.isArray(data?.roles) ? data.roles : []);
      } catch {
        setRoles([]);
      }
    })();
  }, []);
  const canWrite = roles.includes("admin") || roles.includes("compliance");

  const postLog = async (payload: Record<string, unknown>) => {
    setLoading(true);
    setMsg("");
    try {
      await api.post("/api/logs", payload);
      setMsg("Event logged successfully");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      setMsg("Failed to log event: " + msg);
    } finally {
      setLoading(false);
    }
  };

  const onLogin = async () => {
    await postLog({
      module: "Authentication",
      action: "login",
      user,
      success: loginSuccess ? 1 : 0,
      severity: loginSuccess ? "info" : "danger",
      details: loginSuccess
        ? { method: "ui" }
        : { method: "ui", reason: "bad credentials" },
    });
  };
  const onUpdate = async () => {
    await postLog({
      module: updateModule,
      action: "update",
      user,
      success: updateSuccess ? 1 : 0,
      severity: updateSuccess ? "warning" : "danger",
      details: {
        resource: updateResource,
        fields: updateFields.split(",").map((s) => s.trim()),
        method: "ui",
      },
    });
  };
  const onDelete = async () => {
    await postLog({
      module: deleteModule,
      action: "delete",
      user,
      success: deleteSuccess ? 1 : 0,
      severity: "danger",
      details: { resource: deleteResource, reason: deleteReason, method: "ui" },
    });
  };
  const onRun = async () => {
    await postLog({
      module: "Payroll",
      action: "run",
      user: runUser,
      success: runSuccess ? 1 : 0,
      severity: runSuccess ? "info" : "danger",
      details: { amount: runAmount, currency: runCurrency, method: "ui" },
    });
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <FiPlay /> Actions
      </h2>
      <p className="text-sm text-gray-600 mt-1">
        Use these UI controls to perform login, update, delete, and run
        processes. Each action writes a log event to the backend.
      </p>
      {!canWrite && (
        <div className="mt-3 p-3 rounded bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          Write actions require admin/compliance role. Click "Use test-write" in the top bar.
        </div>
      )}
      {msg && (
        <div className="mt-3 p-2 rounded text-sm border bg-slate-50 text-slate-700">
          {msg}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="border rounded-lg bg-white shadow-sm">
          <div className="p-3 border-b bg-gray-50 font-medium">Login</div>
          <div className="p-3 space-y-3">
            <div>
              <label className="block text-sm">User</label>
              <input
                className="border rounded px-3 py-2 w-full"
                value={user}
                onChange={(e) => setUser(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm">Result</label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={loginSuccess}
                  onChange={() => setLoginSuccess(true)}
                />{" "}
                Success
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={!loginSuccess}
                  onChange={() => setLoginSuccess(false)}
                />{" "}
                Failed
              </label>
            </div>
            <button
              className="px-4 py-2 rounded bg-indigo-600 text-white"
              onClick={onLogin}
              disabled={!canWrite || loading}
            >
              Log Login
            </button>
          </div>
        </div>

        <div className="border rounded-lg bg-white shadow-sm">
          <div className="p-3 border-b bg-gray-50 font-medium">Update</div>
          <div className="p-3 space-y-3">
            <div>
              <label className="block text-sm">Module</label>
              <select
                className="border rounded px-3 py-2 w-full"
                value={updateModule}
                onChange={(e) => setUpdateModule(e.target.value)}
              >
                <option>Employees</option>
                <option>Payroll</option>
                <option>Compliance</option>
                <option>Security</option>
              </select>
            </div>
            <div>
              <label className="block text-sm">Resource</label>
              <input
                className="border rounded px-3 py-2 w-full"
                value={updateResource}
                onChange={(e) => setUpdateResource(e.target.value)}
                placeholder="e.g. employee:123"
              />
            </div>
            <div>
              <label className="block text-sm">Fields (comma-separated)</label>
              <input
                className="border rounded px-3 py-2 w-full"
                value={updateFields}
                onChange={(e) => setUpdateFields(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm">Result</label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={updateSuccess}
                  onChange={() => setUpdateSuccess(true)}
                />{" "}
                Success
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={!updateSuccess}
                  onChange={() => setUpdateSuccess(false)}
                />{" "}
                Failed
              </label>
            </div>
            <button
              className="px-4 py-2 rounded bg-indigo-600 text-white"
              onClick={onUpdate}
              disabled={!canWrite || loading}
            >
              Log Update
            </button>
          </div>
        </div>

        <div className="border rounded-lg bg-white shadow-sm">
          <div className="p-3 border-b bg-gray-50 font-medium">Delete</div>
          <div className="p-3 space-y-3">
            <div>
              <label className="block text-sm">Module</label>
              <select
                className="border rounded px-3 py-2 w-full"
                value={deleteModule}
                onChange={(e) => setDeleteModule(e.target.value)}
              >
                <option>Employees</option>
                <option>Payroll</option>
                <option>Compliance</option>
                <option>Security</option>
              </select>
            </div>
            <div>
              <label className="block text-sm">Resource</label>
              <input
                className="border rounded px-3 py-2 w-full"
                value={deleteResource}
                onChange={(e) => setDeleteResource(e.target.value)}
                placeholder="e.g. employee:123"
              />
            </div>
            <div>
              <label className="block text-sm">Reason</label>
              <input
                className="border rounded px-3 py-2 w-full"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm">Result</label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={deleteSuccess}
                  onChange={() => setDeleteSuccess(true)}
                />{" "}
                Success
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={!deleteSuccess}
                  onChange={() => setDeleteSuccess(false)}
                />{" "}
                Failed
              </label>
            </div>
            <button
              className="px-4 py-2 rounded bg-indigo-600 text-white"
              onClick={onDelete}
              disabled={!canWrite || loading}
            >
              Log Delete
            </button>
          </div>
        </div>

        <div className="border rounded-lg bg-white shadow-sm">
          <div className="p-3 border-b bg-gray-50 font-medium">Run Payroll</div>
          <div className="p-3 space-y-3">
            <div>
              <label className="block text-sm">User</label>
              <input
                className="border rounded px-3 py-2 w-full"
                value={runUser}
                onChange={(e) => setRunUser(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm">Amount</label>
                <input
                  type="number"
                  className="border rounded px-3 py-2 w-full"
                  value={runAmount}
                  onChange={(e) => setRunAmount(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="block text-sm">Currency</label>
                <input
                  className="border rounded px-3 py-2 w-full"
                  value={runCurrency}
                  onChange={(e) => setRunCurrency(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm">Result</label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={runSuccess}
                  onChange={() => setRunSuccess(true)}
                />{" "}
                Success
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={!runSuccess}
                  onChange={() => setRunSuccess(false)}
                />{" "}
                Failed
              </label>
            </div>
            <button
              className="px-4 py-2 rounded bg-indigo-600 text-white"
              onClick={onRun}
              disabled={!canWrite || loading}
            >
              Log Run
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
