/**
 * Bandeja de notificaciones del usuario (la campanita).
 * Respaldada por Supabase con realtime: llegan en vivo sin recargar.
 *
 * Las notificaciones NO se insertan desde aquí: las crea el servidor
 * (la función create_class_task) para que nadie pueda notificar a otro.
 */
import { supabase } from '@/backend/supabase'
import { getSession } from '@/frontend/session/session'

export type Notif = {
  id: string
  type: string // task_new | task_due | graded | info
  title: string
  body: string
  link: string
  classId?: string
  read: boolean
  ts: number
}

export const NOTIF_EVENT = 'nf:notifs'

let cache: Notif[] = []
function dispatch() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(NOTIF_EVENT))
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapRow(row: any): Notif {
  return {
    id: row.id,
    type: row.type ?? 'info',
    title: row.title ?? '',
    body: row.body ?? '',
    link: row.link ?? '',
    classId: row.class_id ?? undefined,
    read: !!row.read,
    ts: row.created_at ? new Date(row.created_at).getTime() : 0,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function currentUid(): Promise<string | undefined> {
  const id = getSession()?.id
  if (id) return id
  if (!supabase) return undefined
  const { data } = await supabase.auth.getUser()
  return data.user?.id
}

export function getNotifications(): Notif[] {
  return cache
}
export function unreadCount(): number {
  return cache.filter((n) => !n.read).length
}

export async function loadNotifications(): Promise<void> {
  if (!supabase) return
  const uid = await currentUid()
  if (!uid) return
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(50)
  cache = (data ?? []).map(mapRow)
  dispatch()
}

/** Marca una notificación como leída. */
export async function markRead(id: string): Promise<void> {
  if (!supabase) return
  const n = cache.find((x) => x.id === id)
  if (!n || n.read) return
  n.read = true
  dispatch()
  await supabase.from('notifications').update({ read: true }).eq('id', id)
}

/** Marca TODAS mis notificaciones como leídas (una sola llamada al servidor). */
export async function markAllRead(): Promise<void> {
  if (!supabase) return
  cache.forEach((n) => (n.read = true))
  dispatch()
  await supabase.rpc('mark_all_notifications_read')
}

/** Borra una notificación. */
export async function removeNotification(id: string): Promise<void> {
  if (!supabase) return
  cache = cache.filter((x) => x.id !== id)
  dispatch()
  await supabase.from('notifications').delete().eq('id', id)
}

/** Realtime: recarga la bandeja ante cualquier cambio de MIS notificaciones. */
export function subscribeNotifications(): () => void {
  if (!supabase) return () => {}
  const sb = supabase
  let uid: string | undefined
  const ch = sb.channel(`notifs-${Math.random().toString(36).slice(2)}`)
  currentUid().then((id) => {
    uid = id
    if (!uid) return
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
      () => loadNotifications(),
    ).subscribe()
  })
  return () => {
    sb.removeChannel(ch)
  }
}
