import { Route, Routes, NavLink } from 'react-router-dom'
// removed: import './App.css'
// removed import './index.css'
import { useState, useEffect } from 'react'
import api from './services/api'
import { FiHome, FiFileText, FiSearch, FiEye, FiCheckCircle, FiXCircle, FiPercent, FiBell, FiPlay } from 'react-icons/fi'
// Add export libraries
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// Lightweight charts without external deps
function TrendLineChart({ points, height = 120, color = '#4f46e5' }: { points: number[]; height?: number; color?: string }) {
  const width = 600
  const max = Math.max(...points, 1)
  const stepX = points.length > 1 ? width / (points.length - 1) : width
  const y = (v: number) => height - (v / max) * height
  const path = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * stepX} ${y(v)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-32">
      <path d={path} fill="none" stroke={color} strokeWidth={2} />
      {points.map((v, i) => (
        <circle key={i} cx={i * stepX} cy={y(v)} r={2} fill={color} />
      ))}
    </svg>
  )
}

function BarsChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="space-y-3">
      {data.map(d => (
        <div key={d.label}>
          <div className="flex justify-between text-xs text-gray-600"><span>{d.label}</span><span>{d.value}</span></div>
          <div className="h-2 bg-gray-200 rounded">
            <div className="h-2 bg-indigo-600 rounded" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function Dashboard({ apiKey }: { apiKey: string }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [severityCounts, setSeverityCounts] = useState<{ info: number; warning: number; danger: number }>({ info: 0, warning: 0, danger: 0 })
  // Dashboard quick filters (mirrors Logs)
  const [moduleD] = useState<string>('')
  const [monthD] = useState<string>('')
  const [fromD] = useState<string>('')
  const [toD] = useState<string>('')
  const [severityD] = useState<string>('')
  const [actionD] = useState<string>('')
  const [qD] = useState<string>('')
  const [debouncedQD, setDebouncedQD] = useState<string>('')
  useEffect(() => { const t = setTimeout(() => setDebouncedQD(qD), 300); return () => clearTimeout(t) }, [qD])
  const [successD] = useState<string>('')
  const [userD] = useState<string>('')
  const [ipD] = useState<string>('')
  const [sortByD] = useState<string>('ts')
  const [orderD] = useState<string>('desc')
  // Re-fetch when API key changes (and on mount)
  useEffect(() => { fetchAll() }, [apiKey])
  const fetchAll = async () => {
    setLoading(true)
    setError(null)
    if (!apiKey) { setLoading(false); return }
    try {
      const params: any = { resource: 'logs', per_page: 50, page: 1 }
      if (moduleD) params.module = moduleD
      if (actionD) params.action = actionD
      if (monthD) params.month = monthD
      if (fromD) params.from = fromD
      if (toD) params.to = toD
      if (severityD) params.severity = severityD
      if (debouncedQD) params.q = debouncedQD
      if (successD !== '') params.success = successD
      if (userD) params.user = userD
      if (ipD) params.ip = ipD
      if (sortByD) params.sort_by = sortByD
      if (orderD) params.order = orderD
      const { data } = await api.get('/api.php', { params })
      const list = data?.data || []
      setRows(list)
      const counts = list.reduce((acc: { [key: string]: number }, r: any) => {
        const sev = r?.severity ?? (Number(r?.success) === 1 ? 'info' : 'danger')
        acc[sev] = (acc[sev] || 0) + 1
        return acc
      }, { info: 0, warning: 0, danger: 0 })
      setSeverityCounts(counts)
    } catch (e: any) {
      setError(e?.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }
  // Auto-fetch on quick filter changes
  useEffect(() => { fetchAll() }, [moduleD, actionD, monthD, fromD, toD, severityD, debouncedQD, successD, userD, ipD, sortByD, orderD])
  const total = rows.length
  const succ = rows.filter((r) => Number(r.success) === 1).length
  const fail = total - succ
  const rate = total ? Math.round((succ / total) * 100) : 0
  const modCounts: Record<string, number> = {}
  rows.forEach((r) => { modCounts[r.module] = (modCounts[r.module] || 0) + 1 })
  const modules = Object.entries(modCounts).sort((a,b)=>b[1]-a[1])
  // Build daily activity series (YYYY-MM-DD)
  const byDay: Record<string, number> = {}
  rows.forEach((r) => {
    const d = String(r.ts).slice(0,10)
    byDay[d] = (byDay[d] || 0) + 1
  })
  const daysSorted = Object.entries(byDay).sort((a,b) => a[0].localeCompare(b[0]))
  const daySeries = daysSorted.map(([_, c]) => c)
  return (
    <div className="p-6 bg-gray-50 text-gray-900">
      <div className="w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-gray-600 mt-1">Real-time logging and security overview</p>
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
            <div className="flex items-center gap-2 text-xs opacity-80"><FiEye /> <span>Total Logs</span></div>
            <div className="mt-1 text-2xl font-semibold">{loading ? '...' : total}</div>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-lg p-5 ring-1 ring-white/10">
            <div className="flex items-center gap-2 text-xs opacity-80"><FiCheckCircle /> <span>Successful</span></div>
            <div className="mt-1 text-2xl font-semibold">{loading ? '...' : succ}</div>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-lg p-5 ring-1 ring-white/10">
            <div className="flex items-center gap-2 text-xs opacity-80"><FiXCircle /> <span>Failed</span></div>
            <div className="mt-1 text-2xl font-semibold">{loading ? '...' : fail}</div>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-lg p-5 ring-1 ring-white/10">
            <div className="flex items-center gap-2 text-xs opacity-80"><FiPercent /> <span>Success Rate</span></div>
            <div className="mt-1 text-2xl font-semibold">{loading ? '...' : rate + '%'}
            </div>
          </div>
        </div>
        <div className="mt-6 rounded-2xl bg-white p-4 text-gray-900 shadow-md border border-slate-200">
          <div className="font-medium mb-3">Activity by Module</div>
          {loading && <div className="text-gray-500">Loading...</div>}
          {error && <div className="text-red-600">{error}</div>}
          {!loading && !error && (
            modules.length === 0 ? <div className="text-gray-500">No data</div> : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {modules.map(([m, c]) => (
                  <div key={m} className="border rounded-lg p-3">
                    <div className="text-sm text-gray-600">{m}</div>
                    <div className="text-2xl font-semibold">{c}</div>
                  </div>
                ))}
              </div>
            )
          )}
          <div className="mt-4">
            <a href="/logs" className="inline-block px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md">View Detailed Logs</a>
          </div>
        </div>
        {/* Trends Section */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white p-4 text-gray-900 shadow-md border border-slate-200">
            <div className="font-medium mb-3">Daily Activity</div>
            {daySeries.length ? (
              <TrendLineChart points={daySeries} />
            ) : (
              <div className="text-sm text-gray-500">No activity data yet</div>
            )}
            <div className="mt-2 text-xs text-gray-500">Showing {daysSorted.length} day(s)</div>
          </div>
          <div className="rounded-xl bg-white p-4 text-gray-900 shadow-lg">
            <div className="font-medium mb-3">Module Distribution</div>
            {modules.length ? (
              <BarsChart data={modules.map(([m, c]) => ({ label: m, value: c as number }))} />
            ) : (
              <div className="text-sm text-gray-500">No module data yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
function AlertsPage() {
  const [type, setType] = useState<string>('')
  const [enabled, setEnabled] = useState<string>('')
  const [q, setQ] = useState<string>('')
  const [debouncedQ, setDebouncedQ] = useState<string>('')
  useEffect(() => { const t = setTimeout(() => setDebouncedQ(q), 300); return () => clearTimeout(t) }, [q])
  const [page, setPage] = useState<number>(1)
  const [perPage, setPerPage] = useState<number>(20)
  const [total, setTotal] = useState<number>(0)
  const [rules, setRules] = useState<any[]>([])
  const [evaluation, setEvaluation] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // RBAC: fetch roles
  const [roles, setRoles] = useState<string[]>([])
  useEffect(() => { (async () => { try { const { data } = await api.get('/api.php', { params: { resource: 'auth' } }); setRoles(Array.isArray(data?.roles) ? data.roles : []) } catch {} })() }, [])
  const isAdmin = roles.includes('admin')

  const fetchRules = async () => {
    setLoading(true); setError(null)
    try {
      const { data } = await api.get('/api.php', { params: { resource: 'alerts', type, enabled, q: debouncedQ, page, per_page: perPage, evaluate: 1 } })
      setRules(Array.isArray(data?.rules) ? data.rules : [])
      setTotal(Number(data?.meta?.total || 0))
      setEvaluation(Array.isArray(data?.evaluation) ? data.evaluation : [])
    } catch (e: any) {
      setError(e?.message || 'Network Error')
    } finally { setLoading(false) }
  }
  useEffect(() => { fetchRules() }, [])
  useEffect(() => { fetchRules() }, [type, enabled, debouncedQ, page, perPage])

  const onToggle = async (rule: any, en: boolean) => {
    try {
      const payload: any = { id: rule.id, enabled: en ? 1 : 0 }
      await api.put('/api.php', payload, { params: { resource: 'alerts', id: rule.id } })
      fetchRules()
    } catch (e: any) { alert('Update failed: ' + (e?.message || '')) }
  }
  const onInlineEdit = async (rule: any, updates: any) => {
    try {
      const payload = { id: rule.id, ...updates }
      await api.put('/api.php', payload, { params: { resource: 'alerts', id: rule.id } })
      fetchRules()
    } catch (e: any) { alert('Update failed: ' + (e?.message || '')) }
  }
  const evalMap: Record<number, any> = {}
  for (const ev of evaluation) { if (typeof ev?.rule_id === 'number') evalMap[ev.rule_id] = ev }

  return (
    <div className="space-y-4">
      <div className="flex items	end gap-3">
        <div>
          <label className="block text-xs text-slate-600">Type</label>
          <select className="border rounded px-2 py-1 text-sm" value={type} onChange={(e)=>setType(e.target.value)}>
            <option value="">All</option>
            <option value="threshold">threshold</option>
            <option value="pattern">pattern</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-600">Enabled</label>
          <select className="border rounded px-2 py-1 text-sm" value={enabled} onChange={(e)=>setEnabled(e.target.value)}>
            <option value="">All</option>
            <option value="1">Enabled</option>
            <option value="0">Disabled</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs text-slate-600">Search</label>
          <input className="w-full border rounded px-2 py-1 text-sm" value={q} onChange={(e)=>setQ(e.target.value)} placeholder="module, action, user, severity, pattern" />
        </div>
        <div>
          <label className="block text-xs text-slate-600">Per Page</label>
          <select className="border rounded px-2 py-1 text-sm" value={perPage} onChange={(e)=>{ setPerPage(Number(e.target.value)); setPage(1) }}>
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </div>
        <button className="self-start mt-5 px-3 py-2 text-sm rounded bg-slate-100 hover:bg-slate-200" onClick={()=>fetchRules()}>Apply</button>
      </div>

      <div className="rounded-xl bg-white border border-slate-200">
        <div className="p-3 flex items-center justify-between">
          <div className="font-medium">Alert Rules</div>
          <div className="text-xs text-slate-500">Total: {total}</div>
        </div>
        <div className="divide-y">
          {loading ? (<div className="p-4 text-slate-500">Loading...</div>) : error ? (<div className="p-4 text-red-600">{error}</div>) : (
            rules.length === 0 ? (<div className="p-4 text-slate-500">No rules</div>) : (
              rules.map((r) => {
                const ev = evalMap[r.id] || null
                const trig = !!ev?.triggered
                return (
                  <div key={r.id} className="p-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                    <div className="md:col-span-2">
                      <div className="text-xs text-slate-500">Type</div>
                      <div className="text-sm font-medium">{r.type}</div>
                    </div>
                    <div className="md:col-span-3">
                      <div className="text-xs text-slate-500">Filters</div>
                      <div className="text-sm">
                        {[r.module, r.action, r.user, r.severity].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-xs text-slate-500">Window</div>
                      <div className="text-sm">{r.window}s</div>
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-xs text-slate-500">Evaluation</div>
                      <div className="text-sm inline-flex items-center gap-1">
                        {trig ? <FiCheckCircle className="text-green-600"/> : <FiXCircle className="text-slate-400"/>}
                        <span>{ev ? `${ev.count} evt${ev.type === 'pattern' ? ` / ${ev.matches} match` : ''}` : 'n/a'}</span>
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={Number(r.enabled) === 1} onChange={(e)=>onToggle(r, e.target.checked)} disabled={!isAdmin} />
                        <span>Enabled { !isAdmin && <span className="text-[10px] text-slate-400">(admin only)</span> }</span>
                      </label>
                    </div>
                    <div className="md:col-span-1 text-right">
                      <button className="px-2 py-1 text-xs rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-50" onClick={()=>{
                        const nv = prompt('Update threshold/pattern (json):', JSON.stringify(r.type === 'threshold' ? { threshold: r.threshold } : { pattern: r.pattern }))
                        if (!nv) return
                        try { const obj = JSON.parse(nv); onInlineEdit(r, obj) } catch { alert('Invalid JSON') }
                      }} disabled={!isAdmin}>Edit</button>
                    </div>
                    {Array.isArray(ev?.samples) && ev.samples.length > 0 && (
                      <div className="md:col-span-12">
                        <div className="rounded bg-slate-50 p-2 text-xs text-slate-600">Recent samples:
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-1">
                            {ev.samples.map((s: any) => (
                              <div key={s.id} className="border rounded p-2">
                                <div className="font-mono">{new Date(s.ts * 1000).toLocaleString()}</div>
                                <div>{s.module} · {s.action} · {s.user}</div>
                                <div className="text-slate-500">{s.severity} · success={s.success}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )
          )}
        </div>
        <div className="p-3 flex items-center justify-between">
          <div className="text-xs text-slate-600">Page {page} / {Math.max(1, Math.ceil(total / perPage))}</div>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1 text-sm rounded bg-slate-100" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1, p-1))}>Prev</button>
            <button className="px-3 py-1 text-sm rounded bg-slate-100" disabled={page>=Math.ceil(total/perPage)} onClick={()=>setPage(p=>p+1)}>Next</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function LogsPage() {
  const [module, setModule] = useState('')
  const [action, setAction] = useState('')
  const [user, setUser] = useState('')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  useEffect(() => { const t = setTimeout(() => setDebouncedQ(q), 300); return () => clearTimeout(t) }, [q])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [success, setSuccess] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [total, setTotal] = useState(0)
  const [rows, setRows] = useState<any[]>([])
  const [selected, setSelected] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; break_at_id: number | null; checked: number } | null>(null)
  // RBAC: fetch roles for admin-only actions
  const [roles, setRoles] = useState<string[]>([])
  useEffect(() => { (async () => { try { const { data } = await api.get('/api.php', { params: { resource: 'auth' } }); setRoles(Array.isArray(data?.roles) ? data.roles : []) } catch {} })() }, [])
  const isAdmin = roles.includes('admin')
  // Auto-refresh controls
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [refreshMs, setRefreshMs] = useState(10000)
  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return
    onFilter()
    const id = setInterval(() => { onFilter() }, refreshMs)
    return () => clearInterval(id)
  }, [autoRefresh, refreshMs])

  const onFilter = async () => {
    setLoading(true); setError(null)
    try {
      const params: any = { resource: 'logs', page, per_page: perPage }
      if (module) params.module = module
      if (action) params.action = action
      if (from) params.from = from
      if (to) params.to = to
      if (debouncedQ) params.q = debouncedQ
      if (user) params.user = user
      if (success !== '') params.success = success
      const { data } = await api.get('/api.php', { params })
      setRows(Array.isArray(data?.data) ? data.data : [])
      setTotal(typeof data?.meta?.total === 'number' ? data.meta.total : (Array.isArray(data?.data) ? data.data.length : 0))
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch logs')
    } finally { setLoading(false) }
  }

  const generateSampleData = async () => {
    setGenerating(true)
    try {
      const samples = [
        { module: 'Authentication', action: 'login', user: 'alice', success: 1, severity: 'info', details: { agent: 'web' } },
        { module: 'Payroll', action: 'run', user: 'system', success: 0, severity: 'danger', details: { reason: 'missing account' } },
        { module: 'Employees', action: 'update', user: 'bob', success: 1, severity: 'warning', details: { fields: ['email'] } },
      ]
      for (const s of samples) {
        await api.post('/api.php', s, { params: { resource: 'logs' } })
      }
      await onFilter()
    } catch (e: any) {
      setError(e?.message || 'Failed to generate sample data')
    } finally {
      setGenerating(false)
    }
  }

  // Export helpers
  const exportCSV = () => {
    const header = ['id','ts','module','action','user','success','severity','ip','ua','details']
    const lines = [header.join(',')].concat(rows.map(r => [r.id, r.ts, r.module, r.action, r.user, r.success, r.severity, r.ip, r.ua, JSON.stringify(r.details ?? '')].map(v => JSON.stringify(v ?? '')).join(',')))
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'logs.csv'; a.click(); URL.revokeObjectURL(url)
  }
  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({ id: r.id, ts: r.ts, module: r.module, action: r.action, user: r.user, success: r.success, severity: r.severity, ip: r.ip, ua: r.ua, details: JSON.stringify(r.details ?? '') })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Logs'); XLSX.writeFile(wb, 'logs.xlsx')
  }
  const exportPDF = () => {
    const doc = new jsPDF()
    autoTable(doc, {
      head: [['ID','Timestamp','Module','Action','User','Result','Severity','IP','UA']],
      body: rows.map(r => [r.id, new Date((Number(r.ts) || 0) * 1000).toLocaleString(), r.module, r.action, r.user, String(r.success), r.severity, r.ip, r.ua])
    })
    doc.save('logs.pdf')
  }
  const verifyIntegrity = async () => {
    try {
      const { data } = await api.get('/api.php', { params: { resource: 'logs', verify: 1 } })
      if (typeof data?.valid !== 'undefined') setVerifyResult({ valid: !!data.valid, break_at_id: (data.break_at_id ?? null), checked: Number(data.checked || 0) })
    } catch (e: any) { alert('Verify failed: ' + (e?.message || '')) }
  }

  useEffect(() => { onFilter() }, [])

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold">Logs</h2>
      <div className="mt-4 grid gap-3 grid-cols-1 md:grid-cols-4 lg:grid-cols-6">
        <div className="space-y-2">
          <label className="block text-sm">Module</label>
          <select className="border rounded px-3 py-2 w-full" value={module} onChange={(e)=>setModule(e.target.value)}>
            <option value="">All</option>
            <option value="Authentication">Authentication</option>
            <option value="Employees">Employees</option>
            <option value="Payroll">Payroll</option>
          </select>
        </div>
        <div className="space-y-2 md:col-span-2 lg:col-span-2">
          <label className="block text-sm">Date range</label>
          <div className="flex items-center gap-2">
            <input type="date" className="border rounded px-3 py-2 w-full" value={from} onChange={e=>{ setFrom(e.target.value); setPage(1); }} />
            <input type="date" className="border rounded px-3 py-2 w-full" value={to} onChange={e=>{ setTo(e.target.value); setPage(1); }} />
          </div>
        </div>
        <div className="space-y-2">
          <label className="block text-sm">Action</label>
          <select className="border rounded px-3 py-2 w-full" value={action} onChange={(e)=>setAction(e.target.value)}>
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
          <input type="text" className="border rounded px-3 py-2 w-full" placeholder="Search" value={q} onChange={(e)=>setQ(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="block text-sm">User</label>
          <input type="text" className="border rounded px-3 py-2 w-full" placeholder="User" value={user} onChange={(e)=>setUser(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="block text-sm">Result</label>
          <select className="border rounded px-3 py-2 w-full" value={success} onChange={(e)=>{ setSuccess(e.target.value); setPage(1); }}>
            <option value="">All</option>
            <option value="1">Success</option>
            <option value="0">Failed</option>
          </select>
        </div>
      </div>
      <div className="mt-4 flex gap-2 items-center flex-wrap">
        <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={onFilter}>Filter</button>
        <button className="bg-gray-200 px-4 py-2 rounded" onClick={()=>{ setModule(''); setFrom(''); setTo(''); setAction(''); setUser(''); setQ(''); setSuccess(''); setPage(1); setPerPage(20); }}>Reset</button>
        <button className="bg-slate-200 px-3 py-2 rounded" onClick={exportCSV}>Export CSV</button>
        <button className="bg-slate-200 px-3 py-2 rounded" onClick={exportXLSX}>Export XLSX</button>
        <button className="bg-slate-200 px-3 py-2 rounded" onClick={exportPDF}>Export PDF</button>
        <button className="bg-amber-200 px-3 py-2 rounded" onClick={verifyIntegrity}>Verify Integrity</button>
        {verifyResult && (
          <span className={`px-3 py-2 rounded text-sm ${verifyResult.valid ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            Chain {verifyResult.valid ? 'valid' : `broken at ID ${verifyResult.break_at_id}`} (checked {verifyResult.checked})
          </span>
        )}
        {isAdmin && <button className="bg-emerald-600 text-white px-4 py-2 rounded" onClick={generateSampleData} disabled={generating}>Generate sample data</button>}
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={autoRefresh} onChange={(e)=>setAutoRefresh(e.target.checked)} />
            <span>Auto-refresh</span>
          </label>
          <select className="border rounded px-2 py-1 text-sm" value={refreshMs} onChange={(e)=>setRefreshMs(Number(e.target.value))} disabled={!autoRefresh}>
            <option value={5000}>5s</option>
            <option value={10000}>10s</option>
            <option value={30000}>30s</option>
            <option value={60000}>60s</option>
          </select>
        </div>
      </div>
      <div className="mt-6">
        <div className="border rounded shadow-sm">
          <div className="p-3 border-b bg-gray-50 font-medium flex items-center justify-between"><span>Logs</span></div>
          <div className="p-3 text-sm text-gray-600">
            {loading && <div className="text-gray-500">Loading...</div>}
            {error && <div className="text-red-600">{error}</div>}
            {!loading && !error && (
              rows.length === 0 ? (
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
                      <tr key={r.id} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(r)}>
                        <td className="p-2">{r.id}</td>
                        <td className="p-2">{r.module}</td>
                        <td className="p-2">{r.action}</td>
                        <td className="p-2">{r.user}</td>
                        <td className="p-2">{r.ts}</td>
                        <td className="p-2">
                          <span className={'inline-block px-2 py-1 text-xs rounded ' + ((r.severity || (Number(r.success)===1 ? 'info' : 'danger')) === 'info' ? 'bg-blue-100 text-blue-700' : (r.severity || (Number(r.success)===1 ? 'info' : 'danger')) === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700')}>
                            {r.severity || (Number(r.success)===1 ? 'info' : 'danger')}
                          </span>
                        </td>
                        <td className="p-2">{Number(r.success) === 1 ? (
                          <span className="inline-block px-2 py-1 text-xs rounded bg-green-100 text-green-700">Success</span>
                        ) : (
                          <span className="inline-block px-2 py-1 text-xs rounded bg-red-100 text-red-700">Failed</span>
                        )}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>
          {selected && (
            <div className="border-t p-3 text-sm">
              <div className="font-medium mb-2">Selected Log Details</div>
              <pre className="bg-gray-100 p-2 rounded overflow-auto">{JSON.stringify(selected, null, 2)}</pre>
              <div className="mt-2"><button className="px-3 py-1.5 rounded bg-gray-700 text-white" onClick={() => setSelected(null)}>Close</button></div>
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm">Page size</label>
          <select className="border rounded px-2 py-1" value={perPage} onChange={(e)=>{ setPerPage(Number(e.target.value)); setPage(1); }}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button className="px-3 py-1.5 rounded bg-gray-200" disabled={page<=1} onClick={()=>{ setPage(p=>Math.max(1,p-1)); onFilter(); }}>Prev</button>
          <div className="text-sm">Page {page} of {Math.max(1, Math.ceil(total / perPage))}</div>
          <button className="px-3 py-1.5 rounded bg-gray-200" disabled={page>=Math.ceil(total/perPage)} onClick={()=>{ setPage(p=>p+1); onFilter(); }}>Next</button>
        </div>
      </div>
    </div>
  )
}

function AuditsPage() {
  const [type, setType] = useState('')
  const [actor, setActor] = useState('')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  useEffect(() => { const t = setTimeout(() => setDebouncedQ(q), 300); return () => clearTimeout(t) }, [q])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [total, setTotal] = useState(0)
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // RBAC: roles for compliance export access in Audits
  const [roles, setRoles] = useState<string[]>([])
  useEffect(() => { (async () => { try { const { data } = await api.get('/api.php', { params: { resource: 'auth' } }); setRoles(Array.isArray(data?.roles) ? data.roles : []) } catch {} })() }, [])
  const canCompliance = roles.includes('compliance') || roles.includes('admin')

  const onFilter = async () => {
    setLoading(true); setError(null)
    try {
      const params: any = { resource: 'audits', page, per_page: perPage }
      if (type) params.type = type
      if (actor) params.actor = actor
      if (from) params.from = from
      if (to) params.to = to
      if (debouncedQ) params.q = debouncedQ
      const { data } = await api.get('/api.php', { params })
      setRows(Array.isArray(data?.data) ? data.data : [])
      setTotal(typeof data?.meta?.total === 'number' ? data.meta.total : (Array.isArray(data?.data) ? data.data.length : 0))
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch audits')
    } finally { setLoading(false) }
  }

  // Export helpers for audits
  const exportAuditCSV = () => {
    const header = ['id','ts','type','actor','details']
    const lines = [header.join(',')].concat(rows.map((r:any) => [r.id, r.ts, r.type, r.actor, typeof r.details === 'string' ? r.details : JSON.stringify(r.details)].map(v => JSON.stringify(v ?? '')).join(',')))
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'audits.csv'; a.click(); URL.revokeObjectURL(url)
  }
  const exportAuditXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(rows.map((r:any) => ({ id: r.id, ts: r.ts, type: r.type, actor: r.actor, details: typeof r.details === 'string' ? r.details : JSON.stringify(r.details) })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Audits'); XLSX.writeFile(wb, 'audits.xlsx')
  }
  const exportAuditPDF = () => {
    const doc = new jsPDF()
    autoTable(doc, {
      head: [['ID','Timestamp','Type','Actor','Details']],
      body: rows.map((r:any) => [r.id, new Date((Number(r.ts) || 0) * 1000).toLocaleString(), r.type, r.actor, typeof r.details === 'string' ? r.details : JSON.stringify(r.details)])
    })
    doc.save('audits.pdf')
  }
  // Compliance report (PDF): summarize integrity status, recent audits, alerts count and 24h stats
  const exportCompliancePDF = async () => {
    const doc = new jsPDF()
    doc.text('Compliance Report', 14, 16)
    try {
      const [{ data: verify }, { data: stats }, { data: alerts }, { data: audits }] = await Promise.all([
        api.get('/api.php', { params: { resource: 'logs', verify: 1 } }),
        api.get('/api.php', { params: { resource: 'stats', window: 86400 } }),
        api.get('/api.php', { params: { resource: 'alerts', per_page: 100 } }),
        api.get('/api.php', { params: { resource: 'audits', page: 1, per_page: 100 } }),
      ])
      autoTable(doc, {
        startY: 22,
        head: [['Section','Key','Value']],
        body: [
          ['Integrity','Valid', String(!!verify?.valid)],
          ['Integrity','Break at ID', String(verify?.break_at_id ?? '')],
          ['Stats','Total (24h)', String(stats?.total ?? 0)],
          ['Alerts','Count', String((alerts?.meta?.total ?? (alerts?.rules?.length ?? 0)))],
          ['Audits','Recent entries', String(audits?.meta?.total ?? 0)],
        ]
      })
      doc.save('compliance.pdf')
    } catch (e: any) {
      alert('Compliance export failed: ' + (e?.message || ''))
    }
  }

  useEffect(() => { onFilter() }, [])

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold">Audits</h2>
      <div className="mt-4 grid gap-3 grid-cols-1 md:grid-cols-4 lg:grid-cols-6">
        <div className="space-y-2">
          <label className="block text-sm">Type</label>
          <input type="text" className="border rounded px-3 py-2 w-full" placeholder="e.g. integrity.verify" value={type} onChange={(e)=>setType(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="block text-sm">Actor</label>
          <input type="text" className="border rounded px-3 py-2 w-full" placeholder="actor" value={actor} onChange={(e)=>setActor(e.target.value)} />
        </div>
        <div className="space-y-2 md:col-span-2 lg:col-span-2">
          <label className="block text-sm">Date range</label>
          <div className="flex items-center gap-2">
            <input type="date" className="border rounded px-3 py-2 w-full" value={from} onChange={e=>{ setFrom(e.target.value); setPage(1); }} />
            <input type="date" className="border rounded px-3 py-2 w-full" value={to} onChange={e=>{ setTo(e.target.value); setPage(1); }} />
          </div>
        </div>
        <div className="space-y-2 md:col-span-2 lg:col-span-2">
          <label className="block text-sm">Search</label>
          <input type="text" className="border rounded px-3 py-2 w-full" placeholder="Search type, actor or details" value={q} onChange={(e)=>setQ(e.target.value)} />
        </div>
      </div>
      <div className="mt-4 flex gap-2 items-center flex-wrap">
        <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={onFilter}>Filter</button>
        <button className="bg-gray-200 px-4 py-2 rounded" onClick={()=>{ setType(''); setActor(''); setQ(''); setFrom(''); setTo(''); setPage(1); setPerPage(20) }}>Reset</button>
        <button className="bg-slate-200 px-3 py-2 rounded" onClick={exportAuditCSV}>Export CSV</button>
        <button className="bg-slate-200 px-3 py-2 rounded" onClick={exportAuditXLSX}>Export XLSX</button>
        <button className="bg-slate-200 px-3 py-2 rounded" onClick={exportAuditPDF}>Export PDF</button>
        {canCompliance && <button className="bg-indigo-600 text-white px-3 py-2 rounded" onClick={exportCompliancePDF}>Compliance PDF</button>}
      </div>
      <div className="mt-6">
        <div className="border rounded shadow-sm">
          <div className="p-3 border-b bg-gray-50 font-medium flex items-center justify-between"><span>Audits</span></div>
          <div className="p-3 text-sm text-gray-600">
            {loading && <div className="text-gray-500">Loading...</div>}
            {error && <div className="text-red-600">{error}</div>}
            {!loading && !error && (
              rows.length === 0 ? (
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
                        <td className="p-2"><pre className="whitespace-pre-wrap">{typeof r.details === 'object' ? JSON.stringify(r.details, null, 2) : String(r.details ?? '')}</pre></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm">Page size</label>
          <select className="border rounded px-2 py-1" value={perPage} onChange={(e)=>{ setPerPage(Number(e.target.value)); setPage(1); }}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button className="px-3 py-1.5 rounded bg-gray-200" disabled={page<=1} onClick={()=>{ setPage(p=>Math.max(1,p-1)); onFilter(); }}>Prev</button>
          <div className="text-sm">Page {page} of {Math.max(1, Math.ceil(total / perPage))}</div>
          <button className="px-3 py-1.5 rounded bg-gray-200" disabled={page>=Math.ceil(total/perPage)} onClick={()=>{ setPage(p=>p+1); onFilter(); }}>Next</button>
        </div>
      </div>
    </div>
  )
}

function Sidebar() {
  return (
    <div className="space-y-2">
      <NavLink to="/" className={({isActive}) => 'flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ' + (isActive ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md' : 'text-slate-700 hover:bg-slate-100')}>
        <FiHome className="text-lg" />
        <span>Dashboard</span>
      </NavLink>
      <NavLink to="/logs" className={({isActive}) => 'flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ' + (isActive ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md' : 'text-slate-700 hover:bg-slate-100')}>
        <FiFileText className="text-lg" />
        <span>Logs</span>
      </NavLink>
      <NavLink to="/alerts" className={({isActive}) => 'flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ' + (isActive ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md' : 'text-slate-700 hover:bg-slate-100')}>
        <FiEye className="text-lg" />
        <span>Alerts</span>
      </NavLink>
      <NavLink to="/audits" className={({isActive}) => 'flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ' + (isActive ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md' : 'text-slate-700 hover:bg-slate-100')}>
        <FiCheckCircle className="text-lg" />
        <span>Audits</span>
      </NavLink>
      <NavLink to="/actions" className={({isActive}) => 'flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ' + (isActive ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md' : 'text-slate-700 hover:bg-slate-100')}>
        <FiPlay className="text-lg" />
        <span>Actions</span>
      </NavLink>
    </div>
  )
}

function Topbar({ apiKey, setApiKey }: { apiKey: string; setApiKey: (v: string) => void }) {
  const [roles, setRoles] = useState<string[]>([])
  const [authErr, setAuthErr] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  // Alerts polling state
  const [alertCount, setAlertCount] = useState<number>(0)
  const [alertChecking, setAlertChecking] = useState<boolean>(false)
  const refreshAuth = async () => {
    setChecking(true)
    setAuthErr(null)
    try {
      const { data } = await api.get('/api.php', { params: { resource: 'auth' } })
      setRoles(Array.isArray(data?.roles) ? data.roles : [])
    } catch (e: any) {
      setRoles([])
      setAuthErr(e?.message || 'Network Error')
    } finally {
      setChecking(false)
    }
  }
  const checkAlerts = async () => {
    if (!apiKey) { setAlertCount(0); return }
    setAlertChecking(true)
    try {
      const { data } = await api.get('/api.php', { params: { resource: 'alerts', evaluate: 1 } })
      const evals: any[] = Array.isArray(data?.evaluation) ? data.evaluation : []
      const triggered = evals.filter((e:any) => !!e?.triggered)
      setAlertCount(triggered.length)
    } catch (e: any) {
      // silent
    } finally { setAlertChecking(false) }
  }
  useEffect(() => { if (apiKey) refreshAuth(); else { setRoles([]); setAuthErr(null); } }, [apiKey])
  useEffect(() => {
    let timer: any = null
    if (apiKey) {
      checkAlerts()
      timer = setInterval(() => { checkAlerts() }, 15000)
    }
    return () => { if (timer) clearInterval(timer) }
  }, [apiKey])
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b">
      <div className="px-6 py-3 flex items-center gap-6">
        <div className="text-indigo-700 font-semibold text-xl tracking-wide">HRMS</div>
        <div className="flex-1">
          <div className="relative">
            <input type="text" className="w-full border border-slate-200 rounded-full pl-11 pr-4 py-2.5 text-sm" placeholder="Search" />
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-600">API Key</label>
          <input type="password" className="border rounded px-2 py-1 text-sm" value={apiKey} onChange={(e)=>setApiKey(e.target.value)} placeholder="Paste key" />
          <button className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200" onClick={() => { setApiKey('test-read'); try { localStorage.setItem('apiKey','test-read') } catch {}; refreshAuth(); }}>Use test-read</button>
          <button className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200" onClick={() => { setApiKey('test-write'); try { localStorage.setItem('apiKey','test-write') } catch {}; refreshAuth(); }}>Use test-write</button>
          <div className="ml-2 flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs border ${authErr ? 'bg-red-50 text-red-700 border-red-200' : roles.length ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
              {checking ? <span className="w-2 h-2 rounded-full bg-slate-400 animate-pulse"/> : authErr ? <span className="w-2 h-2 rounded-full bg-red-500"/> : roles.length ? <span className="w-2 h-2 rounded-full bg-emerald-500"/> : <span className="w-2 h-2 rounded-full bg-slate-400"/>}
              {authErr ? `Auth: ${authErr}` : roles.length ? `Roles: ${roles.join(', ')}` : 'Auth: idle'}
            </span>
            <button className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200" onClick={refreshAuth}>Refresh</button>
          </div>
          <div className="ml-2 flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs border ${alertCount > 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
              {alertChecking ? <span className="w-2 h-2 rounded-full bg-slate-400 animate-pulse"/> : alertCount > 0 ? <span className="w-2 h-2 rounded-full bg-red-500"/> : <span className="w-2 h-2 rounded-full bg-slate-400"/>}
              <FiBell /> Alerts: {alertCount}
            </span>
            <button className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200" onClick={checkAlerts}>Check</button>
            <NavLink to="/alerts" className="text-xs px-2 py-1 rounded bg-indigo-600 text-white">View</NavLink>
          </div>
        </div>
      </div>
    </header>
  )
}

function ProtectedRoute({ children, apiKey }: { children: React.ReactNode; apiKey: string }) {
  type State = { allowed: boolean; loading: boolean; err: string | null }
  const [state, setState] = useState<State>({ allowed: false, loading: true, err: null })
  useEffect(() => {
    let cancelled = false
    const check = async () => {
      if (!apiKey) {
        if (!cancelled) setState({ allowed: false, loading: false, err: null })
        return
      }
      try {
        const { data } = await api.get('/api.php', { params: { resource: 'auth' } })
        const roles: string[] = Array.isArray(data?.roles) ? data.roles : []
        const canRead = roles.includes('admin') || roles.includes('compliance') || roles.includes('viewer')
        if (!cancelled) setState({ allowed: canRead, loading: false, err: null })
      } catch (e: any) {
        if (!cancelled) setState({ allowed: false, loading: false, err: e?.message || 'Network Error' })
      }
    }
    setState(s => ({ ...s, loading: true, err: null }))
    check()
    return () => { cancelled = true }
  }, [apiKey])

  if (state.loading) return <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-slate-600">Loading...</div>
  if (!apiKey) return (
    <div className="p-6 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
      No API key: Paste a valid key in the Topbar to fetch roles and unlock Logs.
    </div>
  )
  if (state.err) return (
    <div className="p-6 rounded-xl bg-red-50 border border-red-200 text-red-700">
      Network Error: {state.err}
    </div>
  )
  if (!state.allowed) return (
    <div className="p-6 rounded-xl bg-red-50 border border-red-200 text-red-700">
      Unauthorized: You do not have permission to view logs.
    </div>
  )
  return <>{children}</>
}

function App() {
  const [apiKey, setApiKey] = useState('')
  useEffect(() => {
    try {
      const saved = localStorage.getItem('apiKey')
      if (saved) setApiKey(saved)
    } catch {}
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem('apiKey', apiKey)
    } catch {}
  }, [apiKey])

  return (
    <div className="min-h-screen bg-gray-50">
      <Topbar apiKey={apiKey} setApiKey={setApiKey} />
      <div className="flex">
        <aside className="hidden md:block w-64 p-6 border-r bg-white">
          <Sidebar />
        </aside>
        <main className="flex-1 p-6">
          <Routes>
            <Route path="/" element={<Dashboard apiKey={apiKey}/>} />
            <Route path="/logs" element={<ProtectedRoute apiKey={apiKey}><LogsPage/></ProtectedRoute>} />
            <Route path="/alerts" element={<ProtectedRoute apiKey={apiKey}><AlertsPage/></ProtectedRoute>} />
            <Route path="/audits" element={<ProtectedRoute apiKey={apiKey}><AuditsPage/></ProtectedRoute>} />
            <Route path="/actions" element={<ProtectedRouteWrite apiKey={apiKey}><ActionsPage/></ProtectedRouteWrite>} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

// ActionsPage: UI to perform login, update, delete, and run actions; posts logs to backend
function ActionsPage() {
  const [roles, setRoles] = useState<string[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [msg, setMsg] = useState<string>('')

  const [user, setUser] = useState<string>('alice')
  const [loginSuccess, setLoginSuccess] = useState<boolean>(true)

  const [updateModule, setUpdateModule] = useState<string>('Employees')
  const [updateResource, setUpdateResource] = useState<string>('employee:123')
  const [updateFields, setUpdateFields] = useState<string>('email')
  const [updateSuccess, setUpdateSuccess] = useState<boolean>(true)

  const [deleteModule, setDeleteModule] = useState<string>('Employees')
  const [deleteResource, setDeleteResource] = useState<string>('employee:123')
  const [deleteReason, setDeleteReason] = useState<string>('cleanup')
  const [deleteSuccess, setDeleteSuccess] = useState<boolean>(true)

  const [runUser, setRunUser] = useState<string>('system')
  const [runAmount, setRunAmount] = useState<number>(5000)
  const [runCurrency, setRunCurrency] = useState<string>('USD')
  const [runSuccess, setRunSuccess] = useState<boolean>(true)

  useEffect(() => { (async () => { try { const { data } = await api.get('/api.php', { params: { resource: 'auth' } }); setRoles(Array.isArray(data?.roles) ? data.roles : []) } catch { setRoles([]) } })() }, [])
  const canWrite = roles.includes('admin') || roles.includes('compliance')

  const postLog = async (payload: any) => {
    setLoading(true); setMsg('')
    try {
      await api.post('/api.php', payload, { params: { resource: 'logs' } })
      setMsg('Event logged successfully')
    } catch (e: any) {
      setMsg('Failed to log event: ' + (e?.message || ''))
    } finally { setLoading(false) }
  }

  const onLogin = async () => {
    await postLog({ module: 'Authentication', action: 'login', user, success: loginSuccess ? 1 : 0, severity: loginSuccess ? 'info' : 'danger', details: loginSuccess ? { method: 'ui' } : { method: 'ui', reason: 'bad credentials' } })
  }
  const onUpdate = async () => {
    await postLog({ module: updateModule, action: 'update', user, success: updateSuccess ? 1 : 0, severity: updateSuccess ? 'warning' : 'danger', details: { resource: updateResource, fields: updateFields.split(',').map(s=>s.trim()), method: 'ui' } })
  }
  const onDelete = async () => {
    await postLog({ module: deleteModule, action: 'delete', user, success: deleteSuccess ? 1 : 0, severity: 'danger', details: { resource: deleteResource, reason: deleteReason, method: 'ui' } })
  }
  const onRun = async () => {
    await postLog({ module: 'Payroll', action: 'run', user: runUser, success: runSuccess ? 1 : 0, severity: runSuccess ? 'info' : 'danger', details: { amount: runAmount, currency: runCurrency, method: 'ui' } })
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold flex items-center gap-2"><FiPlay /> Actions</h2>
      <p className="text-sm text-gray-600 mt-1">Use these UI controls to perform login, update, delete, and run processes. Each action writes a log event to the backend.</p>
      {!canWrite && (
        <div className="mt-3 p-3 rounded bg-amber-50 border border-amber-200 text-amber-800 text-sm">Write actions require admin/compliance role. Click \"Use test-write\" in the top bar.</div>
      )}
      {msg && <div className="mt-3 p-2 rounded text-sm border bg-slate-50 text-slate-700">{msg}</div>}

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="border rounded-lg bg-white shadow-sm">
          <div className="p-3 border-b bg-gray-50 font-medium">Login</div>
          <div className="p-3 space-y-3">
            <div>
              <label className="block text-sm">User</label>
              <input className="border rounded px-3 py-2 w-full" value={user} onChange={(e)=>setUser(e.target.value)} />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm">Result</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" checked={loginSuccess} onChange={()=>setLoginSuccess(true)} /> Success</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" checked={!loginSuccess} onChange={()=>setLoginSuccess(false)} /> Failed</label>
            </div>
            <button className="px-4 py-2 rounded bg-indigo-600 text-white" onClick={onLogin} disabled={!canWrite || loading}>Log Login</button>
          </div>
        </div>

        <div className="border rounded-lg bg-white shadow-sm">
          <div className="p-3 border-b bg-gray-50 font-medium">Update</div>
          <div className="p-3 space-y-3">
            <div>
              <label className="block text-sm">Module</label>
              <select className="border rounded px-3 py-2 w-full" value={updateModule} onChange={e=>setUpdateModule(e.target.value)}>
                <option>Employees</option>
                <option>Payroll</option>
                <option>Compliance</option>
                <option>Security</option>
              </select>
            </div>
            <div>
              <label className="block text-sm">Resource</label>
              <input className="border rounded px-3 py-2 w-full" value={updateResource} onChange={(e)=>setUpdateResource(e.target.value)} placeholder="e.g. employee:123" />
            </div>
            <div>
              <label className="block text-sm">Fields (comma-separated)</label>
              <input className="border rounded px-3 py-2 w-full" value={updateFields} onChange={(e)=>setUpdateFields(e.target.value)} />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm">Result</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" checked={updateSuccess} onChange={()=>setUpdateSuccess(true)} /> Success</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" checked={!updateSuccess} onChange={()=>setUpdateSuccess(false)} /> Failed</label>
            </div>
            <button className="px-4 py-2 rounded bg-indigo-600 text-white" onClick={onUpdate} disabled={!canWrite || loading}>Log Update</button>
          </div>
        </div>

        <div className="border rounded-lg bg-white shadow-sm">
          <div className="p-3 border-b bg-gray-50 font-medium">Delete</div>
          <div className="p-3 space-y-3">
            <div>
              <label className="block text-sm">Module</label>
              <select className="border rounded px-3 py-2 w-full" value={deleteModule} onChange={e=>setDeleteModule(e.target.value)}>
                <option>Employees</option>
                <option>Payroll</option>
                <option>Compliance</option>
                <option>Security</option>
              </select>
            </div>
            <div>
              <label className="block text-sm">Resource</label>
              <input className="border rounded px-3 py-2 w-full" value={deleteResource} onChange={(e)=>setDeleteResource(e.target.value)} placeholder="e.g. employee:123" />
            </div>
            <div>
              <label className="block text-sm">Reason</label>
              <input className="border rounded px-3 py-2 w-full" value={deleteReason} onChange={(e)=>setDeleteReason(e.target.value)} />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm">Result</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" checked={deleteSuccess} onChange={()=>setDeleteSuccess(true)} /> Success</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" checked={!deleteSuccess} onChange={()=>setDeleteSuccess(false)} /> Failed</label>
            </div>
            <button className="px-4 py-2 rounded bg-indigo-600 text-white" onClick={onDelete} disabled={!canWrite || loading}>Log Delete</button>
          </div>
        </div>

        <div className="border rounded-lg bg-white shadow-sm">
          <div className="p-3 border-b bg-gray-50 font-medium">Run Payroll</div>
          <div className="p-3 space-y-3">
            <div>
              <label className="block text-sm">User</label>
              <input className="border rounded px-3 py-2 w-full" value={runUser} onChange={(e)=>setRunUser(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm">Amount</label>
                <input type="number" className="border rounded px-3 py-2 w-full" value={runAmount} onChange={(e)=>setRunAmount(Number(e.target.value))} />
              </div>
              <div>
                <label className="block text-sm">Currency</label>
                <input className="border rounded px-3 py-2 w-full" value={runCurrency} onChange={(e)=>setRunCurrency(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm">Result</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" checked={runSuccess} onChange={()=>setRunSuccess(true)} /> Success</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" checked={!runSuccess} onChange={()=>setRunSuccess(false)} /> Failed</label>
            </div>
            <button className="px-4 py-2 rounded bg-indigo-600 text-white" onClick={onRun} disabled={!canWrite || loading}>Log Run</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ProtectedRouteWrite: allows only admin/compliance roles (requires write key)
function ProtectedRouteWrite({ children, apiKey }: { children: React.ReactNode; apiKey: string }) {
  type State = { allowed: boolean; loading: boolean; err: string | null }
  const [state, setState] = useState<State>({ allowed: false, loading: true, err: null })
  useEffect(() => {
    let cancelled = false
    const check = async () => {
      if (!apiKey) { if (!cancelled) setState({ allowed: false, loading: false, err: null }); return }
      try {
        const { data } = await api.get('/api.php', { params: { resource: 'auth' } })
        const roles: string[] = Array.isArray(data?.roles) ? data.roles : []
        const canWrite = roles.includes('admin') || roles.includes('compliance')
        if (!cancelled) setState({ allowed: canWrite, loading: false, err: null })
      } catch (e: any) { if (!cancelled) setState({ allowed: false, loading: false, err: e?.message || 'Network Error' }) }
    }
    setState(s => ({ ...s, loading: true, err: null }))
    check()
    return () => { cancelled = true }
  }, [apiKey])
  if (state.loading) return <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-slate-600">Loading...</div>
  if (!apiKey) return <div className="p-6 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">No API key: Click \"Use test-write\" in the Topbar.</div>
  if (state.err) return <div className="p-6 rounded-xl bg-red-50 border border-red-200 text-red-700">Network Error: {state.err}</div>
  if (!state.allowed) return <div className="p-6 rounded-xl bg-red-50 border border-red-200 text-red-700">Unauthorized: Write actions require admin/compliance role.</div>
  return <>{children}</>
}

export default App
