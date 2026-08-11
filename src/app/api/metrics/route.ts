import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireUser, rateLimit, clientIp, sweepBuckets } from '@/backend/apiGuard'
import { recordMetrics, metricsReady, normalizeRoute, type Metric } from '@/backend/metrics'

/**
 * Monitoreo de metricas y rendimiento.
 *
 *   POST /api/metrics   El navegador manda lo que midio (Core Web Vitals y
 *                       vistas de pagina). Entrada validada y limitada.
 *   GET  /api/metrics   Resumen para el panel. SOLO catedraticos.
 *
 * Por que el navegador no escribe directo en la base: la tabla `app_metrics`
 * no tiene politica de INSERT para usuarios. Todo pasa por aqui, que valida
 * el nombre de la metrica, recorta el valor y descarta lo que no reconoce.
 * Asi el panel no se puede inflar desde la consola del navegador.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Solo se aceptan estas metricas del navegador. Todo lo demas se descarta. */
const ALLOWED_VITALS = new Set([
  'LCP', // Largest Contentful Paint  — cuando se ve el contenido principal
  'CLS', // Cumulative Layout Shift   — cuanto "salta" la pagina
  'INP', // Interaction to Next Paint — que tan rapido responde al clic
  'FCP', // First Contentful Paint    — primer pixel con contenido
  'TTFB', // Time To First Byte       — respuesta del servidor
  'FID', // First Input Delay (navegadores viejos)
  'Next.js-hydration',
  'Next.js-route-change-to-render',
  'Next.js-render',
])

const MAX_BATCH = 25
/** Techo defensivo: nada real pasa de 10 min; recorta valores absurdos. */
const MAX_VALUE = 600_000

export async function POST(req: Request) {
  sweepBuckets()

  if (!metricsReady()) return NextResponse.json({ ok: true, skipped: 'disabled' })

  // Anti abuso: un navegador normal manda un lote por navegacion.
  const ip = clientIp(req)
  const gate = rateLimit(`metrics:${ip}`, 60, 60_000) // 60 lotes / minuto
  if (!gate.ok) return NextResponse.json({ error: 'Demasiadas peticiones.' }, { status: 429 })

  let body: { metrics?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Peticion invalida.' }, { status: 400 })
  }

  const raw = Array.isArray(body.metrics) ? body.metrics.slice(0, MAX_BATCH) : []
  if (!raw.length) return NextResponse.json({ ok: true, saved: 0 })

  // Identidad opcional: si viene token valido, la metrica queda asociada al
  // usuario; si no (pestana cerrandose, sendBeacon), se guarda anonima.
  const user = await requireUser(req)

  const rows: Metric[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const m = item as Record<string, unknown>
    const name = typeof m.name === 'string' ? m.name : ''
    const kind = m.kind === 'event' ? 'event' : 'web_vital'

    if (kind === 'web_vital' && !ALLOWED_VITALS.has(name)) continue
    if (kind === 'event' && name !== 'pageview') continue

    const value = Number(m.value)
    rows.push({
      kind,
      name,
      value: Number.isFinite(value) ? Math.min(Math.max(value, 0), MAX_VALUE) : 0,
      route: normalizeRoute(typeof m.route === 'string' ? m.route : ''),
      userId: user?.id ?? null,
      role: typeof m.role === 'string' ? m.role : '',
      meta: typeof m.rating === 'string' ? { rating: m.rating } : {},
    })
  }

  await recordMetrics(rows)
  return NextResponse.json({ ok: true, saved: rows.length })
}

export async function GET(req: Request) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey || serviceKey.includes('your_')) {
    return NextResponse.json(
      { error: 'Servidor no configurado: falta SUPABASE_SERVICE_ROLE_KEY.' },
      { status: 500 },
    )
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // El panel de monitoreo es vista docente.
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'teacher') {
    return NextResponse.json({ error: 'Solo catedraticos.' }, { status: 403 })
  }

  const hours = Math.min(Math.max(parseInt(new URL(req.url).searchParams.get('hours') ?? '24', 10) || 24, 1), 720)

  // Se llama con la llave del servidor a proposito: asi los totales son de
  // toda la plataforma y no solo de las clases del catedratico que mira.
  const { data, error } = await admin.rpc('metrics_overview', { p_hours: hours })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
