/**
 * Indicador de "escribiendo…" en vivo usando Supabase Realtime Broadcast.
 * No usa tabla: los eventos viajan por el canal en tiempo real.
 */
import { supabase } from '@/backend/supabase'

export type TypingHandle = {
  notify: () => void // llámalo al escribir
  stop: () => void // sal del canal
}

/**
 * Únete a un canal de "escribiendo". onTyping recibe los nombres de quienes
 * están escribiendo ahora (sin contarte a ti).
 */
export function joinTyping(
  room: string,
  me: { id: string; name: string },
  onTyping: (names: string[]) => void,
): TypingHandle {
  if (!supabase || !me.id) return { notify: () => {}, stop: () => {} }
  const sb = supabase
  const ch = sb.channel(`typing-${room}`)

  // nombre -> momento del último "typing" (para expirar a ~3s)
  const active = new Map<string, number>()
  let timer: ReturnType<typeof setInterval> | null = null

  const emit = () => {
    const now = Date.now()
    const names: string[] = []
    active.forEach((ts, name) => {
      if (now - ts < 3000) names.push(name)
      else active.delete(name)
    })
    onTyping(names)
  }

  ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
    const p = payload as { id: string; name: string }
    if (!p?.id || p.id === me.id) return
    active.set(p.name, Date.now())
    emit()
  })
  ch.subscribe()

  // revisa cada segundo para expirar los que dejaron de escribir
  timer = setInterval(emit, 1000)

  let last = 0
  const notify = () => {
    const now = Date.now()
    if (now - last < 1200) return // throttle
    last = now
    Promise.resolve(ch.send({ type: 'broadcast', event: 'typing', payload: { id: me.id, name: me.name } })).catch(() => {})
  }

  const stop = () => {
    if (timer) clearInterval(timer)
    sb.removeChannel(ch)
  }

  return { notify, stop }
}
