import type { User } from '@supabase/supabase-js'
import { getSession, setSession, DEFAULT_COINS, DEFAULT_XP, type Session } from '@/frontend/session/session'

/** Convierte un usuario de Supabase en la sesión local (mezclando con lo existente). */
export function bridgeUser(user: User): void {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const prev = getSession()
  const role = (meta.role as Session['role']) ?? prev?.role ?? 'student'
  const provider = (user.app_metadata?.provider as Session['provider']) ?? prev?.provider ?? 'password'

  setSession({
    ...prev,
    id: user.id,
    user: user.email ?? (meta.user_name as string) ?? (meta.username as string) ?? prev?.user ?? 'usuario',
    name: (meta.username as string) ?? prev?.name ?? (meta.name as string) ?? undefined,
    // nf_full_name = nombre elegido por el usuario (Microsoft/GitHub NO lo pisan).
    // full_name lo reescribe el proveedor en cada login, por eso va de último.
    fullName:
      (meta.nf_full_name as string) ??
      prev?.fullName ??
      (meta.full_name as string) ??
      undefined,
    career: (meta.career as string) ?? prev?.career ?? undefined,
    teacherCode: (meta.teacher_code as string) ?? prev?.teacherCode ?? undefined,
    account: (meta.account_number as string) ?? prev?.account ?? undefined,
    role,
    provider,
    avatar: prev?.avatar ?? (meta.avatar_url as string) ?? undefined,
    coins: prev?.coins ?? DEFAULT_COINS,
    xp: prev?.xp ?? DEFAULT_XP,
  })
}
