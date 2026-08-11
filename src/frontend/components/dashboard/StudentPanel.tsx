'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import ProfileBar from '@/frontend/components/layout/ProfileBar'
import Icon3D from '@/frontend/components/ui/Icon3D'
import {
  GradCapIcon,
  ClipboardIcon,
  CheckIcon,
  AlertIcon,
  CalendarIcon,
  ArrowRightIcon,
} from '@/frontend/components/ui/Icons'
import { useT } from '@/frontend/hooks/useT'
import { getSession, displayName, SESSION_EVENT } from '@/frontend/session/session'
import {
  getClasses,
  loadClasses,
  subscribeClasses,
  joinByCode,
  CLASSES_EVENT,
  type Klass,
} from '@/backend/services/classes'
import { loadMyTasks, subscribeClassTasks, CLASSTASKS_EVENT, type MyTask } from '@/backend/services/classTasks'

/**
 * Panel del ESTUDIANTE.
 *
 * Comparte el armazon visual del panel del catedratico (las clases neo-tp-*),
 * asi los dos modos se ven parte del mismo producto: mismo negro mate, mismo
 * acento cian, mismas tarjetas. Lo que cambia es el contenido, porque el
 * trabajo de un estudiante no se parece al de un docente.
 *
 * Sin capa de juego: ni monedas, ni XP, ni rango, ni retos, ni ranking. Lo
 * primero que ve es lo que tiene que entregar.
 */

const DAY = 86_400_000
type T = (k: string) => string

export default function StudentPanel() {
  const { t } = useT()
  const [name, setName] = useState('')
  const [classes, setClasses] = useState<Klass[]>([])
  const [tasks, setTasks] = useState<MyTask[]>([])
  const [loading, setLoading] = useState(true)
  // null hasta que monta en el navegador: leer la hora durante el render del
  // servidor daria un HTML distinto al del cliente.
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    setNow(Date.now())
    const sync = () => {
      setName(displayName(getSession()))
      setClasses(getClasses())
    }
    sync()

    async function boot() {
      await loadClasses()
      sync()
      setTasks(await loadMyTasks())
      setLoading(false)
    }
    void boot()

    const refreshTasks = () => void loadMyTasks().then(setTasks)
    const unsubClasses = subscribeClasses()
    const unsubTasks = subscribeClassTasks()
    const evs = [SESSION_EVENT, CLASSES_EVENT]
    evs.forEach((e) => window.addEventListener(e, sync))
    window.addEventListener(CLASSTASKS_EVENT, refreshTasks)
    return () => {
      evs.forEach((e) => window.removeEventListener(e, sync))
      window.removeEventListener(CLASSTASKS_EVENT, refreshTasks)
      unsubClasses()
      unsubTasks()
    }
  }, [])

  const { porHacer, entregadas, vencidas } = useMemo(() => {
    const porHacer = tasks.filter((x) => x.state === 'pending' || x.state === 'working')
    return {
      porHacer,
      entregadas: tasks.filter((x) => x.state === 'submitted'),
      vencidas: tasks.filter((x) => x.state === 'overdue'),
    }
  }, [tasks])

  // Lo urgente primero: vencidas arriba, luego por fecha mas cercana. Las que no
  // tienen fecha van al final — no aprietan.
  const agenda = useMemo(() => {
    const orden = (x: MyTask) => (x.state === 'overdue' ? 0 : 1)
    return [...vencidas, ...porHacer]
      .sort((a, b) => orden(a) - orden(b) || (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity))
  }, [porHacer, vencidas])

  return (
    <div className="neo-tp">
      <span className="neo-tp-grid" aria-hidden="true" />

      <div className="neo-tp-work">
        <header className="neo-tp-top">
          <div className="neo-tp-top-l">
            <h1 className="neo-tp-title">{t('head.dashboard.title')}</h1>
            {now != null && name && (
              <p className="neo-tp-hello">
                {t('tp.welcome')}, <b>{name}</b>
              </p>
            )}
            <p className="neo-tp-tag">{t('sp.tagline')}</p>
          </div>
        </header>

        <main className="neo-tp-main">
          <section className="neo-tp-stats">
            <Stat icon={<GradCapIcon size={16} />} value={classes.length} label={t('sp.kpi_classes')} />
            <Stat icon={<ClipboardIcon size={16} />} value={porHacer.length} label={t('sp.kpi_pending')} />
            <Stat icon={<CheckIcon size={16} />} value={entregadas.length} label={t('sp.kpi_done')} />
            <Stat icon={<AlertIcon size={16} />} value={vencidas.length} label={t('sp.kpi_overdue')} alert={vencidas.length > 0} />
          </section>

          <TasksSection t={t} tasks={agenda} loading={loading} now={now} hasClasses={classes.length > 0} />

          <ClassesSection t={t} classes={classes} loading={loading} />
        </main>
      </div>

      <aside className="neo-tp-rail">
        <div className="neo-tp-rail-top">
          <ProfileBar />
        </div>
        <div className="neo-tp-rail-body">
          <AgendaRail t={t} tasks={agenda} now={now} />
        </div>
      </aside>
    </div>
  )
}

/* ------------------------------------------------------- indicadores */

function Stat({ icon, value, label, alert }: { icon: React.ReactNode; value: number; label: string; alert?: boolean }) {
  return (
    <div className={`neo-tp-stat ${alert ? 'neo-tp-stat--alert' : ''}`}>
      <span className="neo-tp-stat-ic">{icon}</span>
      <span className="neo-tp-stat-v">{String(value).padStart(2, '0')}</span>
      <span className="neo-tp-stat-l">{label}</span>
    </div>
  )
}

/* ------------------------------------------------------- tareas */

/** Cuanto falta (o cuanto lleva vencida) en palabras. */
function dueLabel(due: number | null, now: number | null, t: T): { text: string; late: boolean } {
  if (due == null) return { text: t('sp.no_due'), late: false }
  if (now == null) return { text: '', late: false }
  const diff = due - now
  const dias = Math.round(Math.abs(diff) / DAY)
  if (diff < 0) return { text: dias <= 0 ? t('sp.due_today_late') : `${t('sp.overdue_by')} ${dias} d`, late: true }
  if (dias === 0) return { text: t('sp.due_today'), late: false }
  if (dias === 1) return { text: t('sp.due_tomorrow'), late: false }
  return { text: `${t('sp.due_in')} ${dias} d`, late: false }
}

function TasksSection({
  t,
  tasks,
  loading,
  now,
  hasClasses,
}: {
  t: T
  tasks: MyTask[]
  loading: boolean
  now: number | null
  hasClasses: boolean
}) {
  return (
    <section>
      <div className="neo-tp-sec-head">
        <h2 className="neo-tp-kicker">{t('sp.tasks_title')}</h2>
        <Link href="/dashboard/tasks" className="neo-tp-sec-link">
          {t('sp.see_all')} <ArrowRightIcon size={13} />
        </Link>
      </div>

      {loading ? (
        <div className="neo-panel flex items-center justify-center p-10">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent-violet border-t-transparent" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="neo-panel p-8 text-center">
          <p className="text-sm text-neutral-400">{hasClasses ? t('sp.tasks_empty') : t('sp.tasks_no_class')}</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {tasks.slice(0, 6).map((x) => {
            const d = dueLabel(x.dueDate, now, t)
            return (
              <Link key={x.id} href={`/dashboard/tasks/${x.id}`}>
                <div className={`neo-panel neo-panel--hover h-full p-4 ${x.state === 'overdue' ? 'border-red-500/25' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="min-w-0 flex-1 truncate font-semibold leading-snug text-white">{x.title}</h3>
                    {x.state === 'working' && <span className="neo-chip neo-chip--progress flex-shrink-0">{t('sp.state_working')}</span>}
                  </div>
                  <p className="mt-1 truncate text-xs text-neutral-500">{x.className}</p>
                  <div className="mt-3 flex items-center gap-2 border-t border-white/5 pt-3 text-xs">
                    <span className={d.late ? 'text-red-400' : 'text-neutral-400'}>
                      <CalendarIcon size={12} />
                    </span>
                    <span className={d.late ? 'font-medium text-red-400' : 'text-neutral-400'}>{d.text}</span>
                    {x.points > 0 && <span className="ml-auto text-neutral-600">{x.points} pts</span>}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------- clases */

function ClassesSection({ t, classes, loading }: { t: T; classes: Klass[]; loading: boolean }) {
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')

  async function join() {
    if (!code.trim()) return
    const k = await joinByCode(code)
    setMsg(k ? `${t('cls.joined')} ${k.name}` : t('cls.bad_code'))
    if (k) setCode('')
  }

  return (
    <section>
      <div className="neo-tp-sec-head">
        <h2 className="neo-tp-kicker">{t('nav.classes')}</h2>
      </div>

      {loading && classes.length === 0 ? (
        <div className="neo-panel flex items-center justify-center p-10">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent-violet border-t-transparent" />
        </div>
      ) : classes.length === 0 ? (
        <div className="neo-panel flex flex-col items-center gap-4 p-8 text-center">
          <h3 className="text-base font-semibold text-white">{t('cls.no_classes_s')}</h3>
          <p className="max-w-sm text-sm text-neutral-400">{t('cls.join_sub')}</p>
          <JoinByCode code={code} setCode={setCode} onJoin={join} msg={msg} t={t} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {classes.map((c) => (
            <Link key={c.id} href={`/aula/${c.id}`}>
              <div className="neo-panel neo-panel--hover h-full p-5">
                <div className="flex items-start gap-3">
                  {c.emblem && <Icon3D src={c.emblem} alt="" size={36} fallback="◆" />}
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold leading-snug text-white">
                      {c.name}
                      {c.section && <span className="text-neutral-500"> ({c.section})</span>}
                    </h3>
                    <p className="mt-0.5 text-xs text-neutral-500">{c.period}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3 text-xs">
                  <span className="truncate text-neutral-500">{c.teacherName ?? ''}</span>
                  <span className="ml-2 flex-shrink-0 font-mono text-accent-violet">{c.code}</span>
                </div>
              </div>
            </Link>
          ))}
          <div className="neo-panel flex items-center justify-center p-4">
            <JoinByCode code={code} setCode={setCode} onJoin={join} msg={msg} t={t} compact />
          </div>
        </div>
      )}
    </section>
  )
}

function JoinByCode({
  code,
  setCode,
  onJoin,
  msg,
  t,
  compact,
}: {
  code: string
  setCode: (v: string) => void
  onJoin: () => void
  msg: string
  t: T
  compact?: boolean
}) {
  return (
    <div className="w-full max-w-md">
      {compact && <p className="mb-2 text-center text-xs text-neutral-500">{t('sp.join_other')}</p>}
      <div className="flex items-center gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && onJoin()}
          placeholder={t('cls.code_ph')}
          maxLength={12}
          className="neo-input flex-1 text-center font-mono tracking-widest"
          aria-label={t('cls.code_ph')}
        />
        <button onClick={onJoin} className="neo-btn">{compact ? '+' : t('cls.join_btn')}</button>
      </div>
      {msg && <p className="mt-2 text-center text-xs text-neutral-400">{msg}</p>}
    </div>
  )
}

/* ------------------------------------------------------- barra lateral */

/** Proximas entregas en la columna derecha, el equivalente a la agenda del docente. */
function AgendaRail({ t, tasks, now }: { t: T; tasks: MyTask[]; now: number | null }) {
  const conFecha = tasks.filter((x) => x.dueDate != null).slice(0, 5)
  return (
    <section>
      <div className="neo-tp-panel-head">
        <h2 className="neo-tp-kicker">{t('sp.agenda')}</h2>
      </div>
      <div className="neo-panel p-3">
        {conFecha.length === 0 ? (
          <p className="py-5 text-center text-xs text-neutral-600">{t('sp.agenda_empty')}</p>
        ) : (
          <div className="space-y-1">
            {conFecha.map((x) => {
              const d = dueLabel(x.dueDate, now, t)
              return (
                <Link key={x.id} href={`/dashboard/tasks/${x.id}`}>
                  <div className="neo-row flex items-center gap-3 px-2 py-2">
                    <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${d.late ? 'bg-red-400' : 'bg-accent-violet'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-neutral-200">{x.title}</p>
                      <p className="truncate text-[11px] text-neutral-500">{x.className}</p>
                    </div>
                    <span className={`flex-shrink-0 text-[11px] ${d.late ? 'text-red-400' : 'text-neutral-500'}`}>{d.text}</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
