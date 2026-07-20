import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash, timingSafeEqual } from 'crypto'
import { requireUser, rateLimit, clientIp, sweepBuckets } from '@/backend/apiGuard'

/**
 * Verifica la CLAVE DE DOCENTE en el SERVIDOR y, si es correcta, otorga el rol
 * de catedrático al usuario autenticado.
 *
 * Por qué existe (seguridad):
 *  - Antes la clave se comprobaba en el navegador: el hash viajaba al cliente,
 *    así que se podía romper por fuerza bruta sin límite y además saltarse.
 *  - Ahora la clave NUNCA llega al navegador, cada intento pasa por el servidor
 *    y está limitado (anti fuerza bruta).
 *  - Este endpoint es el ÚNICO camino para obtener el rol de catedrático.
 */

// SHA-256 de la clave válida. Configurable por variable de entorno del SERVIDOR.
const FALLBACK_HASH = 'b3b51fce08a232bd48de61fd8b746d0dfc7e1424507e1950ef0eaf798450da19'

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

/** Comparación en tiempo constante (evita filtrar información por el tiempo). */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export async function POST(req: Request) {
  sweepBuckets()

  // 1) ANTI FUERZA BRUTA: pocos intentos por IP en una ventana amplia
  const ip = clientIp(req)
  const byIp = rateLimit(`tkey:ip:${ip}`, 5, 15 * 60 * 1000) // 5 intentos / 15 min
  if (!byIp.ok) {
    return NextResponse.json(
      { error: `Demasiados intentos. Espera ${byIp.retryAfter} segundos.` },
      { status: 429 },
    )
  }

  // 2) Solo un usuario autenticado puede pedir el rol (y solo para sí mismo)
  const user = await requireUser(req)
  if (!user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  // Límite adicional por usuario (por si rota de IP)
  const byUser = rateLimit(`tkey:user:${user.id}`, 5, 15 * 60 * 1000)
  if (!byUser.ok) {
    return NextResponse.json(
      { error: `Demasiados intentos. Espera ${byUser.retryAfter} segundos.` },
      { status: 429 },
    )
  }

  let body: { key?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Petición inválida.' }, { status: 400 })
  }

  const key = (body.key ?? '').trim().toUpperCase()
  if (!key) return NextResponse.json({ error: 'Clave requerida.' }, { status: 400 })

  const expected = process.env.TEACHER_KEY_HASH || FALLBACK_HASH
  if (!safeEqual(sha256(key), expected)) {
    // Mensaje genérico: no damos pistas sobre la clave
    return NextResponse.json({ error: 'Clave de docente inválida.' }, { status: 403 })
  }

  // 3) Clave correcta -> otorgar el rol con la llave del servidor (no desde el cliente)
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

  const { error: metaErr } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: { role: 'teacher' },
  })
  const { error: profErr } = await admin.from('profiles').update({ role: 'teacher' }).eq('id', user.id)

  if (metaErr || profErr) {
    return NextResponse.json({ error: (metaErr || profErr)?.message ?? 'No se pudo asignar el rol.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, role: 'teacher' })
}
