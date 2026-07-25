/**
 * APUNTES DEL ESTUDIANTE E HISTORIAL DEL TUTOR.
 *
 * Todo lo de aquí es privado de cada usuario (lo garantiza la RLS): ni el
 * catedrático lo ve. Un alumno que sabe que su profe lee cada duda que
 * preguntó, deja de preguntar.
 *
 * El historial hace que la lección se pueda retomar: al reabrir el módulo, la
 * conversación con el tutor sigue donde quedó.
 */
import { supabase } from '@/backend/supabase'
import { getSession } from '@/frontend/session/session'

export type NoteSource = 'tutor' | 'propio'

export type StudyNote = {
  id: string
  moduleId: string
  classId: string | null
  content: string
  source: NoteSource
  createdAt: number
}

export type TutorMsg = { role: 'user' | 'assistant'; content: string }

export const NOTES_EVENT = 'nf:studynotes'
function dispatch() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(NOTES_EVENT))
}

async function currentUid(): Promise<string | undefined> {
  const id = getSession()?.id
  if (id) return id
  if (!supabase) return undefined
  const { data } = await supabase.auth.getUser()
  return data.user?.id
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapNote(row: any): StudyNote {
  return {
    id: row.id,
    moduleId: row.module_id,
    classId: row.class_id ?? null,
    content: row.content ?? '',
    source: row.source === 'tutor' ? 'tutor' : 'propio',
    createdAt: row.created_at ? new Date(row.created_at).getTime() : 0,
  }
}

/** Mis apuntes de un módulo (los más recientes primero). */
export async function loadNotes(moduleId: string): Promise<StudyNote[]> {
  if (!supabase) return []
  const uid = await currentUid()
  if (!uid) return []
  const { data } = await supabase
    .from('study_notes')
    .select('*')
    .eq('module_id', moduleId)
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
  return (data ?? []).map(mapNote)
}

/** TODOS mis apuntes (para la vista "Mis apuntes", de todas las clases). */
export async function loadAllNotes(): Promise<StudyNote[]> {
  if (!supabase) return []
  const uid = await currentUid()
  if (!uid) return []
  const { data } = await supabase
    .from('study_notes')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
  return (data ?? []).map(mapNote)
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Guarda un apunte (escrito por el alumno o rescatado del tutor). */
export async function addNote(input: {
  moduleId: string
  classId?: string
  content: string
  source?: NoteSource
}): Promise<boolean> {
  if (!supabase) return false
  const uid = await currentUid()
  if (!uid) return false
  const content = input.content.trim()
  if (!content) return false
  // Red de seguridad contra duplicados: si ya existe el mismo apunte en este
  // módulo, no se vuelve a insertar (el clic repetido en "Guardar" no acumula).
  const { data: dup } = await supabase
    .from('study_notes')
    .select('id')
    .eq('user_id', uid)
    .eq('module_id', input.moduleId)
    .eq('content', content)
    .limit(1)
  if (dup && dup.length) {
    dispatch()
    return true
  }
  const { error } = await supabase.from('study_notes').insert({
    user_id: uid,
    module_id: input.moduleId,
    class_id: input.classId ?? null,
    content,
    source: input.source ?? 'propio',
  })
  if (error) {
    console.error('addNote', error)
    return false
  }
  dispatch()
  return true
}

export async function deleteNote(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('study_notes').delete().eq('id', id)
  dispatch()
}

/**
 * Historial de la conversación con el tutor en este módulo.
 * Se acota a los últimos mensajes: es para retomar, no un archivo infinito.
 */
export async function loadTutorHistory(moduleId: string, limit = 40): Promise<TutorMsg[]> {
  if (!supabase) return []
  const uid = await currentUid()
  if (!uid) return []
  const { data } = await supabase
    .from('tutor_messages')
    .select('role, content')
    .eq('module_id', moduleId)
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(limit)
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return ((data ?? []) as any[]).reverse().map((m) => ({ role: m.role, content: m.content }))
}

/** Guarda un turno de la conversación (no bloquea la UI si falla). */
export async function saveTutorMsg(moduleId: string, msg: TutorMsg): Promise<void> {
  if (!supabase) return
  const uid = await currentUid()
  if (!uid) return
  await supabase.from('tutor_messages').insert({
    user_id: uid,
    module_id: moduleId,
    role: msg.role,
    content: msg.content,
  })
}

/** Borra mi conversación con el tutor en este módulo (empezar de cero). */
export async function clearTutorHistory(moduleId: string): Promise<void> {
  if (!supabase) return
  const uid = await currentUid()
  if (!uid) return
  await supabase.from('tutor_messages').delete().eq('module_id', moduleId).eq('user_id', uid)
}
