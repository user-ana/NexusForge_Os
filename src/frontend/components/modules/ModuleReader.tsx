'use client'

/**
 * LECTOR DE MÓDULO — abre la lección dentro de la plataforma en vez de mandar
 * al estudiante a descargar un PDF suelto.
 *
 * A la izquierda el documento se dibuja con pdfjs y encima lleva una capa de
 * texto invisible: eso es lo que permite SELECCIONAR un párrafo y preguntarle
 * al tutor justo por esa parte, en vez de tener que reescribirlo.
 * A la derecha el tutor, que responde apoyándose SOLO en el material que subió
 * el catedrático. El ancho del panel se ajusta arrastrando la división.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { askModule, loadModuleText, type ClassModule, type ModuleFile } from '@/backend/services/classModules'
import { parcialLabel } from '@/shared/parciales'
import { LinkIcon, SearchIcon } from '@/frontend/components/ui/Icons'

type Msg = { role: 'user' | 'assistant'; content: string }
/** Petición que viaja del documento al tutor. El contador permite repetir la misma selección. */
type AskRequest = { text: string; seq: number }

const TUTOR_MIN = 320
const TUTOR_MAX = 720

export default function ModuleReader({ module: m, onClose }: { module: ClassModule; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  const [file, setFile] = useState<ModuleFile | null>(m.files.find((f) => f.kind === 'pdf') ?? null)
  const [tutorWidth, setTutorWidth] = useState(400)
  const [request, setRequest] = useState<AskRequest | null>(null)
  const seqRef = useRef(0)

  useEffect(() => setMounted(true), [])

  // Cerrar con Escape, como cualquier visor a pantalla completa
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /** Arrastre de la división: se escucha en toda la ventana para que el puntero
   *  pueda salirse del asa sin que se corte el gesto. */
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const move = (ev: MouseEvent) => {
      const w = window.innerWidth - ev.clientX
      setTutorWidth(Math.min(TUTOR_MAX, Math.max(TUTOR_MIN, w)))
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.classList.remove('neo-resizing')
    }
    document.body.classList.add('neo-resizing')
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }, [])

  function askAbout(text: string) {
    seqRef.current += 1
    setRequest({ text, seq: seqRef.current })
  }

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
            <PdfCanvas url={file.url} onAskAbout={askAbout} />
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

        <div className="neo-reader-grip" onMouseDown={startResize} title="Arrastra para ajustar el ancho">
          <span />
        </div>

        <TutorPanel module={m} width={tutorWidth} request={request} />
      </div>
    </div>,
    document.body,
  )
}

/**
 * Dibuja el PDF a canvas y monta encima la capa de texto seleccionable.
 * Renderiza solo la página visible (no las 40 de golpe) para no comerse la
 * memoria del navegador en documentos largos.
 */
function PdfCanvas({ url, onAskAbout }: { url: string; onAskAbout: (t: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const docRef = useRef<any>(null)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(0)
  const [zoom, setZoom] = useState(1.35)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  // Botón flotante que aparece junto al texto que el estudiante marcó
  const [sel, setSel] = useState<{ text: string; x: number; y: number } | null>(null)

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

  /** Dibuja la página actual: primero el canvas, luego la capa de texto encima. */
  const draw = useCallback(async () => {
    const doc = docRef.current
    const canvas = canvasRef.current
    const textDiv = textRef.current
    if (!doc || !canvas || !textDiv) return

    const p = await doc.getPage(page)
    // El canvas se dibuja a la densidad real de la pantalla (nítido); la capa
    // de texto usa el tamaño CSS, que es donde el usuario hace la selección.
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const vpCss = p.getViewport({ scale: zoom })
    const vpHi = p.getViewport({ scale: zoom * dpr })

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = vpHi.width
    canvas.height = vpHi.height
    canvas.style.width = `${vpCss.width}px`
    canvas.style.height = `${vpCss.height}px`
    await p.render({ canvasContext: ctx, viewport: vpHi }).promise

    // Capa de texto: spans transparentes colocados sobre cada palabra
    textDiv.innerHTML = ''
    textDiv.style.width = `${vpCss.width}px`
    textDiv.style.height = `${vpCss.height}px`
    textDiv.style.setProperty('--total-scale-factor', String(zoom))
    const pdfjs = await import('pdfjs-dist')
    const layer = new pdfjs.TextLayer({
      textContentSource: await p.getTextContent(),
      container: textDiv,
      viewport: vpCss,
    })
    await layer.render()
  }, [page, zoom])

  useEffect(() => {
    if (!loading && !error) draw()
  }, [draw, loading, error])

  // Al cambiar de página o de zoom, la selección anterior deja de tener sentido
  useEffect(() => setSel(null), [page, zoom])

  /** Si el estudiante marcó texto del documento, ofrecemos preguntarle al tutor. */
  function onMouseUp() {
    const s = window.getSelection()
    const texto = s?.toString().trim() ?? ''
    if (!s || texto.length < 3 || !textRef.current?.contains(s.anchorNode)) {
      setSel(null)
      return
    }
    const rect = s.getRangeAt(0).getBoundingClientRect()
    const wrap = wrapRef.current?.getBoundingClientRect()
    if (!wrap) return
    setSel({
      text: texto.replace(/\s+/g, ' '),
      x: rect.left - wrap.left + rect.width / 2,
      y: rect.top - wrap.top,
    })
  }

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
      <div className="neo-reader-page" ref={wrapRef} onMouseUp={onMouseUp}>
        {loading ? (
          <p className="text-sm text-neutral-500">Abriendo el documento…</p>
        ) : (
          <div className="neo-reader-sheet">
            <canvas ref={canvasRef} />
            <div className="neo-reader-textlayer" ref={textRef} />
          </div>
        )}

        {sel && (
          <button
            className="neo-reader-selbtn"
            style={{ left: sel.x, top: sel.y }}
            onClick={() => {
              onAskAbout(sel.text)
              setSel(null)
              window.getSelection()?.removeAllRanges()
            }}
          >
            <SearchIcon size={13} /> Preguntar al tutor
          </button>
        )}
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
          <span className="neo-reader-sep" />
          <span className="neo-reader-tip">Marca un párrafo para preguntar por él</span>
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
function TutorPanel({
  module: m,
  width,
  request,
}: {
  module: ClassModule
  width: number
  request: AskRequest | null
}) {
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

  const ask = useCallback(
    async (question: string, mode: 'resumen' | 'pregunta' = 'pregunta') => {
      if (!text) return
      setError('')
      setBusy(true)
      if (mode === 'pregunta') setMsgs((p) => [...p, { role: 'user', content: question }])

      const res = await askModule({ text, title: m.title, question, mode, history: msgs.slice(-6) })
      setBusy(false)

      if (res.error) setError(res.error)
      else if (res.answer) setMsgs((p) => [...p, { role: 'assistant', content: res.answer as string }])
    },
    [text, m.title, msgs],
  )

  // Llega una selección desde el documento: se pregunta por ese fragmento
  const lastSeq = useRef(0)
  useEffect(() => {
    if (!request || request.seq === lastSeq.current || busy || !text) return
    lastSeq.current = request.seq
    ask(`Explícame esta parte del material: "${request.text}"`)
  }, [request, ask, busy, text])

  function send() {
    const q = draft.trim()
    if (!q || busy) return
    setDraft('')
    ask(q)
  }

  // El material sin texto (p. ej. solo .pptx o un PDF escaneado) no da tutoría
  const sinTexto = text !== null && text.length === 0

  return (
    <aside className="neo-reader-tutor" style={{ width }}>
      <div className="neo-reader-tutor-top">
        <span className="neo-reader-tutor-badge">
          <SearchIcon size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">Tutor de la lección</p>
          <p className="truncate text-[11px] text-neutral-500">Responde con el material de tu catedrático</p>
        </div>
        {msgs.length > 0 && (
          <button
            onClick={() => {
              setMsgs([])
              setError('')
            }}
            className="neo-reader-reset"
            title="Volver al inicio del tutor"
          >
            Inicio
          </button>
        )}
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
              Puedo explicarte esta lección con el material que subió tu catedrático. Marca un párrafo del documento o
              empieza por aquí.
            </p>
            <button onClick={() => ask('', 'resumen')} disabled={!text} className="neo-btn w-full justify-center text-sm disabled:opacity-40">
              Resumir la lección
            </button>
            <div className="space-y-1.5">
              {ATAJOS.map((a, i) => (
                <button
                  key={a}
                  onClick={() => ask(a)}
                  disabled={!text}
                  className="neo-reader-chip disabled:opacity-40"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
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
            {busy && (
              <div className="neo-reader-msg neo-reader-msg--wait">
                <span className="neo-reader-dots">
                  <i /><i /><i />
                </span>
              </div>
            )}
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
