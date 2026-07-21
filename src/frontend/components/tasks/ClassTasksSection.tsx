'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  loadClassTasks,
  createClassTask,
  deleteClassTask,
  loadSubmissions,
  uploadTaskPdf,
  summarizePdf,
  subscribeClassTasks,
  CLASSTASKS_EVENT,
  type ClassTask,
  type Submission,
} from '@/backend/services/classTasks'
import { PARCIAL_OPTIONS, parcialLabel } from '@/shared/parciales'

type Roster = { id: string; name: string }[]

export default function ClassTasksSection({
  classId,
  isTeacher,
  roster,
}: {
  classId: string
  isTeacher: boolean
  roster: Roster
}) {
  const [tasks, setTasks] = useState<ClassTask[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const refresh = () => loadClassTasks(classId).then(setTasks)
    refresh()
    window.addEventListener(CLASSTASKS_EVENT, refresh)
    const off = subscribeClassTasks()
    return () => {
      window.removeEventListener(CLASSTASKS_EVENT, refresh)
      off()
    }
  }, [classId])

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">Tareas de la clase</h3>
        {isTeacher && (
          <button onClick={() => setOpen((v) => !v)} className="neo-btn text-sm">
            {open ? 'Cerrar' : 'Publicar tarea'}
          </button>
        )}
      </div>

      {isTeacher && (
        <TaskModal
          classId={classId}
          open={open}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false)
            loadClassTasks(classId).then(setTasks)
          }}
        />
      )}

      {tasks.length === 0 ? (
        <div className="neo-panel p-8 text-center text-sm text-neutral-500">
          {isTeacher ? 'Aún no has publicado tareas. Publica la primera arriba.' : 'El catedrático no ha publicado tareas.'}
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} isTeacher={isTeacher} roster={roster} />
          ))}
        </div>
      )}
    </section>
  )
}

function TaskModal({
  classId,
  open,
  onClose,
  onDone,
}: {
  classId: string
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [parcial, setParcial] = useState('')
  const [due, setDue] = useState('') // datetime-local
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // --- PDF del enunciado + lectura automática con IA ---
  type PdfStatus = 'idle' | 'uploading' | 'reading' | 'done' | 'error'
  const [pdfUrl, setPdfUrl] = useState('')
  const [pdfName, setPdfName] = useState('')
  const [pdfStatus, setPdfStatus] = useState<PdfStatus>('idle')
  const [pdfSource, setPdfSource] = useState<'ai' | 'extract' | null>(null)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => setMounted(true), [])

  // Al abrir, limpiamos el formulario
  useEffect(() => {
    if (open) {
      setTitle(''); setDesc(''); setParcial(''); setDue(''); setLink(''); setErr('')
      setPdfUrl(''); setPdfName(''); setPdfStatus('idle'); setPdfSource(null); setDrag(false)
    }
  }, [open])

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setErr('El archivo debe ser un PDF.')
      return
    }
    setErr('')
    setPdfName(file.name)
    setPdfSource(null)
    setPdfStatus('uploading')
    const url = await uploadTaskPdf(classId, file)
    if (!url) {
      setPdfStatus('error')
      setErr('No se pudo subir el PDF.')
      return
    }
    setPdfUrl(url)
    // La IA lee el PDF y redacta la descripción (con respaldo si falla)
    setPdfStatus('reading')
    const r = await summarizePdf(url)
    if (r && r.summary) {
      setDesc((d) => (d.trim() ? d : r.summary))
      setPdfSource(r.source)
    }
    setPdfStatus('done')
  }

  function removePdf() {
    setPdfUrl(''); setPdfName(''); setPdfStatus('idle'); setPdfSource(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  // Cerrar con la tecla Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!mounted || !open) return null

  async function publish() {
    if (!title.trim()) return setErr('Ponle un título a la tarea.')
    setBusy(true)
    setErr('')
    const ok = await createClassTask({
      classId,
      title,
      description: desc,
      parcial,
      linkUrl: link,
      pdfUrl,
      dueDate: due ? new Date(due).getTime() : null,
    })
    setBusy(false)
    if (!ok) return setErr('No se pudo publicar. Intenta de nuevo.')
    onDone()
  }

  const busyPdf = pdfStatus === 'uploading' || pdfStatus === 'reading'

  return createPortal(
    <div className="neo-modal-backdrop" onClick={onClose}>
      <div className="neo-modal neo-modal--form space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-base font-semibold text-white">Publicar tarea</h4>
            <p className="text-xs text-neutral-500">Se notificará a todos los alumnos inscritos.</p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white" aria-label="Cerrar">✕</button>
        </div>

        <div>
          <label className="neo-label">Título</label>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="neo-input mt-1 w-full" placeholder="Ej. Investigación sobre servidores web" />
        </div>
        {/* PDF del enunciado: la IA lo lee y rellena la descripción */}
        <div>
          <label className="neo-label">Enunciado en PDF (opcional)</label>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          {pdfStatus === 'idle' ? (
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files?.[0]) }}
              className={`neo-pdfdrop ${drag ? 'neo-pdfdrop--over' : ''}`}
            >
              <PdfIcon />
              <div>
                <p className="neo-pdfdrop-title">Arrastra un PDF o haz clic para subirlo</p>
                <p className="neo-pdfdrop-sub">La IA lo leerá y escribirá la descripción por ti</p>
              </div>
            </div>
          ) : (
            <div className={`neo-pdffile ${busyPdf ? 'neo-pdffile--busy' : ''}`}>
              <PdfIcon />
              <div className="neo-pdffile-info">
                <span className="neo-pdffile-name">{pdfName}</span>
                <span className="neo-pdffile-state">
                  {pdfStatus === 'uploading' && 'Subiendo el PDF…'}
                  {pdfStatus === 'reading' && 'La IA está leyendo el PDF…'}
                  {pdfStatus === 'done' && pdfSource === 'ai' && 'Resumen generado por la IA'}
                  {pdfStatus === 'done' && pdfSource === 'extract' && 'Texto extraído del PDF'}
                  {pdfStatus === 'done' && pdfSource === null && 'PDF adjuntado'}
                  {pdfStatus === 'error' && 'No se pudo procesar'}
                </span>
              </div>
              {busyPdf ? <span className="neo-pdfspin" /> : (
                <button onClick={removePdf} className="neo-pdffile-x" aria-label="Quitar PDF">✕</button>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="neo-label">Descripción (opcional)</label>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} className="neo-input mt-1 w-full resize-none" placeholder="Qué deben hacer, formato de entrega, etc." />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="neo-label">Parcial</label>
            <select value={parcial} onChange={(e) => setParcial(e.target.value)} className="neo-input mt-1 w-full">
              {PARCIAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="neo-label">Fecha límite (opcional)</label>
            <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="neo-input mt-1 w-full" />
          </div>
        </div>
        <div>
          <label className="neo-label">Enlace del enunciado (opcional)</label>
          <input value={link} onChange={(e) => setLink(e.target.value)} className="neo-input mt-1 w-full" placeholder="https://..." />
        </div>
        {err && <p className="text-xs text-amber-400">{err}</p>}
        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="neo-btn-ghost">Cancelar</button>
          <button onClick={publish} disabled={busy || busyPdf} className="neo-btn">
            {busy ? 'Publicando…' : busyPdf ? 'Procesando PDF…' : 'Publicar y notificar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function TaskRow({ task, isTeacher, roster }: { task: ClassTask; isTeacher: boolean; roster: Roster }) {
  const [expanded, setExpanded] = useState(false)
  const [subs, setSubs] = useState<Submission[] | null>(null)

  useEffect(() => {
    if (isTeacher && expanded && subs === null) loadSubmissions(task.id).then(setSubs)
  }, [expanded, isTeacher, subs, task.id])

  const { entregados, pendientes } = useMemo(() => {
    const done = new Set((subs ?? []).map((s) => s.studentId))
    return {
      entregados: roster.filter((r) => done.has(r.id)),
      pendientes: roster.filter((r) => !done.has(r.id)),
    }
  }, [subs, roster])

  return (
    <article className="neo-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {task.parcial && <span className="neo-chip neo-chip--gold">{parcialLabel(task.parcial)}</span>}
            <DueTag due={task.dueDate} />
          </div>
          <h4 className="font-semibold text-white">{task.title}</h4>
          {task.description && <p className="mt-1 text-sm text-neutral-400">{task.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {task.pdfUrl && (
              <a href={task.pdfUrl} target="_blank" rel="noreferrer" className="neo-pdflink">
                <PdfIcon small /> Enunciado (PDF)
              </a>
            )}
            {task.linkUrl && (
              <a href={task.linkUrl} target="_blank" rel="noreferrer" className="text-xs text-accent-violet">
                Ver enlace →
              </a>
            )}
          </div>
        </div>
        {isTeacher && (
          <div className="flex flex-shrink-0 items-center gap-2">
            <button onClick={() => setExpanded((v) => !v)} className="neo-btn-ghost text-xs">
              {expanded ? 'Ocultar' : 'Ver entregas'}
            </button>
            <button onClick={() => deleteClassTask(task.id)} className="text-neutral-600 hover:text-red-400" title="Eliminar tarea">✕</button>
          </div>
        )}
      </div>

      {isTeacher && expanded && (
        <div className="mt-4 border-t border-white/5 pt-4">
          {subs === null ? (
            <p className="text-xs text-neutral-500">Cargando entregas…</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold text-emerald-400">Entregaron ({entregados.length})</p>
                {entregados.length === 0 ? (
                  <p className="text-xs text-neutral-600">Nadie aún.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {entregados.map((r) => (
                      <span key={r.id} className="rounded-lg bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">{r.name}</span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold text-neutral-400">Pendientes ({pendientes.length})</p>
                {pendientes.length === 0 ? (
                  <p className="text-xs text-neutral-600">Todos entregaron.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {pendientes.map((r) => (
                      <span key={r.id} className="rounded-lg bg-black/25 px-2 py-1 text-xs text-neutral-400">{r.name}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {!isTeacher && (
        <p className="mt-3 border-t border-white/5 pt-3 text-xs text-neutral-500">
          Gestiona tu entrega desde <span className="text-accent-violet">Mis tareas</span>.
        </p>
      )}
    </article>
  )
}

function PdfIcon({ small }: { small?: boolean }) {
  const s = small ? 13 : 26
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M9 13h1.5a1.5 1.5 0 0 1 0 3H9v-3zm0 0v5" />
      <path d="M15.5 13H14v5m0-2.5h1.2" />
    </svg>
  )
}

function DueTag({ due }: { due: number | null }) {
  if (due == null) return <span className="neo-chip">Sin fecha</span>
  const over = Date.now() > due
  const fecha = new Date(due).toLocaleDateString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  return <span className={`neo-chip ${over ? 'neo-chip--over' : ''}`}>{over ? 'Venció' : 'Vence'} {fecha}</span>
}
