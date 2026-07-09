/**
 * Evaluación del catedrático sobre la entrega de cada grupo — respaldada por Supabase, con realtime.
 * Un registro por grupo: puntos por criterio de la rúbrica, nota total, feedback y quién evaluó.
 * Solo el catedrático puede escribir (lo impone el RLS `ge_write`); los integrantes solo leen la suya.
 */
import { supabase } from '@/backend/supabase'
import { onBusChange, notifyBusChange } from '@/backend/realtime/realtimeBus'

export type Evaluation = {
  groupId: string
  scores: Record<string, number> // índice de criterio -> puntos otorgados
  feedback: string
  grade: number | null // suma de puntos otorgados
  maxPoints: number | null // total posible de la rúbrica al evaluar
  gradedByName: string
  gradedAt: string | null
}

export const GEVAL_EVENT = 'nf:geval'

const roomKey = (groupId: string) => `ge-${groupId}`

let cache: Record<string, Evaluation> = {}
function dispatch() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(GEVAL_EVENT))
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapRow(row: any): Evaluation {
  return {
    groupId: row.group_id,
    scores: (row.scores ?? {}) as Record<string, number>,
    feedback: row.feedback ?? '',
    grade: row.grade ?? null,
    maxPoints: row.max_points ?? null,
    gradedByName: row.graded_by_name ?? '',
    gradedAt: row.graded_at ?? null,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const empty = (groupId: string): Evaluation => ({
  groupId,
  scores: {},
  feedback: '',
  grade: null,
  maxPoints: null,
  gradedByName: '',
  gradedAt: null,
})

export function getEvaluation(groupId: string): Evaluation {
  return cache[groupId] ?? empty(groupId)
}

/** ¿Ya fue evaluada? (tiene fecha de calificación) */
export function isGraded(ev: Evaluation): boolean {
  return !!ev.gradedAt
}

export async function loadEvaluation(groupId: string): Promise<void> {
  if (!supabase) return
  const { data } = await supabase.from('group_evaluations').select('*').eq('group_id', groupId).maybeSingle()
  cache = { ...cache, [groupId]: data ? mapRow(data) : empty(groupId) }
  dispatch()
}

export async function saveEvaluation(
  groupId: string,
  patch: {
    scores: Record<string, number>
    feedback: string
    maxPoints: number
    gradedByName: string
  },
): Promise<void> {
  if (!supabase) return
  const grade = Object.values(patch.scores).reduce((a, n) => a + (Number(n) || 0), 0)
  const gradedAt = new Date().toISOString()
  const next: Evaluation = {
    groupId,
    scores: patch.scores,
    feedback: patch.feedback,
    grade,
    maxPoints: patch.maxPoints,
    gradedByName: patch.gradedByName,
    gradedAt,
  }
  // upsert (crea el registro la primera vez, luego lo actualiza)
  await supabase.from('group_evaluations').upsert(
    {
      group_id: groupId,
      scores: next.scores,
      feedback: next.feedback,
      grade: next.grade,
      max_points: next.maxPoints,
      graded_by_name: next.gradedByName,
      graded_at: gradedAt,
      updated_at: gradedAt,
    },
    { onConflict: 'group_id' },
  )
  cache = { ...cache, [groupId]: next }
  dispatch()
  notifyBusChange(roomKey(groupId))
}

/** Realtime de la evaluación de un grupo. Devuelve el unsubscribe. */
export function subscribeEvaluation(groupId: string): () => void {
  if (!supabase) return () => {}
  const sb = supabase
  const ch = sb
    .channel(`geval-${groupId}-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'group_evaluations' },
      (payload) => {
        const row = (payload.new ?? payload.old) as { group_id?: string } | null
        if (row?.group_id && row.group_id !== groupId) return
        loadEvaluation(groupId)
      },
    )
    .subscribe()
  const offBus = onBusChange(roomKey(groupId), () => loadEvaluation(groupId))
  return () => {
    sb.removeChannel(ch)
    offBus()
  }
}
