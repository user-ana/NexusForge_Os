'use client'

import { useEffect, useMemo, useState } from 'react'
import Header from '@/frontend/components/layout/Header'
import {
  loadMyTasks,
  submitTask,
  unsubmitTask,
  subscribeClassTasks,
  CLASSTASKS_EVENT,
  type MyTask,
  type TaskState,
} from '@/backend/services/classTasks'

type Filter = 'all' | 'pending' | 'submitted' | 'overdue'

const PARCIAL_LABEL: Record<string, string> = {
  p1: 'I Parcial', p2: 'II Parcial', p3: 'III Parcial', final: 'Final',
}

export default function MyTasksPage() {
  const [tasks, setTasks] = useState<MyTask[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState<string | null>(null)

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
    const c = { all: tasks.length, pending: 0, submitted: 0, overdue: 0 }
    tasks.forEach((t) => { c[t.state]++ })
    return c
  }, [tasks])

  const shown = useMemo(
    () => (filter === 'all' ? tasks : tasks.filter((t) => t.state === filter)),
    [tasks, filter],
  )

  async function toggle(t: MyTask) {
    setBusy(t.id)
    if (t.state === 'submitted') await unsubmitTask(t.id)
    else await submitTask(t.id)
    await loadMyTasks().then(setTasks)
    setBusy(null)
  }

  return (
    <>
      <Header title="Mis tareas" subtitle="Todo lo que tus catedráticos han publicado" />
      <main className="flex-1 overflow-auto p-8">
        <div className="mx-auto max-w-4xl">
          {/* Resumen */}
          <div className="mb-6 grid grid-cols-3 gap-4">
            <Stat label="Pendientes" value={counts.pending} tone="pending" />
            <Stat label="Entregadas" value={counts.submitted} tone="submitted" />
            <Stat label="Vencidas" value={counts.overdue} tone="overdue" />
          </div>

          {/* Filtros */}
          <div className="mb-5 flex flex-wrap gap-2">
            {([
              ['all', `Todas (${counts.all})`],
              ['pending', `Pendientes (${counts.pending})`],
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

          {/* Lista */}
          {shown.length === 0 ? (
            <div className="neo-empty">
              <p>No hay tareas en esta vista.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {shown.map((t) => (
                <article key={t.id} className={`neo-task neo-task--${t.state}`}>
                  <div className="neo-task-main">
                    <div className="neo-task-top">
                      <span className="neo-task-class">{t.className}</span>
                      {t.parcial && PARCIAL_LABEL[t.parcial] && (
                        <span className="neo-task-parcial">{PARCIAL_LABEL[t.parcial]}</span>
                      )}
                      <StateBadge state={t.state} />
                    </div>
                    <h3 className="neo-task-title">{t.title}</h3>
                    {t.description && <p className="neo-task-desc">{t.description}</p>}
                    <div className="neo-task-meta">
                      <DueLabel due={t.dueDate} state={t.state} />
                      {t.pdfUrl && (
                        <a href={t.pdfUrl} target="_blank" rel="noreferrer" className="neo-task-link">
                          Enunciado (PDF)
                        </a>
                      )}
                      {t.linkUrl && (
                        <a href={t.linkUrl} target="_blank" rel="noreferrer" className="neo-task-link">
                          Ver enlace
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="neo-task-actions">
                    <button
                      onClick={() => toggle(t)}
                      disabled={busy === t.id}
                      className={t.state === 'submitted' ? 'neo-btn-ghost' : 'neo-btn'}
                    >
                      {busy === t.id ? '…' : t.state === 'submitted' ? 'Deshacer' : 'Marcar entregada'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: TaskState }) {
  return (
    <div className={`neo-taskstat neo-taskstat--${tone}`}>
      <span className="neo-taskstat-num">{value}</span>
      <span className="neo-taskstat-label">{label}</span>
    </div>
  )
}

function StateBadge({ state }: { state: TaskState }) {
  const map = {
    pending: ['Pendiente', 'neo-badge--pending'],
    submitted: ['Entregada', 'neo-badge--submitted'],
    overdue: ['Vencida', 'neo-badge--overdue'],
  } as const
  const [label, cls] = map[state]
  return <span className={`neo-badge ${cls}`}>{label}</span>
}

function DueLabel({ due, state }: { due: number | null; state: TaskState }) {
  if (due == null) return <span className="neo-task-due">Sin fecha límite</span>
  const ms = due - Date.now()
  const day = 24 * 60 * 60 * 1000
  const fecha = new Date(due).toLocaleDateString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  if (state === 'submitted') return <span className="neo-task-due">Entregada · vencía {fecha}</span>
  if (ms < 0) return <span className="neo-task-due neo-task-due--over">Venció el {fecha}</span>

  const dias = Math.floor(ms / day)
  const horas = Math.floor(ms / (60 * 60 * 1000))
  let restante: string
  if (dias >= 1) restante = `vence en ${dias} día${dias > 1 ? 's' : ''}`
  else if (horas >= 1) restante = `vence en ${horas} h`
  else restante = 'vence en menos de 1 h'
  const urgente = ms < day
  return <span className={`neo-task-due ${urgente ? 'neo-task-due--soon' : ''}`}>{restante} · {fecha}</span>
}
