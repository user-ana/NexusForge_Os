/**
 * Defensas para los endpoints de API (seguridad).
 *
 *  - requireUser: verifica el token de sesion de quien llama. Sin token valido,
 *    el endpoint NO hace nada. Evita que un extrano invoque acciones sensibles.
 *  - rateLimit: limita intentos por IP en una ventana de tiempo (anti fuerza bruta).
 *
 * Nota: el rate limit es en memoria del proceso. En serverless cada instancia
 * tiene el suyo, asi que no es perfecto, pero corta el abuso automatizado.
 * Para produccion a gran escala se usaria un store compartido (Redis).
 */
import { createClient } from '@supabase/supabase-js'

/* ------------------------------------------------------------------ *
 * 1) Verificacion de identidad (quien llama)
 * ------------------------------------------------------------------ */

export type ApiUser = { id: string; email: string | null }

/**
 * Devuelve el usuario autenticado a partir del token 'Authorization: Bearer'.
 * null = no autenticado (el endpoint debe rechazar).
 */
export async function requireUser(req: Request): Promise<ApiUser | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return null

  const header = req.headers.get('authorization') || req.headers.get('Authorization')
  const token = header?.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) return null

  try {
    const client = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data, error } = await client.auth.getUser(token)
    if (error || !data.user) return null
    return { id: data.user.id, email: data.user.email ?? null }
  } catch {
    return null
  }
}

export type Role = 'student' | 'teacher' | 'visitor'
export type ApiUserWithRole = ApiUser & { role: Role }

/**
 * Igual que requireUser, pero ademas resuelve el ROL en el SERVIDOR.
 *
 * Por que existe: las rutas del asistente recibian el rol en el cuerpo de la
 * peticion, es decir, lo declaraba el propio navegador. Un estudiante podia
 * mandar {"role":"teacher"} y recibir las herramientas de catedratico.
 *
 * Tampoco sirve leerlo de user_metadata del token: Supabase permite que el
 * usuario escriba su propio user_metadata desde el navegador. La unica fuente
 * confiable es la columna profiles.role, protegida por el disparador
 * protect_profile_role, que revierte cualquier cambio que no venga del servidor.
 *
 * Ante la duda devuelve 'student', que es el rol sin privilegios.
 */
export async function requireUserWithRole(req: Request): Promise<ApiUserWithRole | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return null

  const header = req.headers.get('authorization') || req.headers.get('Authorization')
  const token = header?.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) return null

  try {
    const client = createClient(url, anon, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data, error } = await client.auth.getUser(token)
    if (error || !data.user) return null

    const { data: profile } = await client.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
    const role: Role = profile?.role === 'teacher' ? 'teacher' : profile?.role === 'visitor' ? 'visitor' : 'student'

    return { id: data.user.id, email: data.user.email ?? null, role }
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ *
 * 2) Limite de intentos (anti fuerza bruta)
 * ------------------------------------------------------------------ */

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

/** IP de quien llama (detras del proxy de Vercel). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'desconocida'
}

/**
 * Permite `limit` intentos por `windowMs`. Devuelve si se permite y cuanto falta.
 * Ejemplo: rateLimit(`login:${ip}`, 5, 60_000) -> 5 intentos por minuto.
 */
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now()
  const b = buckets.get(key)

  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfter: 0 }
  }
  if (b.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) }
  }
  b.count++
  return { ok: true, retryAfter: 0 }
}

/** Limpieza ocasional para que el mapa no crezca sin control. */
export function sweepBuckets(): void {
  const now = Date.now()
  if (buckets.size < 500) return
  for (const [k, b] of buckets) if (now > b.resetAt) buckets.delete(k)
}
