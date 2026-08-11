'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Header from '@/frontend/components/layout/Header'
import { useT } from '@/frontend/hooks/useT'
import { getSession, SESSION_EVENT, type Role } from '@/frontend/session/session'
import {
  fetchHealth,
  fetchOverview,
  formatUptime,
  formatVital,
  rateVital,
  type Health,
  type Overview,
  type Rating,
  type SeriesPoint,
} from '@/backend/services/metrics'

/**
 * Panel de MONITOREO DE METRICAS Y RENDIMIENTO (Tercer Parcial).
 *
 * Reune en una sola vista las cuatro preguntas que hay que poder responder
 * sobre un sistema en produccion:
 *
 *   1. ¿Esta vivo?           -> Estado del servicio (/api/health)
 *   2. ¿Va rapido para el
 *      usuario?              -> Core Web Vitals medidos en el navegador
 *   3. ¿Va rapido y sin
 *      fallos el servidor?   -> Latencia y errores por ruta de API
 *   4. ¿Lo usa alguien?      -> Trafico y uso de la plataforma
 *
 * Todos los numeros son reales: salen de la tabla `app_metrics`, que se llena
 * sola con cada visita y cada llamada a la API.
 */

const RANGES = [
  { hours: 1, key: 'met.range_1h' },
  { hours: 24, key: 'met.range_24h' },
  { hours: 168, key: 'met.range_7d' },
]

const REFRESH_MS = 30_000

export default function MetricsPage() {
  const { t } = useT()
  const [role, setRole] = useState<Role>('student')
  const [hours, setHours] = useState(24)
  const [data, setData] = useState<Overview | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [auto, setAuto] = useState(true)
  const first = useRef(true)

  useEffect(() => {
    const sync = () => setRole(getSession()?.role ?? 'student')
    sync()
    window.addEventListener(SESSION_EVENT, sync)
    return () => window.removeEventListener(SESSION_EVENT, sync)
  }, [])

  const load = useCallback(async () => {
    const [overview, hp] = await Promise.all([fetchOverview(hours), fetchHealth()])
    setData(overview)
    setHealth(hp)
    setUpdatedAt(new Date())
    setLoading(false)
  }, [hours])

  useEffect(() => {
    if (role !== 'teacher') return
    if (first.current) {
      first.current = false
    } else {
      setLoading(true)
    }
    load()
  }, [role, hours, load])

  useEffect(() => {
    if (!auto || role !== 'teacher') return
    const id = window.setInterval(load, REFRESH_MS)
    return () => window.clearInterval(id)
  }, [auto, role, load])

  if (role !== 'teacher') {
    return (
      <>
        <Header title={t('met.title')} subtitle={t('met.sub')} />
        <main className="flex-1 p-8">
          <div className="neo-panel p-10 text-center text-sm text-neutral-400">{t('met.teacher_only')}</div>
        </main>
      </>
    )
  }

  const errorRate = data && data.api.requests > 0 ? (data.api.errors / data.api.requests) * 100 : 0

  return (
    <>
      <Header
        title={t('met.title')}
        subtitle={t('met.sub')}
        action={
          <div className="flex items-center gap-2">
            {RANGES.map((r) => (
              <button
                key={r.hours}
                onClick={() => setHours(r.hours)}
                className={`neo-chip ${hours === r.hours ? 'neo-chip--active' : ''}`}
              >
                {t(r.key)}
              </button>
            ))}
            <button
              onClick={() => setAuto((v) => !v)}
              className={`neo-chip ${auto ? 'neo-chip--success' : ''}`}
              title={t('met.auto')}
            >
              {t('met.auto')}
            </button>
          </div>
        }
      />

      <main className="flex-1 overflow-auto p-8 space-y-8">
        {/* ---------------------------------------------------------- *
         * 1. ¿Esta vivo? — estado del servicio
         * ---------------------------------------------------------- */}
        <Section title={t('met.health')} hint={updatedAt ? `${t('met.updated')} ${updatedAt.toLocaleTimeString()}` : ''}>
          {!health ? (
            <div className="neo-panel p-6 text-center text-xs text-neutral-600">{t('met.loading')}</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Stat
                  label={t('met.status')}
                  value={health.status === 'ok' ? t('met.status_ok') : t('met.status_down')}
                  tone={health.status === 'ok' ? 'good' : 'poor'}
                />
                <Stat label={t('met.platform')} value={`${health.runtime.platform} · ${health.runtime.arch}`} hint={health.runtime.release} />
                <Stat label={t('met.node')} value={health.runtime.node} hint={`${health.runtime.cpus} CPU · ${health.runtime.region}`} />
                <Stat label={t('met.uptime')} value={formatUptime(health.runtime.uptimeSeconds)} hint={health.version.env} />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {health.checks.map((c) => (
                  <div key={c.name} className="neo-panel flex items-center justify-between p-4">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-neutral-500">
                        {c.name === 'database' ? t('met.db') : t('met.ai')}
                      </p>
                      <p className="mt-1 text-sm text-neutral-300">{c.detail || (c.ok ? 'OK' : t('met.not_reachable'))}</p>
                    </div>
                    <div className="text-right">
                      <span className={`neo-chip ${c.ok ? 'neo-chip--success' : 'neo-chip--over'}`}>
                        {c.ok ? 'OK' : 'OFF'}
                      </span>
                      <p className="mt-1 text-xs text-neutral-500">{c.ms} ms</p>
                    </div>
                  </div>
                ))}
                <div className="neo-panel p-4">
                  <p className="text-xs uppercase tracking-wider text-neutral-500">{t('met.memory')}</p>
                  <p className="mt-1 text-sm text-neutral-300">
                    {health.runtime.memory.rssMB} MB · {t('met.of')} {health.runtime.memory.totalMB} MB
                  </p>
                  <Bar value={health.runtime.memory.usedMB} max={health.runtime.memory.totalMB} />
                </div>
              </div>
            </div>
          )}
        </Section>

        {loading && !data ? (
          <div className="neo-panel flex items-center justify-center p-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-violet border-t-transparent" />
          </div>
        ) : !data ? (
          <div className="neo-panel p-8 text-center text-sm text-neutral-400">
            {t('met.setup_hint')}
            <code className="mt-3 block text-xs text-accent-violet">supabase/metrics.sql</code>
          </div>
        ) : (
          <>
            {/* ------------------------------------------------------ *
             * 2. ¿Va rapido para el usuario? — Core Web Vitals
             * ------------------------------------------------------ */}
            <Section title={t('met.vitals')} hint={t('met.vitals_sub')}>
              {data.vitals.length === 0 ? (
                <div className="neo-panel p-6 text-center text-xs text-neutral-600">{t('met.no_vitals')}</div>
              ) : (
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
                  {data.vitals.map((v) => (
                    <VitalCard key={v.name} name={v.name} p75={v.p75} samples={v.samples} t={t} />
                  ))}
                </div>
              )}
            </Section>

            {/* ------------------------------------------------------ *
             * 3. ¿Va rapido el servidor? — API
             * ------------------------------------------------------ */}
            <Section title={t('met.api')} hint={t('met.api_sub')}>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                <Stat label={t('met.requests')} value={data.api.requests.toLocaleString()} />
                <Stat
                  label={t('met.error_rate')}
                  value={`${errorRate.toFixed(1)} %`}
                  hint={`${data.api.errors} ${t('met.errors')}`}
                  tone={errorRate === 0 ? 'good' : errorRate < 5 ? 'needs' : 'poor'}
                />
                <Stat label={t('met.p50')} value={`${data.api.p50} ms`} />
                <Stat label={t('met.p95')} value={`${data.api.p95} ms`} tone={data.api.p95 > 3000 ? 'needs' : 'good'} />
                <Stat label={t('met.avg')} value={`${data.api.avg} ms`} />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="neo-panel p-5">
                  <p className="mb-4 text-xs uppercase tracking-wider text-neutral-500">{t('met.chart_requests')}</p>
                  <RequestsChart series={data.series} step={data.range.step_seconds} empty={t('met.no_data')} />
                </div>
                <div className="neo-panel p-5">
                  <p className="mb-4 text-xs uppercase tracking-wider text-neutral-500">{t('met.chart_latency')}</p>
                  <LatencyChart series={data.series} step={data.range.step_seconds} empty={t('met.no_data')} />
                </div>
              </div>
            </Section>

            {/* Rutas mas lentas */}
            <Section title={t('met.routes')} hint={t('met.routes_sub')}>
              {data.routes.length === 0 ? (
                <div className="neo-panel p-6 text-center text-xs text-neutral-600">{t('met.no_data')}</div>
              ) : (
                <div className="neo-panel overflow-x-auto p-2">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-neutral-500">
                        <th className="px-3 py-2 font-medium">{t('met.route')}</th>
                        <th className="px-3 py-2 text-right font-medium">{t('met.requests')}</th>
                        <th className="px-3 py-2 text-right font-medium">{t('met.errors')}</th>
                        <th className="px-3 py-2 text-right font-medium">{t('met.avg')}</th>
                        <th className="px-3 py-2 text-right font-medium">{t('met.p95')}</th>
                        <th className="px-3 py-2 text-right font-medium">{t('met.max')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.routes.map((r) => (
                        <tr key={r.route} className="neo-row border-t border-white/5">
                          <td className="px-3 py-2 font-mono text-xs text-neutral-300">{r.route}</td>
                          <td className="px-3 py-2 text-right text-neutral-400">{r.requests}</td>
                          <td className={`px-3 py-2 text-right ${r.errors ? 'text-red-400' : 'text-neutral-600'}`}>
                            {r.errors}
                          </td>
                          <td className="px-3 py-2 text-right text-neutral-400">{r.avg} ms</td>
                          <td className="px-3 py-2 text-right text-neutral-200">{r.p95} ms</td>
                          <td className="px-3 py-2 text-right text-neutral-500">{r.max} ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* Errores recientes */}
            <Section title={t('met.errors_recent')}>
              {data.errors.length === 0 ? (
                <div className="neo-panel p-6 text-center text-xs text-neutral-600">{t('met.no_errors')}</div>
              ) : (
                <div className="neo-panel divide-y divide-white/5 p-2">
                  {data.errors.map((e, i) => (
                    <div key={`${e.ts}-${i}`} className="neo-row flex items-center justify-between gap-4 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs text-neutral-300">{e.route || '—'}</p>
                        <p className="truncate text-xs text-neutral-500">
                          {typeof e.meta?.message === 'string' ? e.meta.message : e.name}
                        </p>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-3">
                        <span className="neo-chip neo-chip--over">{e.status ?? 'ERR'}</span>
                        <span className="text-xs text-neutral-600">{new Date(e.ts).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* ------------------------------------------------------ *
             * 4. ¿Lo usa alguien? — trafico y uso
             * ------------------------------------------------------ */}
            <Section title={t('met.usage')} hint={t('met.usage_sub')}>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
                <Stat label={t('met.pageviews')} value={data.traffic.pageviews.toLocaleString()} />
                <Stat label={t('met.active_users')} value={data.traffic.active_users.toLocaleString()} />
                <Stat label={t('met.users')} value={data.usage.users} hint={`+${data.usage.new_users}`} />
                <Stat label={t('met.teachers')} value={data.usage.teachers} />
                <Stat label={t('met.students')} value={data.usage.students} />
                <Stat label={t('met.classes')} value={data.usage.classes} />
                <Stat label={t('met.groups')} value={data.usage.groups} />
                <Stat label={t('met.projects')} value={data.usage.projects} />
                <Stat label={t('met.tasks')} value={data.usage.tasks} />
                <Stat
                  label={t('met.submissions')}
                  value={data.usage.submissions}
                  hint={`+${data.usage.new_submissions}`}
                />
                <Stat label={t('met.messages')} value={data.usage.messages} />
              </div>
            </Section>
          </>
        )}
      </main>
    </>
  )
}

/* ------------------------------------------------------------------ *
 * Piezas de la vista
 * ------------------------------------------------------------------ */

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-accent-violet">{title}</h2>
        {hint && <span className="text-xs text-neutral-500">{hint}</span>}
        <span className="h-px flex-1 bg-white/5" />
      </div>
      {children}
    </section>
  )
}

const TONE: Record<string, string> = {
  good: 'text-emerald-400',
  needs: 'text-amber-400',
  poor: 'text-red-400',
  plain: 'text-neutral-100',
}

function Stat({
  label,
  value,
  hint,
  tone = 'plain',
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'good' | 'needs' | 'poor' | 'plain'
}) {
  return (
    <div className="neo-panel p-5">
      <p className="text-xs uppercase tracking-wider text-neutral-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${TONE[tone]}`}>{value}</p>
      {hint && <p className="mt-1 truncate text-xs text-neutral-600">{hint}</p>}
    </div>
  )
}

const RATING_COLOR: Record<Rating, string> = {
  good: '#34d399',
  needs: '#fbbf24',
  poor: '#f87171',
  unknown: '#6b7280',
}

function VitalCard({
  name,
  p75,
  samples,
  t,
}: {
  name: string
  p75: number
  samples: number
  t: (k: string) => string
}) {
  const rating = rateVital(name, p75)
  const label = rating === 'good' ? t('met.good') : rating === 'needs' ? t('met.needs') : rating === 'poor' ? t('met.poor') : ''

  return (
    <div className="neo-panel p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">{name}</p>
        <span className="h-2 w-2 rounded-full" style={{ background: RATING_COLOR[rating] }} />
      </div>
      <p className="mt-2 text-2xl font-bold text-neutral-100">{formatVital(name, p75)}</p>
      <p className="mt-1 text-xs" style={{ color: RATING_COLOR[rating] }}>
        {label}
      </p>
      <p className="mt-2 text-[11px] text-neutral-600">
        p75 · {samples} {t('met.samples')}
      </p>
    </div>
  )
}

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
      <div className="h-full rounded-full bg-accent-violet" style={{ width: `${pct}%` }} />
    </div>
  )
}

/** Etiqueta de tiempo acorde al ancho del intervalo (5 min / 1 h / 1 dia). */
function tick(iso: string, step: number): string {
  const d = new Date(iso)
  if (step >= 86400) return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** Barras: peticiones por intervalo, con la porcion de errores en rojo. */
function RequestsChart({ series, step, empty }: { series: SeriesPoint[]; step: number; empty: string }) {
  const max = Math.max(1, ...series.map((p) => p.requests))
  const total = series.reduce((a, p) => a + p.requests, 0)

  if (!total) return <p className="py-10 text-center text-xs text-neutral-600">{empty}</p>

  return (
    <div>
      <div className="flex h-40 items-end gap-[2px]">
        {series.map((p) => {
          const h = (p.requests / max) * 100
          const errPct = p.requests ? (p.errors / p.requests) * 100 : 0
          return (
            <div
              key={p.t}
              className="flex-1"
              title={`${tick(p.t, step)} · ${p.requests} · ${p.errors} err`}
              style={{ height: '100%', display: 'flex', alignItems: 'flex-end' }}
            >
              <div className="w-full overflow-hidden rounded-sm bg-accent-violet/60" style={{ height: `${h}%` }}>
                <div className="w-full bg-red-500/80" style={{ height: `${errPct}%` }} />
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-neutral-600">
        <span>{tick(series[0].t, step)}</span>
        <span>{tick(series[series.length - 1].t, step)}</span>
      </div>
    </div>
  )
}

/** Linea: latencia media por intervalo. */
function LatencyChart({ series, step, empty }: { series: SeriesPoint[]; step: number; empty: string }) {
  const values = series.map((p) => p.avg_ms)
  const max = Math.max(1, ...values)
  const hasData = values.some((v) => v > 0)

  if (!hasData) return <p className="py-10 text-center text-xs text-neutral-600">{empty}</p>

  const points = series
    .map((p, i) => {
      const x = series.length > 1 ? (i / (series.length - 1)) * 100 : 50
      const y = 100 - (p.avg_ms / max) * 100
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  return (
    <div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-40 w-full">
        <polyline
          points={`0,100 ${points} 100,100`}
          fill="rgba(63,195,232,0.12)"
          stroke="none"
        />
        <polyline
          points={points}
          fill="none"
          stroke="#3FC3E8"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
      </svg>
      <div className="mt-2 flex justify-between text-[10px] text-neutral-600">
        <span>{tick(series[0].t, step)}</span>
        <span>
          {t0(max)} ms {'·'} {tick(series[series.length - 1].t, step)}
        </span>
      </div>
    </div>
  )
}

function t0(n: number): string {
  return Math.round(n).toLocaleString()
}
