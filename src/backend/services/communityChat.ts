/**
 * Chat de la COMUNIDAD (global) — respaldado por Supabase, con realtime.
 * Canales: community / soft / civil / mech / group / class …
 */
import { supabase } from '@/backend/supabase'
import { onBusChange, notifyBusChange } from '@/backend/realtime/realtimeBus'

const roomKey = (channel: string) => `comm-${channel}`

export type CommMsg = {
  id: string
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

export function getMessages(channel: string): CommMsg[] {
  return cache.filter((m) => m.channel === channel).sort((a, b) => a.ts - b.ts)
}

export async function loadMessages(channel: string): Promise<void> {
  if (!supabase) return
  const { data } = await supabase
    .from('community_messages')
    .select('*')
    .eq('channel', channel)
    .order('created_at', { ascending: true })
    .limit(200)
  cache = [...cache.filter((m) => m.channel !== channel), ...(data ?? []).map(mapRow)]
  dispatch()
}

export async function sendMessage(input: {
  channel: string
  author: string
  name: string
  role?: string
  rank?: string
  avatar?: string
  text: string
}): Promise<void> {
  if (!supabase) return
  const body = input.text.trim()
  if (!body) return
  await supabase.from('community_messages').insert({
    channel: input.channel,
    author_id: input.author,
    author_name: input.name,
    author_role: input.role,
    rank: input.rank,
    avatar: input.avatar,
    body,
  })
  await loadMessages(input.channel)
  notifyBusChange(roomKey(input.channel))
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
    notifyBusChange(roomKey(m.channel))
  }
}

/** Elimina un mensaje propio de comunidad. */
export async function deleteMessage(id: string): Promise<void> {
  if (!supabase) return
  const m = cache.find((x) => x.id === id)
  await supabase.from('community_messages').delete().eq('id', id)
  cache = cache.filter((x) => x.id !== id)
  dispatch()
  if (m) notifyBusChange(roomKey(m.channel))
}

/** Realtime de un canal de comunidad (INSERT/UPDATE/DELETE). */
export function subscribeMessages(channel: string): () => void {
  if (!supabase) return () => {}
  const sb = supabase
  // Sin 'filter': los filtros de postgres_changes descartan UPDATE/DELETE.
  // Filtramos del lado del cliente recargando solo este canal (RLS aplica igual).
  const ch = sb
    .channel(`comm-${channel}-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'community_messages' },
      (payload) => {
        const row = (payload.new ?? payload.old) as { channel?: string } | null
        if (row?.channel && row.channel !== channel) return
        loadMessages(channel)
      },
    )
    .subscribe()
  // Broadcast: garantiza editar/borrar (postgres_changes solo trae INSERT aquí)
  const offBus = onBusChange(roomKey(channel), () => loadMessages(channel))
  return () => {
    sb.removeChannel(ch)
    offBus()
  }
}
