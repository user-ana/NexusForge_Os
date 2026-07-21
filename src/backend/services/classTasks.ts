/**
 * Tareas de CLASE (para todos los alumnos, no por grupo) + entregas.
 * Respaldado por Supabase con realtime.
 *
 *  - El catedrático publica con createClassTask() -> función del servidor que
 *    crea la tarea y notifica a cada alumno inscrito.
 *  - El estudiante marca su entrega con submitTask(). Sin fila de entrega = pendiente.
 */
import { supabase } from '@/backend/supabase'
import { getSession } from '@/frontend/session/session'

export type ClassTask = {
  id: string
  classId: string
  title: string
  description: string
  parcial: string
  linkUrl: string
  pdfUrl: string
  dueDate: number | null // epoch ms, o null si no tiene fecha límite
  createdByName: string
  createdAt: number
}

export type TaskState = 'pending' | 'submitted' | 'overdue'

export type MyTask = ClassTask & {
  className: string
  state: TaskState
  submittedAt: number | null
  myNote: string
  myLink: string
}

export type Submission = {
  taskId: string
  studentId: string
  note: string
  linkUrl: string
  submittedAt: number
}

export const CLASSTASKS_EVENT = 'nf:classtasks'
function dispatch() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CLASSTASKS_EVENT))
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapTask(row: any): ClassTask {
  return {
    id: row.id,
    classId: row.class_id,
    title: row.title,
    description: row.description ?? '',
    parcial: row.parcial ?? '',
    linkUrl: row.link_url ?? '',
    pdfUrl: row.pdf_url ?? '',
    dueDate: row.due_date ? new Date(row.due_date).getTime() : null,
    createdByName: row.created_by_name ?? '',
    createdAt: row.created_at ? new Date(row.created_at).getTime() : 0,
  }
}

function stateOf(dueDate: number | null, submitted: boolean): TaskState {
  if (submitted) return 'submitted'
  if (dueDate != null && Date.now() > dueDate) return 'overdue'
  return 'pending'
}

async function currentUid(): Promise<string | undefined> {
  const id = getSession()?.id
  if (id) return id
  if (!supabase) return undefined
  const { data } = await supabase.auth.getUser()
  return data.user?.id
}

/** Tareas de UNA clase (para la vista del catedrático dentro de la clase). */
export async function loadClassTasks(classId: string): Promise<ClassTask[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('class_tasks')
    .select('*')
    .eq('class_id', classId)
    .order('created_at', { ascending: false })
  return (data ?? []).map(mapTask)
}

/** El catedrático publica una tarea (crea la tarea + notifica a los alumnos). */
export async function createClassTask(input: {
  classId: string
  title: string
  description?: string
  parcial?: string
  linkUrl?: string
  pdfUrl?: string
  dueDate?: number | null // epoch ms
}): Promise<boolean> {
  if (!supabase) return false
  const { data, error } = await supabase.rpc('create_class_task', {
    cid: input.classId,
    ptitle: input.title.trim(),
    pdesc: input.description ?? '',
    pparcial: input.parcial ?? '',
    plink: input.linkUrl ?? '',
    pdue: input.dueDate ? new Date(input.dueDate).toISOString() : null,
  })
  if (error) {
    console.error('createClassTask', error)
    return false
  }
  // La función devuelve el id de la tarea nueva; si hay PDF, lo guardamos.
  if (input.pdfUrl && typeof data === 'string') {
    await supabase.from('class_tasks').update({ pdf_url: input.pdfUrl }).eq('id', data)
  }
  dispatch()
  return true
}

/**
 * Sube el PDF del enunciado al Storage (reutiliza el bucket de enunciados) y
 * devuelve su URL pública, o null si falla.
 */
export async function uploadTaskPdf(classId: string, file: File): Promise<string | null> {
  if (!supabase) return null
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `tasks/${classId}/${crypto.randomUUID()}-${safe}`
  const { error } = await supabase.storage.from('project-briefs').upload(path, file, { upsert: false })
  if (error) {
    console.error('uploadTaskPdf', error)
    return null
  }
  return supabase.storage.from('project-briefs').getPublicUrl(path).data.publicUrl
}

/**
 * Pide al servidor que lea el PDF y devuelva un resumen (lo redacta la IA;
 * si la IA falla, devuelve un extracto del propio PDF). Requiere sesión.
 */
export async function summarizePdf(pdfUrl: string): Promise<{ summary: string; source: 'ai' | 'extract' } | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return null
  try {
    const res = await fetch('/api/pdf-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pdfUrl }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return null
    return { summary: json.summary ?? '', source: json.source === 'ai' ? 'ai' : 'extract' }
  } catch {
    return null
  }
}

/** Editar una tarea (solo el catedrático, por RLS). */
export async function updateClassTask(id: string, patch: {
  title?: string
  description?: string
  parcial?: string
  linkUrl?: string
  dueDate?: number | null
}): Promise<void> {
  if (!supabase) return
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.title !== undefined) row.title = patch.title.trim()
  if (patch.description !== undefined) row.description = patch.description
  if (patch.parcial !== undefined) row.parcial = patch.parcial
  if (patch.linkUrl !== undefined) row.link_url = patch.linkUrl
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate ? new Date(patch.dueDate).toISOString() : null
  await supabase.from('class_tasks').update(row).eq('id', id)
  dispatch()
}

export async function deleteClassTask(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('class_tasks').delete().eq('id', id)
  dispatch()
}

/** Todas MIS tareas (de todas las clases donde estoy inscrito) con su estado. */
export async function loadMyTasks(): Promise<MyTask[]> {
  if (!supabase) return []
  const uid = await currentUid()
  if (!uid) return []

  // clases en las que estoy inscrito
  const { data: enr } = await supabase.from('enrollments').select('class_id').eq('student_id', uid)
  const classIds = Array.from(new Set((enr ?? []).map((e: any) => e.class_id)))
  if (!classIds.length) return []

  const [tasksRes, subsRes, classesRes] = await Promise.all([
    supabase.from('class_tasks').select('*').in('class_id', classIds).order('due_date', { ascending: true }),
    supabase.from('task_submissions').select('*').eq('student_id', uid),
    supabase.from('classes').select('id, name').in('id', classIds),
  ])

  const nameByClass = new Map<string, string>()
  ;(classesRes.data ?? []).forEach((c: any) => nameByClass.set(c.id, c.name))
  const subByTask = new Map<string, any>()
  ;(subsRes.data ?? []).forEach((s: any) => subByTask.set(s.task_id, s))

  return (tasksRes.data ?? []).map((row: any) => {
    const t = mapTask(row)
    const sub = subByTask.get(t.id)
    return {
      ...t,
      className: nameByClass.get(t.classId) ?? 'Clase',
      state: stateOf(t.dueDate, !!sub),
      submittedAt: sub?.submitted_at ? new Date(sub.submitted_at).getTime() : null,
      myNote: sub?.note ?? '',
      myLink: sub?.link_url ?? '',
    } as MyTask
  })
}

/** El estudiante entrega (o actualiza su entrega de) una tarea. */
export async function submitTask(taskId: string, note = '', linkUrl = ''): Promise<boolean> {
  if (!supabase) return false
  const uid = await currentUid()
  if (!uid) return false
  const { error } = await supabase.from('task_submissions').upsert({
    task_id: taskId,
    student_id: uid,
    note: note.trim(),
    link_url: linkUrl.trim(),
    submitted_at: new Date().toISOString(),
  })
  if (error) {
    console.error('submitTask', error)
    return false
  }
  dispatch()
  return true
}

/** El estudiante deshace su entrega (vuelve a pendiente). */
export async function unsubmitTask(taskId: string): Promise<void> {
  if (!supabase) return
  const uid = await currentUid()
  if (!uid) return
  await supabase.from('task_submissions').delete().eq('task_id', taskId).eq('student_id', uid)
  dispatch()
}

/** El catedrático ve quién entregó una tarea (matriz de entregas). */
export async function loadSubmissions(taskId: string): Promise<Submission[]> {
  if (!supabase) return []
  const { data } = await supabase.from('task_submissions').select('*').eq('task_id', taskId)
  return (data ?? []).map((s: any) => ({
    taskId: s.task_id,
    studentId: s.student_id,
    note: s.note ?? '',
    linkUrl: s.link_url ?? '',
    submittedAt: s.submitted_at ? new Date(s.submitted_at).getTime() : 0,
  }))
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Realtime: avisa a la UI ante cambios en tareas o entregas. */
export function subscribeClassTasks(): () => void {
  if (!supabase) return () => {}
  const sb = supabase
  const ch = sb
    .channel(`classtasks-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'class_tasks' }, () => dispatch())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'task_submissions' }, () => dispatch())
    .subscribe()
  return () => {
    sb.removeChannel(ch)
  }
}
