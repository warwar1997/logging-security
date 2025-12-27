import { Route, Routes } from "react-router-dom";
import { useState, useEffect } from "react";
import Topbar from "./components/Topbar";
import Sidebar from "./components/Sidebar";
import ProtectedRoute from "./components/ProtectedRoute";
import ProtectedRouteWrite from "./components/ProtectedRouteWrite";
import Dashboard from "./pages/Dashboard";
import LogsPage from "./pages/LogsPage";
import AlertsPage from "./pages/AlertsPage";
import AuditsPage from "./pages/AuditsPage";
import ActionsPage from "./pages/ActionsPage";

export default function App() {
  const [apiKey, setApiKey] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("apiKey");
      return saved || "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("apiKey", apiKey);
    } catch {
      void 0;
    }
  }, [apiKey]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Topbar apiKey={apiKey} setApiKey={setApiKey} />
      <div className="flex">
        <aside className="hidden md:block w-64 p-6 border-r bg-white">
          <Sidebar />
        </aside>
        <main className="flex-1 p-6">
          <Routes>
            <Route path="/" element={<Dashboard apiKey={apiKey} />} />
            <Route
              path="/logs"
              element={
                <ProtectedRoute apiKey={apiKey}>
                  <LogsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/alerts"
              element={
                <ProtectedRoute apiKey={apiKey}>
                  <AlertsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/audits"
              element={
                <ProtectedRoute apiKey={apiKey}>
                  <AuditsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/actions"
              element={
                <ProtectedRouteWrite apiKey={apiKey}>
                  <ActionsPage />
                </ProtectedRouteWrite>
              }
            />
          </Routes>
        </main>
      </div>
    </div>
  );
}
