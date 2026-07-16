/**
 * Puente entre la tabla real (student_stats) y la sesión local.
 * Las páginas llaman a estas funciones; si la tabla existe, todo persiste y es
 * real; si aún no se ha corrido el SQL, cae limpio a los valores locales.
 */
import { getSession, patchSession, addReward } from './session'
import { loadStudentStats, addRewardRemote, recordSpinRemote } from '@/backend/services/gamification'
import { loadClasses, getClasses } from '@/backend/services/classes'
import { loadGroups, groupOf } from '@/backend/services/classGroups'

/** Carga las stats reales del estudiante y las refleja en la sesión. */
export async function syncStudentStats(): Promise<void> {
  const s = getSession()
  if (!s || s.role === 'teacher' || !s.id) return
  const stats = await loadStudentStats(s.id)
  if (stats) patchSession({ coins: stats.coins, xp: stats.xp, streak: stats.streak, lastSpin: stats.lastSpin })
}

/** Suma una recompensa: persiste en la tabla si existe; si no, queda local. */
export async function earnReward(coins: number, xp: number): Promise<void> {
  const s = getSession()
  if (s?.id && s.role !== 'teacher') {
    const stats = await addRewardRemote(s.id, coins, xp)
    if (stats) {
      patchSession({ coins: stats.coins, xp: stats.xp })
      return
    }
  }
  addReward(coins, xp) // fallback local (sin tabla)
}

/**
 * Detecta el grupo REAL del estudiante (en cualquiera de sus clases) y lo refleja
 * en la sesión, para que la barra muestre su escuadrón en vez de "Sin grupo".
 */
export async function syncStudentGroup(): Promise<void> {
  const s = getSession()
  if (!s || s.role === 'teacher' || !s.id) return
  await loadClasses()
  let name: string | undefined
  for (const c of getClasses()) {
    await loadGroups(c.id)
    const g = groupOf(c.id, s.id)
    if (g) {
      name = g.name
      break
    }
  }
  patchSession({ group: name }) // undefined = sin grupo (limpia el anterior)
}

/** Registra el giro de la ruleta (local siempre; remoto si hay tabla). */
export function recordSpin(): void {
  const s = getSession()
  patchSession({ lastSpin: Date.now() })
  if (s?.id && s.role !== 'teacher') void recordSpinRemote(s.id)
}
