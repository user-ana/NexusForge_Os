'use client'

import { supabase } from '@/backend/supabase'

/**
 * Verifica la clave de docente EN EL SERVIDOR y, si es correcta, el servidor
 * otorga el rol de catedrático al usuario autenticado.
 *
 * El navegador nunca conoce la clave ni su hash, y cada intento está limitado
 * (anti fuerza bruta). Requiere sesión iniciada.
 */
export async function verifyTeacherKey(key: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'No disponible en este momento.' }

  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, error: 'Necesitas iniciar sesión para verificar la clave.' }

  try {
    const res = await fetch('/api/verify-teacher-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ key }),
    })
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) return { ok: false, error: json.error ?? 'Clave de docente inválida.' }
    // Refresca la sesión para que el rol nuevo quede reflejado en el token
    await supabase.auth.refreshSession().catch(() => {})
    return { ok: true }
  } catch {
    return { ok: false, error: 'Error de conexión.' }
  }
}
