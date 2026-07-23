'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSession, displayName } from '@/frontend/session/session'
import NeoSelect from '@/frontend/components/ui/NeoSelect'
import NeoDate from '@/frontend/components/ui/NeoDate'
import { getClasses, loadClasses, type Klass } from '@/backend/services/classes'
import {
  createClassTask,
  uploadTaskPdf,
  extractPdfText,
  summarizeText,
  type Deliverable,
  type DeliverableKind,
} from '@/backend/services/classTasks'
import { createProject } from '@/backend/services/projects'
import { PARCIAL_OPTIONS, type ParcialCode } from '@/shared/parciales'

/* Tipos de evidencia que puede pedir el catedrático (definen el progreso real). */
const DELIVERABLES: { kind: DeliverableKind; label: string; hint: string }[] = [
  { kind: 'files', label: 'Archivos', hint: 'Documentos, código o entregables' },
  { kind: 'screenshot', label: 'Capturas o video', hint: 'Evidencia visual del resultado' },
  { kind: 'github', label: 'Enlace de GitHub', hint: 'Repositorio del trabajo' },
  { kind: 'commits', label: 'Commits mínimos', hint: 'Cantidad mínima de aportes' },
  { kind: 'per_requirement', label: 'Evidencia por requisito', hint: 'Prueba de cada punto' },
  { kind: 'text', label: 'Texto o reflexión', hint: 'Explicación escrita' },
]

const DRAFT_KEY = 'nf_activity_draft'

/* Horas seleccionables (cada 30 min) + 11:59 p. m., para el selector bonito. */
const TIME_OPTIONS: { value: string; label: string }[] = (() => {
  const out: { value: string; label: string }[] = []
  const fmt = (h: number, m: number) => {
    const ap = h < 12 ? 'a. m.' : 'p. m.'
    const h12 = h % 12 === 0 ? 12 : h % 12
    return `${h12}:${String(m).padStart(2, '0')} ${ap}`
  }
  for (let h = 0; h < 24; h++) for (const m of [0, 30]) out.push({ value: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, label: fmt(h, m) })
  out.push({ value: '23:59', label: '11:59 p. m.' })
  return out
})()

/** Deriva un título a partir del texto del PDF (instantáneo, sin IA). */
function deriveTitle(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  const m = clean.match(/(?:t[ií]tulo|tema|objetivo)\s*:\s*([^.\n]{4,70})/i)
  let t = (m ? m[1] : clean.split(/[.\n:]/)[0]).replace(/^tarea\s+/i, '').trim()
  const words = t.split(' ')
  if (words.length > 9) t = words.slice(0, 9).join(' ')
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''
}

export default function ActivityStudioPage() {
  return (
    <Suspense fallback={<div className="p-8 text-neutral-500">Cargando estudio…</div>}>
      <Studio />
    </Suspense>
  )
}

function Studio() {
  const router = useRouter()
  const search = useSearchParams()
  const [classes, setClasses] = useState<Klass[]>([])

  // ---- Estado de la actividad ----
  const [kind, setKind] = useState<'tarea' | 'proyecto'>('tarea')
  const [teamSize, setTeamSize] = useState(4)
  const [classId, setClassId] = useState('')
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [parcial, setParcial] = useState('')
  const [dueDate, setDueDate] = useState('') // 'YYYY-MM-DD'
  const [dueTime, setDueTime] = useState('23:59') // 'HH:MM'
  const [points, setPoints] = useState(20)
  const [reminders, setReminders] = useState(true)
  const [showOnPublish, setShowOnPublish] = useState(true)
  const [group, setGroup] = useState(false)
  const [delivs, setDelivs] = useState<Deliverable[]>([{ kind: 'files' }])

  // ---- PDF + IA ----
  type PdfStatus = 'idle' | 'uploading' | 'reading' | 'done' | 'error'
  const [pdfUrl, setPdfUrl] = useState('')
  const [pdfName, setPdfName] = useState('')
  const [pdfStatus, setPdfStatus] = useState<PdfStatus>('idle')
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const instrRef = useRef<HTMLTextAreaElement>(null)

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [savedNote, setSavedNote] = useState('')

  // Cargar clases del catedrático + preseleccionar la del query (?class=)
  useEffect(() => {
    loadClasses().then(() => {
      const me = getSession()?.id
      const mine = getClasses().filter((c) => c.teacher === me)
      setClasses(mine)
      const q = search.get('class')
      setClassId((prev) => prev || (q && mine.some((c) => c.id === q) ? q : mine[0]?.id ?? ''))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Restaurar borrador local (si existe)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const d = JSON.parse(raw)
      if (d.title) setTitle(d.title)
      if (d.instructions) setInstructions(d.instructions)
      if (d.parcial) setParcial(d.parcial)
      if (d.dueDate) setDueDate(d.dueDate)
      if (d.dueTime) setDueTime(d.dueTime)
      if (typeof d.points === 'number') setPoints(d.points)
      if (typeof d.group === 'boolean') setGroup(d.group)
      if (Array.isArray(d.delivs)) setDelivs(d.delivs)
    } catch {
      /* ignore */
    }
  }, [])

  const currentClass = useMemo(() => classes.find((c) => c.id === classId), [classes, classId])
  const teacherName = displayName(getSession())
  const dueEpoch = dueDate ? new Date(`${dueDate}T${dueTime || '23:59'}`).getTime() : null

  function toggleDeliv(kind: DeliverableKind) {
    setDelivs((prev) =>
      prev.some((d) => d.kind === kind)
        ? prev.filter((d) => d.kind !== kind)
        : [...prev, kind === 'commits' ? { kind, min: 3 } : { kind }],
    )
  }
  function setCommitsMin(min: number) {
    setDelivs((prev) => prev.map((d) => (d.kind === 'commits' ? { ...d, min } : d)))
  }
  const hasDeliv = (k: DeliverableKind) => delivs.some((d) => d.kind === k)

  // Inserta markdown simple alrededor de la selección de instrucciones
  function wrap(before: string, after = before) {
    const el = instrRef.current
    if (!el) return
    const s = el.selectionStart, e = el.selectionEnd
    const val = instructions
    const sel = val.slice(s, e) || 'texto'
    const next = val.slice(0, s) + before + sel + after + val.slice(e)
    setInstructions(next)
    requestAnimationFrame(() => { el.focus(); el.selectionStart = s + before.length; el.selectionEnd = s + before.length + sel.length })
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setErr('El archivo debe ser un PDF.'); return
    }
    if (!classId) { setErr('Elige primero la clase.'); return }
    setErr(''); setPdfName(file.name); setPdfStatus('uploading')
    const [url, text] = await Promise.all([uploadTaskPdf(classId, file), extractPdfText(file).catch(() => '')])
    if (!url) { setPdfStatus('error'); setErr('No se pudo subir el PDF.'); return }
    setPdfUrl(url)
    if (text && text.length >= 20) {
      // El título se rellena al instante desde el PDF (si estaba vacío)…
      setTitle((prev) => (prev.trim() ? prev : deriveTitle(text)))
      // …y la IA redacta las instrucciones.
      setPdfStatus('reading')
      const r = await summarizeText(text)
      if (r && r.summary) setInstructions((prev) => (prev.trim() ? prev : r.summary))
    }
    setPdfStatus('done')
  }
  function removePdf() {
    setPdfUrl(''); setPdfName(''); setPdfStatus('idle')
    if (fileRef.current) fileRef.current.value = ''
  }

  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, instructions, parcial, dueDate, dueTime, points, group, delivs }))
      setSavedNote('Borrador guardado')
      setTimeout(() => setSavedNote(''), 1800)
    } catch { /* ignore */ }
  }

  async function publish() {
    if (!classId) return setErr('Elige la clase destinataria.')
    if (!title.trim()) return setErr('Ponle un título a la actividad.')
    setErr(''); setBusy(true)

    // ---- PROYECTO: se crea en el catálogo de la clase ----
    if (kind === 'proyecto') {
      const req = delivs.map((d) => delivLabel(d)).join(' · ')
      const p = await createProject({
        classId,
        title: title.trim(),
        description: instructions,
        objectives: '',
        deliverables: req,
        rubric: [],
        dueDate: dueEpoch ? new Date(dueEpoch).toLocaleDateString('es') : '',
        teamSize,
        groupMode: 'open',
        leaderMode: 'first',
        parcial: (parcial || '') as ParcialCode,
        briefUrl: pdfUrl,
        requirements: req,
      })
      setBusy(false)
      if (!p) return setErr('No se pudo crear el proyecto. Intenta de nuevo.')
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
      router.push(`/dashboard/classes/${classId}`)
      return
    }

    // ---- TAREA ----
    const ok = await createClassTask({
      classId,
      title,
      description: instructions,
      parcial,
      pdfUrl,
      dueDate: dueEpoch,
      points,
      deliverables: delivs,
      reminders,
      showOnPublish,
      group,
    })
    setBusy(false)
    if (!ok) return setErr('No se pudo publicar. Intenta de nuevo.')
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
    router.push(`/dashboard/classes/${classId}`)
  }

  const busyPdf = pdfStatus === 'uploading' || pdfStatus === 'reading'

  return (
    <main className="neo-studio">
      {/* Barra superior */}
      <div className="neo-studio-top">
        <div className="min-w-0">
          <Link href={currentClass ? `/dashboard/classes/${classId}` : '/dashboard/classes'} className="neo-studio-back">← Volver a la clase</Link>
          <p className="neo-studio-kicker">Estudio de publicación</p>
          <h1 className="neo-studio-title">Crea una actividad <span>clara y visual</span></h1>
          <p className="neo-studio-sub">Configura la actividad y observa en tiempo real cómo la recibirá el estudiante.</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {savedNote && <span className="text-xs text-emerald-400">{savedNote}</span>}
          <button onClick={saveDraft} className="neo-btn-ghost text-sm">Guardar borrador</button>
          <button onClick={publish} disabled={busy || busyPdf} className="neo-btn text-sm">
            {busy ? 'Publicando…' : kind === 'proyecto' ? 'Publicar proyecto' : 'Publicar y notificar'}
          </button>
        </div>
      </div>

      {/* Stepper (guía visual) */}
      <div className="neo-stepper">
        {['Contenido', 'Configuración', 'Destinatarios', 'Publicación'].map((s, i) => (
          <div key={s} className={`neo-step ${i === 0 ? 'neo-step--active' : ''}`}>
            <span className="neo-step-n">{i + 1}</span>
            <span className="neo-step-l">{s}</span>
          </div>
        ))}
      </div>

      <div className="neo-studio-grid">
        {/* ── Constructor ── */}
        <div className="neo-studio-left">
          {/* PASO 1 · Contenido */}
          <section className="neo-sec">
            <div className="neo-sec-head"><span className="neo-sec-n">Paso 01</span><h2>¿Qué deseas publicar?</h2></div>

            <div className="neo-typegrid">
              <button onClick={() => setKind('tarea')} className={`neo-typebtn ${kind === 'tarea' ? 'neo-typebtn--active' : ''}`}>
                <span className="neo-typebtn-ic"><CheckIc /></span>
                <span><b>Tarea</b><small>Actividad puntual o práctica</small></span>
              </button>
              <button onClick={() => setKind('proyecto')} className={`neo-typebtn ${kind === 'proyecto' ? 'neo-typebtn--active' : ''}`}>
                <span className="neo-typebtn-ic"><BranchIc /></span>
                <span><b>Proyecto</b><small>Trabajo grupal por requisitos</small></span>
              </button>
            </div>

            <label className="neo-label mt-4">Título</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="neo-input w-full" placeholder="Ej. Configurar servidor web seguro" />

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="neo-label">Clase</label>
                <NeoSelect
                  value={classId}
                  onChange={setClassId}
                  options={classes.length ? classes.map((c) => ({ value: c.id, label: c.section ? `${c.name} · ${c.section}` : c.name })) : [{ value: '', label: 'No tienes clases' }]}
                />
              </div>
              <div>
                <label className="neo-label">Destinatarios</label>
                <div className="neo-input flex w-full items-center justify-between">
                  <span>Toda la clase</span>
                  <span className="text-xs text-neutral-500">{currentClass ? `${currentClass.roster.length} estudiantes` : '—'}</span>
                </div>
              </div>
            </div>

            <label className="neo-label mt-4">Instrucciones</label>
            <div className="neo-editor">
              <div className="neo-editor-bar">
                <button onClick={() => wrap('**')} title="Negrita"><b>B</b></button>
                <button onClick={() => wrap('*')} title="Cursiva"><i>I</i></button>
                <button onClick={() => wrap('\n- ', '')} title="Lista">• Lista</button>
                <button onClick={() => wrap('[', '](url)')} title="Enlace">Enlace</button>
                <button onClick={() => wrap('`')} title="Código">Código</button>
              </div>
              <textarea ref={instrRef} value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={5} className="neo-editor-area" placeholder="Explica qué deben hacer, cómo y con qué evidencia." />
            </div>

            {/* PDF con lectura de IA */}
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
            {pdfStatus === 'idle' ? (
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files?.[0]) }}
                className={`neo-pdfdrop mt-4 ${drag ? 'neo-pdfdrop--over' : ''}`}
              >
                <FileIc />
                <div>
                  <p className="neo-pdfdrop-title">Arrastra archivos o selecciónalos</p>
                  <p className="neo-pdfdrop-sub">PDF, guía o plantilla · la IA lee el PDF y redacta las instrucciones</p>
                </div>
              </div>
            ) : (
              <div className={`neo-pdffile mt-4 ${busyPdf ? 'neo-pdffile--busy' : ''}`}>
                <FileIc />
                <div className="neo-pdffile-info">
                  <span className="neo-pdffile-name">{pdfName}</span>
                  <span className="neo-pdffile-state">
                    {pdfStatus === 'uploading' && 'Subiendo…'}
                    {pdfStatus === 'reading' && 'La IA está leyendo el PDF…'}
                    {pdfStatus === 'done' && 'Documento listo'}
                    {pdfStatus === 'error' && 'No se pudo procesar'}
                  </span>
                </div>
                {busyPdf ? <span className="neo-pdfspin" /> : <button onClick={removePdf} className="neo-pdffile-x">✕</button>}
              </div>
            )}
          </section>

          {/* PASO 2 · Configuración */}
          <section className="neo-sec">
            <div className="neo-sec-head"><span className="neo-sec-n">Paso 02</span><h2>Configuración de entrega</h2></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="neo-label">Fecha de vencimiento</label>
                <NeoDate value={dueDate} onChange={setDueDate} />
              </div>
              <div>
                <label className="neo-label">Hora</label>
                <NeoSelect value={dueTime} onChange={setDueTime} options={TIME_OPTIONS} />
              </div>
              {kind === 'proyecto' && (
                <div>
                  <label className="neo-label">Integrantes por grupo</label>
                  <div className="neo-input flex items-center gap-2">
                    <input type="number" min={1} max={12} value={teamSize} onChange={(e) => setTeamSize(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} className="w-full bg-transparent outline-none" />
                    <span className="text-xs text-neutral-500">POR GRUPO</span>
                  </div>
                </div>
              )}
              <div>
                <label className="neo-label">Puntaje</label>
                <div className="neo-input flex items-center gap-2">
                  <input type="number" min={0} max={100} value={points} onChange={(e) => setPoints(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} className="w-full bg-transparent outline-none" />
                  <span className="text-xs text-neutral-500">PTS</span>
                </div>
              </div>
            </div>
            <div className="mt-3">
              <label className="neo-label">Parcial (opcional)</label>
              <div className="sm:w-1/2">
                <NeoSelect value={parcial} onChange={setParcial} options={PARCIAL_OPTIONS} />
              </div>
            </div>

            <ToggleRow icon={<BellIc />} title="Recordatorios automáticos" sub="Notificar 72 h, 24 h y 6 h antes del vencimiento" on={reminders} onToggle={() => setReminders((v) => !v)} />
            <ToggleRow icon={<EyeIc />} title="Mostrar al publicar" sub="La actividad aparecerá de inmediato en «Mis tareas»" on={showOnPublish} onToggle={() => setShowOnPublish((v) => !v)} />
          </section>

          {/* PASO 3 · ¿Qué debe entregar? */}
          <section className="neo-sec">
            <div className="neo-sec-head"><span className="neo-sec-n">Paso 03</span><h2>¿Qué debe entregar el estudiante?</h2></div>
            <p className="mb-3 text-sm text-neutral-500">Con esto la plataforma calcula el progreso real, no solo «entregado sí/no».</p>
            <div className="neo-delivgrid">
              {DELIVERABLES.map((d) => {
                const on = hasDeliv(d.kind)
                return (
                  <button key={d.kind} onClick={() => toggleDeliv(d.kind)} className={`neo-deliv ${on ? 'neo-deliv--on' : ''}`}>
                    <span className="neo-deliv-check">{on ? <CheckIc /> : null}</span>
                    <span><b>{d.label}</b><small>{d.hint}</small></span>
                    {d.kind === 'commits' && on && (
                      <input
                        type="number" min={1} value={delivs.find((x) => x.kind === 'commits')?.min ?? 3}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setCommitsMin(Math.max(1, Number(e.target.value) || 1))}
                        className="neo-deliv-min"
                      />
                    )}
                  </button>
                )
              })}
            </div>
            <ToggleRow icon={<UsersIc />} title="Entrega grupal" sub="La entrega es por grupo, no individual" on={group} onToggle={() => setGroup((v) => !v)} />
          </section>

          {err && <p className="text-sm text-amber-400">{err}</p>}
        </div>

        {/* ── Vista previa del estudiante (en vivo) ── */}
        <div className="neo-studio-right">
          <div className="neo-prev-flag"><span className="neo-live-dot" /> Vista del estudiante</div>
          <StudentPreview
            title={title}
            instructions={instructions}
            className={currentClass ? (currentClass.section ? `${currentClass.name} · ${currentClass.section}` : currentClass.name) : 'Tu clase'}
            teacherName={teacherName}
            dueEpoch={dueEpoch}
            points={points}
            group={kind === 'proyecto' ? true : group}
            kind={kind}
            pdfName={pdfName}
            delivs={delivs}
          />
          <p className="neo-prev-note"><Spark /> Los cambios del formulario se reflejan aquí antes de publicar.</p>
        </div>
      </div>
    </main>
  )
}

/* ---------- Vista previa ---------- */
function StudentPreview({
  title, instructions, className, teacherName, dueEpoch, points, group, kind, pdfName, delivs,
}: {
  title: string; instructions: string; className: string; teacherName: string
  dueEpoch: number | null; points: number; group: boolean; kind: 'tarea' | 'proyecto'
  pdfName: string; delivs: Deliverable[]
}) {
  const esProyecto = kind === 'proyecto'
  const [hint, setHint] = useState(false)
  const dueTxt = dueEpoch
    ? new Date(dueEpoch).toLocaleDateString('es', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })
    : 'Sin fecha límite'
  const initials = teacherName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '·'
  return (
    <article className="neo-prev-card">
      <div className="neo-prev-top">
        <span className="neo-prev-badge">{esProyecto || group ? <UsersIc /> : <CheckIc />} {esProyecto ? 'Proyecto grupal' : group ? 'Tarea grupal' : 'Tarea individual'}</span>
        <span className="neo-prev-new">NUEVA</span>
      </div>
      <p className="neo-prev-class">{className}</p>
      <h3 className="neo-prev-title">{title || (esProyecto ? 'Título del proyecto' : 'Título de la actividad')}</h3>
      <p className="neo-prev-instr">{instructions ? stripMd(instructions) : 'Las instrucciones aparecerán aquí conforme las escribas.'}</p>

      <div className="neo-prev-author">
        <span className="neo-prev-av">{initials}</span>
        <div><small>Publicado por</small><b>{teacherName || 'Catedrático'}</b></div>
        <span className="neo-prev-ago">Ahora</span>
      </div>

      <div className="neo-prev-facts">
        <div><small>Vence</small><b>{dueTxt}</b></div>
        <div><small>Valor</small><b>{points} puntos</b></div>
        <div><small>Asignada a</small><b>{esProyecto || group ? 'Grupos' : 'Toda la clase'}</b></div>
      </div>

      {pdfName && (
        <div className="neo-prev-file"><FileIc /><span>{pdfName}</span><span className="neo-prev-file-cta">Ver guía</span></div>
      )}

      {delivs.length > 0 && (
        <div className="neo-prev-delivs">
          <small>Debes entregar</small>
          <div className="neo-prev-delivs-row">
            {delivs.map((d) => <span key={d.kind} className="neo-prev-chip">{delivLabel(d)}</span>)}
          </div>
        </div>
      )}

      <div className="neo-prev-status"><span className="neo-dot-amber" /> Aún no iniciada</div>
      <button
        type="button"
        className="neo-prev-start neo-prev-start--demo"
        onClick={() => { setHint(true); setTimeout(() => setHint(false), 3500) }}
        title="Simulación: así lo verá el estudiante"
      >
        {esProyecto ? 'Elegir proyecto y comenzar →' : 'Comenzar tarea →'}
      </button>
      {hint && (
        <p className="neo-prev-hint">
          Este botón es una simulación. Publica la actividad y el estudiante lo verá así en <b>Mis tareas</b>.
        </p>
      )}
    </article>
  )
}

function ToggleRow({ icon, title, sub, on, onToggle }: { icon: React.ReactNode; title: string; sub: string; on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="neo-togglerow">
      <span className="neo-togglerow-ic">{icon}</span>
      <span className="neo-togglerow-txt"><b>{title}</b><small>{sub}</small></span>
      <span className={`neo-switch ${on ? 'neo-switch--on' : ''}`}><span className="neo-switch-knob" /></span>
    </button>
  )
}

function delivLabel(d: Deliverable): string {
  const m: Record<DeliverableKind, string> = {
    files: 'Archivos', screenshot: 'Capturas/video', github: 'GitHub',
    commits: `${d.min ?? 3}+ commits`, per_requirement: 'Evidencia por requisito', text: 'Texto',
  }
  return m[d.kind]
}
/** Quita marcas markdown para el texto de la vista previa. */
function stripMd(s: string): string {
  return s.replace(/[*_`>#-]/g, '').replace(/\[(.*?)\]\(.*?\)/g, '$1').replace(/\s+/g, ' ').trim().slice(0, 220)
}

/* ---------- Iconos (SVG, sin emojis) ---------- */
function CheckIc() { return (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>) }
function BranchIc() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="2.4" /><circle cx="6" cy="18" r="2.4" /><circle cx="18" cy="8" r="2.4" /><path d="M6 8.4v7.2M8.2 7.2A6 6 0 0 0 15.6 9" /></svg>) }
function FileIc() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>) }
function BellIc() { return (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>) }
function EyeIc() { return (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>) }
function UsersIc() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>) }
function Spark() { return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5 10.1 7.6z" /></svg>) }
