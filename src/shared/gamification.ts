/**
 * Reglas de gamificación (compartidas front/back).
 * El nivel y el rango se DERIVAN del XP real; no se guardan aparte.
 */

export type RankKey = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'

export const RANKS: { key: RankKey; label: string; minLevel: number }[] = [
  { key: 'bronze', label: 'Bronze', minLevel: 1 },
  { key: 'silver', label: 'Silver', minLevel: 5 },
  { key: 'gold', label: 'Gold', minLevel: 10 },
  { key: 'platinum', label: 'Platinum', minLevel: 18 },
  { key: 'diamond', label: 'Diamond', minLevel: 30 },
]

/** Valores iniciales de un estudiante nuevo (nada de datos inflados). */
export const START_COINS = 0
export const START_XP = 0

/**
 * Nivel a partir del XP acumulado. Cada nivel cuesta un poco más que el anterior
 * (curva suave). Devuelve el nivel, cuánto XP llevas dentro del nivel y cuánto falta.
 */
export function levelFromXp(xp: number): { level: number; into: number; needed: number; pct: number } {
  const x = Math.max(0, Math.floor(xp || 0))
  let level = 1
  let need = 500 // XP para pasar del nivel 1 al 2
  let acc = 0
  while (x >= acc + need) {
    acc += need
    level++
    need = Math.round(need * 1.35) // cada nivel pide ~35% más
  }
  const into = x - acc
  const pct = Math.min(100, Math.round((into / need) * 100))
  return { level, into, needed: need, pct }
}

/** Índice del rango actual (0..4) según el nivel. */
export function rankIndexFromLevel(level: number): number {
  let idx = 0
  for (let i = 0; i < RANKS.length; i++) if (level >= RANKS[i].minLevel) idx = i
  return idx
}

/** Rango actual a partir del XP. */
export function rankFromXp(xp: number): { key: RankKey; label: string; index: number; level: number } {
  const { level } = levelFromXp(xp)
  const index = rankIndexFromLevel(level)
  const r = RANKS[index]
  return { key: r.key, label: r.label, index, level }
}

/** XP que falta para el siguiente rango (0 si ya está en el máximo). */
export function xpToNextRank(xp: number): { nextLabel: string | null; remaining: number } {
  const { level } = levelFromXp(xp)
  const idx = rankIndexFromLevel(level)
  const next = RANKS[idx + 1]
  if (!next) return { nextLabel: null, remaining: 0 }
  // XP acumulado necesario para alcanzar el minLevel del siguiente rango
  let need = 500
  let acc = 0
  for (let lvl = 1; lvl < next.minLevel; lvl++) {
    acc += need
    need = Math.round(need * 1.35)
  }
  return { nextLabel: next.label, remaining: Math.max(0, acc - Math.floor(xp || 0)) }
}
