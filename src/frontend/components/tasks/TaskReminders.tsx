'use client'

/**
 * RECORDATORIO FLOTANTE (estudiante) — un widget abajo a la izquierda que va
 * ROTANDO por lo que tiene que hacer: la tarea más próxima a vencer, luego la
 * siguiente, etc. Así el estudiante ve de reojo qué le urge sin abrir nada.
 *
 * Solo aparece para estudiantes y solo si hay tareas por hacer. Se puede cerrar
 * (queda oculto hasta recargar) y minimizar a una burbuja.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { loadMyTasks, subscribeClassTasks, CLASSTASKS_EVENT, type MyTask } from '@/backend/services/classTasks'
import { getSession, SESSION_EVENT } from '@/frontend/session/session'

export default function TaskReminders() {
  const [tasks, setTasks] = useState<MyTask[]>([])
  const [role, setRole] = useState<string>('student')
  const [idx, setIdx] = useState(0)
  const [open, setOpen] = useState(true)
  const [closed, setClosed] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const sync = () => setRole(getSession()?.role ?? 'student')
    sync()
    const refresh = () => loadMyTasks().then(setTasks)
    refresh()
    window.addEventListener(CLASSTASKS_EVENT, refresh)
    window.addEventListener(SESSION_EVENT, sync)
    const off = subscribeClassTasks()
    return () => {
      window.removeEventListener(CLASSTASKS_EVENT, refresh)
      window.removeEventListener(SESSION_EVENT, sync)
      off()
    }
  }, [])

  // Solo lo que hay que hacer: vencidas y pendientes/en progreso con fecha,
  // ordenado por lo que urge primero.
  const pend = useMemo(() => {
    return tasks
      .filter((t) => t.state === 'overdue' || t.state === 'pending' || t.state === 'working')
      .sort((a, b) => {
        const av = a.state === 'overdue' ? -1 : 0
        const bv = b.state === 'overdue' ? -1 : 0
        if (av !== bv) return av - bv
        return (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity)
      })
  }, [tasks])

  // Rotación automática cada 5s entre las tareas pendientes
  useEffect(() => {
    if (timer.current) clearInterval(timer.current)
    if (pend.length > 1 && open) {
      timer.current = setInterval(() => setIdx((i) => (i + 1) % pend.length), 5000)
    }
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [pend.length, open])

  // Si cambia el número de pendientes, evita índice fuera de rango
  useEffect(() => {
    if (idx >= pend.length) setIdx(0)
  }, [pend.length, idx])

  if (role !== 'student' || closed || pend.length === 0) return null

  const overdue = pend.filter((t) => t.state === 'overdue').length
  const current = pend[idx] ?? pend[0]

  // Minimizado: una burbuja con el conteo
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={`neo-rem-bubble ${overdue > 0 ? 'neo-rem-bubble--alert' : ''}`} title="Ver pendientes">
        <BellIcon />
        <span className="neo-rem-count">{pend.length}</span>
      </button>
    )
  }

  return (
    <div className="neo-rem">
      <div className="neo-rem-head">
        <span className="neo-rem-title">
          <BellIcon /> Por hacer
          {overdue > 0 && <span className="neo-rem-badge">{overdue} vencida{overdue > 1 ? 's' : ''}</span>}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => setOpen(false)} className="neo-rem-ic" title="Minimizar">–</button>
          <button onClick={() => setClosed(true)} className="neo-rem-ic" title="Cerrar">✕</button>
        </div>
      </div>

      {/* Tarea destacada, va rotando */}
      <Link href={`/dashboard/tasks/${current.id}`} className="neo-rem-card" key={current.id}>
        <div className="neo-rem-card-top">
          <span className="neo-rem-class">{current.className}</span>
          <DueChip task={current} />
        </div>
        <p className="neo-rem-tasktitle">{current.title}</p>
      </Link>

      {/* Puntos de la rotación */}
      {pend.length > 1 && (
        <div className="neo-rem-dots">
          {pend.slice(0, 6).map((t, i) => (
            <button
              key={t.id}
              onClick={() => setIdx(i)}
              className={`neo-rem-dot ${i === idx ? 'neo-rem-dot--on' : ''}`}
              aria-label={`Tarea ${i + 1}`}
            />
          ))}
          <Link href="/dashboard/tasks" className="neo-rem-all">Ver todas →</Link>
        </div>
      )}
    </div>
  )
}

function DueChip({ task }: { task: MyTask }) {
  if (task.state === 'overdue') return <span className="neo-rem-due neo-rem-due--over">Vencida</span>
  if (task.dueDate == null) return <span className="neo-rem-due">Sin fecha</span>
  const ms = task.dueDate - Date.now()
  const day = 24 * 60 * 60 * 1000
  const dias = Math.floor(ms / day)
  const horas = Math.floor(ms / (60 * 60 * 1000))
  const txt = dias >= 1 ? `${dias} día${dias > 1 ? 's' : ''}` : horas >= 1 ? `${horas} h` : '< 1 h'
  return <span className={`neo-rem-due ${ms < day ? 'neo-rem-due--soon' : ''}`}>vence en {txt}</span>
}

function BellIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}
