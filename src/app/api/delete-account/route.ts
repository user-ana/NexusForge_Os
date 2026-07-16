import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Elimina la cuenta (auth.users) del usuario en el SERVIDOR con la service_role
 * key. Al borrar el usuario, la base elimina en cascada sus datos asociados.
 *
 * Nota de seguridad (igual que reset-password): esto NO verifica por un segundo
 * factor que quien pide el borrado sea el dueño; recibe el userId del cliente.
 * Suficiente para el MVP; para producción conviene validar el token de sesión.
 */
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey || serviceKey.includes('your_')) {
    return NextResponse.json(
      { error: 'Servidor no configurado: falta SUPABASE_SERVICE_ROLE_KEY en .env.local.' },
      { status: 500 },
    )
  }

  let body: { userId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Petición inválida.' }, { status: 400 })
  }

  const userId = (body.userId ?? '').trim()
  if (!/^[0-9a-f-]{20,}$/i.test(userId)) {
    return NextResponse.json({ error: 'Usuario inválido.' }, { status: 400 })
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
