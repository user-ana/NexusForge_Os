'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon3D from '@/frontend/components/ui/Icon3D'
import { useT } from '@/frontend/hooks/useT'
import { getSession, SESSION_EVENT, type Role } from '@/frontend/session/session'
import {
  searchStudents,
  getAssistantOverview,
  getAssistantContext,
  type StudentDossier,
  type AssistantOverview,
  type QuickStudent,
  type QuickGroup,
} from '@/backend/services/studentSearch'

type Entry =
  | { kind: 'query'; text: string }
  | { kind: 'ai'; text: string }
  | { kind: 'result'; query: string; dossiers: StudentDossier[] }
  | { kind: 'quick'; label: string; color: string; students?: QuickStudent[]; groups?: QuickGroup[] }

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
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => setMounted(true), [])

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
    setLoading(true)
    try {
      // 1) Intentar con la IA (Llama vía Ollama), usando el resumen de clases
      const context = ctx ?? (await getAssistantContext(meId))
      if (ctx == null) setCtx(context)
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, context }),
      })
      const data = await res.json()
      if (res.ok && data.answer) {
        setEntries((e) => [...e, { kind: 'ai', text: data.answer }])
        setLoading(false)
        return
      }
      throw new Error(data.error || 'IA no disponible')
    } catch {
      // 2) Si la IA no está disponible, caer a la búsqueda estructurada por nombre
      const dossiers = await searchStudents(meId, q)
      setEntries((e) => [...e, { kind: 'result', query: q, dossiers }])
      setLoading(false)
    }
  }

  function pushQuick(label: string, color: string, students?: QuickStudent[], groups?: QuickGroup[]) {
    setEntries((e) => [...e, { kind: 'quick', label, color, students, groups }])
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
            {!home && (
              <button onClick={() => setEntries([])} className="ml-1 text-xs text-neutral-500 hover:text-accent-violet" title="Inicio">
                Inicio
              </button>
            )}
            <button onClick={() => setOpen(false)} className="ml-1 text-neutral-500 hover:text-white" aria-label="Cerrar">✕</button>
          </div>

          <div className="neo-assistant-body">
            {home ? (
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
                {entries.map((e, i) => <EntryView key={i} e={e} t={t} />)}
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

          {!home && (
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
