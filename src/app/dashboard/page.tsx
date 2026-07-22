'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/frontend/components/layout/Header'
import Tilt3DCard from '@/frontend/components/ui/Tilt3DCard'
import Icon3D from '@/frontend/components/ui/Icon3D'
import { FlameIcon } from '@/frontend/components/ui/Icons'
import { useT } from '@/frontend/hooks/useT'
import { getSession, displayName, DEFAULT_COINS, DEFAULT_XP, SESSION_EVENT, normalizeStudentStats, type Role } from '@/frontend/session/session'
import { syncStudentStats, earnReward, syncStudentGroup } from '@/frontend/session/gamificationSync'
import { getClasses, loadClasses, subscribeClasses, joinByCode, CLASSES_EVENT, type Klass } from '@/backend/services/classes'
import { CGROUPS_EVENT } from '@/backend/services/classGroups'
import { getClassLeaderboard, type BoardRow } from '@/backend/services/gamification'
import { levelFromXp, rankFromXp } from '@/shared/gamification'

export default function DashboardPage() {
  const { t } = useT()
  const [role, setRole] = useState<Role>('student')

  useEffect(() => {
    const sync = () => setRole(getSession()?.role ?? 'student')
    sync()
    window.addEventListener(SESSION_EVENT, sync)
    return () => window.removeEventListener(SESSION_EVENT, sync)
  }, [])

  const roleLabel =
    role === 'teacher' ? t('prof.role_teacher') : role === 'visitor' ? t('prof.role_visitor') : t('prof.role_student')

  return (
    <>
      <Header
        title={t('head.dashboard.title')}
        subtitle={t('head.dashboard.sub')}
        action={
          role === 'visitor' ? (
            <Link href="/auth/signup" className="neo-btn">
              {t('dash.register')}
            </Link>
          ) : undefined
        }
      />

      <main className="flex-1 overflow-auto p-8 space-y-10">
        {/* Banner de rol */}
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-neutral-500">
          <span className="h-px w-6 bg-white/10" />
          {t('dash.view_as')} <span className="font-semibold text-accent-violet">{roleLabel}</span>
        </div>

        {role === 'teacher' ? <TeacherView t={t} /> : role === 'visitor' ? <VisitorView t={t} /> : <StudentView t={t} />}
      </main>
    </>
  )
}

type T = (k: string) => string

/* ---------------- Estudiante (gamer) ---------------- */
const QUESTS = [
  { id: 'commit', label: 'Sube tu primer commit', coins: 50, xp: 120, icon: '/icons/ach-commit.png', emoji: '◆' },
  { id: 'task', label: 'Completa una tarea del tablero', coins: 30, xp: 80, icon: '/icons/ach-code.png', emoji: '◆' },
  { id: 'social', label: 'Saluda en el chat de tu clase', coins: 20, xp: 60, icon: '/icons/ach-team.png', emoji: '◆' },
]

// Reclamos de retos: se guardan por día (se reinician cada día natural). Evita que
// al recargar reaparezca "Reclamar" y se sumen monedas otra vez.
const CLAIMED_KEY = 'nf_quests_claimed'
function todayStr(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD
}
function loadClaimed(): string[] {
  try {
    const o = JSON.parse(localStorage.getItem(CLAIMED_KEY) || '{}')
    return o.date === todayStr() ? (o.ids ?? []) : []
  } catch {
    return []
  }
}
function saveClaimed(ids: string[]): void {
  try {
    localStorage.setItem(CLAIMED_KEY, JSON.stringify({ date: todayStr(), ids }))
  } catch {
    /* ignore */
  }
}

function StudentView({ t }: { t: T }) {
  const [meName, setMeName] = useState('')
  const [meId, setMeId] = useState('')
  const [avatar, setAvatar] = useState<string | undefined>(undefined)
  const [coins, setCoins] = useState(DEFAULT_COINS)
  const [xp, setXp] = useState(DEFAULT_XP)
  const [streak, setStreak] = useState(0)
  const [classes, setClasses] = useState<Klass[]>([])
  const [board, setBoard] = useState<BoardRow[]>([])
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [claimed, setClaimed] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    normalizeStudentStats() // borra el XP/monedas inflados de la versión vieja
    void syncStudentStats() // carga las stats reales de la tabla (si existe)
    void syncStudentGroup() // detecta y refleja el escuadrón real del estudiante
    setClaimed(loadClaimed()) // retos ya reclamados hoy (no se pueden reclamar de nuevo)
    const sync = () => {
      const s = getSession()
      setMeId(s?.id ?? '')
      setMeName(displayName(s))
      setAvatar(s?.avatar)
      setCoins(s?.coins ?? DEFAULT_COINS)
      setXp(s?.xp ?? DEFAULT_XP)
      setStreak(s?.streak ?? 0)
      setClasses(getClasses()) // loadClasses ya trae solo las clases del alumno
    }
    sync()
    loadClasses().finally(() => setLoading(false))
    const unsub = subscribeClasses()
    const ev = [SESSION_EVENT, CLASSES_EVENT, CGROUPS_EVENT]
    ev.forEach((e) => window.addEventListener(e, sync))
    return () => {
      ev.forEach((e) => window.removeEventListener(e, sync))
      unsub()
    }
  }, [])

  // Leaderboard REAL del aula (primera clase del estudiante), ordenado por monedas.
  useEffect(() => {
    const cid = classes[0]?.id
    if (cid) getClassLeaderboard(cid).then(setBoard)
  }, [classes])

  async function join() {
    if (!code.trim()) return
    const k = await joinByCode(code)
    setMsg(k ? `✓ ${t('cls.joined')} ${k.name}` : `✗ ${t('cls.bad_code')}`)
    if (k) setCode('')
  }
  function claim(q: (typeof QUESTS)[number]) {
    if (claimed.includes(q.id)) return
    void earnReward(q.coins, q.xp) // persiste en la tabla (o local si no hay)
    setClaimed((p) => {
      const next = [...p, q.id]
      saveClaimed(next) // guarda el reclamo del día (no reaparece al recargar)
      return next
    })
  }

  const rk = rankFromXp(xp)
  const lv = levelFromXp(xp)
  // Refleja MIS monedas frescas de la sesión en mi fila del leaderboard (evita el desfase con 0)
  const displayBoard = board.map((r) => (r.id === meId ? { ...r, coins } : r)).sort((a, b) => b.coins - a.coins)

  return (
    <>
      {/* HERO gamer */}
      <div className="neo-hero">
        <div className="neo-hero-glow" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="neo-hero-ava">
            {avatar ? (
              <Icon3D src={avatar} alt="" size={76} fallback={meName.charAt(0).toUpperCase()} />
            ) : (
              <span>{meName.charAt(0).toUpperCase()}</span>
            )}
            <span className="neo-hero-gem">
              <Icon3D src={`/icons/rank-${rk.key}.png`} alt="" size={26} fallback="◆" />
            </span>
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-bold text-white">{meName}</h2>
              <span className="neo-chip neo-chip--gold">{rk.label} · Nivel {lv.level}</span>
            </div>
            <p className="mt-0.5 text-sm text-neutral-500">Operador de ingeniería · UTH</p>
            <div className="mt-3 max-w-md">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/45 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.5)]">
                <div className="h-full rounded-full bg-gradient-to-r from-[#4fc9f0] to-[#1089d3] transition-all" style={{ width: `${lv.pct}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-neutral-500">XP al siguiente nivel · {lv.pct}%</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="neo-hero-stat">
              <span className="text-accent-violet"><FlameIcon size={20} /></span>
              <div>
                <p className="neo-hero-stat-v">{streak}</p>
                <p className="neo-hero-stat-l">Racha</p>
              </div>
            </div>
            <div className="neo-hero-stat">
              <Icon3D src="/icons/coin.png" alt="" size={22} fallback="◆" />
              <div>
                <p className="neo-hero-stat-v">{coins.toLocaleString()}</p>
                <p className="neo-hero-stat-l">Monedas</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RETOS DE HOY */}
      <Section title="Retos de hoy">
        <div className="grid gap-3 md:grid-cols-3">
          {QUESTS.map((q) => {
            const done = claimed.includes(q.id)
            return (
              <div key={q.id} className={`neo-quest transition-all duration-200 hover:-translate-y-0.5 ${done ? 'neo-quest--done' : 'hover:border-accent-violet/25'}`}>
                <div className="neo-quest-ic">
                  <Icon3D src={q.icon} alt="" size={34} fallback={q.emoji} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-100">{q.label}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="rounded-full bg-accent-violet/15 px-2 py-0.5 font-medium text-accent-violet">+{q.coins} monedas</span>
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-400">+{q.xp} XP</span>
                  </p>
                </div>
                <button onClick={() => claim(q)} disabled={done} className="neo-quest-btn">
                  {done ? '✓' : 'Reclamar'}
                </button>
              </div>
            )
          })}
        </div>
      </Section>

      {/* MIS CLASES + TOP DEL AULA */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section title={t('nav.classes')}>
            {loading && classes.length === 0 ? (
              <div className="neo-panel flex items-center justify-center p-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-violet border-t-transparent" />
              </div>
            ) : classes.length === 0 ? (
              <div className="neo-panel flex flex-col items-center gap-5 p-10 text-center">
                <Icon3D src="/icons/emblem-1.png" alt="" size={56} fallback="◆" />
                <div>
                  <h3 className="text-base font-semibold text-white">{t('cls.no_classes_s')}</h3>
                  <p className="mt-1 max-w-sm text-sm text-neutral-400">{t('cls.join_sub')}</p>
                </div>
                <JoinByCode code={code} setCode={setCode} onJoin={join} msg={msg} t={t} />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {classes.map((c) => (
                  <Link key={c.id} href={`/aula/${c.id}`}>
                    <Tilt3DCard className="h-full p-5" max={8}>
                      <div className="flex items-start gap-3">
                        {c.emblem && <Icon3D src={c.emblem} alt="" size={40} fallback="◆" />}
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-semibold leading-snug text-white">
                            {c.name}
                            {c.section && <span className="text-neutral-400"> ({c.section})</span>}
                          </h3>
                          <p className="mt-1 text-xs text-neutral-500">{c.period}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3 text-xs">
                        <span className="text-neutral-500">{c.teacherName ?? c.teacher}</span>
                        <span className="font-mono text-accent-violet">{c.code}</span>
                      </div>
                    </Tilt3DCard>
                  </Link>
                ))}
                <div className="neo-panel flex items-center justify-center p-4">
                  <JoinByCode code={code} setCode={setCode} onJoin={join} msg={msg} t={t} compact />
                </div>
              </div>
            )}
          </Section>
        </div>

        <div>
          <Section title="Top del aula">
            <div className="neo-panel p-4">
              {classes.length === 0 ? (
                <p className="py-6 text-center text-sm text-neutral-500">Únete a una clase para ver el ranking.</p>
              ) : (
                <div className="space-y-1.5">
                  {displayBoard.slice(0, 5).map((row, i) => (
                    <div key={row.id} className={`neo-rank-row ${row.id === meId ? 'neo-rank-row--me' : ''}`}>
                      <span className={`neo-rank-pos neo-rank-pos--${i + 1}`}>{i + 1}</span>
                      <span className="neo-member !mr-0">{row.name.charAt(0).toUpperCase()}</span>
                      <span className="flex-1 truncate text-sm text-neutral-200">
                        {row.id === meId ? 'Tú' : row.name}
                      </span>
                      <span className="text-xs font-semibold text-accent-violet">{row.coins.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>
        </div>
      </div>
    </>
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
      {compact && <p className="mb-2 text-center text-xs text-neutral-500">Unirse a otra clase</p>}
      <div className="flex items-center gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && onJoin()}
          placeholder={t('cls.code_ph')}
          maxLength={12}
          className="neo-input flex-1 text-center font-mono tracking-widest"
        />
        <button onClick={onJoin} className="neo-btn">{compact ? '+' : t('cls.join_btn')}</button>
      </div>
      {msg && <p className="mt-2 text-center text-sm text-neutral-400">{msg}</p>}
    </div>
  )
}

/* ---------------- Catedrático ---------------- */
function TeacherView({ t }: { t: T }) {
  const [classes, setClasses] = useState<Klass[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const sync = () => {
      const s = getSession()
      const key = s?.id ?? ''
      setClasses(getClasses().filter((c) => c.teacher === key))
    }
    sync()
    loadClasses().finally(() => setLoading(false))
    const unsub = subscribeClasses()
    window.addEventListener(SESSION_EVENT, sync)
    window.addEventListener(CLASSES_EVENT, sync)
    return () => {
      window.removeEventListener(SESSION_EVENT, sync)
      window.removeEventListener(CLASSES_EVENT, sync)
      unsub()
    }
  }, [])

  const totalStudents = classes.reduce((a, c) => a + c.students.length, 0)

  return (
    <>
      <Section title={t('dash.quickstats')}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Tilt3DCard className="p-6">
            <p className="text-xs uppercase tracking-wider text-neutral-500">{t('dash.my_classes')}</p>
            <p className="mt-2 text-3xl font-bold text-neutral-100">{classes.length}</p>
          </Tilt3DCard>
          <Tilt3DCard className="p-6">
            <p className="text-xs uppercase tracking-wider text-neutral-500">{t('dash.students')}</p>
            <p className="mt-2 text-3xl font-bold text-neutral-100">{totalStudents}</p>
          </Tilt3DCard>
          <Tilt3DCard className="p-6">
            <p className="text-xs uppercase tracking-wider text-neutral-500">{t('cls.code')}</p>
            <p className="mt-2 font-mono text-lg font-bold text-accent-violet">{classes.length > 0 ? '✓' : '—'}</p>
          </Tilt3DCard>
        </div>
      </Section>

      <Section title={t('dash.classes_section')}>
        {loading && classes.length === 0 ? (
          <div className="neo-panel flex items-center justify-center p-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-violet border-t-transparent" />
          </div>
        ) : classes.length === 0 ? (
          <div className="neo-panel flex flex-col items-center gap-4 p-12 text-center">
            <Icon3D src="/icons/emblem-1.png" alt="" size={56} fallback="◆" />
            <p className="max-w-sm text-sm text-neutral-400">{t('cls.no_classes_t')}</p>
            <Link href="/dashboard/classes?create=1" className="neo-btn">{t('cls.create')}</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {classes.map((c) => (
              <Link key={c.id} href={`/aula/${c.id}`}>
                <Tilt3DCard className="h-full p-6" max={8}>
                  <div className="flex items-start gap-3">
                    {c.emblem && <Icon3D src={c.emblem} alt="" size={40} fallback="◆" />}
                    <div>
                      <h3 className="text-base font-semibold leading-snug text-white">
                        {c.name}
                        {c.section && <span className="text-neutral-400"> ({c.section})</span>}
                      </h3>
                      <p className="mt-1 text-xs text-neutral-500">{c.period}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3 text-xs">
                    <span className="text-neutral-500">{c.students.length} {t('dash.students_count')}</span>
                    <span className="font-mono text-accent-violet">{c.code}</span>
                  </div>
                </Tilt3DCard>
              </Link>
            ))}
            <Link
              href="/dashboard/classes?create=1"
              className="neo-panel flex min-h-[120px] items-center justify-center gap-2 p-6 text-sm font-medium text-neutral-500 transition hover:text-accent-violet"
            >
              <span className="text-xl">＋</span> {t('cls.create')}
            </Link>
          </div>
        )}
      </Section>
    </>
  )
}

/* ---------------- Visitante ---------------- */
function VisitorView({ t }: { t: T }) {
  const PUBLIC = [
    { name: 'E-Learning Platform', rank: 'gold' as const, stars: '4.8' },
    { name: 'Analytics Dashboard', rank: 'platinum' as const, stars: '4.9' },
    { name: 'IoT Greenhouse', rank: 'silver' as const, stars: '4.6' },
  ]
  return (
    <>
      <Tilt3DCard className="p-10" max={5}>
        <div className="flex flex-col items-center text-center gap-3">
          <Icon3D src="/icons/chest.png" alt="" size={72} fallback="◆" />
          <h2 className="text-2xl font-bold text-white">{t('dash.visitor_title')}</h2>
          <p className="max-w-md text-sm text-neutral-400">{t('dash.visitor_sub')}</p>
          <Link href="/auth/signup" className="neo-btn mt-2">
            {t('dash.register')}
          </Link>
        </div>
      </Tilt3DCard>

      <Section title={t('dash.public_projects')}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PUBLIC.map((p) => (
            <Tilt3DCard key={p.name} className="p-6" max={8}>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">{p.name}</h3>
                  <span className={`neo-chip neo-chip--${p.rank}`}>{p.rank}</span>
                </div>
                <p className="pt-3 border-t border-white/5 text-xs text-neutral-500">{p.stars} {t('dash.stars')}</p>
              </div>
            </Tilt3DCard>
          ))}
        </div>
      </Section>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500 mb-4">{title}</h2>
      {children}
    </section>
  )
}
