'use client'

/**
 * LECTOR DE MÓDULO — abre la lección dentro de la plataforma en vez de mandar
 * al usuario a descargar un PDF suelto.
 *
 * Izquierda: el documento con pdfjs y encima una capa de texto invisible, que
 * es lo que permite MARCAR un párrafo y preguntar por él sin reescribirlo.
 * Derecha: el asistente, que cambia según quién entra —
 *   estudiante  -> tutor: explica y guía, no resuelve la tarea.
 *   catedrático -> asistente de cátedra: prepara examen, tarea y detecta huecos.
 * Y una pestaña de apuntes, privada de cada quien.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { askModule, loadModuleText, type ClassModule, type ModuleFile } from '@/backend/services/classModules'
import {
  addNote,
  deleteNote,
  loadNotes,
  NOTES_EVENT,
  type StudyNote,
} from '@/backend/services/studyNotes'
import {
  ensureSession,
  loadSessionMessages,
  saveMessage,
  markPublished,
  archiveAndNew,
  deleteSession,
  listSessions,
  type TutorMessage,
  type TutorSession,
} from '@/backend/services/tutorHistory'
import { parcialLabel } from '@/shared/parciales'
import { LinkIcon, SearchIcon, TrashIcon, ClipboardIcon } from '@/frontend/components/ui/Icons'
import PublishTaskModal from '@/frontend/components/modules/PublishTaskModal'

/** Petición que viaja del documento al asistente. El contador permite repetir lo mismo. */
type AskRequest = { text: string; kind: 'fragmento' | 'pagina'; seq: number }

const TUTOR_MIN = 320
const TUTOR_MAX = 720

export default function ModuleReader({
  module: m,
  isTeacher,
  onClose,
}: {
  module: ClassModule
  isTeacher: boolean
  onClose: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [file, setFile] = useState<ModuleFile | null>(m.files.find((f) => f.kind === 'pdf') ?? null)
  const [tutorWidth, setTutorWidth] = useState(420)
  const [request, setRequest] = useState<AskRequest | null>(null)
  const seqRef = useRef(0)

  useEffect(() => setMounted(true), [])

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

  function askAbout(text: string, kind: 'fragmento' | 'pagina') {
    seqRef.current += 1
    setRequest({ text, kind, seq: seqRef.current })
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

        <AssistantPanel module={m} isTeacher={isTeacher} width={tutorWidth} request={request} />
      </div>
    </div>,
    document.body,
  )
}

/**
 * Dibuja el PDF a canvas y monta encima la capa de texto seleccionable.
 * Arranca AJUSTADO AL ANCHO: con presentaciones apaisadas, un zoom fijo dejaba
 * la hoja más ancha que el panel y marcar texto se volvía una pelea con el
 * scroll horizontal.
 */
function PdfCanvas({
  url,
  onAskAbout,
}: {
  url: string
  onAskAbout: (t: string, k: 'fragmento' | 'pagina') => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const docRef = useRef<any>(null)
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const taskRef = useRef<any>(null) // render en curso, para cancelarlo si llega otro
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [pageText, setPageText] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  // Mientras nadie toque el zoom, la hoja se reajusta sola al ancho disponible
  const [autoFit, setAutoFit] = useState(true)
  const [sel, setSel] = useState<{ text: string; x: number; y: number } | null>(null)

  /** Zoom que hace que la página quepa a lo ancho del panel. */
  const fitZoom = useCallback(async (): Promise<number | null> => {
    const doc = docRef.current
    const wrap = wrapRef.current
    if (!doc || !wrap) return null
    const p = await doc.getPage(1)
    const base = p.getViewport({ scale: 1 })
    const disponible = wrap.clientWidth - 44 // margen del contenedor
    if (disponible <= 0) return null
    return Math.min(2.6, Math.max(0.5, +(disponible / base.width).toFixed(2)))
  }, [])

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
        const z = await fitZoom()
        if (!cancel && z) setZoom(z)
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
  }, [url, fitZoom])

  // Si se arrastra la división, la hoja se reajusta (salvo que se haya fijado zoom)
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || !autoFit) return
    const ro = new ResizeObserver(() => {
      fitZoom().then((z) => {
        if (z) setZoom(z)
      })
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [autoFit, fitZoom, loading])

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
    // Cancela el render anterior: dos render() sobre el mismo canvas corrompen
    // la imagen (se ve volteada) y pdfjs lanza error.
    taskRef.current?.cancel?.()
    canvas.width = vpHi.width
    canvas.height = vpHi.height
    canvas.style.width = `${vpCss.width}px`
    canvas.style.height = `${vpCss.height}px`
    const task = p.render({ canvasContext: ctx, viewport: vpHi })
    taskRef.current = task
    try {
      await task.promise
    } catch (e) {
      if ((e as { name?: string })?.name !== 'RenderingCancelledException') console.error('render', e)
    }

    const content = await p.getTextContent()
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    setPageText(content.items.map((it: any) => it.str ?? '').join(' ').replace(/\s+/g, ' ').trim())

    // Capa de texto: spans transparentes colocados sobre cada palabra
    textDiv.innerHTML = ''
    textDiv.style.width = `${vpCss.width}px`
    textDiv.style.height = `${vpCss.height}px`
    textDiv.style.setProperty('--total-scale-factor', String(zoom))
    const pdfjs = await import('pdfjs-dist')
    const layer = new pdfjs.TextLayer({ textContentSource: content, container: textDiv, viewport: vpCss })
    await layer.render()
  }, [page, zoom])

  useEffect(() => {
    if (!loading && !error) draw()
  }, [draw, loading, error])

  // Al cambiar de página o de zoom, la selección anterior deja de tener sentido
  useEffect(() => setSel(null), [page, zoom])

  function setManualZoom(z: number) {
    setAutoFit(false)
    setZoom(z)
  }

  async function reFit() {
    setAutoFit(true)
    const z = await fitZoom()
    if (z) setZoom(z)
  }

  /** Si se marcó texto del documento, ofrecemos preguntar por esa parte. */
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
      y: rect.top - wrap.top + (wrapRef.current?.scrollTop ?? 0),
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
              onAskAbout(sel.text, 'fragmento')
              setSel(null)
              window.getSelection()?.removeAllRanges()
            }}
          >
            <SearchIcon size={13} /> Preguntar por esto
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
          <button onClick={() => setManualZoom(Math.max(0.5, +(zoom - 0.15).toFixed(2)))} className="neo-reader-nav" title="Alejar">
            −
          </button>
          <span className="neo-reader-count">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setManualZoom(Math.min(2.6, +(zoom + 0.15).toFixed(2)))} className="neo-reader-nav" title="Acercar">
            +
          </button>
          <button
            onClick={reFit}
            className={`neo-reader-fit ${autoFit ? 'neo-reader-fit--on' : ''}`}
            title="Ajustar la hoja al ancho del panel"
          >
            Ajustar
          </button>
          <span className="neo-reader-sep" />
          <button
            onClick={() => onAskAbout(pageText, 'pagina')}
            disabled={!pageText}
            className="neo-reader-askpage disabled:opacity-40"
            title="Sin necesidad de marcar nada"
          >
            <SearchIcon size={12} /> Explicar esta página
          </button>
        </div>
      )}
    </>
  )
}

/** Atajos de arranque, distintos para cada rol. */
const ATAJOS_ALUMNO: { label: string; mode?: 'resumen'; q?: string }[] = [
  { label: 'Resumir la lección', mode: 'resumen' },
  { label: 'Explícamelo como si no supiera nada', q: 'Explícame esta lección como si no supiera nada del tema.' },
  { label: 'Dame un ejemplo práctico', q: 'Dame un ejemplo práctico de lo que explica el material.' },
  { label: '¿Qué debo repasar para el examen?', q: '¿Qué debo repasar de este material para el examen?' },
]

const ATAJOS_PROFE: { label: string; mode?: 'resumen' | 'examen' | 'tarea' | 'huecos'; q?: string }[] = [
  { label: 'Generar preguntas de examen', mode: 'examen' },
  { label: 'Redactar una tarea con este material', mode: 'tarea' },
  { label: '¿Qué temas quedan flojos?', mode: 'huecos' },
  { label: 'Resumen para presentar en clase', mode: 'resumen' },
]

type Tab = 'chat' | 'notas' | 'historial'

/**
 * ¿Hay un modelo con visión configurado? Si no, el botón de adjuntar captura ni
 * se muestra: es preferible no ofrecerlo a que el usuario adjunte algo y choque
 * con un error. Se enciende poniendo NEXT_PUBLIC_VISION_ENABLED=1 (y su
 * OLLAMA_VISION_MODEL en el servidor).
 */
const VISION_ON = process.env.NEXT_PUBLIC_VISION_ENABLED === '1'

/**
 * Panel derecho: conversación + apuntes + historial. El criterio de la IA y los
 * atajos cambian según el rol, porque el catedrático no viene a que le expliquen.
 *
 * La conversación vive en una SESIÓN (ver tutorHistory). "Reiniciar" no borra:
 * archiva la sesión y abre otra, y todas quedan en la pestaña Historial.
 */
function AssistantPanel({
  module: m,
  isTeacher,
  width,
  request,
}: {
  module: ClassModule
  isTeacher: boolean
  width: number
  request: AskRequest | null
}) {
  const [tab, setTab] = useState<Tab>('chat')
  const [text, setText] = useState<string | null>(null) // material en texto (null = cargando)
  const [msgs, setMsgs] = useState<TutorMessage[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notes, setNotes] = useState<StudyNote[]>([])
  const [image, setImage] = useState<{ name: string; b64: string } | null>(null)
  const [saved, setSaved] = useState<Set<string>>(new Set())
  // Respuesta que el catedrático está publicando (índice del mensaje) o null
  const [publishing, setPublishing] = useState<number | null>(null)
  const [sessions, setSessions] = useState<TutorSession[]>([])
  const [viewing, setViewing] = useState<{ session: TutorSession; msgs: TutorMessage[] } | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLInputElement>(null)
  const sessionRef = useRef<string | null>(null) // sesión activa (para usar dentro de ask)

  const atajos = isTeacher ? ATAJOS_PROFE : ATAJOS_ALUMNO

  /** Guarda una respuesta como apunte, una sola vez aunque se pulse varias veces. */
  async function saveAnswer(content: string) {
    if (saved.has(content)) return
    setSaved((p) => new Set(p).add(content))
    const ok = await addNote({ moduleId: m.id, classId: m.classId, content, source: 'tutor' })
    if (!ok) setSaved((p) => { const n = new Set(p); n.delete(content); return n })
  }

  const refreshSessions = useCallback(() => {
    listSessions(m.id).then(setSessions)
  }, [m.id])

  // Material, sesión activa (con sus mensajes), apuntes e historial
  useEffect(() => {
    loadModuleText(m.id).then(setText)
    ensureSession({ moduleId: m.id, classId: m.classId, parcial: m.parcial, role: isTeacher ? 'teacher' : 'student' }).then((sid) => {
      sessionRef.current = sid
      if (sid) loadSessionMessages(sid).then(setMsgs)
      refreshSessions()
    })
    loadNotes(m.id).then((ns) => {
      setNotes(ns)
      setSaved(new Set(ns.filter((n) => n.source === 'tutor').map((n) => n.content)))
    })
  }, [m.id, m.classId, m.parcial, isTeacher, refreshSessions])

  useEffect(() => {
    const refresh = () => loadNotes(m.id).then(setNotes)
    window.addEventListener(NOTES_EVENT, refresh)
    return () => window.removeEventListener(NOTES_EVENT, refresh)
  }, [m.id])

  useEffect(() => {
    if (tab === 'chat' && !viewing) endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, busy, tab, viewing])

  const ask = useCallback(
    async (question: string, mode?: 'resumen' | 'examen' | 'tarea' | 'huecos') => {
      if ((!text && !image) || !sessionRef.current) return
      const sid = sessionRef.current
      setError('')
      setBusy(true)
      setTab('chat')
      setViewing(null)

      const visible = question || atajos.find((a) => a.mode === mode)?.label || ''
      let historial: { role: string; content: string }[] = []
      if (visible) {
        const id = (await saveMessage(sid, m.id, 'user', visible)) ?? `tmp-${Date.now()}`
        setMsgs((p) => {
          historial = p.slice(-6).map((x) => ({ role: x.role, content: x.content }))
          return [...p, { id, role: 'user', content: visible, published: false }]
        })
      }

      const res = await askModule({
        text: text ?? '',
        title: m.title,
        question,
        mode,
        role: isTeacher ? 'teacher' : 'student',
        image: image?.b64,
        history: historial,
      })
      setBusy(false)
      setImage(null)

      if (res.error) {
        setError(res.error)
      } else if (res.answer) {
        const id = (await saveMessage(sid, m.id, 'assistant', res.answer)) ?? `tmp-${Date.now()}`
        setMsgs((p) => [...p, { id, role: 'assistant', content: res.answer as string, published: false }])
        refreshSessions()
      }
    },
    [text, image, m.id, m.title, isTeacher, atajos, refreshSessions],
  )

  // Llega una selección desde el documento
  const lastSeq = useRef(0)
  useEffect(() => {
    if (!request || request.seq === lastSeq.current || busy || !text) return
    lastSeq.current = request.seq
    ask(
      request.kind === 'pagina'
        ? `Explícame lo que dice esta página del material: "${request.text.slice(0, 900)}"`
        : `Explícame esta parte del material: "${request.text}"`,
    )
  }, [request, ask, busy, text])

  function send() {
    const q = draft.trim()
    if ((!q && !image) || busy) return
    setDraft('')
    ask(q || 'Explícame qué se ve en esta imagen y cómo se relaciona con la lección.')
  }

  function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      const s = String(reader.result ?? '')
      setImage({ name: f.name, b64: s.slice(s.indexOf(',') + 1) })
    }
    reader.readAsDataURL(f)
  }

  /** Reiniciar = archivar la conversación (queda en Historial) y abrir otra. */
  async function reiniciar() {
    const old = sessionRef.current
    if (!old) return
    setError('')
    const sid = await archiveAndNew(old, { moduleId: m.id, classId: m.classId, parcial: m.parcial, role: isTeacher ? 'teacher' : 'student' })
    sessionRef.current = sid
    setMsgs([])
    refreshSessions()
  }

  /** Abre una conversación del historial en modo lectura. */
  async function openSession(s: TutorSession) {
    const list = await loadSessionMessages(s.id)
    setViewing({ session: s, msgs: list })
    setTab('chat')
  }

  const sinTexto = text !== null && text.length === 0
  const titulo = isTeacher ? 'Asistente de cátedra' : 'Tutor de la lección'
  const subtitulo = isTeacher ? 'Prepara tu clase con este material' : 'Responde con el material de tu catedrático'
  const shownMsgs = viewing ? viewing.msgs : msgs

  return (
    <aside className="neo-reader-tutor" style={{ width }}>
      <div className="neo-reader-tutor-top">
        <span className="neo-reader-tutor-badge">
          {isTeacher ? <ClipboardIcon size={14} /> : <SearchIcon size={13} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{titulo}</p>
          <p className="truncate text-[11px] text-neutral-500">{subtitulo}</p>
        </div>
        {tab === 'chat' && !viewing && msgs.length > 0 && (
          <button onClick={reiniciar} className="neo-reader-reset" title="Archiva esta conversación (queda en Historial) y empieza otra">
            Reiniciar
          </button>
        )}
      </div>

      <div className="neo-reader-tabs">
        <button onClick={() => { setTab('chat'); setViewing(null) }} className={`neo-reader-tab ${tab === 'chat' ? 'neo-reader-tab--on' : ''}`}>
          {isTeacher ? 'Asistente' : 'Tutor'}
        </button>
        <button onClick={() => setTab('notas')} className={`neo-reader-tab ${tab === 'notas' ? 'neo-reader-tab--on' : ''}`}>
          Apuntes {notes.length > 0 && <span className="neo-reader-tabn">{notes.length}</span>}
        </button>
        <button onClick={() => setTab('historial')} className={`neo-reader-tab ${tab === 'historial' ? 'neo-reader-tab--on' : ''}`}>
          Historial {sessions.length > 0 && <span className="neo-reader-tabn">{sessions.length}</span>}
        </button>
      </div>

      {tab === 'notas' ? (
        <NotesTab module={m} notes={notes} />
      ) : tab === 'historial' ? (
        <HistoryTab
          sessions={sessions}
          onOpen={openSession}
          onDelete={async (id) => { await deleteSession(id); refreshSessions() }}
        />
      ) : (
        <>
          {viewing && (
            <div className="neo-reader-viewing">
              <span className="truncate">Conversación archivada · {new Date(viewing.session.updatedAt).toLocaleDateString('es', { day: '2-digit', month: 'short' })}</span>
              <button onClick={() => setViewing(null)} className="neo-reader-viewback">Volver a la actual</button>
            </div>
          )}
          <div className="neo-reader-chat">
            {sinTexto ? (
              <p className="neo-reader-note">
                Este módulo no tiene texto que la IA pueda leer. Si se sube el PDF de la presentación, podrá apoyarse en
                ese material.
              </p>
            ) : shownMsgs.length === 0 && !busy ? (
              <div className="space-y-3">
                <p className="neo-reader-note">
                  {isTeacher
                    ? 'Trabajo sobre el material que subiste. Puedo sacarte preguntas de examen, un borrador de tarea o decirte qué quedó flojo.'
                    : 'Puedo explicarte esta lección con el material que subió tu catedrático. Marca un párrafo del documento o empieza por aquí.'}
                </p>
                <div className="space-y-1.5">
                  {atajos.map((a, i) => (
                    <button
                      key={a.label}
                      onClick={() => ask(a.q ?? '', a.mode)}
                      disabled={!text}
                      className={`neo-reader-chip disabled:opacity-40 ${i === 0 ? 'neo-reader-chip--main' : ''}`}
                      style={{ animationDelay: `${i * 60}ms` }}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {shownMsgs.map((msg, i) => (
                  <div key={msg.id || i} className={`neo-reader-msg ${msg.role === 'user' ? 'neo-reader-msg--me' : ''}`}>
                    {msg.content}
                    {msg.role === 'assistant' && !viewing && (
                      <div className="neo-reader-actions">
                        <button
                          onClick={() => saveAnswer(msg.content)}
                          disabled={saved.has(msg.content)}
                          className={`neo-reader-save ${saved.has(msg.content) ? 'neo-reader-save--done' : ''}`}
                          title={saved.has(msg.content) ? 'Ya está en tus apuntes' : 'Guardar esta explicación en mis apuntes'}
                        >
                          {saved.has(msg.content) ? 'Guardado ✓' : 'Guardar en apuntes'}
                        </button>
                        {isTeacher &&
                          (msg.published ? (
                            <span className="neo-reader-save neo-reader-save--done">Publicada ✓</span>
                          ) : (
                            <button
                              onClick={() => setPublishing(i)}
                              className="neo-reader-save neo-reader-save--pub"
                              title="Publicar esta respuesta como tarea de la clase"
                            >
                              Publicar como tarea
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
                {busy && !viewing && (
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

          {!sinTexto && !viewing && (
            <div className="neo-reader-ask">
              {image && (
                <div className="neo-reader-img">
                  <span className="truncate">{image.name}</span>
                  <button onClick={() => setImage(null)} title="Quitar">✕</button>
                </div>
              )}
              <div className="flex gap-2">
                {VISION_ON && (
                  <>
                    <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={onImage} />
                    <button
                      onClick={() => imgRef.current?.click()}
                      disabled={busy}
                      className="neo-reader-clip disabled:opacity-40"
                      title="Adjuntar una captura para que la lea"
                    >
                      +
                    </button>
                  </>
                )}
                <input
                  className="neo-input flex-1"
                  placeholder={text === null ? 'Cargando el material…' : isTeacher ? 'Pídeme algo sobre este material…' : 'Pregúntale al tutor…'}
                  value={draft}
                  disabled={!text || busy}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') send()
                  }}
                />
                <button
                  onClick={send}
                  disabled={!text || busy || (!draft.trim() && !image)}
                  className="neo-btn text-sm disabled:opacity-40"
                >
                  Enviar
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {publishing !== null && msgs[publishing] && (
        <PublishTaskModal
          classId={m.classId}
          defaultParcial={m.parcial}
          source={msgs[publishing].content}
          moduleTitle={m.title}
          onClose={() => setPublishing(null)}
          onPublished={() => {
            const idx = publishing
            const msg = msgs[idx]
            if (msg?.id) markPublished(msg.id)
            setMsgs((p) => p.map((x, j) => (j === idx ? { ...x, published: true } : x)))
            setPublishing(null)
          }}
        />
      )}
    </aside>
  )
}

/** Pestaña de historial: las conversaciones pasadas, clasificadas por parcial. */
function HistoryTab({
  sessions,
  onOpen,
  onDelete,
}: {
  sessions: TutorSession[]
  onOpen: (s: TutorSession) => void
  onDelete: (id: string) => void
}) {
  const conCharla = sessions.filter((s) => s.count > 0)
  return (
    <div className="neo-reader-chat">
      {conCharla.length === 0 ? (
        <p className="neo-reader-note">
          Aquí quedarán tus conversaciones con el asistente. Cuando pulses “Reiniciar”, la charla actual se guarda aquí
          en vez de borrarse.
        </p>
      ) : (
        <div className="space-y-2">
          {conCharla.map((s) => (
            <div key={s.id} className="neo-hist">
              <button onClick={() => onOpen(s)} className="min-w-0 flex-1 text-left">
                <div className="neo-hist-top">
                  {s.parcial && <span className="neo-hist-parcial">{parcialLabel(s.parcial)}</span>}
                  {!s.archived && <span className="neo-hist-active">Actual</span>}
                  <span className="neo-hist-date">
                    {new Date(s.updatedAt).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
                  </span>
                </div>
                <p className="neo-hist-title">{s.title || 'Conversación'}</p>
                <p className="neo-hist-count">{s.count} mensaje{s.count === 1 ? '' : 's'}</p>
              </button>
              <button onClick={() => onDelete(s.id)} className="neo-hist-del" title="Borrar del historial">
                <TrashIcon size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Pestaña de apuntes: lo guardado del asistente más lo que se escriba a mano. */
function NotesTab({ module: m, notes }: { module: ClassModule; notes: StudyNote[] }) {
  const [draft, setDraft] = useState('')

  async function save() {
    const c = draft.trim()
    if (!c) return
    setDraft('')
    await addNote({ moduleId: m.id, classId: m.classId, content: c, source: 'propio' })
  }

  return (
    <>
      <div className="neo-reader-chat">
        {notes.length === 0 ? (
          <p className="neo-reader-note">
            Aquí se guarda lo tuyo: lo que escribas y las explicaciones que rescates del asistente. Es privado, nadie
            más lo ve.
          </p>
        ) : (
          <div className="space-y-2.5">
            {notes.map((n) => (
              <article key={n.id} className="neo-reader-noteitem">
                <div className="neo-reader-notetop">
                  <span className={`neo-reader-notetag ${n.source === 'tutor' ? 'neo-reader-notetag--ai' : ''}`}>
                    {n.source === 'tutor' ? 'Del asistente' : 'Mío'}
                  </span>
                  <span className="text-[10px] text-neutral-600">
                    {new Date(n.createdAt).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
                  </span>
                  <button onClick={() => deleteNote(n.id)} className="ml-auto text-neutral-600 hover:text-red-400" title="Borrar apunte">
                    <TrashIcon size={12} />
                  </button>
                </div>
                <p className="neo-reader-notebody">{n.content}</p>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="neo-reader-ask">
        <div className="flex w-full gap-2">
          <textarea
            className="neo-input flex-1 resize-none"
            rows={2}
            placeholder="Escribe un apunte…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                save()
              }
            }}
          />
          <button onClick={save} disabled={!draft.trim()} className="neo-btn text-sm disabled:opacity-40">
            Guardar
          </button>
        </div>
      </div>
    </>
  )
}
