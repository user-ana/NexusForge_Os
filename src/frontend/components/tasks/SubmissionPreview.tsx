'use client'

/**
 * VISTA PREVIA DE LA ENTREGA — para revisar y calificar sin salir de la app.
 *
 * A la izquierda se dibuja EL DOCUMENTO que entregó el estudiante (su PDF), con
 * pdfjs, igual que el lector de módulos. A la derecha, su evidencia y el panel de
 * calificación: pre-nota con IA, ajuste y guardado. Así el catedrático lee lo
 * entregado y pone la nota en la misma pantalla.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  aiPreGrade,
  gradeSubmission,
  compileSubmissionText,
  type ClassTask,
  type Submission,
} from '@/backend/services/classTasks'

export default function SubmissionPreview({
  sub,
  task,
  name,
  onClose,
  onGraded,
}: {
  sub: Submission
  task: ClassTask
  name: string
  onClose: () => void
  onGraded: (grade: number, feedback: string) => void
}) {
  const [mounted, setMounted] = useState(false)
  const ev = sub.evidence ?? {}
  const files = [...(ev.files ?? []), ...(ev.screenshot ?? [])]
  const pdf = files.find((f) => f.name.toLowerCase().endsWith('.pdf'))
  const [current, setCurrent] = useState<string | undefined>(pdf?.url)

  useEffect(() => setMounted(true), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!mounted) return null

  const cuando = sub.submittedAt
    ? new Date(sub.submittedAt).toLocaleDateString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : ''

  return createPortal(
    <div className="neo-reader" style={{ zIndex: 130 }}>
      <header className="neo-reader-top">
        <div className="min-w-0">
          <p className="neo-subs-eyebrow">Revisar entrega · {name}</p>
          <h2 className="truncate text-base font-bold text-white">{task.title}</h2>
        </div>
        <button onClick={onClose} className="neo-reader-close" title="Cerrar (Esc)">✕</button>
      </header>

      <div className="neo-reader-body">
        <section className="neo-reader-doc">
          {files.length > 1 && (
            <div className="neo-reader-files">
              {files.map((f) => (
                <button
                  key={f.url}
                  onClick={() => (f.name.toLowerCase().endsWith('.pdf') ? setCurrent(f.url) : window.open(f.url, '_blank'))}
                  className={`neo-reader-file ${current === f.url ? 'neo-reader-file--active' : ''}`}
                  title={f.name}
                >
                  <span className="truncate">{f.name}</span>
                </button>
              ))}
            </div>
          )}
          {current ? (
            <PdfDoc url={current} />
          ) : (
            <div className="neo-reader-empty">
              <p className="text-sm text-neutral-400">
                {files.length ? 'La entrega no trae un PDF para mostrar aquí.' : 'Esta entrega no adjuntó archivos.'}
              </p>
              {files.length > 0 && (
                <div className="mt-4 space-y-2">
                  {files.map((f) => (
                    <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="neo-btn-ghost block text-sm">Abrir {f.name}</a>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="neo-reader-tutor" style={{ width: 400 }}>
          <div className="neo-reader-tutor-top">
            <span className="neo-subs-av neo-subs-av--lg">{initials(name)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{name}</p>
              <p className="text-[11px] text-neutral-500">Entregó {cuando}</p>
            </div>
          </div>

          <div className="neo-reader-chat">
            {/* Evidencia entregada */}
            <p className="neo-subs-eyebrow mb-2">Lo que entregó</p>
            <div className="neo-subcard-ev !mt-0">
              {(ev.github?.trim()) && <a href={ev.github} target="_blank" rel="noreferrer" className="neo-ev neo-ev--link">GitHub →</a>}
              {sub.linkUrl && <a href={sub.linkUrl} target="_blank" rel="noreferrer" className="neo-ev neo-ev--link">Enlace →</a>}
              {typeof ev.commits === 'number' && ev.commits > 0 && <span className="neo-ev">{ev.commits} commits{ev.ghVerified ? ' ✓' : ''}</span>}
              {files.map((f) => (
                <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="neo-ev neo-ev--link">{f.name}{f.pages ? ` · ${f.pages}p` : ''}</a>
              ))}
              {(ev.text || sub.note) && <span className="neo-ev">Reflexión</span>}
            </div>
            {(ev.text || sub.note) && <p className="neo-subcard-note mt-3">{ev.text || sub.note}</p>}

            {/* Calificación */}
            <div className="mt-5 border-t border-white/5 pt-4">
              <p className="neo-subs-eyebrow mb-2">Calificación</p>
              <GradePanel sub={sub} task={task} onGraded={onGraded} />
            </div>
          </div>
        </aside>
      </div>
    </div>,
    document.body,
  )
}

/** Panel de calificación con pre-nota de IA. */
function GradePanel({ sub, task, onGraded }: { sub: Submission; task: ClassTask; onGraded: (g: number, f: string) => void }) {
  const max = task.points || 100
  const [grade, setGrade] = useState(sub.grade != null ? String(sub.grade) : '')
  const [feedback, setFeedback] = useState(sub.feedback ?? '')
  const [suggestion, setSuggestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState(sub.grade != null)

  async function preGrade() {
    setBusy(true); setError('')
    const entrega = compileSubmissionText(sub.evidence ?? {})
    if (!entrega.trim()) { setBusy(false); setError('Esta entrega no tiene texto legible para revisar (solo archivos escaneados o sin texto).'); return }
    const r = await aiPreGrade({ enunciado: task.description ?? '', entrega, points: max })
    setBusy(false)
    if (r.error) { setError(r.error); return }
    setSuggestion(r.suggestion ?? '')
    if (typeof r.score === 'number') setGrade(String(r.score))
    const fb = (r.suggestion ?? '').replace(/^NOTA:.*$/im, '').trim()
    if (fb) setFeedback(fb)
  }

  async function save() {
    const n = parseFloat(grade.replace(',', '.'))
    if (!Number.isFinite(n)) { setError('Escribe una nota.'); return }
    setBusy(true); setError('')
    const g = Math.max(0, Math.min(max, n))
    const ok = await gradeSubmission(sub.taskId, sub.studentId, g, feedback)
    setBusy(false)
    if (ok) { setOkMsg(true); onGraded(g, feedback) }
    else setError('No se pudo guardar la nota.')
  }

  return (
    <div className="neo-grade !mt-0">
      <button onClick={preGrade} disabled={busy} className="neo-grade-ai">
        {busy ? 'Revisando…' : 'Pre-calificar con IA'}
      </button>
      {suggestion && <p className="neo-grade-sug">{suggestion}</p>}
      <div className="neo-grade-row">
        <label>Nota</label>
        <input type="number" min={0} max={max} step="0.5" value={grade} onChange={(e) => setGrade(e.target.value)} className="neo-input w-24" />
        <span className="text-xs text-neutral-500">/ {max}</span>
        {okMsg && <span className="ml-auto text-xs text-emerald-400">Guardada ✓</span>}
      </div>
      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        rows={4}
        placeholder="Retroalimentación para el estudiante…"
        className="neo-input w-full resize-none text-sm"
      />
      {error && <p className="text-xs text-amber-400">{error}</p>}
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={busy} className="neo-btn text-sm">Guardar nota</button>
        <span className="text-[10px] text-neutral-600">La nota de la IA es una sugerencia.</span>
      </div>
    </div>
  )
}

/** Visor de PDF a canvas (página visible, con navegación y zoom). */
function PdfDoc({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const docRef = useRef<any>(null)
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const taskRef = useRef<any>(null) // render en curso, para cancelarlo si llega otro
  const wrapRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [autoFit, setAutoFit] = useState(true)

  const fitZoom = useCallback(async (): Promise<number | null> => {
    const doc = docRef.current, wrap = wrapRef.current
    if (!doc || !wrap) return null
    const p = await doc.getPage(1)
    const base = p.getViewport({ scale: 1 })
    const avail = wrap.clientWidth - 44
    return avail > 0 ? Math.min(2.4, Math.max(0.5, +(avail / base.width).toFixed(2))) : null
  }, [])

  useEffect(() => {
    let cancel = false
    setLoading(true); setError('')
    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const doc = await pdfjs.getDocument({ url }).promise
        if (cancel) return
        docRef.current = doc
        setPages(doc.numPages); setPage(1)
        const z = await fitZoom()
        if (!cancel && z) setZoom(z)
      } catch (e) {
        console.error('PdfDoc', e)
        if (!cancel) setError('No se pudo mostrar el documento.')
      } finally {
        if (!cancel) setLoading(false)
      }
    })()
    return () => { cancel = true; docRef.current?.destroy?.(); docRef.current = null }
  }, [url, fitZoom])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || !autoFit) return
    const ro = new ResizeObserver(() => { fitZoom().then((z) => { if (z) setZoom(z) }) })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [autoFit, fitZoom, loading])

  const draw = useCallback(async () => {
    const doc = docRef.current, canvas = canvasRef.current
    if (!doc || !canvas) return
    // Cancela el render anterior: dos render() sobre el MISMO canvas corrompen
    // la imagen (se ve volteada) y pdfjs lanza error. Un solo render a la vez.
    taskRef.current?.cancel?.()
    const p = await doc.getPage(page)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const vpCss = p.getViewport({ scale: zoom })
    const vpHi = p.getViewport({ scale: zoom * dpr })
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = vpHi.width; canvas.height = vpHi.height
    canvas.style.width = `${vpCss.width}px`; canvas.style.height = `${vpCss.height}px`
    const task = p.render({ canvasContext: ctx, viewport: vpHi })
    taskRef.current = task
    try {
      await task.promise
    } catch (e) {
      // Cancelar un render lanza RenderingCancelledException: es esperado.
      if ((e as { name?: string })?.name !== 'RenderingCancelledException') console.error('render', e)
    }
  }, [page, zoom])

  useEffect(() => { if (!loading && !error) draw() }, [draw, loading, error])

  if (error) {
    return (
      <div className="neo-reader-empty">
        <p className="text-sm text-neutral-400">{error}</p>
        <a href={url} target="_blank" rel="noreferrer" className="neo-btn-ghost mt-3 text-sm">Abrirlo en otra pestaña</a>
      </div>
    )
  }

  return (
    <>
      <div className="neo-reader-page" ref={wrapRef}>
        {loading ? <p className="text-sm text-neutral-500">Abriendo el documento…</p> : (
          <div className="neo-reader-sheet"><canvas ref={canvasRef} /></div>
        )}
      </div>
      {!loading && pages > 0 && (
        <div className="neo-reader-bar">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="neo-reader-nav">←</button>
          <span className="neo-reader-count">{page} / {pages}</span>
          <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} className="neo-reader-nav">→</button>
          <span className="neo-reader-sep" />
          <button onClick={() => { setAutoFit(false); setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2))) }} className="neo-reader-nav">−</button>
          <span className="neo-reader-count">{Math.round(zoom * 100)}%</span>
          <button onClick={() => { setAutoFit(false); setZoom((z) => Math.min(2.4, +(z + 0.15).toFixed(2))) }} className="neo-reader-nav">+</button>
        </div>
      )}
    </>
  )
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (!p.length) return '?'
  if (p.length === 1) return p[0].charAt(0).toUpperCase()
  return (p[0].charAt(0) + p[p.length - 1].charAt(0)).toUpperCase()
}
