/**
 * Tablero Kanban por grupo — respaldado por Supabase (con realtime).
 * Columnas: todo / doing / done.
 */
import { supabase } from '@/backend/supabase'
import { onBusChange, notifyBusChange } from '@/backend/realtime/realtimeBus'

const roomKey = (groupId: string) => `kan-${groupId}`

export type KanCol = 'todo' | 'doing' | 'done'

export type KanTask = {
  id: string
  groupId: string
  col: KanCol
  title: string
  assignee?: string
  createdAt: number
}

export const KANBAN_EVENT = 'nf:kanban'

let cache: KanTask[] = []
function dispatch() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(KANBAN_EVENT))
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapRow(row: any): KanTask {
  return {
    id: row.id,
    groupId: row.group_id,
    col: (row.col ?? 'todo') as KanCol,
    title: row.title,
    assignee: row.assignee ?? undefined,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : 0,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function getBoard(groupId: string): KanTask[] {
  return cache.filter((t) => t.groupId === groupId).sort((a, b) => a.createdAt - b.createdAt)
}

export async function loadBoard(groupId: string): Promise<void> {
  if (!supabase) return
  const { data } = await supabase.from('kanban_tasks').select('*').eq('group_id', groupId)
  cache = [...cache.filter((t) => t.groupId !== groupId), ...(data ?? []).map(mapRow)]
  dispatch()
}

export async function addTask(groupId: string, col: KanCol, title: string, assignee?: string): Promise<void> {
  if (!supabase) return
  const text = title.trim()
  if (!text) return
  await supabase.from('kanban_tasks').insert({ group_id: groupId, col, title: text, assignee })
  await loadBoard(groupId)
  notifyBusChange(roomKey(groupId))
}

export async function moveTask(taskId: string, col: KanCol): Promise<void> {
  if (!supabase) return
  const t = cache.find((x) => x.id === taskId)
  await supabase.from('kanban_tasks').update({ col }).eq('id', taskId)
  if (t) {
    await loadBoard(t.groupId)
    notifyBusChange(roomKey(t.groupId))
  }
}

export async function deleteTask(taskId: string): Promise<void> {
  if (!supabase) return
  const t = cache.find((x) => x.id === taskId)
  await supabase.from('kanban_tasks').delete().eq('id', taskId)
  if (t) {
    await loadBoard(t.groupId)
    notifyBusChange(roomKey(t.groupId))
  }
}

/** Suscripción realtime al tablero de un grupo. Devuelve el unsubscribe. */
export function subscribeBoard(groupId: string): () => void {
  if (!supabase) return () => {}
  const sb = supabase
  // Sin 'filter' (descarta UPDATE/DELETE de mover/borrar tarjetas); filtramos al recargar.
  const ch = sb
    .channel(`kan-${groupId}-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'kanban_tasks' },
      (payload) => {
        const row = (payload.new ?? payload.old) as { group_id?: string } | null
        if (row?.group_id && row.group_id !== groupId) return
        loadBoard(groupId)
      },
    )
    .subscribe()
  const offBus = onBusChange(roomKey(groupId), () => loadBoard(groupId))
  return () => {
    sb.removeChannel(ch)
    offBus()
  }
}
