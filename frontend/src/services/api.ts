import axios, { type AxiosRequestHeaders } from "axios";

const envBase = import.meta.env?.VITE_API_BASE_URL as string | undefined;
let normalizedBase = envBase;
if (!envBase && import.meta.env.DEV) {
  normalizedBase = "";
} else if (typeof envBase === "string" && /localhost/i.test(envBase)) {
  try {
    const u = new URL(envBase);
    u.hostname = "127.0.0.1";
    normalizedBase = u.toString();
  } catch {
    normalizedBase = envBase;
  }
}

const api = axios.create({
  baseURL: normalizedBase,
  headers: { Accept: "application/json" },
  withCredentials: false,
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  try {
    const key = localStorage.getItem("apiKey");
    if (key) {
      const headers = (config.headers ?? {}) as AxiosRequestHeaders;
      headers["Authorization"] = `Bearer ${key}`;
      headers["X-API-KEY"] = key;
      config.headers = headers;
    }
  } catch {
    void 0;
  }
  return config;
});

export default api;
