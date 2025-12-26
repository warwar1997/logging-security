import axios from 'axios'

const api = axios.create({
  baseURL: (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000',
  headers: { Accept: 'application/json' },
  withCredentials: false,
  timeout: 10000,
})

// Attach API key from localStorage on every request
api.interceptors.request.use((config) => {
  try {
    const key = localStorage.getItem('apiKey')
    if (key) {
      config.headers = config.headers || {}
      ;(config.headers as any)['Authorization'] = `Bearer ${key}`
      ;(config.headers as any)['X-API-KEY'] = key
    }
  } catch {}
  return config
})

export default api