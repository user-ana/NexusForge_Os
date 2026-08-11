/**
 * Monitoreo — lado cliente.
 *
 * Solo pide datos: el resumen agregado (/api/metrics) y el estado del
 * servicio (/api/health). Ningun calculo se hace aqui; los percentiles los
 * calcula PostgreSQL, que es donde estan los datos.
 */
import { supabase } from '@/backend/supabase'

export type Vital = {
  name: string
  samples: number
  p50: number
  p75: number
  p95: number
}

export type RouteStat = {
  route: string
  requests: number
  errors: number
  avg: number
  p95: number
  max: number
}

export type SeriesPoint = {
  t: string
  requests: number
  errors: number
  pageviews: number
  avg_ms: number
}

export type ErrorRow = {
  ts: string
  name: string
  route: string
  status: number | null
  meta: Record<string, unknown>
}

export type Overview = {
  range: { hours: number; from: string; to: string; step_seconds: number }
  vitals: Vital[]
  api: { requests: number; errors: number; p50: number; p95: number; avg: number }
  routes: RouteStat[]
  series: SeriesPoint[]
  errors: ErrorRow[]
  traffic: { pageviews: number; active_users: number }
  usage: {
    users: number
    teachers: number
    students: number
    classes: number
    groups: number
    projects: number
    tasks: number
    submissions: number
    messages: number
    new_users: number
    new_submissions: number
  }
}

export type Health = {
  status: 'ok' | 'down'
  timestamp: string
  runtime: {
    platform: string
    release: string
    arch: string
    node: string
    cpus: number
    uptimeSeconds: number
    loadavg: number[]
    memory: { rssMB: number; usedMB: number; totalMB: number }
    region: string
  }
  checks: { name: string; ok: boolean; ms: number; detail?: string }[]
  version: { env: string; commit: string; branch: string }
}

/** Resumen del panel. Devuelve null si no hay sesion o el rol no es docente. */
export async function fetchOverview(hours: number): Promise<Overview | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return null

  try {
    const res = await fetch(`/api/metrics?hours=${hours}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!res.ok) return null
    return (await res.json()) as Overview
  } catch {
    return null
  }
}

/** Estado del servicio. Publico: no necesita sesion. */
export async function fetchHealth(): Promise<Health | null> {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' })
    // 503 tambien trae cuerpo util (dice que se cayo), asi que se lee igual.
    return (await res.json()) as Health
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ *
 * Umbrales oficiales de Google para Core Web Vitals (percentil 75).
 * Sirven para pintar el semaforo del panel: por debajo del primer valor
 * es "bueno"; entre los dos, "mejorable"; por encima, "deficiente".
 * ------------------------------------------------------------------ */
export const VITAL_THRESHOLDS: Record<string, { good: number; poor: number; unit: 'ms' | 'score' }> = {
  LCP: { good: 2500, poor: 4000, unit: 'ms' },
  INP: { good: 200, poor: 500, unit: 'ms' },
  FID: { good: 100, poor: 300, unit: 'ms' },
  FCP: { good: 1800, poor: 3000, unit: 'ms' },
  TTFB: { good: 800, poor: 1800, unit: 'ms' },
  // CLS viaja x1000 desde el navegador (0.1 -> 100) para no perderse al redondear
  CLS: { good: 100, poor: 250, unit: 'score' },
}

export type Rating = 'good' | 'needs' | 'poor' | 'unknown'

export function rateVital(name: string, value: number): Rating {
  const th = VITAL_THRESHOLDS[name]
  if (!th) return 'unknown'
  if (value <= th.good) return 'good'
  if (value <= th.poor) return 'needs'
  return 'poor'
}

/** Formatea un vital con su unidad (CLS vuelve a su escala 0–1). */
export function formatVital(name: string, value: number): string {
  const th = VITAL_THRESHOLDS[name]
  if (th?.unit === 'score') return (value / 1000).toFixed(3)
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`
  return `${Math.round(value)} ms`
}

/** "2 d 4 h 13 min" a partir de segundos. */
export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d) return `${d} d ${h} h`
  if (h) return `${h} h ${m} min`
  return `${m} min`
}
