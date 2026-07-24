'use client'

/**
 * LECTOR DE MÓDULO — abre la lección dentro de la plataforma en vez de mandar
 * al estudiante a descargar un PDF suelto.
 *
 * A la izquierda el documento se dibuja página por página con pdfjs (el mismo
 * que ya usamos para extraer texto, con su worker servido desde public/).
 * A la derecha, el tutor: resume la lección y responde dudas apoyándose SOLO
 * en el material que subió el catedrático.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { askModule, loadModuleText, type ClassModule, type ModuleFile } from '@/backend/services/classModules'
import { parcialLabel } from '@/shared/parciales'
import { LinkIcon, SearchIcon } from '@/frontend/components/ui/Icons'

type Msg = { role: 'user' | 'assistant'; content: string }

export default function ModuleReader({ module: m, onClose }: { module: ClassModule; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  const [file, setFile] = useState<ModuleFile | null>(m.files.find((f) => f.kind === 'pdf') ?? null)

  useEffect(() => setMounted(true), [])

  // Cerrar con Escape, como cualquier visor a pantalla completa
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!mounted) return null

  return createPortal(
    <div className="neo-reader">
      <header className="neo-reader-top">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {m.week != null && <span className="neo-chip neo-chip--progress">Semana {m.week}</span>}
            {m.parcial && <span className="neo-chip neo-chip--gold">{parcialLabel(m.parcial)}</span>}
          </div>
          <h2 className="truncate text-base font-bold text-white">{m.title}</h2>
        </div>
        <button onClick={onClose} className="neo-reader-close" title="Cerrar (Esc)">✕</button>
      </header>

      <div className="neo-reader-body">
        <section className="neo-reader-doc">
          {m.files.length > 1 && (
            <div className="neo-reader-files">
              {m.files.map((f) => (
                <button
                  key={f.id}
                  onClick={() => (f.kind === 'pdf' ? setFile(f) : window.open(f.url, '_blank'))}
                  className={`neo-reader-file ${file?.id === f.id ? 'neo-reader-file--active' : ''}`}
                  title={f.name}
                >
                  {f.kind === 'link' ? <LinkIcon size={12} /> : null}
                  <span className="truncate">{f.name}</span>
                </button>
              ))}
            </div>
          )}

          {file ? (
            <PdfCanvas url={file.url} />
          ) : (
            <div className="neo-reader-empty">
              <p className="text-sm text-neutral-400">Esta lección no tiene un PDF para mostrar aquí.</p>
              {m.files.length > 0 && (
                <div className="mt-4 space-y-2">
                  {m.files.map((f) => (
                    <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="neo-btn-ghost block text-sm">
                      Abrir {f.name}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <TutorPanel module={m} />
      </div>
    </div>,
    document.body,
  )
}

/**
 * Dibuja el PDF a canvas. Renderiza solo la página visible (no las 40 de golpe)
 * para que no se coma la memoria del navegador en documentos largos.
 */
function PdfCanvas({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const docRef = useRef<any>(null)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(0)
  const [zoom, setZoom] = useState(1.35)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  // Carga del documento (una sola vez por URL)
  useEffect(() => {
    let cancel = false
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const doc = await pdfjs.getDocument({ url }).promise
        if (cancel) return
        docRef.current = doc
        setPages(doc.numPages)
        setPage(1)
      } catch (e) {
        console.error('PdfCanvas', e)
        if (!cancel) setError('No se pudo mostrar el documento aquí.')
      } finally {
        if (!cancel) setLoading(false)
      }
    })()
    return () => {
      cancel = true
      docRef.current?.destroy?.()
      docRef.current = null
    }
  }, [url])

  // Dibujo de la página actual
  const draw = useCallback(async () => {
    const doc = docRef.current
    const canvas = canvasRef.current
    if (!doc || !canvas) return
    const p = await doc.getPage(page)
    // Se multiplica por la densidad de pantalla para que no se vea borroso
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const viewport = p.getViewport({ scale: zoom * dpr })
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = viewport.width
    canvas.height = viewport.height
    canvas.style.width = `${viewport.width / dpr}px`
    canvas.style.height = `${viewport.height / dpr}px`
    await p.render({ canvasContext: ctx, viewport }).promise
  }, [page, zoom])

  useEffect(() => {
    if (!loading && !error) draw()
  }, [draw, loading, error])

  if (error) {
    return (
      <div className="neo-reader-empty">
        <p className="text-sm text-neutral-400">{error}</p>
        <a href={url} target="_blank" rel="noreferrer" className="neo-btn-ghost mt-3 text-sm">
          Abrirlo en otra pestaña
        </a>
      </div>
    )
  }

  return (
    <>
      <div className="neo-reader-page">
        {loading ? <p className="text-sm text-neutral-500">Abriendo el documento…</p> : <canvas ref={canvasRef} />}
      </div>

      {!loading && pages > 0 && (
        <div className="neo-reader-bar">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="neo-reader-nav">
            ←
          </button>
          <span className="neo-reader-count">
            {page} / {pages}
          </span>
          <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} className="neo-reader-nav">
            →
          </button>
          <span className="neo-reader-sep" />
          <button onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(2)))} className="neo-reader-nav" title="Alejar">
            −
          </button>
          <span className="neo-reader-count">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(2.6, +(z + 0.2).toFixed(2)))} className="neo-reader-nav" title="Acercar">
            +
          </button>
        </div>
      )}
    </>
  )
}

/** Sugerencias de arranque: le quitan al estudiante el "no sé qué preguntar". */
const ATAJOS = [
  'Explícamelo como si no supiera nada',
  'Dame un ejemplo práctico',
  '¿Qué debo repasar para el examen?',
]

/** Panel del tutor: resume la lección y responde dudas sobre ESTE material. */
function TutorPanel({ module: m }: { module: ClassModule }) {
  const [text, setText] = useState<string | null>(null) // material en texto (null = cargando)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadModuleText(m.id).then(setText)
  }, [m.id])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, busy])

  async function ask(question: string, mode: 'resumen' | 'pregunta' = 'pregunta') {
    if (busy || !text) return
    setError('')
    setBusy(true)
    if (mode === 'pregunta') setMsgs((p) => [...p, { role: 'user', content: question }])

    const res = await askModule({
      text,
      title: m.title,
      question,
      mode,
      history: msgs.slice(-6),
    })
    setBusy(false)

    if (res.error) setError(res.error)
    else if (res.answer) setMsgs((p) => [...p, { role: 'assistant', content: res.answer as string }])
  }

  function send() {
    const q = draft.trim()
    if (!q) return
    setDraft('')
    ask(q)
  }

  // El material sin texto (p. ej. solo .pptx o un PDF escaneado) no da tutoría
  const sinTexto = text !== null && text.length === 0

  return (
    <aside className="neo-reader-tutor">
      <div className="neo-reader-tutor-top">
        <span className="neo-reader-tutor-badge">
          <SearchIcon size={13} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Tutor de la lección</p>
          <p className="text-[11px] text-neutral-500">Responde con el material de tu catedrático</p>
        </div>
      </div>

      <div className="neo-reader-chat">
        {sinTexto ? (
          <p className="neo-reader-note">
            Este módulo no tiene texto que la IA pueda leer. Si el catedrático sube el PDF de la presentación, el tutor
            podrá explicarte con ese material.
          </p>
        ) : msgs.length === 0 && !busy ? (
          <div className="space-y-3">
            <p className="neo-reader-note">
              Puedo explicarte esta lección con el material que subió tu catedrático. Empieza por donde quieras.
            </p>
            <button onClick={() => ask('', 'resumen')} disabled={!text} className="neo-btn w-full justify-center text-sm disabled:opacity-40">
              Resumir la lección
            </button>
            <div className="space-y-1.5">
              {ATAJOS.map((a) => (
                <button key={a} onClick={() => ask(a)} disabled={!text} className="neo-reader-chip disabled:opacity-40">
                  {a}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {msgs.map((msg, i) => (
              <div key={i} className={`neo-reader-msg ${msg.role === 'user' ? 'neo-reader-msg--me' : ''}`}>
                {msg.content}
              </div>
            ))}
            {busy && <div className="neo-reader-msg neo-reader-msg--wait">Pensando…</div>}
            <div ref={endRef} />
          </div>
        )}

        {error && <p className="mt-3 text-xs text-amber-400">{error}</p>}
      </div>

      {!sinTexto && (
        <div className="neo-reader-ask">
          <input
            className="neo-input flex-1"
            placeholder={text === null ? 'Cargando el material…' : 'Pregúntale al tutor…'}
            value={draft}
            disabled={!text || busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send()
            }}
          />
          <button onClick={send} disabled={!text || busy || !draft.trim()} className="neo-btn text-sm disabled:opacity-40">
            Enviar
          </button>
        </div>
      )}
    </aside>
  )
}
