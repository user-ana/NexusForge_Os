/**
 * HISTORIAL DEL ASISTENTE — conversaciones organizadas en SESIONES.
 *
 * Cada charla con el tutor/asistente es una sesión atada a un módulo (y por él a
 * una clase y un parcial). "Reiniciar" ya no borra: archiva la sesión y abre una
 * nueva, así el historial se conserva y se puede volver a leer, clasificado por
 * clase y parcial. Además cada respuesta recuerda si ya se publicó como tarea.
 *
 * Todo es privado de cada usuario (lo garantiza la RLS).
 */
import { supabase } from '@/backend/supabase'
import { getSession } from '@/frontend/session/session'

export type TutorRole = 'student' | 'teacher'

export type TutorMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  published: boolean
}

export type TutorSession = {
  id: string
  moduleId: string
  classId: string | null
  parcial: string
  role: TutorRole
  title: string
  archived: boolean
  createdAt: number
  updatedAt: number
  count: number // nº de mensajes (para la lista de historial)
}

async function currentUid(): Promise<string | undefined> {
  const id = getSession()?.id
  if (id) return id
  if (!supabase) return undefined
  const { data } = await supabase.auth.getUser()
  return data.user?.id
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapSession(row: any, count = 0): TutorSession {
  return {
    id: row.id,
    moduleId: row.module_id,
    classId: row.class_id ?? null,
    parcial: row.parcial ?? '',
    role: row.role === 'teacher' ? 'teacher' : 'student',
    title: row.title ?? '',
    archived: !!row.archived,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : 0,
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : 0,
    count,
  }
}

/**
 * Devuelve la sesión ACTIVA (no archivada) del usuario en este módulo, o crea
 * una nueva si no hay. Es el punto de entrada al abrir el lector.
 */
export async function ensureSession(input: {
  moduleId: string
  classId?: string
  parcial?: string
  role: TutorRole
}): Promise<string | null> {
  if (!supabase) return null
  const uid = await currentUid()
  if (!uid) return null

  const { data: existing } = await supabase
    .from('tutor_sessions')
    .select('id')
    .eq('user_id', uid)
    .eq('module_id', input.moduleId)
    .eq('archived', false)
    .order('updated_at', { ascending: false })
    .limit(1)
  if (existing && existing.length) return existing[0].id

  const { data, error } = await supabase
    .from('tutor_sessions')
    .insert({
      user_id: uid,
      module_id: input.moduleId,
      class_id: input.classId ?? null,
      parcial: input.parcial ?? '',
      role: input.role,
    })
    .select('id')
    .maybeSingle()
  if (error) {
    console.error('ensureSession', error)
    return null
  }
  return data?.id ?? null
}

/** Mensajes de una sesión, en orden. */
export async function loadSessionMessages(sessionId: string): Promise<TutorMessage[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('tutor_messages')
    .select('id, role, content, published')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  return ((data ?? []) as any[]).map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    published: !!m.published,
  }))
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Guarda un mensaje en la sesión y devuelve su id (para poder marcarlo luego). */
export async function saveMessage(
  sessionId: string,
  moduleId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<string | null> {
  if (!supabase) return null
  const uid = await currentUid()
  if (!uid) return null
  const { data, error } = await supabase
    .from('tutor_messages')
    .insert({ session_id: sessionId, module_id: moduleId, user_id: uid, role, content })
    .select('id')
    .maybeSingle()
  if (error) {
    console.error('saveMessage', error)
    return null
  }
  return data?.id ?? null
}

/** Marca una respuesta como ya publicada (tarea). Persiste el "Publicada ✓". */
export async function markPublished(messageId: string): Promise<void> {
  if (!supabase) return
  await supabase.from('tutor_messages').update({ published: true }).eq('id', messageId)
}

/**
 * "Reiniciar": archiva la sesión actual (queda en el historial) y crea una
 * nueva vacía. Devuelve el id de la nueva.
 */
export async function archiveAndNew(
  sessionId: string,
  input: { moduleId: string; classId?: string; parcial?: string; role: TutorRole },
): Promise<string | null> {
  if (!supabase) return null
  await supabase.from('tutor_sessions').update({ archived: true, updated_at: new Date().toISOString() }).eq('id', sessionId)
  const uid = await currentUid()
  if (!uid) return null
  const { data } = await supabase
    .from('tutor_sessions')
    .insert({
      user_id: uid,
      module_id: input.moduleId,
      class_id: input.classId ?? null,
      parcial: input.parcial ?? '',
      role: input.role,
    })
    .select('id')
    .maybeSingle()
  return data?.id ?? null
}

/** Borra una sesión del historial de forma definitiva. */
export async function deleteSession(sessionId: string): Promise<void> {
  if (!supabase) return
  await supabase.from('tutor_sessions').delete().eq('id', sessionId)
}

/**
 * Historial de sesiones del usuario en un módulo (la activa y las archivadas),
 * con su número de mensajes. La más reciente primero.
 */
export async function listSessions(moduleId: string): Promise<TutorSession[]> {
  if (!supabase) return []
  const uid = await currentUid()
  if (!uid) return []
  const { data } = await supabase
    .from('tutor_sessions')
    .select('*')
    .eq('user_id', uid)
    .eq('module_id', moduleId)
    .order('updated_at', { ascending: false })
  const sessions = data ?? []
  if (!sessions.length) return []

  // Conteo de mensajes por sesión (una sola consulta)
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const ids = sessions.map((s: any) => s.id)
  const { data: msgs } = await supabase
    .from('tutor_messages')
    .select('session_id')
    .in('session_id', ids)
  const countBy = new Map<string, number>()
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  ;(msgs ?? []).forEach((m: any) => countBy.set(m.session_id, (countBy.get(m.session_id) ?? 0) + 1))

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return sessions.map((s: any) => mapSession(s, countBy.get(s.id) ?? 0))
}
