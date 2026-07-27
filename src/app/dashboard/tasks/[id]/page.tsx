'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Header from '@/frontend/components/layout/Header'
import {
  loadTask,
  loadMySubmission,
  saveEvidence,
  uploadEvidence,
  validateDoc,
  progressOf,
  type ClassTask,
  type Deliverable,
  type DeliverableKind,
  type Evidence,
  type EvidenceFile,
  type SubmissionStatus,
} from '@/backend/services/classTasks'
import { verifyGithub } from '@/backend/external/github'
import TaskInstructions from '@/frontend/components/tasks/TaskInstructions'
import { downloadTask } from '@/frontend/components/tasks/downloadTask'

const LABEL: Record<DeliverableKind, { title: string; hint: string }> = {
  files: { title: 'Archivos', hint: 'Documentos, código o entregables' },
  screenshot: { title: 'Capturas o video', hint: 'Evidencia visual del resultado' },
  github: { title: 'Enlace de GitHub', hint: 'Repositorio donde trabajas' },
  commits: { title: 'Commits mínimos', hint: 'Cuántos aportes llevas' },
  per_requirement: { title: 'Evidencia por requisito', hint: 'Explica qué cumple cada punto' },
  text: { title: 'Texto o reflexión', hint: 'Tu explicación escrita' },
}

export default function WorkspacePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [task, setTask] = useState<ClassTask | null>(null)
  const [ev, setEv] = useState<Evidence>({})
  const [status, setStatus] = useState<SubmissionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')
  const [grade, setGrade] = useState<number | null>(null)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    Promise.all([loadTask(params.id), loadMySubmission(params.id)]).then(([t, s]) => {
      setTask(t)
      if (s) {
        setEv(s.evidence ?? {})
        setStatus(s.status)
        setGrade(s.grade)
        setFeedback(s.feedback)
        if (s.note) setNote(s.note)
      }
      setLoading(false)
    })
  }, [params.id])

  // Guardado automático del avance (sin entregar), con un respiro entre cambios
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autosave = useCallback(
    (next: Evidence) => {
      if (status === 'submitted') return // ya entregada: no se sobreescribe sola
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        setSaving(true)
        saveEvidence(params.id, next, 'working').then(() => {
          setStatus('working')
          setSaving(false)
        })
      }, 700)
    },
    [params.id, status],
  )

  function patch(p: Partial<Evidence>) {
    setEv((prev) => {
      const next = { ...prev, ...p }
      autosave(next)
      return next
    })
  }

  async function submit() {
    setSaving(true)
    const ok = await saveEvidence(params.id, ev, 'submitted')
    setSaving(false)
    if (ok) {
      setStatus('submitted')
      router.push('/dashboard/tasks')
    }
  }

  if (loading) {
    return (
      <>
        <Header title="Tarea" subtitle="" />
        <main className="flex-1 p-8 text-sm text-neutral-500">Cargando…</main>
      </>
    )
  }
  if (!task) {
    return (
      <>
        <Header title="Tarea" subtitle="" />
        <main className="flex-1 p-8">
          <p className="text-sm text-neutral-400">No encontramos esta tarea.</p>
          <Link href="/dashboard/tasks" className="mt-3 inline-block text-sm text-accent-violet">← Volver a Mis tareas</Link>
        </main>
      </>
    )
  }

  const prog = progressOf(task.deliverables, ev)
  const submitted = status === 'submitted'
  const due = task.dueDate
  // Mínimo de páginas que menciona el enunciado ("documento de 4 páginas") para validar el PDF
  const minPages = (() => {
    const m = (task.description || '').match(/(\d+)\s*p[aá]ginas?/i)
    return m ? parseInt(m[1], 10) : 0
  })()
  // ¿Algún archivo entregado NO cumple el formato? Bloquea la entrega.
  const badFile = (ev.files ?? []).some((f) => f.ok === false)

  return (
    <>
      <Header title={task.title} subtitle="Espacio de trabajo" />
      <main className="flex-1 overflow-auto p-8">
        <div className="mx-auto max-w-5xl">
          <Link href="/dashboard/tasks" className="mb-4 inline-block text-sm text-neutral-500 hover:text-accent-violet">
            ← Volver a Mis tareas
          </Link>

          {/* Nota del catedrático (si ya calificó) */}
          {grade != null && (
            <section className="neo-graded">
              <div className="neo-graded-score">
                <b>{grade}</b><small>/ {task.points || 100}</small>
              </div>
              <div className="min-w-0">
                <p className="neo-graded-title">Calificada por tu catedrático</p>
                {feedback && <p className="neo-graded-fb">{feedback}</p>}
              </div>
            </section>
          )}

          {/* Resumen: progreso + fecha + estado */}
          <section className="neo-ws-top">
            <div className="neo-ws-ring" style={{ ['--p' as string]: `${prog.pct}` }}>
              <span>{prog.pct}<small>%</small></span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="neo-ws-state">
                {submitted ? 'Entregada' : status === 'working' ? 'En progreso' : 'Aún no iniciada'}
              </p>
              <p className="neo-ws-sub">
                {prog.total > 0
                  ? `${prog.done} de ${prog.total} requisitos con evidencia`
                  : 'Esta tarea no pide evidencias específicas'}
              </p>
              <div className="neo-ws-bar"><span style={{ width: `${prog.pct}%` }} /></div>
            </div>
            <div className="neo-ws-due">
              <small>Vence</small>
              <b>{due ? new Date(due).toLocaleDateString('es', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'Sin fecha límite'}</b>
              {due && !submitted && <span className={remainingClass(due)}>{remaining(due)}</span>}
            </div>
          </section>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.15fr]">
            {/* Instrucciones */}
            <section className="neo-panel p-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="neo-ws-h !mb-0">Instrucciones</h3>
                <button onClick={() => downloadTask(task)} className="neo-tk-icon" title="Descargar en PDF">
                  <DownloadIc />
                </button>
              </div>
              {task.description ? (
                <TaskInstructions text={task.description} />
              ) : (
                <p className="text-sm text-neutral-500">El catedrático no dejó instrucciones escritas.</p>
              )}
              {(task.pdfUrl || task.linkUrl) && (
                <div className="mt-4 flex flex-wrap gap-3 border-t border-white/5 pt-4">
                  {task.pdfUrl && <a href={task.pdfUrl} target="_blank" rel="noreferrer" className="neo-btn-ghost text-sm">Ver guía (PDF)</a>}
                  {task.linkUrl && <a href={task.linkUrl} target="_blank" rel="noreferrer" className="neo-btn-ghost text-sm">Abrir enlace</a>}
                </div>
              )}
              <div className="mt-4 border-t border-white/5 pt-4">
                <p className="neo-label mb-2">Nota para el catedrático (opcional)</p>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  disabled={submitted}
                  placeholder="Algo que quieras aclarar sobre tu entrega."
                  className="neo-input w-full resize-none text-sm"
                />
              </div>
            </section>

            {/* Requisitos */}
            <section className="neo-panel p-6">
              <h3 className="neo-ws-h">Qué debes entregar</h3>
              {task.deliverables.length === 0 ? (
                <p className="text-sm text-neutral-500">No se pidieron evidencias concretas. Puedes entregar directamente.</p>
              ) : (
                <div className="space-y-3">
                  {task.deliverables.map((d) => (
                    <Requirement
                      key={d.kind}
                      d={d}
                      ev={ev}
                      taskId={params.id}
                      disabled={submitted}
                      minPages={minPages}
                      onChange={patch}
                    />
                  ))}
                </div>
              )}

              <div className="mt-5 border-t border-white/5 pt-5">
                {submitted ? (
                  <div className="neo-locked">
                    <span className="neo-locked-ic"><LockIc /></span>
                    <div>
                      <p className="text-sm font-semibold text-neutral-100">Entrega enviada</p>
                      <p className="text-xs text-neutral-500">Ya no puedes editarla. Si necesitas cambiar algo, avísale a tu catedrático.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {badFile && (
                      <p className="mb-3 text-xs text-amber-400">⚠ Uno de tus archivos no cumple el formato pedido. Corrígelo antes de entregar.</p>
                    )}
                    <div className="flex items-center gap-3">
                      <button onClick={submit} disabled={saving || badFile} className="neo-btn disabled:opacity-40">
                        {saving ? 'Guardando…' : 'Entregar tarea'}
                      </button>
                      <span className="text-xs text-neutral-500">
                        {saving ? 'Guardando tu avance…' : 'Tu avance se guarda solo · al entregar ya no podrás editar'}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  )
}

/* ---------- Un requisito ---------- */
function Requirement({
  d, ev, taskId, disabled, minPages, onChange,
}: {
  d: Deliverable
  ev: Evidence
  taskId: string
  disabled: boolean
  minPages: number
  onChange: (p: Partial<Evidence>) => void
}) {
  const meta = LABEL[d.kind]
  const [busy, setBusy] = useState(false)
  const [check, setCheck] = useState<{ ok: boolean; reason: string } | null>(null)
  const [ghBusy, setGhBusy] = useState(false)
  const [ghMsg, setGhMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const done = isDone(d, ev)

  async function addFiles(list: FileList | null, key: 'files' | 'screenshot') {
    if (!list?.length) return
    setBusy(true)
    const uploaded: EvidenceFile[] = []
    let docText = ev.docText ?? ''
    for (const f of Array.from(list)) {
      // Solo los 'files' (documentos) se validan de formato; las capturas no.
      if (key === 'files') {
        const v = await validateDoc(f, minPages)
        setCheck({ ok: v.ok, reason: v.reason })
        if (v.text) docText += (docText ? '\n\n' : '') + v.text
        const r = await uploadEvidence(taskId, f)
        if (r) uploaded.push({ ...r, pages: v.pages, ok: v.ok })
      } else {
        const r = await uploadEvidence(taskId, f)
        if (r) uploaded.push(r)
      }
    }
    setBusy(false)
    if (uploaded.length) {
      const patch: Partial<Evidence> = { [key]: [...(ev[key] ?? []), ...uploaded] } as Partial<Evidence>
      if (key === 'files' && docText !== (ev.docText ?? '')) patch.docText = docText
      onChange(patch)
    }
  }

  /** Verifica el repo contra GitHub: que exista y cuántos commits reales tiene. */
  async function verifyRepo() {
    const url = (ev.github ?? '').trim()
    if (!url) return
    setGhBusy(true); setGhMsg('')
    const r = await verifyGithub(url)
    setGhBusy(false)
    if (!r) { setGhMsg('No encontramos ese repositorio público.'); onChange({ ghVerified: false }); return }
    setGhMsg(`Repositorio verificado: ${r.name} · ${r.commits} commits reales.`)
    // Guarda los commits REALES (no el número que el alumno escribiría)
    onChange({ ghVerified: true, commits: r.commits })
  }
  function removeFile(key: 'files' | 'screenshot', url: string) {
    onChange({ [key]: (ev[key] ?? []).filter((f) => f.url !== url) } as Partial<Evidence>)
  }

  return (
    <article className={`neo-req-card ${done ? 'neo-req-card--done' : ''}`}>
      <div className="neo-req-head">
        <span className="neo-req-check">{done ? <CheckIc /> : null}</span>
        <div className="min-w-0">
          <b>{meta.title}{d.kind === 'commits' && d.min ? ` (mínimo ${d.min})` : ''}</b>
          <small>{meta.hint}</small>
        </div>
      </div>

      <div className="neo-req-body">
        {(d.kind === 'files' || d.kind === 'screenshot') && (
          <>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={d.kind === 'screenshot' ? 'image/*,video/*' : undefined}
              className="hidden"
              onChange={(e) => addFiles(e.target.files, d.kind as 'files' | 'screenshot')}
            />
            <button onClick={() => fileRef.current?.click()} disabled={disabled || busy} className="neo-btn-ghost text-xs">
              {busy ? 'Subiendo…' : 'Adjuntar'}
            </button>
            <div className="mt-2 space-y-1.5">
              {(ev[d.kind as 'files' | 'screenshot'] ?? []).map((f) => (
                <div key={f.url} className="neo-req-file">
                  <a href={f.url} target="_blank" rel="noreferrer">
                    {f.name}{f.pages ? ` · ${f.pages} pág.` : ''}
                  </a>
                  {!disabled && <button onClick={() => removeFile(d.kind as 'files' | 'screenshot', f.url)}>✕</button>}
                </div>
              ))}
            </div>
            {d.kind === 'files' && (
              <div className="neo-fmt">
                <p className="neo-fmt-title">Requisitos de formato</p>
                <FmtRule ok label="Documento PDF o Word" />
                {minPages > 0 && <FmtRule ok label={`Mínimo ${minPages} páginas`} />}
                {check && (
                  <p className={`mt-1.5 text-xs ${check.ok ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {check.ok ? '✓ ' : '⚠ '}{check.reason}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {d.kind === 'github' && (
          <>
            <input
              value={ev.github ?? ''}
              onChange={(e) => { onChange({ github: e.target.value, ghVerified: false }); setGhMsg('') }}
              disabled={disabled}
              placeholder="https://github.com/usuario/repositorio"
              className="neo-input w-full text-sm"
            />
            <div className="mt-2 flex items-center gap-2">
              <button onClick={verifyRepo} disabled={disabled || ghBusy || !(ev.github ?? '').trim()} className="neo-btn-ghost text-xs disabled:opacity-40">
                {ghBusy ? 'Verificando…' : 'Verificar repositorio'}
              </button>
              {ev.ghVerified && <span className="text-xs text-emerald-400">✓ verificado</span>}
            </div>
            {ghMsg && <p className={`mt-1.5 text-xs ${ev.ghVerified ? 'text-emerald-400' : 'text-amber-400'}`}>{ghMsg}</p>}
          </>
        )}

        {d.kind === 'commits' && (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={ev.commits ?? 0}
              onChange={(e) => onChange({ commits: Math.max(0, Number(e.target.value) || 0) })}
              disabled={disabled}
              className="neo-input w-24 text-sm"
            />
            <span className="text-xs text-neutral-500">commits realizados</span>
          </div>
        )}

        {(d.kind === 'per_requirement' || d.kind === 'text') && (
          <textarea
            value={(d.kind === 'text' ? ev.text : ev.per_requirement) ?? ''}
            onChange={(e) => onChange(d.kind === 'text' ? { text: e.target.value } : { per_requirement: e.target.value })}
            disabled={disabled}
            rows={3}
            placeholder={d.kind === 'text' ? 'Escribe tu reflexión…' : 'Explica qué evidencia cumple cada requisito…'}
            className="neo-input w-full resize-none text-sm"
          />
        )}
      </div>
    </article>
  )
}

function isDone(d: Deliverable, ev: Evidence): boolean {
  switch (d.kind) {
    case 'files': return (ev.files?.length ?? 0) > 0
    case 'screenshot': return (ev.screenshot?.length ?? 0) > 0
    case 'github': return (ev.github ?? '').trim().length > 8
    case 'commits': return (ev.commits ?? 0) >= (d.min ?? 1)
    case 'per_requirement': return (ev.per_requirement ?? '').trim().length > 0
    case 'text': return (ev.text ?? '').trim().length > 0
  }
}

function remaining(due: number): string {
  const ms = due - Date.now()
  if (ms < 0) return 'Venció'
  const d = Math.floor(ms / 86400000)
  if (d >= 1) return `Faltan ${d} día${d > 1 ? 's' : ''}`
  const h = Math.floor(ms / 3600000)
  return h >= 1 ? `Faltan ${h} h` : 'Menos de 1 h'
}
function remainingClass(due: number): string {
  const ms = due - Date.now()
  if (ms < 0) return 'neo-ws-left neo-ws-left--over'
  return ms < 86400000 ? 'neo-ws-left neo-ws-left--soon' : 'neo-ws-left'
}

function CheckIc() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function DownloadIc() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function LockIc() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

/** Una regla de formato con su check. */
function FmtRule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`neo-fmt-rule ${ok ? 'neo-fmt-rule--ok' : ''}`}>
      <span className="neo-fmt-tick">{ok ? '✓' : '○'}</span> {label}
    </span>
  )
}
