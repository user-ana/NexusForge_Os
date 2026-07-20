import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireUser, rateLimit, clientIp, sweepBuckets } from '@/backend/apiGuard'

/**
 * Elimina la cuenta del usuario AUTENTICADO (solo la suya).
 *
 * Seguridad:
 *  - Exige el token de sesion (Authorization: Bearer). Sin sesion valida -> 401.
 *  - El id a borrar se toma del TOKEN, nunca del cuerpo de la peticion, para que
 *    nadie pueda borrar la cuenta de otra persona.
 *  - Rate limit por IP (anti abuso).
 */
export async function POST(req: Request) {
  sweepBuckets()

  // 1) Limite de intentos por IP
  const ip = clientIp(req)
  const limit = rateLimit(`delete-account:${ip}`, 5, 60 * 60 * 1000) // 5 por hora
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Demasiados intentos. Espera ${limit.retryAfter} segundos.` },
      { status: 429 },
    )
  }

  // 2) Identidad verificada: solo puede borrarse a SI MISMO
  const user = await requireUser(req)
  if (!user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

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

  // Se borra el usuario del TOKEN (no un id que venga del cliente)
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
