'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Header from '@/frontend/components/layout/Header'
import {
  loadMyTasks,
  subscribeClassTasks,
  progressOf,
  CLASSTASKS_EVENT,
  type MyTask,
  type TaskState,
} from '@/backend/services/classTasks'
import { downloadTask } from '@/frontend/components/tasks/downloadTask'

type Filter = 'all' | 'pending' | 'working' | 'submitted' | 'overdue'

const PARCIAL_LABEL: Record<string, string> = {
  p1: 'I Parcial', p2: 'II Parcial', p3: 'III Parcial', final: 'Final',
}

export default function MyTasksPage() {
  const [tasks, setTasks] = useState<MyTask[]>([])
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    const refresh = () => loadMyTasks().then(setTasks)
    refresh()
    window.addEventListener(CLASSTASKS_EVENT, refresh)
    const off = subscribeClassTasks()
    return () => {
      window.removeEventListener(CLASSTASKS_EVENT, refresh)
      off()
    }
  }, [])

  const counts = useMemo(() => {
    const c = { all: tasks.length, pending: 0, working: 0, submitted: 0, overdue: 0 }
    tasks.forEach((t) => { c[t.state]++ })
    return c
  }, [tasks])

  const shown = useMemo(
    () => (filter === 'all' ? tasks : tasks.filter((t) => t.state === filter)),
    [tasks, filter],
  )

  // Agrupa por clase: cada clase es una "carpeta" con sus tareas
  const folders = useMemo(() => {
    const map = new Map<string, MyTask[]>()
    for (const t of shown) {
      const arr = map.get(t.className) ?? []
      arr.push(t)
      map.set(t.className, arr)
    }
    // Dentro de cada carpeta, primero lo urgente (vencidas y pendientes), luego el resto
    const orden: Record<TaskState, number> = { overdue: 0, working: 1, pending: 2, submitted: 3 }
    return Array.from(map.entries())
      .map(([className, list]) => ({
        className,
        list: [...list].sort((a, b) => orden[a.state] - orden[b.state]),
      }))
      .sort((a, b) => a.className.localeCompare(b.className))
  }, [shown])

  return (
    <>
      <Header title="Mis tareas" subtitle="Todo lo que tus catedráticos han publicado" />
      <main className="flex-1 overflow-auto p-8">
        <div className="mx-auto max-w-5xl">
          {/* Resumen */}
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Pendientes" value={counts.pending} tone="pending" active={filter === 'pending'} onClick={() => setFilter(filter === 'pending' ? 'all' : 'pending')} />
            <Stat label="En progreso" value={counts.working} tone="working" active={filter === 'working'} onClick={() => setFilter(filter === 'working' ? 'all' : 'working')} />
            <Stat label="Entregadas" value={counts.submitted} tone="submitted" active={filter === 'submitted'} onClick={() => setFilter(filter === 'submitted' ? 'all' : 'submitted')} />
            <Stat label="Vencidas" value={counts.overdue} tone="overdue" active={filter === 'overdue'} onClick={() => setFilter(filter === 'overdue' ? 'all' : 'overdue')} />
          </div>

          {/* Filtros */}
          <div className="mb-6 flex flex-wrap gap-2">
            {([
              ['all', `Todas (${counts.all})`],
              ['pending', `Pendientes (${counts.pending})`],
              ['working', `En progreso (${counts.working})`],
              ['submitted', `Entregadas (${counts.submitted})`],
              ['overdue', `Vencidas (${counts.overdue})`],
            ] as [Filter, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`neo-chip ${filter === key ? 'neo-chip--active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Carpetas por clase */}
          {shown.length === 0 ? (
            <div className="neo-empty">
              <p>No hay tareas en esta vista.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {folders.map((f, fi) => (
                <ClassFolder key={f.className} className={f.className} tasks={f.list} delay={fi * 60} />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  )
}

/** Carpeta de una clase con sus tareas en cuadrícula. */
function ClassFolder({ className, tasks, delay }: { className: string; tasks: MyTask[]; delay: number }) {
  const [open, setOpen] = useState(true)
  const pend = tasks.filter((t) => t.state === 'pending' || t.state === 'working').length

  return (
    <section className="neo-tkfolder" style={{ animationDelay: `${delay}ms` }}>
      <button onClick={() => setOpen((v) => !v)} className="neo-tkfolder-head">
        <span className="neo-tkfolder-ic">
          <FolderIcon />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="neo-tkfolder-name">{className}</span>
          <span className="neo-tkfolder-sub">
            {tasks.length} {tasks.length === 1 ? 'tarea' : 'tareas'}
            {pend > 0 && <span className="neo-tkfolder-pend"> · {pend} por hacer</span>}
          </span>
        </span>
        <span className={`neo-tkfolder-chev ${open ? 'neo-tkfolder-chev--open' : ''}`}>⌄</span>
      </button>

      {open && (
        <div className="neo-tkgrid">
          {tasks.map((t, i) => (
            <TaskCard key={t.id} task={t} delay={i * 45} />
          ))}
        </div>
      )}
    </section>
  )
}

/** Tarjeta moderna de una tarea. */
function TaskCard({ task: t, delay }: { task: MyTask; delay: number }) {
  const prog = progressOf(t.deliverables ?? [], t.evidence ?? {})
  const soon = t.dueDate != null && t.state !== 'submitted' && t.dueDate - Date.now() < 24 * 60 * 60 * 1000 && t.dueDate - Date.now() > 0

  return (
    <article className={`neo-tk neo-tk--${t.state}`} style={{ animationDelay: `${delay}ms` }}>
      <span className="neo-tk-bar" />
      <div className="neo-tk-in">
        <div className="neo-tk-top">
          {t.parcial && PARCIAL_LABEL[t.parcial] && <span className="neo-tk-parcial">{PARCIAL_LABEL[t.parcial]}</span>}
          {t.points > 0 && <span className="neo-tk-pts">{t.points} pts</span>}
          {t.grade != null ? <span className="neo-tk-grade">{t.grade}/{t.points || 100}</span> : <StateBadge state={t.state} />}
        </div>

        <h3 className="neo-tk-title">{t.title}</h3>
        {t.description && <p className="neo-tk-desc">{t.description}</p>}

        {/* Avance real por entregables (si la tarea los pide) */}
        {prog.total > 0 && t.state !== 'submitted' && (
          <div className="neo-tk-prog">
            <div className="neo-tk-prog-bar">
              <span style={{ width: `${prog.pct}%` }} />
            </div>
            <span className="neo-tk-prog-txt">{prog.done}/{prog.total}</span>
          </div>
        )}

        <div className="neo-tk-foot">
          <DueLabel due={t.dueDate} state={t.state} soon={soon} />
          <div className="neo-tk-acts">
            <button onClick={() => downloadTask(t)} className="neo-tk-icon" title="Descargar en PDF">
              <DownloadIcon />
            </button>
            {t.pdfUrl && (
              <a href={t.pdfUrl} target="_blank" rel="noreferrer" className="neo-tk-icon" title="Enunciado (PDF)">
                <PdfIcon />
              </a>
            )}
            <Link
              href={`/dashboard/tasks/${t.id}`}
              className={t.state === 'submitted' ? 'neo-btn-ghost text-sm' : 'neo-btn text-sm'}
            >
              {t.state === 'submitted' ? 'Ver entrega' : t.state === 'working' ? 'Continuar →' : 'Comenzar →'}
            </Link>
          </div>
        </div>
      </div>
    </article>
  )
}

function Stat({ label, value, tone, active, onClick }: { label: string; value: number; tone: TaskState; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`neo-taskstat neo-taskstat--${tone} ${active ? 'neo-taskstat--active' : ''}`}>
      <span className="neo-taskstat-num">{value}</span>
      <span className="neo-taskstat-label">{label}</span>
    </button>
  )
}

function StateBadge({ state }: { state: TaskState }) {
  const map = {
    pending: ['Pendiente', 'neo-badge--pending'],
    working: ['En progreso', 'neo-badge--working'],
    submitted: ['Entregada', 'neo-badge--submitted'],
    overdue: ['Vencida', 'neo-badge--overdue'],
  } as const
  const [label, cls] = map[state]
  return <span className={`neo-badge ${cls}`}>{label}</span>
}

function DueLabel({ due, state, soon }: { due: number | null; state: TaskState; soon: boolean }) {
  if (due == null) return <span className="neo-tk-due">Sin fecha límite</span>
  const ms = due - Date.now()
  const day = 24 * 60 * 60 * 1000
  const fecha = new Date(due).toLocaleDateString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  if (state === 'submitted') return <span className="neo-tk-due">Entregada · vencía {fecha}</span>
  if (ms < 0) return <span className="neo-tk-due neo-tk-due--over">Venció el {fecha}</span>

  const dias = Math.floor(ms / day)
  const horas = Math.floor(ms / (60 * 60 * 1000))
  let restante: string
  if (dias >= 1) restante = `vence en ${dias} día${dias > 1 ? 's' : ''}`
  else if (horas >= 1) restante = `vence en ${horas} h`
  else restante = 'vence en menos de 1 h'
  return <span className={`neo-tk-due ${soon ? 'neo-tk-due--soon' : ''}`}>{restante} · {fecha}</span>
}

/* ---- Iconos ---- */
function FolderIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2z" />
    </svg>
  )
}
function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}
function PdfIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
    </svg>
  )
}
