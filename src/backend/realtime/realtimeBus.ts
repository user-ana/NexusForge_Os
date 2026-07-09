/**
 * Bus de sincronización por "sala" usando Supabase Realtime **Broadcast**.
 *
 * postgres_changes entrega INSERT pero en este proyecto NO entrega UPDATE/DELETE
 * de forma fiable (depende de WAL / replica identity / config del servicio).
 * Broadcast es pub/sub puro: cuando alguien cambia algo (enviar/editar/borrar)
 * llama a notifyChange(sala) y todos los demás reciben el aviso y recargan.
 *
 * Un solo canal por sala, compartido entre emisor y receptores (ref-count).
 */
import { supabase } from '@/backend/supabase'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Entry = { channel: any; subs: Set<() => void> }
const rooms = new Map<string, Entry>()

function getRoom(room: string): Entry | null {
  if (!supabase) return null
  let e = rooms.get(room)
  if (!e) {
    // self:false → el emisor no recibe su propio aviso (ya recargó localmente)
    const ch = supabase.channel(`bus-${room}`, { config: { broadcast: { self: false } } })
    const entry: Entry = { channel: ch, subs: new Set() }
    ch.on('broadcast', { event: 'changed' }, () => {
      entry.subs.forEach((cb) => cb())
    })
    ch.subscribe()
    rooms.set(room, entry)
    e = entry
  }
  return e
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Escucha cambios en una sala. Devuelve la función para dejar de escuchar. */
export function onBusChange(room: string, cb: () => void): () => void {
  const e = getRoom(room)
  if (!e) return () => {}
  e.subs.add(cb)
  return () => {
    e.subs.delete(cb)
    if (e.subs.size === 0 && supabase) {
      supabase.removeChannel(e.channel)
      rooms.delete(room)
    }
  }
}

/** Avisa a los demás que algo cambió en la sala (recarguen). */
export function notifyBusChange(room: string): void {
  const e = getRoom(room)
  if (!e) return
  Promise.resolve(
    e.channel.send({ type: 'broadcast', event: 'changed', payload: {} }),
  ).catch(() => {})
}
