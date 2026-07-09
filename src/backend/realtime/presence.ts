/**
 * Presencia en vivo (quién está en línea) usando Supabase Realtime Presence.
 *
 * La presencia DEBE compartir el mismo nombre de "salón" entre clientes (para
 * verse), pero dentro de un mismo cliente solo puede existir UN canal por salón.
 * Por eso usamos un registro con ref-count: varios componentes (ej. el chat
 * flotante + la página de Comunidad) comparten el mismo canal sin chocar.
 */
import { supabase } from '@/backend/supabase'

export type PresenceUser = { id: string; name: string; rank?: string; role?: string }

/* eslint-disable @typescript-eslint/no-explicit-any */
type Entry = {
  channel: any
  callbacks: Set<(users: PresenceUser[]) => void>
}
const registry = new Map<string, Entry>()

function currentUsers(channel: any): PresenceUser[] {
  const state = channel.presenceState() as Record<string, PresenceUser[]>
  const byId = new Map<string, PresenceUser>()
  Object.values(state)
    .flat()
    .forEach((u: any) => {
      if (u?.id) byId.set(u.id, u)
    })
  return Array.from(byId.values())
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Únete a un "salón" de presencia. onSync recibe la lista de usuarios en línea.
 * Devuelve la función para salir.
 */
export function joinPresence(
  room: string,
  me: PresenceUser,
  onSync: (users: PresenceUser[]) => void,
): () => void {
  if (!supabase || !me.id) return () => {}
  const sb = supabase

  let entry = registry.get(room)
  if (entry) {
    // Ya hay un canal para este salón en este cliente: solo agrega el callback.
    entry.callbacks.add(onSync)
    onSync(currentUsers(entry.channel))
  } else {
    const ch = sb.channel(room, { config: { presence: { key: me.id } } })
    const e: Entry = { channel: ch, callbacks: new Set([onSync]) }
    registry.set(room, e)
    ch.on('presence', { event: 'sync' }, () => {
      const users = currentUsers(ch)
      e.callbacks.forEach((cb) => cb(users))
    })
    ch.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') Promise.resolve(ch.track(me)).catch(() => {})
    })
    entry = e
  }

  return () => {
    const e = registry.get(room)
    if (!e) return
    e.callbacks.delete(onSync)
    if (e.callbacks.size === 0) {
      sb.removeChannel(e.channel)
      registry.delete(room)
    }
  }
}
