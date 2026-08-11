/**
 * Monitoreo de metricas y rendimiento — lado servidor.
 *
 * Dos piezas:
 *
 *  1) recordMetrics(): escribe en la tabla `app_metrics` con la llave del
 *     SERVIDOR (service_role). El navegador nunca escribe directo: si pudiera,
 *     cualquiera inflaria el panel desde la consola.
 *
 *  2) withMetrics(): envuelve el handler de una ruta de API y mide cuanto
 *     tarda y con que codigo responde. Se aplica por ruta en vez de en un
 *     middleware porque el middleware de Next se ejecuta ANTES del handler y
 *     no puede cronometrar lo que tarda en responder.
 *
 * Regla de oro: el monitoreo NUNCA puede tumbar la funcionalidad. Todo error
 * al registrar se traga en silencio y la peticion original sigue su curso.
 *
 * Ver: supabase/metrics.sql
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type MetricKind = 'web_vital' | 'api' | 'error' | 'event'

export type Metric = {
  kind: MetricKind
  name: string
  /** Milisegundos (o score sin unidad en el caso de CLS). */
  value?: number
  /** Ruta normalizada: /dashboard/classes/[id] */
  route?: string
  status?: number
  userId?: string | null
  role?: string
  meta?: Record<string, unknown>
}

/** Tiempo maximo que dejamos que tarde el registro antes de rendirnos. */
const WRITE_TIMEOUT_MS = 2500

let admin: SupabaseClient | null = null

/** Cliente con la llave del servidor (se salta RLS). null si no esta configurada. */
function adminClient(): SupabaseClient | null {
  if (admin) return admin
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || key.includes('your_')) return null
  admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  return admin
}

/** ¿Se puede registrar? (falta la llave del servidor = monitoreo apagado). */
export function metricsReady(): boolean {
  return process.env.METRICS_ENABLED !== 'false' && !!adminClient()
}

/**
 * Rutas con identificadores: /dashboard/classes/9f3c-…/projects/1a2b-…
 * se guardan como /dashboard/classes/[id]/projects/[id]. Sin esto cada clase
 * seria una "ruta" distinta y la tabla de rutas lentas no serviria de nada.
 */
export function normalizeRoute(path: string): string {
  return path
    .split('?')[0]
    .split('/')
    .map((seg) => {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return '[id]'
      if (/^\d{4,}$/.test(seg)) return '[id]'
      return seg
    })
    .join('/')
    .slice(0, 160)
}

/** Escribe un lote de metricas. Nunca lanza. */
export async function recordMetrics(rows: Metric[]): Promise<void> {
  if (!rows.length) return
  const db = adminClient()
  if (!db || process.env.METRICS_ENABLED === 'false') return

  const payload = rows.map((r) => ({
    kind: r.kind,
    name: String(r.name).slice(0, 60),
    value: Number.isFinite(r.value) ? Number(r.value) : 0,
    route: normalizeRoute(r.route ?? ''),
    status: Number.isFinite(r.status) ? Number(r.status) : null,
    user_id: r.userId ?? null,
    role: (r.role ?? '').slice(0, 20),
    meta: r.meta ?? {},
  }))

  try {
    await db.from('app_metrics').insert(payload).abortSignal(AbortSignal.timeout(WRITE_TIMEOUT_MS))
  } catch {
    // El monitoreo no debe romper la aplicacion.
  }
}

type Handler = (req: Request, ctx?: unknown) => Promise<Response> | Response

/**
 * Envuelve un handler de API y registra duracion + codigo de estado.
 *
 * Uso en la ruta:
 *   async function handler(req: Request) { … }
 *   export const POST = withMetrics('/api/nexus', handler)
 */
export function withMetrics(route: string, handler: Handler): Handler {
  return async function instrumented(req: Request, ctx?: unknown): Promise<Response> {
    const started = Date.now()
    try {
      const res = await handler(req, ctx)
      await recordMetrics([
        { kind: 'api', name: req.method, value: Date.now() - started, route, status: res.status },
      ])
      return res
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await recordMetrics([
        { kind: 'api', name: req.method, value: Date.now() - started, route, status: 500 },
        { kind: 'error', name: 'unhandled', route, status: 500, meta: { message: message.slice(0, 300) } },
      ])
      throw err
    }
  }
}
