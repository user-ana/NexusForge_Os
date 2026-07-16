/**
 * Gamificación REAL del estudiante, respaldada por Supabase (tabla student_stats).
 * Monedas, XP, racha y último giro persistentes; leaderboard real del aula.
 *
 * Todo es tolerante a fallos: si la tabla aún no existe (no se ha corrido el SQL)
 * las funciones devuelven null y la app sigue con los valores locales de la sesión.
 */
import { supabase } from '@/backend/supabase'

export type StudentStats = { coins: number; xp: number; streak: number; lastSpin?: number }
export type BoardRow = { id: string; name: string; coins: number }

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Carga las stats del estudiante (crea la fila la primera vez). null = tabla ausente. */
export async function loadStudentStats(studentId: string): Promise<StudentStats | null> {
  if (!supabase || !studentId) return null
  const { data, error } = await supabase
    .from('student_stats')
    .select('coins, xp, streak, last_spin_at')
    .eq('student_id', studentId)
    .maybeSingle()
  if (error) return null // tabla ausente o RLS → no tocar la sesión local
  if (!data) {
    await supabase.from('student_stats').insert({ student_id: studentId })
    return { coins: 0, xp: 0, streak: 0 }
  }
  return {
    coins: data.coins ?? 0,
    xp: data.xp ?? 0,
    streak: data.streak ?? 0,
    lastSpin: data.last_spin_at ? new Date(data.last_spin_at).getTime() : undefined,
  }
}

/** Suma monedas/XP de forma persistente. null = no se pudo (tabla ausente). */
export async function addRewardRemote(studentId: string, coins: number, xp: number): Promise<StudentStats | null> {
  const cur = await loadStudentStats(studentId)
  if (!cur || !supabase) return null
  const next = { coins: cur.coins + coins, xp: cur.xp + xp }
  const { error } = await supabase
    .from('student_stats')
    .upsert({ student_id: studentId, coins: next.coins, xp: next.xp, updated_at: new Date().toISOString() }, { onConflict: 'student_id' })
  if (error) return null
  return { ...cur, ...next }
}

/** Registra el giro de la ruleta (para el límite diario). */
export async function recordSpinRemote(studentId: string): Promise<void> {
  if (!supabase || !studentId) return
  await supabase
    .from('student_stats')
    .upsert({ student_id: studentId, last_spin_at: new Date().toISOString() }, { onConflict: 'student_id' })
}

/** Leaderboard REAL: estudiantes de una clase ordenados por monedas. */
export async function getClassLeaderboard(classId: string): Promise<BoardRow[]> {
  if (!supabase || !classId) return []
  const { data: enr } = await supabase.from('enrollments').select('student_id').eq('class_id', classId)
  const ids = Array.from(new Set((enr ?? []).map((e: any) => e.student_id)))
  if (!ids.length) return []
  const [{ data: profs }, { data: stats }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, username').in('id', ids),
    supabase.from('student_stats').select('student_id, coins').in('student_id', ids),
  ])
  const coinsById = new Map<string, number>((stats ?? []).map((s: any) => [s.student_id, s.coins ?? 0]))
  const nameById = new Map<string, string>((profs ?? []).map((p: any) => [p.id, p.full_name || p.username || 'Estudiante']))
  return ids
    .map((id: string) => ({ id, name: nameById.get(id) ?? 'Estudiante', coins: coinsById.get(id) ?? 0 }))
    .sort((a, b) => b.coins - a.coins)
}
/* eslint-enable @typescript-eslint/no-explicit-any */
