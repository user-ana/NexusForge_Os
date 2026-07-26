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

/** Tipos de evidencia que el estudiante debe entregar (define el progreso real). */
export type DeliverableKind =
  | 'files' | 'screenshot' | 'github' | 'commits' | 'per_requirement' | 'text'
export type Deliverable = { kind: DeliverableKind; min?: number } // min: p. ej. commits mínimos

export type ClassTask = {
  id: string
  classId: string
  title: string
  description: string
  parcial: string
  linkUrl: string
  pdfUrl: string
  dueDate: number | null // epoch ms, o null si no tiene fecha límite
  points: number
  deliverables: Deliverable[]
  audience: string // 'all'
  group: boolean // entrega grupal
  createdByName: string
  createdAt: number
}

export type TaskState = 'pending' | 'working' | 'submitted' | 'overdue'

export type MyTask = ClassTask & {
  className: string
  state: TaskState
  submittedAt: number | null
  myNote: string
  myLink: string
  evidence: Evidence
}

export type Submission = {
  taskId: string
  studentId: string
  note: string
  linkUrl: string
  submittedAt: number
  status: SubmissionStatus
  evidence: Evidence
  grade: number | null
  feedback: string
}

/** Estado de la entrega del estudiante. */
export type SubmissionStatus = 'working' | 'submitted'

/** Evidencia que sube el estudiante, por tipo de entregable. */
export type EvidenceFile = { name: string; url: string; pages?: number; ok?: boolean }
export type Evidence = {
  files?: EvidenceFile[]
  screenshot?: EvidenceFile[]
  github?: string
  commits?: number
  per_requirement?: string
  text?: string
  docText?: string // texto extraído de los PDF subidos, para validar y pre-calificar
  ghVerified?: boolean // el repo se comprobó contra GitHub (existe + commits reales)
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
    points: row.points ?? 0,
    deliverables: Array.isArray(row.deliverables) ? (row.deliverables as Deliverable[]) : [],
    audience: row.audience ?? 'all',
    group: !!row.group_submission,
    createdByName: row.created_by_name ?? '',
    createdAt: row.created_at ? new Date(row.created_at).getTime() : 0,
  }
}

function stateOf(dueDate: number | null, sub: { status?: string } | null | undefined): TaskState {
  if (sub) return sub.status === 'working' ? 'working' : 'submitted'
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

/**
 * La IA REDACTA la explicación de una tarea para los estudiantes, a partir del
 * título y el tema que dio el catedrático. Devuelve '' si la IA no responde
 * (el flujo sigue: el catedrático puede escribir la descripción a mano).
 */
export async function generateTaskDescription(input: {
  titulo: string
  tema?: string
  className?: string
}): Promise<string> {
  if (!supabase) return ''
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return ''
  const partes = [
    `Redacta la explicación de una tarea para estudiantes universitarios.`,
    `Título de la tarea: "${input.titulo}".`,
    input.tema ? `Trata sobre: ${input.tema}.` : '',
    input.className ? `Es para la clase de ${input.className}.` : '',
    `Incluye: una breve introducción, qué deben hacer, qué deben entregar y algún criterio de evaluación.`,
    `Máximo 2 párrafos cortos. No inventes fechas.`,
  ].filter(Boolean)
  try {
    const res = await fetch('/api/ai-write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ prompt: partes.join(' ') }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return ''
    return (json.text ?? '').trim()
  } catch {
    return ''
  }
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
  points?: number
  deliverables?: Deliverable[]
  reminders?: boolean
  showOnPublish?: boolean
  group?: boolean
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
  // La función devuelve el id de la tarea nueva; guardamos los extras del Estudio.
  if (typeof data === 'string') {
    const extra: Record<string, unknown> = {}
    if (input.pdfUrl) extra.pdf_url = input.pdfUrl
    if (input.points != null) extra.points = input.points
    if (input.deliverables) extra.deliverables = input.deliverables
    if (input.reminders != null) extra.reminders = input.reminders
    if (input.showOnPublish != null) extra.show_on_publish = input.showOnPublish
    if (input.group != null) extra.group_submission = input.group
    if (Object.keys(extra).length) {
      await supabase.from('class_tasks').update(extra).eq('id', data)
    }
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

/** Extensiones que cuentan como "documento" válido para un entregable de archivos. */
const DOC_EXT = ['pdf', 'doc', 'docx', 'odt', 'txt', 'md', 'rtf']

/**
 * Valida el FORMATO de un archivo entregado (regla dura, sin IA): que sea un
 * documento y, si es PDF, que tenga al menos `minPages` páginas. Extrae también
 * el texto del PDF para poder pre-calificar después. No juzga el contenido.
 */
export async function validateDoc(
  file: File,
  minPages = 0,
): Promise<{ ok: boolean; reason: string; pages?: number; text?: string }> {
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  if (!DOC_EXT.includes(ext)) {
    return { ok: false, reason: `No parece un documento (.${ext}). Se espera PDF o Word.` }
  }
  if (ext !== 'pdf') return { ok: true, reason: 'Documento válido.' } // Word/txt: no leemos páginas

  try {
    const { text, pages } = await extractPdfMeta(file)
    if (minPages > 0 && pages < minPages) {
      return { ok: false, reason: `El PDF tiene ${pages} página${pages === 1 ? '' : 's'} (se piden ${minPages}).`, pages, text }
    }
    if (!text.trim()) {
      return { ok: true, reason: `PDF de ${pages} página${pages === 1 ? '' : 's'} (parece escaneado: sin texto).`, pages, text }
    }
    return { ok: true, reason: `PDF válido · ${pages} página${pages === 1 ? '' : 's'}.`, pages, text }
  } catch {
    return { ok: true, reason: 'Documento adjuntado (no se pudo leer el PDF).' }
  }
}

/** Texto + número de páginas de un PDF (en el navegador). */
export async function extractPdfMeta(file: File): Promise<{ text: string; pages: number }> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  const buf = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise
  const pages = pdf.numPages
  const read = Math.min(pages, 20)
  let out = ''
  for (let i = 1; i <= read; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    out += content.items.map((it) => (it as { str?: string }).str ?? '').join(' ') + '\n'
  }
  return { text: out.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(), pages }
}

/**
 * Extrae el texto de un PDF EN EL NAVEGADOR con pdfjs (donde funciona de forma
 * confiable). Devuelve '' si el PDF no tiene texto (p. ej. es una imagen).
 */
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  // El worker se sirve como archivo estático del propio sitio (public/), no de un
  // CDN: funciona offline, sin CSP externa, y sin que el bundler lo procese.
  // Debe coincidir con la versión de pdfjs-dist (ver scripts/copy-pdf-worker.mjs).
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  const buf = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise
  const pages = Math.min(pdf.numPages, 20) // tope de páginas por si el PDF es enorme
  let out = ''
  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    out += content.items.map((it) => (it as { str?: string }).str ?? '').join(' ') + '\n'
  }
  return out.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Pide al servidor que resuma el texto con la IA (si la IA falla, devuelve un
 * extracto). Requiere sesión.
 */
export async function summarizeText(text: string): Promise<{ summary: string; source: 'ai' | 'extract' } | null> {
  if (!supabase || text.trim().length < 20) return null
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return null
  try {
    const res = await fetch('/api/pdf-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text }),
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
      state: stateOf(t.dueDate, sub),
      submittedAt: sub?.submitted_at ? new Date(sub.submitted_at).getTime() : null,
      myNote: sub?.note ?? '',
      myLink: sub?.link_url ?? '',
      evidence: (sub?.evidence && typeof sub.evidence === 'object' ? sub.evidence : {}) as Evidence,
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

function mapSubmission(s: any): Submission {
  return {
    taskId: s.task_id,
    studentId: s.student_id,
    note: s.note ?? '',
    linkUrl: s.link_url ?? '',
    submittedAt: s.submitted_at ? new Date(s.submitted_at).getTime() : 0,
    status: s.status === 'working' ? 'working' : 'submitted',
    evidence: (s.evidence && typeof s.evidence === 'object' ? s.evidence : {}) as Evidence,
    grade: s.grade == null ? null : Number(s.grade),
    feedback: s.feedback ?? '',
  }
}

/** El catedrático ve quién entregó una tarea (matriz de entregas). */
export async function loadSubmissions(taskId: string): Promise<Submission[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('task_submissions')
    .select('*')
    .eq('task_id', taskId)
    .eq('status', 'submitted')
  return (data ?? []).map(mapSubmission)
}

/** Pide a la IA una nota SUGERIDA (el catedrático la revisa y confirma). */
export async function aiPreGrade(input: { enunciado: string; entrega: string; points: number }): Promise<{ suggestion?: string; score?: number | null; error?: string }> {
  if (!supabase) return { error: 'Sin conexión.' }
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { error: 'Necesitas iniciar sesión.' }
  try {
    const res = await fetch('/api/grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { error: json.error ?? 'La IA no respondió.' }
    return { suggestion: json.suggestion ?? '', score: json.score ?? null }
  } catch {
    return { error: 'No se pudo conectar con la IA.' }
  }
}

/** El catedrático guarda la nota y la retroalimentación (vía RPC seguro). */
export async function gradeSubmission(taskId: string, studentId: string, grade: number, feedback: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('grade_submission', {
    p_task_id: taskId,
    p_student_id: studentId,
    p_grade: grade,
    p_feedback: feedback,
  })
  if (error) {
    console.error('gradeSubmission', error)
    return false
  }
  dispatch()
  return true
}

/**
 * Arma un texto legible con TODO lo que el alumno entregó, para dárselo a la IA
 * al pre-calificar. Junta su reflexión, el texto de sus PDF, lo de por-requisito,
 * el repo y los commits. Es lo que la IA "lee" de la entrega.
 */
export function compileSubmissionText(ev: Evidence): string {
  const partes: string[] = []
  if (ev.text?.trim()) partes.push(`Reflexión del estudiante:\n${ev.text.trim()}`)
  if (ev.per_requirement?.trim()) partes.push(`Evidencia por requisito:\n${ev.per_requirement.trim()}`)
  if (ev.docText?.trim()) partes.push(`Contenido del documento entregado:\n${ev.docText.trim()}`)
  if (ev.github?.trim()) partes.push(`Repositorio: ${ev.github.trim()}${ev.ghVerified ? ' (verificado)' : ''}`)
  if (typeof ev.commits === 'number' && ev.commits > 0) partes.push(`Commits: ${ev.commits}`)
  const files = [...(ev.files ?? []), ...(ev.screenshot ?? [])]
  if (files.length) partes.push(`Archivos adjuntos: ${files.map((f) => f.name).join(', ')}`)
  return partes.join('\n\n').slice(0, 9000)
}

/** Una tarea concreta (para el espacio de trabajo). */
export async function loadTask(taskId: string): Promise<ClassTask | null> {
  if (!supabase) return null
  const { data } = await supabase.from('class_tasks').select('*').eq('id', taskId).maybeSingle()
  return data ? mapTask(data) : null
}

/** Mi entrega de una tarea (null si aún no la empecé). */
export async function loadMySubmission(taskId: string): Promise<Submission | null> {
  if (!supabase) return null
  const uid = await currentUid()
  if (!uid) return null
  const { data } = await supabase
    .from('task_submissions')
    .select('*')
    .eq('task_id', taskId)
    .eq('student_id', uid)
    .maybeSingle()
  return data ? mapSubmission(data) : null
}

/** Guarda el avance (evidencia) sin entregar todavía. */
export async function saveEvidence(taskId: string, evidence: Evidence, status: SubmissionStatus = 'working'): Promise<boolean> {
  if (!supabase) return false
  const uid = await currentUid()
  if (!uid) return false
  const { error } = await supabase.from('task_submissions').upsert({
    task_id: taskId,
    student_id: uid,
    evidence,
    status,
    submitted_at: new Date().toISOString(),
  })
  if (error) {
    console.error('saveEvidence', error)
    return false
  }
  dispatch()
  return true
}

/** Sube un archivo de evidencia al Storage y devuelve su URL. */
export async function uploadEvidence(taskId: string, file: File): Promise<EvidenceFile | null> {
  if (!supabase) return null
  const uid = await currentUid()
  if (!uid) return null
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `submissions/${taskId}/${uid}/${crypto.randomUUID()}-${safe}`
  const { error } = await supabase.storage.from('project-briefs').upload(path, file, { upsert: false })
  if (error) {
    console.error('uploadEvidence', error)
    return null
  }
  const url = supabase.storage.from('project-briefs').getPublicUrl(path).data.publicUrl
  return { name: file.name, url }
}

/**
 * Progreso real: qué proporción de los entregables pedidos tiene evidencia.
 * Es lo que hace que el avance no sea "entregado sí/no" sino un porcentaje.
 */
export function progressOf(deliverables: Deliverable[], ev: Evidence): { done: number; total: number; pct: number } {
  const total = deliverables.length
  if (!total) return { done: 0, total: 0, pct: 0 }
  let done = 0
  for (const d of deliverables) {
    switch (d.kind) {
      case 'files': if ((ev.files?.length ?? 0) > 0) done++; break
      case 'screenshot': if ((ev.screenshot?.length ?? 0) > 0) done++; break
      case 'github': if ((ev.github ?? '').trim().length > 8) done++; break
      case 'commits': if ((ev.commits ?? 0) >= (d.min ?? 1)) done++; break
      case 'per_requirement': if ((ev.per_requirement ?? '').trim().length > 0) done++; break
      case 'text': if ((ev.text ?? '').trim().length > 0) done++; break
    }
  }
  return { done, total, pct: Math.round((done / total) * 100) }
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
