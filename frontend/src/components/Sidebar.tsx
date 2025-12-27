import { NavLink } from "react-router-dom";
import {
  FiHome,
  FiFileText,
  FiEye,
  FiCheckCircle,
  FiPlay,
} from "react-icons/fi";

export default function Sidebar() {
  return (
    <div className="space-y-2">
      <NavLink
        to="/"
        className={({ isActive }) =>
          "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors " +
          (isActive
            ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md"
            : "text-slate-700 hover:bg-slate-100")
        }
      >
        <FiHome className="text-lg" />
        <span>Dashboard</span>
      </NavLink>
      <NavLink
        to="/logs"
        className={({ isActive }) =>
          "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors " +
          (isActive
            ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md"
            : "text-slate-700 hover:bg-slate-100")
        }
      >
        <FiFileText className="text-lg" />
        <span>Logs</span>
      </NavLink>
      <NavLink
        to="/alerts"
        className={({ isActive }) =>
          "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors " +
          (isActive
            ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md"
            : "text-slate-700 hover:bg-slate-100")
        }
      >
        <FiEye className="text-lg" />
        <span>Alerts</span>
      </NavLink>
      <NavLink
        to="/audits"
        className={({ isActive }) =>
          "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors " +
          (isActive
            ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md"
            : "text-slate-700 hover:bg-slate-100")
        }
      >
        <FiCheckCircle className="text-lg" />
        <span>Audits</span>
      </NavLink>
      <NavLink
        to="/actions"
        className={({ isActive }) =>
          "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors " +
          (isActive
            ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md"
            : "text-slate-700 hover:bg-slate-100")
        }
      >
        <FiPlay className="text-lg" />
        <span>Actions</span>
      </NavLink>
    </div>
  );
}
