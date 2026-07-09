/**
 * Caché de perfiles (id → nombre/foto/rol) para mostrar datos EN VIVO en el chat
 * y listas. Si alguien cambia su foto o nombre, se refleja en todos lados
 * (realtime sobre la tabla profiles), sin quedar congelado en cada mensaje.
 */
import { supabase } from '@/backend/supabase'

export type ProfileLite = { id: string; name: string; avatar?: string; role?: string }

const cache: Record<string, ProfileLite> = {}
export const PROFILES_EVENT = 'nf:profiles'

function dispatch() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PROFILES_EVENT))
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function nameOf(p: any): string {
  return p.full_name || p.username || p.email || 'Usuario'
}
function put(p: any) {
  cache[p.id] = { id: p.id, name: nameOf(p), avatar: p.avatar ?? undefined, role: p.role ?? undefined }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function getProfile(id?: string): ProfileLite | undefined {
  return id ? cache[id] : undefined
}

/** Carga (o refresca) los perfiles de los ids dados. */
export async function loadProfiles(ids: (string | undefined)[]): Promise<void> {
  if (!supabase) return
  const list = Array.from(new Set(ids.filter(Boolean) as string[]))
  if (!list.length) return
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, username, email, avatar, role')
    .in('id', list)
  ;(data ?? []).forEach(put)
  dispatch()
}

/** Realtime: cuando alguien actualiza su perfil, refresca la caché. */
export function subscribeProfiles(): () => void {
  if (!supabase) return () => {}
  const sb = supabase
  const ch = sb
    .channel(`profiles-rt-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
      put(payload.new)
      dispatch()
    })
    .subscribe()
  return () => {
    sb.removeChannel(ch)
  }
}
