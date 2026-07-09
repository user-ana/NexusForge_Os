/**
 * Chat del aula por canal — respaldado por Supabase (con realtime).
 * Canales: 'general' o 'g:<groupId>'.
 */
import { supabase } from '@/backend/supabase'
import type { Role } from '@/frontend/session/session'
import { onBusChange, notifyBusChange } from '@/backend/realtime/realtimeBus'

const roomKey = (classId: string, channel: string) => `aula-${classId}-${channel}`

export type AulaMsg = {
  id: string
  classId: string
  channel: string
  author: string // uuid
  name: string
  role: Role
  avatar?: string
  text: string
  edited?: boolean
  ts: number
}

export const AULACHAT_EVENT = 'nf:aulachat'

let cache: AulaMsg[] = []
function dispatch() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(AULACHAT_EVENT))
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapRow(row: any): AulaMsg {
  return {
    id: row.id,
    classId: row.class_id,
    channel: row.channel,
    author: row.author_id,
    name: row.author_name ?? 'Usuario',
    role: (row.author_role ?? 'student') as Role,
    avatar: row.avatar ?? undefined,
    text: row.body,
    edited: row.edited ?? false,
    ts: row.created_at ? new Date(row.created_at).getTime() : 0,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function getMessages(classId: string, channel: string): AulaMsg[] {
  return cache.filter((m) => m.classId === classId && m.channel === channel).sort((a, b) => a.ts - b.ts)
}

export async function loadMessages(classId: string, channel: string): Promise<void> {
  if (!supabase) return
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('class_id', classId)
    .eq('channel', channel)
    .order('created_at', { ascending: true })
    .limit(300)
  cache = [
    ...cache.filter((m) => !(m.classId === classId && m.channel === channel)),
    ...(data ?? []).map(mapRow),
  ]
  dispatch()
}

export async function sendMessage(input: {
  classId: string
  channel: string
  author: string
  name: string
  role: Role
  avatar?: string
  text: string
}): Promise<void> {
  if (!supabase) return
  const body = input.text.trim()
  if (!body) return
  await supabase.from('messages').insert({
    class_id: input.classId,
    channel: input.channel,
    author_id: input.author,
    author_name: input.name,
    author_role: input.role,
    avatar: input.avatar,
    body,
  })
  await loadMessages(input.classId, input.channel)
  notifyBusChange(roomKey(input.classId, input.channel))
}

/** Edita el texto de un mensaje propio. */
export async function editMessage(id: string, text: string): Promise<void> {
  if (!supabase) return
  const body = text.trim()
  if (!body) return
  const { error } = await supabase.from('messages').update({ body, edited: true }).eq('id', id)
  if (error) return
  const m = cache.find((x) => x.id === id)
  if (m) {
    m.text = body
    m.edited = true
    dispatch()
    notifyBusChange(roomKey(m.classId, m.channel))
  }
}

/** Elimina un mensaje propio. */
export async function deleteMessage(id: string): Promise<void> {
  if (!supabase) return
  const m = cache.find((x) => x.id === id)
  await supabase.from('messages').delete().eq('id', id)
  cache = cache.filter((x) => x.id !== id)
  dispatch()
  if (m) notifyBusChange(roomKey(m.classId, m.channel))
}

/** Realtime de un canal (INSERT/UPDATE/DELETE). Devuelve el unsubscribe. */
export function subscribeMessages(classId: string, channel: string): () => void {
  if (!supabase) return () => {}
  const sb = supabase
  // Sin 'filter': los filtros de postgres_changes descartan UPDATE/DELETE.
  // Filtramos del lado del cliente recargando solo este canal (RLS aplica igual).
  const ch = sb
    .channel(`msg-${classId}-${channel}-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'messages' },
      (payload) => {
        const row = (payload.new ?? payload.old) as { class_id?: string } | null
        if (row?.class_id && row.class_id !== classId) return
        loadMessages(classId, channel)
      },
    )
    .subscribe()
  // Broadcast: garantiza editar/borrar (postgres_changes solo trae INSERT aquí)
  const offBus = onBusChange(roomKey(classId, channel), () => loadMessages(classId, channel))
  return () => {
    sb.removeChannel(ch)
    offBus()
  }
}
