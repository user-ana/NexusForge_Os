import { NextResponse } from 'next/server'
import os from 'os'
import { createClient } from '@supabase/supabase-js'
import { ollamaBase, ollamaModel, ollamaHeaders } from '@/backend/ollama'
import { rateLimit, clientIp, sweepBuckets } from '@/backend/apiGuard'

/**
 * Estado del servicio (health check).
 *
 * Es el endpoint que consulta el panel de monitoreo y el que consultaria
 * cualquier sonda externa (UptimeRobot, cron, systemd) para saber si la
 * aplicacion sigue viva. Es publico a proposito: una sonda no tiene sesion.
 *
 * Reporta tres cosas:
 *   - runtime: sistema operativo, memoria y tiempo encendido del servidor.
 *              Aqui se ve que la aplicacion corre sobre LINUX.
 *   - checks:  base de datos y servidor de IA, con su latencia real en ms.
 *   - version: commit desplegado y entorno.
 *
 * Devuelve 200 si la base responde y 503 si no: asi una sonda externa puede
 * decidir por el codigo HTTP sin leer el cuerpo.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Check = { name: string; ok: boolean; ms: number; detail?: string }

const DB_TIMEOUT_MS = 4000
const AI_TIMEOUT_MS = 2000

/** Ping a la base: una lectura minima, midiendo el viaje de ida y vuelta. */
async function checkDatabase(): Promise<Check> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key || key.includes('your_')) {
    return { name: 'database', ok: false, ms: 0, detail: 'sin configurar' }
  }

  const started = Date.now()
  try {
    const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    const { error } = await db
      .from('profiles')
      .select('id', { head: true, count: 'exact' })
      .limit(1)
      .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS))

    const ms = Date.now() - started
    if (error) return { name: 'database', ok: false, ms, detail: error.message.slice(0, 120) }
    return { name: 'database', ok: true, ms }
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'error'
    return { name: 'database', ok: false, ms: Date.now() - started, detail: detail.slice(0, 120) }
  }
}

/**
 * Ping al servidor de IA. Es OPCIONAL: si Ollama no esta levantado la
 * aplicacion sigue funcionando (solo el asistente queda sin respuesta), asi
 * que este check no tumba el estado general.
 */
async function checkAI(): Promise<Check> {
  const base = ollamaBase()
  const started = Date.now()
  try {
    // Con ollamaHeaders(): si el servidor de IA está detrás del candado del
    // túnel, una consulta sin token recibe 401 y la sonda reportaría la IA como
    // caída estando perfectamente viva.
    const res = await fetch(`${base}/api/tags`, {
      headers: ollamaHeaders(),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    })
    const ms = Date.now() - started
    if (!res.ok) return { name: 'ai', ok: false, ms, detail: `HTTP ${res.status}` }
    const data = (await res.json()) as { models?: { name: string }[] }
    const models = data.models?.length ?? 0
    return { name: 'ai', ok: true, ms, detail: `${models} modelo(s) · ${ollamaModel()}` }
  } catch {
    return { name: 'ai', ok: false, ms: Date.now() - started, detail: 'no alcanzable' }
  }
}

export async function GET(req: Request) {
  sweepBuckets()
  const gate = rateLimit(`health:${clientIp(req)}`, 30, 60_000)
  if (!gate.ok) return NextResponse.json({ error: 'Demasiadas peticiones.' }, { status: 429 })

  const [database, ai] = await Promise.all([checkDatabase(), checkAI()])

  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const rss = process.memoryUsage().rss

  const body = {
    // El estado general depende solo de lo imprescindible: la base de datos.
    status: database.ok ? 'ok' : 'down',
    timestamp: new Date().toISOString(),
    runtime: {
      platform: os.platform(), // 'linux' en produccion
      release: os.release(),
      arch: os.arch(),
      node: process.version,
      cpus: os.cpus().length,
      uptimeSeconds: Math.round(process.uptime()),
      loadavg: os.loadavg().map((n) => Number(n.toFixed(2))),
      memory: {
        rssMB: Math.round(rss / 1024 / 1024),
        usedMB: Math.round((totalMem - freeMem) / 1024 / 1024),
        totalMB: Math.round(totalMem / 1024 / 1024),
      },
      region: process.env.VERCEL_REGION || process.env.FLY_REGION || 'local',
    },
    checks: [database, ai],
    version: {
      env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
      // En Vercel la variable la pone la plataforma. En un servidor propio no
      // existe, asi que deploy-rocky.sh escribe APP_COMMIT en la unidad de
      // systemd. Sin esto, una instalacion autohospedada no sabe decir que
      // version esta corriendo — y con dos despliegues en paralelo, esa
      // pregunta importa.
      commit: (process.env.VERCEL_GIT_COMMIT_SHA || process.env.APP_COMMIT || '').slice(0, 7),
      branch: process.env.VERCEL_GIT_COMMIT_REF || process.env.APP_BRANCH || '',
    },
  }

  return NextResponse.json(body, {
    status: database.ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}
