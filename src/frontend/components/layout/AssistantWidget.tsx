'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon3D from '@/frontend/components/ui/Icon3D'
import { useT } from '@/frontend/hooks/useT'
import { getSession, displayName, SESSION_EVENT, type Role } from '@/frontend/session/session'
import { supabase } from '@/backend/supabase'
import { getClasses, loadClasses, createClass, deleteClass } from '@/backend/services/classes'
import { createGroupsBulk, GROUP_ICONS, loadGroups, getGroups, setGroupProject } from '@/backend/services/classGroups'
import { createProject, loadProjects, getProjects } from '@/backend/services/projects'
import { type ParcialCode } from '@/shared/parciales'
import {
  searchStudents,
  getAssistantOverview,
  getAssistantContext,
  type StudentDossier,
  type AssistantOverview,
  type QuickStudent,
  type QuickGroup,
} from '@/backend/services/studentSearch'

type ToolCall = { name: string; args: Record<string, unknown> }
type ActionStatus = 'pending' | 'running' | 'done' | 'cancelled' | 'error'

type Entry =
  | { kind: 'query'; text: string }
  | { kind: 'ai'; text: string }
  | { kind: 'result'; query: string; dossiers: StudentDossier[] }
  | { kind: 'quick'; label: string; color: string; students?: QuickStudent[]; groups?: QuickGroup[] }
  | { kind: 'action'; toolCall: ToolCall; status: ActionStatus; message?: string; warning?: string }

type Chat = { id: string; title: string; entries: Entry[]; at: number }
const CHATS_KEY = 'nf_assistant_chats'
function loadChats(): Chat[] {
  try {
    return JSON.parse(localStorage.getItem(CHATS_KEY) || '[]') as Chat[]
  } catch {
    return []
  }
}
function saveChats(chats: Chat[]) {
  try {
    localStorage.setItem(CHATS_KEY, JSON.stringify(chats.slice(0, 20)))
  } catch {
    /* almacenamiento no disponible */
  }
}

/**
 * Asistente flotante (catedrático): orbe que despliega un panel con saludo hero,
 * input de gradiente, acciones rápidas y búsqueda de estudiantes. Base del
 * asistente con IA; luego se conecta el LLM propio.
 */
export default function AssistantWidget() {
  const { t } = useT()
  const [mounted, setMounted] = useState(false)
  const [role, setRole] = useState<Role>('student')
  const [meId, setMeId] = useState('')
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [entries, setEntries] = useState<Entry[]>([])
  const [ov, setOv] = useState<AssistantOverview | null>(null)
  const [ctx, setCtx] = useState<string | null>(null)
  const [pending, setPending] = useState<{ toolCall: ToolCall; field: string } | null>(null)
  const [chats, setChats] = useState<Chat[]>([])
  const [activeId, setActiveId] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => setMounted(true), [])

  // Cargar el historial de conversaciones al montar
  useEffect(() => {
    const c = loadChats()
    setChats(c)
    if (c.length) {
      setActiveId(c[0].id)
      setEntries(c[0].entries)
    } else {
      setActiveId(crypto.randomUUID())
    }
  }, [])

  // Guardar la conversación activa cuando cambia (si tiene contenido)
  useEffect(() => {
    if (!activeId || entries.length === 0) return
    const first = entries.find((e) => e.kind === 'query') as { text?: string } | undefined
    const title = first?.text?.slice(0, 44) || 'Conversación'
    setChats((prev) => {
      const next = [{ id: activeId, title, entries, at: Date.now() }, ...prev.filter((c) => c.id !== activeId)]
      saveChats(next)
      return next
    })
  }, [entries, activeId])

  useEffect(() => {
    const sync = () => {
      const s = getSession()
      setRole(s?.role ?? 'student')
      setMeId(s?.id ?? '')
    }
    sync()
    window.addEventListener(SESSION_EVENT, sync)
    return () => window.removeEventListener(SESSION_EVENT, sync)
  }, [])

  useEffect(() => {
    if (open && meId && !ov) getAssistantOverview(meId).then(setOv)
  }, [open, meId, ov])

  // Precarga el contexto (resumen de clases) para la IA
  useEffect(() => {
    if (open && meId && ctx == null) getAssistantContext(meId).then(setCtx)
  }, [open, meId, ctx])

  useEffect(() => {
    if (open && entries.length) endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries, loading, open])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80)
  }, [open])

  async function submit() {
    const q = input.trim()
    if (!q || loading || !meId) return
    setInput('')
    setEntries((e) => [...e, { kind: 'query', text: q }])
    const fullUserText = [...entries.flatMap((e) => (e.kind === 'query' ? [e.text] : [])), q].join(' ')

    // Si la app dejó un dato pendiente, usamos la respuesta DIRECTA (sin depender de la IA)
    if (pending) {
      const tc: ToolCall = { name: pending.toolCall.name, args: { ...pending.toolCall.args } }
      tc.args[pending.field] = pending.field === 'cantidad' ? Number(q.match(/\d+/)?.[0]) || 0 : q
      proceedWithAction(tc, fullUserText)
      return
    }

    setLoading(true)
    try {
      // Intentar con la IA (Llama vía Ollama), usando el resumen de clases.
      // NO enviamos historial: cada comando es independiente (el modelo chico se
      // confunde si arrastra comandos anteriores). La conversación multi-turno la
      // maneja el flujo determinista de "pending", no el modelo.
      const context = ctx ?? (await getAssistantContext(meId))
      if (ctx == null) setCtx(context)
      // La IA exige sesión iniciada (evita que cualquiera consuma el servidor).
      const { data: sess } = supabase ? await supabase.auth.getSession() : { data: { session: null } }
      const token = sess.session?.access_token
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ question: q, context }),
      })
      const data = await res.json()
      if (res.ok && data.toolCall) {
        setLoading(false)
        proceedWithAction(correctTool(data.toolCall as ToolCall, q), fullUserText)
        return
      }
      if (res.ok && data.answer) {
        setEntries((e) => [...e, { kind: 'ai', text: data.answer }])
        setLoading(false)
        return
      }
      throw new Error(data.error || 'IA no disponible')
    } catch {
      // La IA no respondió. Si el mensaje parecía un COMANDO de acción, no tiene
      // sentido "buscar estudiantes": avisamos claro. Si parecía una búsqueda por
      // nombre, degradamos a la búsqueda estructurada (funciona sin IA).
      const looksLikeAction = /\b(crea|crear|cre[aá]|agrega|agregar|a[ñn]ade|a[ñn]adir|arma|genera|asigna|asignar|nuev[oa]s?|elimina|eliminar|borra|borrar|quita|da de baja)\b/i.test(q)
      if (looksLikeAction) {
        setEntries((e) => [...e, { kind: 'ai', text: 'No pude conectar con el asistente de IA en este momento. Verifica que esté activo e inténtalo de nuevo.' }])
        setLoading(false)
        return
      }
      const dossiers = await searchStudents(meId, q)
      setEntries((e) => [...e, { kind: 'result', query: q, dossiers }])
      setLoading(false)
    }
  }

  // Valida la acción: si falta un dato, lo pregunta (queda pendiente); si está completa, muestra la confirmación.
  function proceedWithAction(tc: ToolCall, userText: string) {
    const missing = nextMissing(tc, userText)
    if (missing) {
      setEntries((e) => [...e, { kind: 'ai', text: missing.question }])
      setPending({ toolCall: tc, field: missing.field })
      return
    }
    setPending(null)
    let warning: string | undefined
    if (tc.name === 'crear_clase') {
      const n = String(tc.args.nombre ?? '').trim()
      if (n && findClass(n)) warning = `Ya existe una clase parecida a «${n}». ¿Seguro que quieres otra?`
    } else if (tc.name === 'crear_grupos' || tc.name === 'crear_proyecto' || tc.name === 'asignar_proyecto') {
      const c = String(tc.args.clase ?? '').trim()
      if (c && !findClass(c)) warning = `No encuentro una clase llamada «${c}». Revisa el nombre o créala primero.`
    } else if (tc.name === 'eliminar_clase') {
      const c = String(tc.args.clase ?? '').trim()
      if (c && !findClass(c)) warning = `No encuentro una clase llamada «${c}».`
    }
    setEntries((e) => [...e, { kind: 'action', toolCall: tc, status: 'pending', warning }])
  }

  function pushQuick(label: string, color: string, students?: QuickStudent[], groups?: QuickGroup[]) {
    setEntries((e) => [...e, { kind: 'quick', label, color, students, groups }])
  }

  function newChat() {
    setEntries([])
    setPending(null)
    setActiveId(crypto.randomUUID())
    setShowHistory(false)
  }
  function openChat(c: Chat) {
    setActiveId(c.id)
    setEntries(c.entries)
    setPending(null)
    setShowHistory(false)
  }

  function updateAction(i: number, patch: Partial<Extract<Entry, { kind: 'action' }>>) {
    setEntries((es) => es.map((e, idx) => (idx === i && e.kind === 'action' ? { ...e, ...patch } : e)))
  }

  function findClass(name: string) {
    const q = name.trim().toLowerCase()
    if (!q) return undefined
    return getClasses()
      .filter((c) => c.teacher === meId)
      .find((c) => c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase()))
  }

  // Ejecuta la acción que pidió la IA, del lado del cliente (con los permisos del profe).
  async function executeAction(i: number) {
    const entry = entries[i]
    if (entry?.kind !== 'action' || entry.status !== 'pending') return
    updateAction(i, { status: 'running' })
    const { name, args } = entry.toolCall
    const teacherName = displayName(getSession())
    try {
      let msg = ''
      if (name === 'crear_clase') {
        const nombre = String(args.nombre ?? '').trim()
        const k = await createClass({
          name: nombre,
          section: String(args.seccion ?? ''),
          period: String(args.periodo ?? ''),
          code: codeFromName(nombre),
          emblem: GROUP_ICONS[Math.floor(Math.random() * GROUP_ICONS.length)],
          teacherName,
        })
        msg = k ? `Clase «${k.name}» creada (código ${k.code}).` : 'No se pudo crear la clase.'
      } else if (name === 'crear_grupos') {
        await loadClasses()
        const cls = findClass(String(args.clase ?? ''))
        if (!cls) msg = `No encontré una clase llamada «${args.clase}».`
        else {
          const n = Math.max(1, Math.min(30, Number(args.cantidad) || 1))
          await createGroupsBulk(cls.id, n)
          msg = `Creé ${n} grupo(s) en «${cls.name}».`
        }
      } else if (name === 'crear_proyecto') {
        await loadClasses()
        const cls = findClass(String(args.clase ?? ''))
        if (!cls) msg = `No encontré una clase llamada «${args.clase}».`
        else {
          const p = await createProject({
            classId: cls.id,
            title: String(args.titulo ?? '').trim(),
            description: String(args.descripcion ?? ''),
            objectives: '',
            deliverables: '',
            rubric: [],
            dueDate: '',
            teamSize: 4,
            groupMode: 'open',
            leaderMode: 'first',
            parcial: normParcial(String(args.parcial ?? '')),
            briefUrl: '',
            requirements: '',
          })
          msg = p ? `Proyecto «${p.title}» creado en «${cls.name}».` : 'No se pudo crear el proyecto.'
        }
      } else if (name === 'asignar_proyecto') {
        await loadClasses()
        const cls = findClass(String(args.clase ?? ''))
        if (!cls) msg = `No encontré una clase llamada «${args.clase}».`
        else {
          await Promise.all([loadGroups(cls.id), loadProjects(cls.id)])
          const gq = String(args.grupo ?? '').trim().toLowerCase()
          const pq = String(args.proyecto ?? '').trim().toLowerCase()
          const grp = getGroups(cls.id).find((g) => g.name.toLowerCase().includes(gq) || gq.includes(g.name.toLowerCase()))
          const proj = getProjects(cls.id).find((p) => p.title.toLowerCase().includes(pq) || pq.includes(p.title.toLowerCase()))
          if (!grp) msg = `No encontré el grupo «${args.grupo}» en «${cls.name}».`
          else if (!proj) msg = `No encontré el proyecto «${args.proyecto}» en «${cls.name}».`
          else {
            await setGroupProject(cls.id, grp.id, proj.id)
            msg = `Asigné el proyecto «${proj.title}» al grupo «${grp.name}».`
          }
        }
      } else if (name === 'eliminar_clase') {
        await loadClasses()
        const cls = findClass(String(args.clase ?? ''))
        if (!cls) msg = `No encontré una clase llamada «${args.clase}».`
        else {
          await deleteClass(cls.id)
          msg = `Clase «${cls.name}» eliminada.`
        }
      } else {
        msg = 'No reconozco esa acción.'
      }
      updateAction(i, { status: 'done', message: msg })
      setOv(null) // refresca el panorama
      setCtx(null) // y el contexto de la IA
    } catch {
      updateAction(i, { status: 'error', message: 'Ocurrió un error al ejecutar la acción.' })
    }
  }

  function cancelAction(i: number) {
    updateAction(i, { status: 'cancelled' })
  }

  if (!mounted || role !== 'teacher') return null

  const QUICK = ov
    ? [
        { key: 'free', label: 'Sin grupo', color: '#f59e0b', count: ov.freeStudents.length, run: () => pushQuick('Estudiantes sin grupo', '#f59e0b', ov.freeStudents) },
        { key: 'noproj', label: 'Sin proyecto', color: '#3b82f6', count: ov.groupsNoProject.length, run: () => pushQuick('Grupos sin proyecto', '#3b82f6', undefined, ov.groupsNoProject) },
        { key: 'ungraded', label: 'Sin calificar', color: '#a78bfa', count: ov.ungraded.length, run: () => pushQuick('Grupos con entrega sin calificar', '#a78bfa', undefined, ov.ungraded) },
        { key: 'nosub', label: 'Sin entrega', color: '#f43f5e', count: ov.noSubmission.length, run: () => pushQuick('Grupos sin entrega', '#f43f5e', undefined, ov.noSubmission) },
      ]
    : []

  const home = entries.length === 0

  return createPortal(
    <>
      {open && (
        <div className="neo-assistant-panel">
          <div className="neo-assistant-head">
            <span className="neo-assistant-avatar"><Spark /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white">{t('search.assistant')}</p>
              <p className="text-[11px] text-neutral-500">{t('search.sub')}</p>
            </div>
            <span className="neo-ia-badge">IA</span>
            <button
              onClick={() => setShowHistory((v) => !v)}
              className={`ml-1 rounded-lg p-1.5 transition hover:bg-white/5 ${showHistory ? 'text-accent-violet' : 'text-neutral-500 hover:text-neutral-300'}`}
              title="Historial"
              aria-label="Historial"
            >
              <ClockGlyph />
            </button>
            <button
              onClick={newChat}
              className="rounded-lg p-1.5 text-neutral-500 transition hover:bg-white/5 hover:text-neutral-300"
              title="Nuevo chat"
              aria-label="Nuevo chat"
            >
              <PlusGlyph />
            </button>
            <button onClick={() => setOpen(false)} className="ml-0.5 text-neutral-500 hover:text-white" aria-label="Cerrar">✕</button>
          </div>

          <div className="neo-assistant-body">
            {showHistory ? (
              /* ── HISTORIAL ── */
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <p className="neo-label">Conversaciones</p>
                  <button onClick={newChat} className="text-xs text-accent-violet hover:text-accent-violetBright">+ Nuevo</button>
                </div>
                {chats.length === 0 ? (
                  <p className="text-sm text-neutral-500">Aún no hay conversaciones guardadas.</p>
                ) : (
                  <div className="space-y-1.5">
                    {chats.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => openChat(c)}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition ${
                          c.id === activeId ? 'border-accent-violet/30 bg-accent-violet/5' : 'border-white/8 bg-white/[0.02] hover:bg-white/[0.05]'
                        }`}
                      >
                        <span className="truncate text-sm text-neutral-200">{c.title}</span>
                        <span className="flex-shrink-0 text-[11px] text-neutral-500">{fmtDate(c.at)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : home ? (
              /* ── HERO ── */
              <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-6 text-center">
                <div className="neo-a-in flex flex-col items-center gap-4">
                  <div className="neo-ai-hero-icon"><Spark /></div>
                  <div>
                    <h3 className="text-xl font-bold text-white">¿En qué te ayudo hoy?</h3>
                    <p className="mt-1 text-sm text-neutral-400">Pregúntame lo que sea sobre tus clases, o usa una acción rápida.</p>
                  </div>
                </div>

                <div className="neo-a-in w-full max-w-lg" style={{ animationDelay: '80ms' }}>
                  <AssistantInput inputRef={inputRef} value={input} onChange={setInput} onSubmit={submit} disabled={loading} placeholder={t('search.placeholder')} />
                </div>

                <div className="flex flex-wrap justify-center gap-2">
                  {QUICK.map((a, idx) => (
                    <button key={a.key} onClick={a.run} className="neo-ai-chip neo-a-in" style={{ animationDelay: `${160 + idx * 60}ms` }}>
                      <span className="h-2 w-2 rounded-full" style={{ background: a.color }} />
                      {a.label}
                      <span className="font-bold" style={{ color: a.color }}>{a.count}</span>
                    </button>
                  ))}
                </div>

                <div className="grid w-full max-w-lg grid-cols-4 gap-2.5 pt-2">
                  <Stat label="Clases" value={ov?.classCount} i={0} />
                  <Stat label="Alumnos" value={ov?.studentCount} i={1} />
                  <Stat label="Grupos" value={ov?.groupCount} i={2} />
                  <Stat label="Sin nota" value={ov?.ungradedCount} highlight i={3} />
                </div>
              </div>
            ) : (
              /* ── CONVERSACIÓN ── */
              <>
                {entries.map((e, i) =>
                  e.kind === 'action' ? (
                    <ActionCard key={i} e={e} onConfirm={() => executeAction(i)} onCancel={() => cancelAction(i)} />
                  ) : (
                    <EntryView key={i} e={e} t={t} />
                  ),
                )}
                {loading && (
                  <div className="flex items-center gap-2 text-sm text-neutral-400">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent-violet border-t-transparent" />
                    {t('search.searching')}
                  </div>
                )}
                <div ref={endRef} />
              </>
            )}
          </div>

          {!home && !showHistory && (
            <div className="px-4 py-3.5">
              <AssistantInput inputRef={inputRef} value={input} onChange={setInput} onSubmit={submit} disabled={loading} placeholder={t('search.placeholder')} />
            </div>
          )}
        </div>
      )}

      <button onClick={() => setOpen((o) => !o)} className={`neo-assistant-orb ${open ? 'neo-assistant-orb--open' : ''}`} aria-label={t('search.assistant')}>
        {open ? <span className="text-lg text-white">✕</span> : <Spark />}
      </button>
    </>,
    document.body,
  )
}

function AssistantInput({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder,
  inputRef,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  disabled: boolean
  placeholder: string
  inputRef?: React.RefObject<HTMLInputElement>
}) {
  return (
    <div className="neo-ai-input">
      <div className="neo-ai-input-inner">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
          placeholder={placeholder}
        />
        <button onClick={onSubmit} disabled={disabled || !value.trim()} className="neo-assistant-send" aria-label="Buscar">
          <SendGlyph />
        </button>
      </div>
    </div>
  )
}

function useCountUp(target: number | undefined, ms = 700): number | undefined {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (target == null) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms)
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return target == null ? undefined : n
}

function Stat({ label, value, highlight, i }: { label: string; value?: number; highlight?: boolean; i: number }) {
  const n = useCountUp(value)
  return (
    <div
      className={`neo-a-in neo-a-tile rounded-xl border p-2.5 text-center ${highlight && value ? 'border-accent-violet/30 bg-accent-violet/5' : 'border-white/8 bg-white/[0.03]'}`}
      style={{ animationDelay: `${220 + i * 60}ms` }}
    >
      <p className="text-xl font-bold text-white">{n ?? '—'}</p>
      <p className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</p>
    </div>
  )
}

function EntryView({ e, t }: { e: Entry; t: (k: string) => string }) {
  if (e.kind === 'query') {
    return (
      <div className="flex justify-end">
        <span className="rounded-2xl rounded-tr-sm bg-accent-violet px-3.5 py-2 text-sm text-white">{e.text}</span>
      </div>
    )
  }
  if (e.kind === 'ai') {
    return (
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-accent-violet" style={{ background: 'rgba(167,139,250,0.14)' }}>
          <Spark />
        </span>
        <div className="min-w-0 flex-1 whitespace-pre-line rounded-2xl rounded-tl-sm border border-white/8 bg-white/[0.03] px-3.5 py-2.5 text-sm leading-relaxed text-neutral-200">
          {e.text}
        </div>
      </div>
    )
  }
  if (e.kind === 'result') {
    return (
      <div className="space-y-3">
        {e.dossiers.length === 0 ? (
          <div className="rounded-xl bg-black/25 p-3 text-sm text-neutral-400">
            {t('search.none_a')} <span className="text-neutral-200">“{e.query}”</span> {t('search.none_b')}
          </div>
        ) : (
          e.dossiers.map((d) => <StudentCard key={d.id} d={d} t={t} />)
        )}
      </div>
    )
  }
  if (e.kind !== 'quick') return null
  const items = e.students ?? e.groups ?? []
  return (
    <div className="neo-card-in rounded-xl border border-white/8 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: e.color }} />
        <p className="text-sm font-semibold text-white">{e.label}</p>
        <span className="text-xs text-neutral-500">({items.length})</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">Nada por aquí — todo en orden.</p>
      ) : (
        <div className="space-y-1.5">
          {e.students?.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-2 text-sm">
              <span className="truncate text-neutral-100">{s.name}</span>
              <span className="flex-shrink-0 text-xs text-neutral-500">{s.className}</span>
            </div>
          ))}
          {e.groups?.map((g) => (
            <div key={g.id} className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-2 text-sm" style={{ borderLeft: `3px solid ${g.color}` }}>
              <span className="truncate text-neutral-100">
                {g.name}
                {g.projectTitle && <span className="text-neutral-500"> · {g.projectTitle}</span>}
              </span>
              <span className="flex-shrink-0 text-xs text-neutral-500">{g.className}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StudentCard({ d, t }: { d: StudentDossier; t: (k: string) => string }) {
  return (
    <div className="neo-card-in rounded-xl border border-white/8 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2.5 border-b border-white/5 pb-3">
        {d.avatar ? (
          <Icon3D src={d.avatar} alt="" size={38} fallback={d.name.charAt(0).toUpperCase()} />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-sm font-bold text-neutral-200">
            {d.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{d.name}</p>
          <p className="truncate text-[11px] text-neutral-500">
            {[d.career, d.accountNumber].filter(Boolean).join(' · ') || t('search.no_data')}
          </p>
        </div>
      </div>

      {d.classes.length === 0 ? (
        <p className="pt-3 text-sm text-neutral-500">{t('search.no_classes')}</p>
      ) : (
        <div className="grid gap-2.5 pt-3 sm:grid-cols-2">
          {d.classes.map((c) => {
            const total = c.tasks.todo + c.tasks.doing + c.tasks.done
            const links = c.deliverable
              ? [
                  { label: 'Repo', url: c.deliverable.repoUrl },
                  { label: 'Deploy', url: c.deliverable.deployUrl },
                  { label: 'Video', url: c.deliverable.videoUrl },
                ].filter((l) => l.url.trim())
              : []
            return (
              <div key={c.classId} className="rounded-lg bg-black/20 p-3" style={{ borderLeft: `3px solid ${c.groupColor || '#8b5cf6'}` }}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-white">{c.className}</span>
                  {c.groupName ? (
                    <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: `${c.groupColor}22`, color: '#e5e7eb' }}>
                      {c.groupName}{c.isLeader ? ` · ${t('search.leader')}` : ''}
                    </span>
                  ) : (
                    <span className="text-[10px] text-neutral-500">{t('search.no_group')}</span>
                  )}
                </div>
                <div className="mt-1.5 space-y-0.5 text-[11px] text-neutral-400">
                  <p><span className="text-neutral-500">{t('search.project')}: </span>{c.projectTitle || t('search.none_project')}</p>
                  <p>
                    <span className="text-neutral-500">{t('search.grade')}: </span>
                    {c.grade != null ? `${c.grade}${c.maxPoints != null ? ` / ${c.maxPoints}` : ''}` : t('search.ungraded')}
                    <span className="text-neutral-600"> · </span>
                    <span className="text-neutral-500">{t('search.tasks')}: </span>
                    {total === 0 ? t('search.no_tasks') : `${c.tasks.done}/${total}`}
                  </p>
                </div>
                {(links.length > 0 || c.briefUrl?.trim()) && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {c.briefUrl?.trim() && (
                      <a href={c.briefUrl} target="_blank" rel="noopener noreferrer" className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-accent-violet hover:bg-white/10">
                        PDF ↗
                      </a>
                    )}
                    {links.map((l) => (
                      <a
                        key={l.label}
                        href={l.url.startsWith('http') ? l.url : `https://${l.url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-neutral-300 hover:bg-white/10"
                      >
                        {l.label} ↗
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** ¿Un dato de la acción realmente aparece en el mensaje del catedrático? (evita que la IA invente). */
function argInQuestion(arg: string, question: string): boolean {
  const nq = question.toLowerCase()
  const words = String(arg).toLowerCase().split(/\s+/).filter((w) => w.length > 2)
  return words.length > 0 && words.some((w) => nq.includes(w))
}

/** Corrige la herramienta si contradice el verbo del catedrático (crear vs eliminar). */
function correctTool(tc: ToolCall, q: string): ToolCall {
  const s = q.toLowerCase()
  const wantsDelete = /(elimin|borra|dar de baja|quita)/.test(s)
  const wantsCreate = /(crea|crear|agrega|nuev|añad)/.test(s)
  const nameMatch = q.match(/clase\s+(?:de\s+)?(.+)/i)
  const name = nameMatch ? nameMatch[1].trim() : ''
  if (wantsCreate && !wantsDelete && tc.name === 'eliminar_clase') {
    return { name: 'crear_clase', args: { nombre: name } }
  }
  if (wantsDelete && !wantsCreate && tc.name.startsWith('crear')) {
    return { name: 'eliminar_clase', args: { clase: name } }
  }
  return tc
}

/** Dato que falta en la acción (para preguntarlo), validando contra lo que dijo el profe. */
function nextMissing(tc: ToolCall, userText: string): { field: string; question: string } | null {
  if (tc.name === 'crear_clase') {
    if (!argInQuestion(String(tc.args.nombre ?? ''), userText)) return { field: 'nombre', question: '¿Qué nombre le ponemos a la clase?' }
  }
  if (tc.name === 'crear_grupos') {
    if (!argInQuestion(String(tc.args.clase ?? ''), userText)) return { field: 'clase', question: '¿En qué clase creo los grupos?' }
    if (!(Number(tc.args.cantidad) > 0)) return { field: 'cantidad', question: '¿Cuántos grupos creo?' }
  }
  if (tc.name === 'crear_proyecto') {
    if (!argInQuestion(String(tc.args.titulo ?? ''), userText)) return { field: 'titulo', question: '¿Cómo se llama el proyecto?' }
    if (!argInQuestion(String(tc.args.clase ?? ''), userText)) return { field: 'clase', question: '¿En qué clase creo el proyecto?' }
  }
  if (tc.name === 'asignar_proyecto') {
    if (!argInQuestion(String(tc.args.proyecto ?? ''), userText)) return { field: 'proyecto', question: '¿Qué proyecto quieres asignar?' }
    if (!argInQuestion(String(tc.args.grupo ?? ''), userText)) return { field: 'grupo', question: '¿A qué grupo se lo asigno?' }
    if (!argInQuestion(String(tc.args.clase ?? ''), userText)) return { field: 'clase', question: '¿En qué clase está ese grupo?' }
  }
  if (tc.name === 'eliminar_clase') {
    if (!argInQuestion(String(tc.args.clase ?? ''), userText)) return { field: 'clase', question: '¿Qué clase quieres eliminar?' }
  }
  return null
}

/** Código de clase estructurado a partir del nombre (ej. "Estructura de Datos" -> "ED-2026-K7"). */
function codeFromName(name: string): string {
  const words = name.toUpperCase().split(/\s+/).filter((w) => w.length > 2)
  const initials = (words.map((w) => w[0]).join('') || 'CL').slice(0, 4)
  const year = new Date(Date.now()).getFullYear()
  const rand = Math.random().toString(36).slice(2, 4).toUpperCase()
  return `${initials}-${year}-${rand}`
}

function normParcial(s: string): ParcialCode {
  const x = s.toLowerCase()
  if (/final/.test(x)) return 'final'
  if (/3|terc/.test(x)) return 'p3'
  if (/2|seg/.test(x)) return 'p2'
  if (/1|prim/.test(x)) return 'p1'
  return ''
}

function describeAction({ name, args }: ToolCall): string {
  if (name === 'crear_clase')
    return `Crear la clase «${args.nombre}»${args.seccion ? ` (sección ${args.seccion})` : ''}${args.periodo ? `, período ${args.periodo}` : ''}.`
  if (name === 'crear_grupos') return `Crear ${args.cantidad} grupo(s) en la clase «${args.clase}».`
  if (name === 'crear_proyecto')
    return `Crear el proyecto «${args.titulo}» en la clase «${args.clase}»${args.parcial ? ` (${args.parcial})` : ''}.`
  if (name === 'asignar_proyecto')
    return `Asignar el proyecto «${args.proyecto}» al grupo «${args.grupo}» de la clase «${args.clase}».`
  if (name === 'eliminar_clase')
    return `Eliminar la clase «${args.clase}» y todo su contenido (grupos, proyectos, chats). Esto no se puede deshacer.`
  return 'Acción desconocida.'
}

function ActionCard({ e, onConfirm, onCancel }: { e: Extract<Entry, { kind: 'action' }>; onConfirm: () => void; onCancel: () => void }) {
  const danger = e.toolCall.name.startsWith('eliminar')
  return (
    <div className={`neo-card-in rounded-xl border p-4 ${danger ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/25 bg-amber-500/5'}`}>
      <div className="mb-2 flex items-center gap-2">
        <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${danger ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
          <Spark />
        </span>
        <p className="text-sm font-semibold text-white">{danger ? 'La IA quiere ELIMINAR esto' : 'La IA quiere hacer esto'}</p>
      </div>
      <p className="text-sm text-neutral-200">{describeAction(e.toolCall)}</p>

      {e.warning && e.status === 'pending' && (
        <p className={`mt-2 rounded-lg px-3 py-2 text-xs ${danger ? 'bg-red-500/10 text-red-300' : 'bg-amber-500/10 text-amber-300'}`}>{e.warning}</p>
      )}

      {e.status === 'pending' && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={onConfirm}
            className={danger ? 'rounded-lg bg-red-500/90 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500' : 'neo-btn text-sm'}
          >
            {danger ? 'Sí, eliminar' : 'Confirmar'}
          </button>
          <button onClick={onCancel} className="neo-btn-ghost text-sm">Cancelar</button>
        </div>
      )}
      {e.status === 'running' && <p className="mt-2.5 text-xs text-neutral-400">Ejecutando…</p>}
      {e.status === 'done' && <p className="mt-2.5 text-sm font-medium text-emerald-400">✓ {e.message}</p>}
      {e.status === 'cancelled' && <p className="mt-2.5 text-xs text-neutral-500">Cancelado.</p>}
      {e.status === 'error' && <p className="mt-2.5 text-sm text-red-400">{e.message}</p>}
    </div>
  )
}

function fmtDate(at: number): string {
  const d = new Date(at)
  const now = new Date(Date.now())
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es', { day: '2-digit', month: 'short' })
}

function ClockGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function PlusGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function Spark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5 10.1 7.6z" />
      <path d="M19 15l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z" />
    </svg>
  )
}

function SendGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  )
}
