'use client'

/**
 * PANEL DE ENTREGAS DEL CATEDRÁTICO — todo lo de una tarea a la mano.
 *
 * En vez de dos listas de nombres, muestra por cada alumno QUÉ entregó: sus
 * archivos, su repo, sus commits, su texto y su nota, con el avance real según
 * los entregables que la tarea pedía. Y aparte, quién falta.
 */

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  loadSubmissions,
  progressOf,
  type ClassTask,
  type Submission,
} from '@/backend/services/classTasks'

type Roster = { id: string; name: string }[]
type Vista = 'entregadas' | 'pendientes'

export default function TaskSubmissionsModal({
  task,
  roster,
  onClose,
}: {
  task: ClassTask
  roster: Roster
  onClose: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [subs, setSubs] = useState<Submission[] | null>(null)
  const [vista, setVista] = useState<Vista>('entregadas')

  useEffect(() => setMounted(true), [])
  useEffect(() => {
    loadSubmissions(task.id).then(setSubs)
  }, [task.id])

  const nameById = useMemo(() => {
    const m = new Map<string, string>()
    roster.forEach((r) => m.set(r.id, r.name))
    return m
  }, [roster])

  const { entregadas, pendientes, pct } = useMemo(() => {
    const list = subs ?? []
    const done = new Set(list.map((s) => s.studentId))
    const pend = roster.filter((r) => !done.has(r.id))
    const total = roster.length || 1
    return { entregadas: list, pendientes: pend, pct: Math.round((list.length / total) * 100) }
  }, [subs, roster])

  if (!mounted) return null

  return createPortal(
    <div className="neo-modal-backdrop" style={{ zIndex: 120 }} onClick={onClose}>
      <div className="neo-modal neo-modal--form neo-modal--scroll neo-subs" onClick={(e) => e.stopPropagation()}>
        {/* Cabecera con anillo de avance de la clase */}
        <div className="neo-subs-head">
          <div className="min-w-0">
            <p className="neo-subs-eyebrow">Entregas de la tarea</p>
            <h4 className="truncate text-base font-semibold text-white">{task.title}</h4>
          </div>
          <div className="flex items-center gap-4">
            <Ring pct={pct} />
            <button onClick={onClose} className="text-neutral-500 hover:text-white">✕</button>
          </div>
        </div>

        <div className="neo-subs-summary">
          <span><b className="text-emerald-400">{entregadas.length}</b> entregaron</span>
          <span className="text-neutral-600">·</span>
          <span><b className="text-neutral-300">{pendientes.length}</b> pendientes</span>
          <span className="text-neutral-600">·</span>
          <span>{roster.length} en la clase</span>
        </div>

        {/* Pestañas */}
        <div className="neo-subs-tabs">
          <button onClick={() => setVista('entregadas')} className={`neo-subs-tab ${vista === 'entregadas' ? 'neo-subs-tab--on' : ''}`}>
            Entregadas ({entregadas.length})
          </button>
          <button onClick={() => setVista('pendientes')} className={`neo-subs-tab ${vista === 'pendientes' ? 'neo-subs-tab--on' : ''}`}>
            Pendientes ({pendientes.length})
          </button>
        </div>

        {subs === null ? (
          <p className="py-8 text-center text-sm text-neutral-500">Cargando entregas…</p>
        ) : vista === 'entregadas' ? (
          entregadas.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">Nadie ha entregado todavía.</p>
          ) : (
            <div className="space-y-2.5">
              {entregadas.map((s) => (
                <SubCard key={s.studentId} sub={s} name={nameById.get(s.studentId) ?? 'Estudiante'} task={task} />
              ))}
            </div>
          )
        ) : pendientes.length === 0 ? (
          <p className="py-8 text-center text-sm text-emerald-400">Todos entregaron.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {pendientes.map((r) => (
              <span key={r.id} className="neo-subs-pend">
                <span className="neo-subs-av">{initials(r.name)}</span>
                {r.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** Tarjeta de la entrega de un alumno con su evidencia. */
function SubCard({ sub, name, task }: { sub: Submission; name: string; task: ClassTask }) {
  const prog = progressOf(task.deliverables ?? [], sub.evidence ?? {})
  const ev = sub.evidence ?? {}
  const cuando = sub.submittedAt
    ? new Date(sub.submittedAt).toLocaleDateString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <article className="neo-subcard">
      <div className="neo-subcard-top">
        <span className="neo-subs-av neo-subs-av--lg">{initials(name)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-neutral-100">{name}</p>
          <p className="text-[11px] text-neutral-500">Entregó {cuando}</p>
        </div>
        {task.deliverables?.length > 0 && (
          <div className="neo-subcard-prog">
            <div className="neo-subcard-progbar"><span style={{ width: `${prog.pct}%` }} /></div>
            <span className="text-[11px] font-semibold text-neutral-400">{prog.done}/{prog.total}</span>
          </div>
        )}
      </div>

      {/* Evidencia concreta */}
      <div className="neo-subcard-ev">
        {(ev.files ?? []).map((f, i) => (
          <a key={`f${i}`} href={f.url} target="_blank" rel="noreferrer" className="neo-ev neo-ev--link">📄 {f.name}</a>
        ))}
        {(ev.screenshot ?? []).map((f, i) => (
          <a key={`s${i}`} href={f.url} target="_blank" rel="noreferrer" className="neo-ev neo-ev--link">🖼 {f.name}</a>
        ))}
        {ev.github && (
          <a href={ev.github} target="_blank" rel="noreferrer" className="neo-ev neo-ev--link">GitHub →</a>
        )}
        {sub.linkUrl && (
          <a href={sub.linkUrl} target="_blank" rel="noreferrer" className="neo-ev neo-ev--link">Enlace →</a>
        )}
        {typeof ev.commits === 'number' && ev.commits > 0 && <span className="neo-ev">{ev.commits} commits</span>}
        {ev.text && <span className="neo-ev">Texto</span>}
        {ev.per_requirement && <span className="neo-ev">Por requisito</span>}
        {Object.keys(ev).length === 0 && !sub.linkUrl && <span className="text-[11px] text-neutral-600">Sin evidencia adjunta.</span>}
      </div>

      {(ev.text || sub.note) && (
        <p className="neo-subcard-note">{ev.text || sub.note}</p>
      )}
    </article>
  )
}

/** Anillo de progreso (SVG) para el porcentaje de la clase que entregó. */
function Ring({ pct }: { pct: number }) {
  const r = 20
  const c = 2 * Math.PI * r
  return (
    <div className="neo-ring">
      <svg width="52" height="52" viewBox="0 0 52 52">
        <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="5" />
        <circle
          cx="26" cy="26" r={r} fill="none" stroke="url(#g)" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} transform="rotate(-90 26 26)"
        />
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#43c8ec" /><stop offset="1" stopColor="#1089d3" />
          </linearGradient>
        </defs>
      </svg>
      <span className="neo-ring-num">{pct}%</span>
    </div>
  )
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (!p.length) return '?'
  if (p.length === 1) return p[0].charAt(0).toUpperCase()
  return (p[0].charAt(0) + p[p.length - 1].charAt(0)).toUpperCase()
}
