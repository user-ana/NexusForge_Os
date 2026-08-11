'use client'

/**
 * Panel del catedrático — pantalla principal de /dashboard cuando el rol es
 * "teacher".
 *
 * Armazón de dos columnas fijas, cada una con su propio desplazamiento:
 *   · Izquierda — cabecera (título + buscador) y zona de trabajo:
 *       mis clases · acceso rápido · próximos eventos · frase del día.
 *   · Derecha  — carril de la agenda: perfil arriba, semana y entregas del día.
 *
 * Los datos son reales: las clases salen del store y las fechas de la agenda y
 * de los eventos son las fechas límite de las tareas publicadas. El color y el
 * icono de cada clase los deduce Nexus de la materia (ver shared/classSubjects).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ProfileBar from '@/frontend/components/layout/ProfileBar'
import {
  ArrowRightIcon,
  BoltIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardIcon,
  CodeIcon,
  DatabaseIcon,
  GlobeIcon,
  GradCapIcon,
  InboxIcon,
  MonitorIcon,
  PlusCircleIcon,
  QuoteIcon,
  SearchIcon,
  SparkIcon,
  TargetIcon,
  UploadIcon,
  UsersIcon,
} from '@/frontend/components/ui/Icons'
import { useT } from '@/frontend/hooks/useT'
import { getSession, displayName, SESSION_EVENT } from '@/frontend/session/session'
import {
  getClasses,
  loadClasses,
  subscribeClasses,
  CLASSES_EVENT,
  type Klass,
} from '@/backend/services/classes'
import {
  loadClassTasks,
  subscribeClassTasks,
  CLASSTASKS_EVENT,
  type ClassTask,
} from '@/backend/services/classTasks'
import { subjectFor, type SubjectId } from '@/shared/classSubjects'
import { quoteOfTheDay } from '@/shared/dailyQuote'
import type { Lang } from '@/frontend/i18n/i18n'

type ClassTaskX = ClassTask & { className: string }
type DatedTask = ClassTaskX & { dueDate: number }
type T = (k: string) => string

const DAY = 86_400_000

/* --------------------------------------------------------------- utilidades */

function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Días naturales de diferencia (0 = hoy, 1 = mañana). */
function daysUntil(ts: number, now: number): number {
  return Math.round((startOfDay(ts) - startOfDay(now)) / DAY)
}

function locale(lang: Lang): string {
  return lang === 'en' ? 'en-US' : 'es-ES'
}

function fmtTime(ts: number, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), { hour: '2-digit', minute: '2-digit', hour12: true })
    .format(ts)
    .toUpperCase()
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function fmtDayMonth(ts: number, lang: Lang): string {
  return cap(new Intl.DateTimeFormat(locale(lang), { weekday: 'long', day: 'numeric', month: 'long' }).format(ts))
}

function fmtMonthShort(ts: number, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), { month: 'short' }).format(ts).replace('.', '').toUpperCase()
}

/** Icono de la materia que dedujo Nexus a partir del nombre de la clase. */
function subjectIcon(id: SubjectId) {
  const size = 20
  switch (id) {
    case 'data':
      return <DatabaseIcon size={size} />
    case 'web':
    case 'code':
      return <CodeIcon size={size} />
    case 'network':
      return <GlobeIcon size={size} />
    case 'ai':
    case 'math':
      return <TargetIcon size={size} />
    case 'system':
      return <MonitorIcon size={size} />
    default:
      return <GradCapIcon size={size} />
  }
}

/* -------------------------------------------------------------------- panel */

export default function TeacherPanel() {
  const { t, lang } = useT()
  const [name, setName] = useState('')
  const [classes, setClasses] = useState<Klass[]>([])
  const [tasks, setTasks] = useState<ClassTaskX[]>([])
  const [loading, setLoading] = useState(true)
  // Se calcula ya montado: el día del servidor y el del navegador pueden diferir.
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    setNow(Date.now())
    const sync = () => {
      const s = getSession()
      setName(displayName(s))
      setClasses(getClasses().filter((c) => c.teacher === (s?.id ?? '')))
    }
    sync()
    loadClasses().finally(() => setLoading(false))
    const unsub = subscribeClasses()
    const ev = [SESSION_EVENT, CLASSES_EVENT]
    ev.forEach((e) => window.addEventListener(e, sync))
    return () => {
      ev.forEach((e) => window.removeEventListener(e, sync))
      unsub()
    }
  }, [])

  // Tareas de todas mis clases: alimentan la agenda y los próximos eventos.
  const classIds = classes.map((c) => c.id).join(',')
  useEffect(() => {
    let alive = true
    const pull = async () => {
      if (!classes.length) {
        setTasks([])
        return
      }
      const packs = await Promise.all(classes.map((c) => loadClassTasks(c.id)))
      if (!alive) return
      setTasks(packs.flatMap((pack, i) => pack.map((task) => ({ ...task, className: classes[i].name }))))
    }
    void pull()
    const unsub = subscribeClassTasks()
    const onTasks = () => void pull()
    window.addEventListener(CLASSTASKS_EVENT, onTasks)
    return () => {
      alive = false
      window.removeEventListener(CLASSTASKS_EVENT, onTasks)
      unsub()
    }
    // classIds evita relanzar la carga por una referencia nueva en cada render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classIds])

  const dated = useMemo(
    () => tasks.filter((x): x is DatedTask => x.dueDate != null),
    [tasks],
  )

  const upcoming = useMemo(() => {
    if (now == null) return []
    const floor = startOfDay(now)
    return dated.filter((x) => x.dueDate >= floor).sort((a, b) => a.dueDate - b.dueDate)
  }, [dated, now])

  // Ya venció la fecha límite: son las entregas que esperan revisión.
  const toReview = useMemo(() => {
    if (now == null) return 0
    return dated.filter((x) => x.dueDate < startOfDay(now) + DAY).length
  }, [dated, now])

  const totalStudents = classes.reduce((a, c) => a + c.students.length, 0)

  return (
    <div className="neo-tp">
      {/* Capa de fondo del centro de mando: rejilla técnica + halos */}
      <span className="neo-tp-grid" aria-hidden="true" />

      <div className="neo-tp-work">
        <header className="neo-tp-top">
          <div className="neo-tp-top-l">
            <h1 className="neo-tp-title">{t('head.dashboard.title')}</h1>
            {now != null && (
              <p className="neo-tp-hello">
                {t('tp.welcome')}, <b>{name}</b>
              </p>
            )}
            <p className="neo-tp-tag">{t('tp.tagline')}</p>
          </div>
          <PanelSearch classes={classes} tasks={tasks} t={t} />
        </header>

        <main className="neo-tp-main">
          <StatBar
            t={t}
            classes={classes.length}
            students={totalStudents}
            tasks={tasks.length}
            toReview={toReview}
          />

          <ClassesSection t={t} classes={classes} loading={loading} />

          <div className="neo-tp-duo">
            <QuickActions t={t} />
            <EventsPanel t={t} lang={lang} events={upcoming} now={now} />
          </div>
        </main>
      </div>

      <aside className="neo-tp-rail">
        <div className="neo-tp-rail-top">
          <ProfileBar />
        </div>
        <div className="neo-tp-rail-body">
          <QuoteBand t={t} lang={lang} now={now} />
          <AgendaRail t={t} lang={lang} now={now} tasks={dated} />
          <ReviewPanel t={t} now={now} tasks={dated} />
        </div>
      </aside>
    </div>
  )
}

/* ------------------------------------------------- barra de indicadores */

/** Cuatro cifras grandes en cápsula: el pulso de la academia de un vistazo. */
function StatBar({
  t,
  classes,
  students,
  tasks,
  toReview,
}: {
  t: T
  classes: number
  students: number
  tasks: number
  toReview: number
}) {
  const STATS = [
    { icon: <GradCapIcon size={16} />, value: classes, label: t('tp.kpi_classes') },
    { icon: <UsersIcon size={16} />, value: students, label: t('tp.kpi_students') },
    { icon: <ClipboardIcon size={16} />, value: tasks, label: t('tp.kpi_tasks') },
    { icon: <InboxIcon size={16} />, value: toReview, label: t('tp.kpi_review'), alert: toReview > 0 },
  ]
  return (
    <section className="neo-tp-stats">
      {STATS.map((s) => (
        <div key={s.label} className={`neo-tp-stat ${s.alert ? 'neo-tp-stat--alert' : ''}`}>
          <span className="neo-tp-stat-ic">{s.icon}</span>
          <span className="neo-tp-stat-v">{String(s.value).padStart(2, '0')}</span>
          <span className="neo-tp-stat-l">{s.label}</span>
        </div>
      ))}
    </section>
  )
}

/* ----------------------------------------------------------------- buscador */

type Hit = { id: string; kind: 'class' | 'task' | 'student'; title: string; sub: string; href: string }

function PanelSearch({ classes, tasks, t }: { classes: Klass[]; tasks: ClassTaskX[]; t: T }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Ctrl/Cmd + K enfoca el buscador desde cualquier punto del panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === 'Escape') setOpen(false)
    }
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [])

  const hits = useMemo<Hit[]>(() => {
    const needle = q.trim().toLowerCase()
    if (needle.length < 2) return []
    const out: Hit[] = []

    classes.forEach((c) => {
      if (`${c.name} ${c.code} ${c.section} ${c.period}`.toLowerCase().includes(needle))
        out.push({
          id: `c-${c.id}`,
          kind: 'class',
          title: c.name,
          sub: [c.section, c.code].filter(Boolean).join(' · '),
          href: `/aula/${c.id}`,
        })
    })
    tasks.forEach((x) => {
      if (x.title.toLowerCase().includes(needle))
        out.push({ id: `t-${x.id}`, kind: 'task', title: x.title, sub: x.className, href: `/dashboard/classes/${x.classId}` })
    })
    classes.forEach((c) => {
      c.roster.forEach((r) => {
        if (r.name.toLowerCase().includes(needle))
          out.push({ id: `s-${c.id}-${r.id}`, kind: 'student', title: r.name, sub: c.name, href: `/dashboard/classes/${c.id}` })
      })
    })
    return out.slice(0, 8)
  }, [q, classes, tasks])

  function go(h: Hit) {
    setOpen(false)
    setQ('')
    router.push(h.href)
  }

  const kindLabel: Record<Hit['kind'], string> = {
    class: t('tp.k_class'),
    task: t('tp.k_task'),
    student: t('tp.k_student'),
  }

  return (
    <div ref={boxRef} className="neo-tp-search-wrap">
      <div className="neo-tp-search">
        <span className="neo-tp-search-ic">
          <SearchIcon size={16} />
        </span>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hits[0]) go(hits[0])
          }}
          placeholder={t('tp.search_ph')}
          aria-label={t('tp.search_ph')}
        />
        <span className="neo-tp-kbd">Ctrl K</span>
      </div>

      {open && q.trim().length >= 2 && (
        <div className="neo-tp-results">
          {hits.length === 0 ? (
            <p className="neo-tp-results-empty">{t('tp.no_results')}</p>
          ) : (
            hits.map((h) => (
              <button key={h.id} onClick={() => go(h)} className="neo-tp-result">
                <span className={`neo-tp-result-ic neo-tp-result-ic--${h.kind}`}>
                  {h.kind === 'class' ? <GradCapIcon size={15} /> : h.kind === 'task' ? <ClipboardIcon size={15} /> : <UsersIcon size={15} />}
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="neo-tp-result-t">{h.title}</span>
                  <span className="neo-tp-result-s">{h.sub}</span>
                </span>
                <span className="neo-tp-result-kind">{kindLabel[h.kind]}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------------- mis clases */

function ClassesSection({ t, classes, loading }: { t: T; classes: Klass[]; loading: boolean }) {
  return (
    <section>
      <div className="neo-tp-sec-head">
        <span className="neo-tp-kicker">
          <SparkIcon size={12} />
          {t('tp.my_classes')}
        </span>
        <Link href="/dashboard/classes" className="neo-tp-sec-link">
          {t('tp.see_all')}
          <ArrowRightIcon size={14} />
        </Link>
      </div>

      {loading && classes.length === 0 ? (
        <div className="neo-tp-panel neo-tp-loading">
          <span className="neo-tp-spin" />
        </div>
      ) : classes.length === 0 ? (
        <div className="neo-tp-panel neo-tp-empty">
          <span className="neo-tp-empty-ic">
            <GradCapIcon size={22} />
          </span>
          <p className="neo-tp-empty-t">{t('tp.no_classes')}</p>
          <p className="neo-tp-empty-s">{t('tp.no_classes_sub')}</p>
          <Link href="/dashboard/classes?create=1" className="neo-btn mt-1">
            {t('tp.create_first')}
          </Link>
        </div>
      ) : (
        <div className="neo-tp-classes">
          {classes.map((c) => {
            const subject = subjectFor(c.name, c.id)
            return (
              <Link key={c.id} href={`/aula/${c.id}`} className="neo-tp-class">
                <span className="neo-tp-class-head">
                  <span className="neo-tp-class-ic">{subjectIcon(subject.id)}</span>
                  <span className="neo-tp-code">{c.code}</span>
                </span>

                <span className="neo-tp-class-row">
                  <span className="neo-tp-class-name">{c.name}</span>
                  <span className="neo-tp-class-meta">{[c.section, c.period].filter(Boolean).join(' · ')}</span>
                </span>

                <span className="neo-tp-class-foot">
                  <span className="neo-tp-class-students">
                    {c.students.length} {c.students.length === 1 ? t('tp.student_one') : t('tp.student_many')}
                  </span>
                  <span className="neo-tp-class-go">
                    <ArrowRightIcon size={16} />
                  </span>
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------ acceso rápido */

function QuickActions({ t }: { t: T }) {
  const ACTIONS = [
    { href: '/dashboard/classes?create=1', icon: <PlusCircleIcon size={18} />, label: t('tp.a_class'), sub: t('tp.a_class_s') },
    { href: '/dashboard/activities/new', icon: <ClipboardIcon size={18} />, label: t('tp.a_task'), sub: t('tp.a_task_s') },
    { href: '/dashboard/classes', icon: <UploadIcon size={18} />, label: t('tp.a_material'), sub: t('tp.a_material_s') },
    { href: '/dashboard/classes', icon: <InboxIcon size={18} />, label: t('tp.a_deliveries'), sub: t('tp.a_deliveries_s') },
  ]
  return (
    <section className="neo-tp-panel">
      <div className="neo-tp-panel-head">
        <span className="neo-tp-kicker">
          <BoltIcon size={12} />
          {t('tp.quick')}
        </span>
      </div>
      <div className="neo-tp-actions">
        {ACTIONS.map((a) => (
          <Link key={a.label} href={a.href} className="neo-tp-action">
            <span className="neo-tp-action-ic">{a.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="neo-tp-action-t">{a.label}</span>
              <span className="neo-tp-action-s">{a.sub}</span>
            </span>
            <span className="neo-tp-action-go">
              <ChevronRightIcon size={14} />
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

/* --------------------------------------------------------- próximos eventos */

function EventsPanel({ t, lang, events, now }: { t: T; lang: Lang; events: DatedTask[]; now: number | null }) {
  const list = events.slice(0, 4)
  return (
    <section className="neo-tp-panel">
      <div className="neo-tp-panel-head">
        <span className="neo-tp-kicker">
          <CalendarIcon size={12} />
          {t('tp.events')}
        </span>
        <Link href="/dashboard/classes" className="neo-tp-sec-link">
          {t('tp.see_calendar')}
          <ArrowRightIcon size={13} />
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="neo-tp-empty neo-tp-empty--sm">
          <span className="neo-tp-empty-ic">
            <CalendarIcon size={20} />
          </span>
          <p className="neo-tp-empty-s">{t('tp.events_empty')}</p>
        </div>
      ) : (
        <div className="neo-tp-events">
          {list.map((e) => {
            const d = now == null ? 99 : daysUntil(e.dueDate, now)
            const tone = d === 0 ? 'now' : d === 1 ? 'soon' : d <= 5 ? 'mid' : 'far'
            const when = d === 0 ? t('tp.d_today') : d === 1 ? t('tp.d_tomorrow') : `${t('tp.d_in')} ${d} ${t('tp.d_days')}`
            return (
              <Link key={e.id} href={`/dashboard/classes/${e.classId}`} className="neo-tp-event">
                <span className="neo-tp-date">
                  <b>{new Date(e.dueDate).getDate()}</b>
                  <i>{fmtMonthShort(e.dueDate, lang)}</i>
                </span>
                <span className={`neo-tp-dot neo-tp-dot--${tone}`} />
                <span className="min-w-0 flex-1">
                  <span className="neo-tp-event-t">{e.title}</span>
                  <span className="neo-tp-event-s">
                    {e.className} · {fmtTime(e.dueDate, lang)}
                  </span>
                </span>
                <span className={`neo-tp-when neo-tp-when--${tone}`}>{when}</span>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------ frase del día */

/** Vive arriba del carril: al pie de la página quedaba fuera de la vista. */
function QuoteBand({ t, lang, now }: { t: T; lang: Lang; now: number | null }) {
  if (now == null) return null
  const q = quoteOfTheDay(new Date(now))
  return (
    <section className="neo-tp-quote">
      <div className="neo-tp-quote-head">
        <span className="neo-tp-quote-ic">
          <QuoteIcon size={18} />
        </span>
        <span className="neo-tp-kicker">{t('tp.quote')}</span>
      </div>
      <p className="neo-tp-quote-txt">{lang === 'en' ? q.en : q.es}</p>
      <p className="neo-tp-quote-by">— {q.author}</p>
    </section>
  )
}

/* --------------------------------------------- pendientes de revisar */

/**
 * Tareas cuya fecha límite ya pasó: son las que esperan que el catedrático
 * entre a calificar. Llena el carril con algo accionable en vez de aire.
 */
function ReviewPanel({ t, now, tasks }: { t: T; now: number | null; tasks: DatedTask[] }) {
  const list = useMemo(() => {
    if (now == null) return []
    return tasks
      .filter((x) => x.dueDate < startOfDay(now) + DAY)
      .sort((a, b) => b.dueDate - a.dueDate)
      .slice(0, 5)
  }, [tasks, now])

  return (
    <div className="neo-tp-review">
      <div className="neo-tp-agenda-head">
        <span className="neo-tp-kicker">
          <InboxIcon size={13} />
          {t('tp.to_review')}
        </span>
        {list.length > 0 && (
          <Link href="/dashboard/classes" className="neo-tp-sec-link">
            {t('tp.see_all')}
          </Link>
        )}
      </div>

      {list.length === 0 ? (
        <p className="neo-tp-review-empty">{t('tp.to_review_empty')}</p>
      ) : (
        <div className="neo-tp-review-list">
          {list.map((x) => {
            const d = now == null ? 0 : -daysUntil(x.dueDate, now)
            const tone = d <= 0 ? 'now' : d <= 3 ? 'soon' : 'far'
            const when =
              d <= 0
                ? t('tp.d_today')
                : d === 1
                  ? t('tp.yesterday')
                  : `${t('tp.ago')} ${d} ${t('tp.d_days')} ${t('tp.ago_suffix')}`.trim()
            return (
              <Link key={x.id} href={`/dashboard/classes/${x.classId}`} className={`neo-tp-review-row neo-tp-review-row--${tone}`}>
                <span className="min-w-0 flex-1">
                  <span className="neo-tp-review-t">{x.title}</span>
                  <span className="neo-tp-review-s">{x.className}</span>
                </span>
                <span className={`neo-tp-review-when neo-tp-review-when--${tone}`}>{when}</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------- carril de la agenda */

function AgendaRail({ t, lang, now, tasks }: { t: T; lang: Lang; now: number | null; tasks: DatedTask[] }) {
  // Día que se está mirando: arranca en hoy y las flechas lo mueven.
  const [offset, setOffset] = useState(0)
  const day = now == null ? null : startOfDay(now) + offset * DAY

  const week = useMemo(() => {
    if (day == null) return []
    const shift = (new Date(day).getDay() + 6) % 7 // 0 = lunes
    const monday = day - shift * DAY
    return Array.from({ length: 7 }, (_, i) => monday + i * DAY)
  }, [day])

  const items = useMemo(() => {
    if (day == null) return []
    return tasks.filter((x) => startOfDay(x.dueDate) === day).sort((a, b) => a.dueDate - b.dueDate)
  }, [tasks, day])

  const dayLetters = lang === 'en' ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['L', 'M', 'M', 'J', 'V', 'S', 'D']
  const title = offset === 0 ? t('tp.agenda') : t('tp.agenda_day')

  return (
    <div className="neo-tp-agenda">
      <div className="neo-tp-agenda-head">
        <span className="neo-tp-kicker">
          <SparkIcon size={12} />
          {title}
        </span>
        <span className="neo-tp-nav">
          <button onClick={() => setOffset((o) => o - 1)} aria-label={t('tp.prev_day')}>
            <ChevronLeftIcon size={14} />
          </button>
          <button onClick={() => setOffset((o) => o + 1)} aria-label={t('tp.next_day')}>
            <ChevronRightIcon size={14} />
          </button>
        </span>
      </div>
      <p className="neo-tp-agenda-date">{day == null ? '' : fmtDayMonth(day, lang)}</p>

      <div className="neo-tp-week">
        {week.map((d, i) => (
          <button
            key={d}
            onClick={() => now != null && setOffset(Math.round((d - startOfDay(now)) / DAY))}
            className={`neo-tp-day ${d === day ? 'neo-tp-day--sel' : ''} ${now != null && d === startOfDay(now) ? 'neo-tp-day--today' : ''}`}
          >
            <span className="neo-tp-day-l">{dayLetters[i]}</span>
            <span className="neo-tp-day-n">{new Date(d).getDate()}</span>
          </button>
        ))}
      </div>

      <div className="neo-tp-slots">
        {items.length === 0 ? (
          <div className="neo-tp-empty neo-tp-empty--sm">
            <span className="neo-tp-empty-ic">
              <CalendarIcon size={20} />
            </span>
            <p className="neo-tp-empty-s">{t('tp.agenda_empty')}</p>
          </div>
        ) : (
          items.map((x) => {
            const d = now == null ? 99 : daysUntil(x.dueDate, now)
            const tone = d < 0 ? 'far' : d === 0 ? 'now' : d === 1 ? 'soon' : 'mid'
            const [h, ap] = fmtTime(x.dueDate, lang).split(' ')
            return (
              <Link key={x.id} href={`/dashboard/classes/${x.classId}`} className="neo-tp-slot">
                <span className="neo-tp-slot-time">
                  <b>{h}</b>
                  <i>{ap}</i>
                </span>
                <span className="neo-tp-slot-card">
                  <span className="min-w-0 flex-1">
                    <span className="neo-tp-slot-t">{x.title}</span>
                    <span className="neo-tp-slot-s">{x.className}</span>
                    <span className="neo-tp-slot-s">{t('tp.deadline')}</span>
                  </span>
                  <span className={`neo-tp-dot neo-tp-dot--${tone}`} />
                </span>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}
