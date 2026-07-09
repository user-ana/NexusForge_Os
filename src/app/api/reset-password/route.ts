import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Restablecer contraseña SIN correo (panel flotante).
 * El cambio se hace en el SERVIDOR con la service_role key (nunca en el cliente).
 *
 * Nota de seguridad: no verifica que quien pide el cambio sea el dueño de la cuenta.
 * Suficiente para el MVP; para producción real conviene verificación por correo
 * (con dominio en Resend) o un segundo factor.
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

  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Petición inválida.' }, { status: 400 })
  }

  const email = (body.email ?? '').trim().toLowerCase()
  const password = body.password ?? ''
  const strong = password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !strong) {
    return NextResponse.json({ error: 'Correo o contraseña inválidos.' }, { status: 400 })
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Busca el usuario por correo
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const user = data.users.find((u) => (u.email ?? '').toLowerCase() === email)
  if (!user) {
    return NextResponse.json({ error: 'No existe una cuenta con ese correo.' }, { status: 404 })
  }

  const { error: upErr } = await admin.auth.admin.updateUserById(user.id, { password })
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
