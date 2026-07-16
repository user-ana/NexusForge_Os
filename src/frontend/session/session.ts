/**
 * Sesión ligera del lado del cliente (localStorage).
 * Provisional hasta conectar un backend real de autenticación.
 */

export type Role = 'student' | 'teacher' | 'visitor'

export type Session = {
  user: string
  id?: string // uuid de auth.users (Supabase) — clave estable para la base de datos
  name?: string
  fullName?: string
  career?: string
  teacherCode?: string
  account?: string // número de cuenta (estudiante UTH)
  role?: Role
  provider?: 'password' | 'azure' | 'google' | 'github'
  coins?: number
  xp?: number
  streak?: number // días seguidos de actividad
  lastSpin?: number // timestamp del último giro de la ruleta (límite 1/día)
  avatar?: string
  group?: string
}

/** Evento que se emite cuando la sesión cambia (para refrescar el perfil en vivo). */
export const SESSION_EVENT = 'nf:session'

const KEY = 'nexusforge_session'

// Valores iniciales realistas (un estudiante nuevo empieza en cero, no inflado).
export const DEFAULT_COINS = 0
export const DEFAULT_XP = 0

export function setSession(session: Session): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    // almacenamiento lleno: ignora en silencio
  }
  window.dispatchEvent(new Event(SESSION_EVENT))
}

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function clearSession(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(KEY)
}

/** Mezcla cambios parciales en la sesión y la devuelve actualizada. */
export function patchSession(patch: Partial<Session>): Session | null {
  const s = getSession()
  if (!s) return null
  const next: Session = { ...s, ...patch }
  setSession(next)
  return next
}

/** Guarda el avatar elegido y devuelve la sesión actualizada. */
export function setAvatar(avatar: string): Session | null {
  return patchSession({ avatar })
}

/** Nombre para mostrar: prioriza nombre completo, luego username, luego correo. */
export function displayName(s: Session | null): string {
  if (!s) return 'Usuario'
  if (s.fullName) return s.fullName
  if (s.name) return s.name
  const base = s.user.includes('@') ? s.user.split('@')[0] : s.user
  return base || 'Usuario'
}

/** Suma monedas/XP a la sesión y devuelve la sesión actualizada. */
export function addReward(coins: number, xp: number): Session | null {
  const s = getSession()
  if (!s) return null
  const next: Session = {
    ...s,
    coins: (s.coins ?? DEFAULT_COINS) + coins,
    xp: (s.xp ?? DEFAULT_XP) + xp,
  }
  setSession(next)
  return next
}

/**
 * Resetea los valores de juego INFLADOS que quedaron de la versión anterior
 * (el XP falso de ~20M y monedas exageradas). Deja al estudiante en cero para
 * que empiece a acumular de verdad. Se llama al entrar a las vistas gamificadas.
 */
export function normalizeStudentStats(): void {
  const s = getSession()
  if (s && ((s.xp ?? 0) > 1_000_000 || (s.coins ?? 0) > 100_000)) {
    patchSession({ coins: 0, xp: 0 })
  }
}

/** ¿Se puede girar la ruleta? (límite: 1 vez por día natural) */
export function canSpinToday(lastSpin?: number): boolean {
  if (!lastSpin) return true
  const last = new Date(lastSpin)
  const now = new Date()
  return last.toDateString() !== now.toDateString()
}
