/**
 * Chat de COMUNIDAD — respaldado por Supabase, con realtime.
 *
 * ALCANCE: la comunidad NO es global de la universidad. Cada catedrático
 * tiene la suya, y se identifica por `teacherId`:
 *   - el catedrático ve/escribe en la propia,
 *   - el estudiante ve la de los catedráticos de sus clases,
 *   - quien entra por primera vez la encuentra vacía.
 * La base lo garantiza con RLS (ver supabase/community_por_catedratico.sql);
 * aquí solo se filtra y se etiqueta cada mensaje con su ecosistema.
 */
import { supabase } from '@/backend/supabase'
import { onBusChange, notifyBusChange } from '@/backend/realtime/realtimeBus'

const roomKey = (teacherId: string, channel: string) => `comm-${teacherId}-${channel}`

export type CommMsg = {
  id: string
  teacherId: string
  channel: string
  author: string // uuid
  name: string
  role?: string
  rank?: string
  avatar?: string
  text: string
  edited?: boolean
  ts: number
}

export const COMMCHAT_EVENT = 'nf:commchat'

let cache: CommMsg[] = []
function dispatch() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(COMMCHAT_EVENT))
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapRow(row: any): CommMsg {
  return {
    id: row.id,
    teacherId: row.teacher_id ?? '',
    channel: row.channel,
    author: row.author_id,
    name: row.author_name ?? 'Usuario',
    role: row.author_role ?? undefined,
    rank: row.rank ?? undefined,
    avatar: row.avatar ?? undefined,
    text: row.body,
    edited: row.edited ?? false,
    ts: row.created_at ? new Date(row.created_at).getTime() : 0,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const same = (m: CommMsg, teacherId: string, channel: string) =>
  m.teacherId === teacherId && m.channel === channel

export function getMessages(teacherId: string, channel: string): CommMsg[] {
  return cache.filter((m) => same(m, teacherId, channel)).sort((a, b) => a.ts - b.ts)
}

export async function loadMessages(teacherId: string, channel: string): Promise<void> {
  if (!supabase || !teacherId) return
  const { data } = await supabase
    .from('community_messages')
    .select('*')
    .eq('teacher_id', teacherId)
    .eq('channel', channel)
    .order('created_at', { ascending: true })
    .limit(200)
  cache = [...cache.filter((m) => !same(m, teacherId, channel)), ...(data ?? []).map(mapRow)]
  dispatch()
}

export async function sendMessage(input: {
  teacherId: string
  channel: string
  author: string
  name: string
  role?: string
  rank?: string
  avatar?: string
  text: string
}): Promise<void> {
  if (!supabase || !input.teacherId) return
  const body = input.text.trim()
  if (!body) return
  await supabase.from('community_messages').insert({
    teacher_id: input.teacherId,
    channel: input.channel,
    author_id: input.author,
    author_name: input.name,
    author_role: input.role,
    rank: input.rank,
    avatar: input.avatar,
    body,
  })
  await loadMessages(input.teacherId, input.channel)
  notifyBusChange(roomKey(input.teacherId, input.channel))
}

/** Edita un mensaje propio de comunidad. */
export async function editMessage(id: string, text: string): Promise<void> {
  if (!supabase) return
  const body = text.trim()
  if (!body) return
  const { error } = await supabase.from('community_messages').update({ body, edited: true }).eq('id', id)
  if (error) return
  const m = cache.find((x) => x.id === id)
  if (m) {
    m.text = body
    m.edited = true
    dispatch()
    notifyBusChange(roomKey(m.teacherId, m.channel))
  }
}

/** Elimina un mensaje propio de comunidad. */
export async function deleteMessage(id: string): Promise<void> {
  if (!supabase) return
  const m = cache.find((x) => x.id === id)
  await supabase.from('community_messages').delete().eq('id', id)
  cache = cache.filter((x) => x.id !== id)
  dispatch()
  if (m) notifyBusChange(roomKey(m.teacherId, m.channel))
}

/** Realtime de una comunidad (INSERT/UPDATE/DELETE). */
export function subscribeMessages(teacherId: string, channel: string): () => void {
  if (!supabase || !teacherId) return () => {}
  const sb = supabase
  // Sin 'filter': los filtros de postgres_changes descartan UPDATE/DELETE.
  // Filtramos del lado del cliente recargando solo esta comunidad (RLS aplica igual).
  const ch = sb
    .channel(`comm-${teacherId}-${channel}-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'community_messages' },
      (payload) => {
        const row = (payload.new ?? payload.old) as { channel?: string; teacher_id?: string } | null
        if (row?.channel && row.channel !== channel) return
        if (row?.teacher_id && row.teacher_id !== teacherId) return
        loadMessages(teacherId, channel)
      },
    )
    .subscribe()
  const offBus = onBusChange(roomKey(teacherId, channel), () => loadMessages(teacherId, channel))
  return () => {
    sb.removeChannel(ch)
    offBus()
  }
}
