'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  loadClassTasks,
  deleteClassTask,
  loadSubmissions,
  subscribeClassTasks,
  CLASSTASKS_EVENT,
  type ClassTask,
  type Submission,
} from '@/backend/services/classTasks'
import { parcialLabel } from '@/shared/parciales'

type Roster = { id: string; name: string }[]

export default function ClassTasksSection({
  classId,
  isTeacher,
  roster,
}: {
  classId: string
  isTeacher: boolean
  roster: Roster
}) {
  const [tasks, setTasks] = useState<ClassTask[]>([])

  useEffect(() => {
    const refresh = () => loadClassTasks(classId).then(setTasks)
    refresh()
    window.addEventListener(CLASSTASKS_EVENT, refresh)
    const off = subscribeClassTasks()
    return () => {
      window.removeEventListener(CLASSTASKS_EVENT, refresh)
      off()
    }
  }, [classId])

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">Tareas de la clase</h3>
        {isTeacher && (
          <Link href={`/dashboard/activities/new?class=${classId}`} className="neo-btn text-sm">
            Publicar tarea
          </Link>
        )}
      </div>

      {tasks.length === 0 ? (
        <div className="neo-panel p-8 text-center text-sm text-neutral-500">
          {isTeacher ? 'Aún no has publicado tareas. Abre el Estudio de publicación para crear la primera.' : 'El catedrático no ha publicado tareas.'}
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} isTeacher={isTeacher} roster={roster} />
          ))}
        </div>
      )}
    </section>
  )
}


function TaskRow({ task, isTeacher, roster }: { task: ClassTask; isTeacher: boolean; roster: Roster }) {
  const [expanded, setExpanded] = useState(false)
  const [subs, setSubs] = useState<Submission[] | null>(null)

  useEffect(() => {
    if (isTeacher && expanded && subs === null) loadSubmissions(task.id).then(setSubs)
  }, [expanded, isTeacher, subs, task.id])

  const { entregados, pendientes } = useMemo(() => {
    const done = new Set((subs ?? []).map((s) => s.studentId))
    return {
      entregados: roster.filter((r) => done.has(r.id)),
      pendientes: roster.filter((r) => !done.has(r.id)),
    }
  }, [subs, roster])

  return (
    <article className="neo-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {task.parcial && <span className="neo-chip neo-chip--gold">{parcialLabel(task.parcial)}</span>}
            <DueTag due={task.dueDate} />
          </div>
          <h4 className="font-semibold text-white">{task.title}</h4>
          {task.description && <p className="mt-1 text-sm text-neutral-400">{task.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {task.pdfUrl && (
              <a href={task.pdfUrl} target="_blank" rel="noreferrer" className="neo-pdflink">
                <PdfIcon small /> Enunciado (PDF)
              </a>
            )}
            {task.linkUrl && (
              <a href={task.linkUrl} target="_blank" rel="noreferrer" className="text-xs text-accent-violet">
                Ver enlace →
              </a>
            )}
          </div>
        </div>
        {isTeacher && (
          <div className="flex flex-shrink-0 items-center gap-2">
            <button onClick={() => setExpanded((v) => !v)} className="neo-btn-ghost text-xs">
              {expanded ? 'Ocultar' : 'Ver entregas'}
            </button>
            <button onClick={() => deleteClassTask(task.id)} className="text-neutral-600 hover:text-red-400" title="Eliminar tarea">✕</button>
          </div>
        )}
      </div>

      {isTeacher && expanded && (
        <div className="mt-4 border-t border-white/5 pt-4">
          {subs === null ? (
            <p className="text-xs text-neutral-500">Cargando entregas…</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold text-emerald-400">Entregaron ({entregados.length})</p>
                {entregados.length === 0 ? (
                  <p className="text-xs text-neutral-600">Nadie aún.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {entregados.map((r) => (
                      <span key={r.id} className="rounded-lg bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">{r.name}</span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold text-neutral-400">Pendientes ({pendientes.length})</p>
                {pendientes.length === 0 ? (
                  <p className="text-xs text-neutral-600">Todos entregaron.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {pendientes.map((r) => (
                      <span key={r.id} className="rounded-lg bg-black/25 px-2 py-1 text-xs text-neutral-400">{r.name}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {!isTeacher && (
        <p className="mt-3 border-t border-white/5 pt-3 text-xs text-neutral-500">
          Gestiona tu entrega desde <span className="text-accent-violet">Mis tareas</span>.
        </p>
      )}
    </article>
  )
}

function PdfIcon({ small }: { small?: boolean }) {
  const s = small ? 13 : 26
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M9 13h1.5a1.5 1.5 0 0 1 0 3H9v-3zm0 0v5" />
      <path d="M15.5 13H14v5m0-2.5h1.2" />
    </svg>
  )
}

function DueTag({ due }: { due: number | null }) {
  if (due == null) return <span className="neo-chip">Sin fecha</span>
  const over = Date.now() > due
  const fecha = new Date(due).toLocaleDateString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  return <span className={`neo-chip ${over ? 'neo-chip--over' : ''}`}>{over ? 'Venció' : 'Vence'} {fecha}</span>
}
