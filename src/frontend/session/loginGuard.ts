'use client'

/**
 * Freno progresivo de intentos de inicio de sesión (anti fuerza bruta).
 *
 * IMPORTANTE — honestidad sobre su alcance:
 *  Esto vive en el navegador, así que un atacante decidido puede saltárselo
 *  (basta con borrar el almacenamiento o llamar a la API directo). NO es la
 *  defensa principal: la defensa real es el límite de intentos del servidor de
 *  autenticación (Supabase Auth) y los límites de nuestros endpoints propios.
 *
 *  Su valor es defensa en profundidad: frena el ataque "de navegador" (scripts
 *  simples en la propia página), da retroalimentación clara a la persona y
 *  reduce el ruido de intentos automáticos contra el formulario.
 */

const WINDOW_MS = 15 * 60 * 1000 // los intentos viejos se olvidan a los 15 min

/** Ámbito: permite reusar el mismo freno en otros formularios sensibles. */
export type Scope = 'login' | 'password'
const keyOf = (scope: Scope) => `nf_attempts_${scope}`

type State = { fails: number; first: number; until: number }

function read(scope: Scope): State {
  try {
    const raw = localStorage.getItem(keyOf(scope))
    if (!raw) return { fails: 0, first: 0, until: 0 }
    const s = JSON.parse(raw) as State
    // La ventana caducó: se empieza de cero
    if (s.first && Date.now() - s.first > WINDOW_MS && Date.now() > s.until) {
      return { fails: 0, first: 0, until: 0 }
    }
    return s
  } catch {
    return { fails: 0, first: 0, until: 0 }
  }
}

function write(scope: Scope, s: State) {
  try {
    localStorage.setItem(keyOf(scope), JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

/**
 * Espera creciente según los fallos acumulados:
 *   1-2 fallos → sin espera   (errores de dedo normales)
 *   3 fallos   → 15 s
 *   4 fallos   → 30 s
 *   5 fallos   → 1 min
 *   6 fallos   → 2 min
 *   7+ fallos  → 5 min
 */
function penaltyMs(fails: number): number {
  if (fails <= 2) return 0
  if (fails === 3) return 15_000
  if (fails === 4) return 30_000
  if (fails === 5) return 60_000
  if (fails === 6) return 120_000
  return 300_000
}

/** ¿Puede intentar ahora? Si no, cuántos segundos faltan. */
export function loginAllowed(scope: Scope = 'login'): { ok: boolean; retryAfter: number } {
  const s = read(scope)
  const left = s.until - Date.now()
  if (left > 0) return { ok: false, retryAfter: Math.ceil(left / 1000) }
  return { ok: true, retryAfter: 0 }
}

/** Registra un intento fallido y devuelve la espera aplicada (en segundos). */
export function loginFailed(scope: Scope = 'login'): { fails: number; retryAfter: number } {
  const s = read(scope)
  const fails = s.fails + 1
  const first = s.first || Date.now()
  const wait = penaltyMs(fails)
  write(scope, { fails, first, until: Date.now() + wait })
  return { fails, retryAfter: Math.ceil(wait / 1000) }
}

/** Intento correcto: se borra el historial de fallos. */
export function loginSucceeded(scope: Scope = 'login') {
  try {
    localStorage.removeItem(keyOf(scope))
  } catch {
    /* ignore */
  }
}
