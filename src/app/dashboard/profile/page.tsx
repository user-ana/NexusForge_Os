'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Header from '@/frontend/components/layout/Header'
import Icon3D from '@/frontend/components/ui/Icon3D'
import { PencilIcon } from '@/frontend/components/ui/Icons'
import PresetAvatar, { presetIndex } from '@/frontend/components/ui/PresetAvatar'
import AvatarPicker from '@/frontend/components/ui/AvatarPicker'
import {
  getSession,
  patchSession,
  displayName,
  SESSION_EVENT,
  DEFAULT_COINS,
  DEFAULT_XP,
  normalizeStudentStats,
  type Session,
  type Role,
} from '@/frontend/session/session'
import { useT } from '@/frontend/hooks/useT'
import { supabase } from '@/backend/supabase'
import { getAssistantOverview, type AssistantOverview } from '@/backend/services/studentSearch'
import { syncStudentStats } from '@/frontend/session/gamificationSync'
import { RANKS, levelFromXp, rankFromXp } from '@/shared/gamification'

const ACHIEVEMENTS = [
  { name: 'First Commit', icon: '/icons/ach-commit.png', emoji: '◆', unlocked: true },
  { name: 'Code Master', icon: '/icons/ach-code.png', emoji: '◆', unlocked: true },
  { name: 'Champion', icon: '/icons/ach-trophy.png', emoji: '◆', unlocked: false },
  { name: 'Team Player', icon: '/icons/ach-team.png', emoji: '◆', unlocked: true },
  { name: 'Bug Slayer', icon: '/icons/ach-slots.png', emoji: '◆', unlocked: true },
  { name: 'Top Earner', icon: '/icons/ach-gold.png', emoji: '◆', unlocked: false },
]

export default function ProfilePage() {
  const { t, lang, setLang } = useT()
  const [session, setSessionState] = useState<Session | null>(null)
  const [ov, setOv] = useState<AssistantOverview | null>(null) // stats reales del catedrático
  const [picker, setPicker] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [tName, setTName] = useState('')
  const [tCareer, setTCareer] = useState('')
  const [needNameFocus, setNeedNameFocus] = useState(false)
  const tInited = useRef(false)
  const nameRef = useRef<HTMLInputElement>(null)

  async function saveTeacher() {
    patchSession({ fullName: tName.trim(), career: tCareer.trim() })
    if (supabase) {
      // nf_full_name = clave propia que el proveedor OAuth no sobreescribe al re-loguear.
      await supabase.auth
        .updateUser({ data: { nf_full_name: tName.trim(), full_name: tName.trim(), career: tCareer.trim() } })
        .catch(() => {})
    }
  }

  useEffect(() => {
    const sync = () => {
      const s = getSession()
      setSessionState(s)
      if (s && !tInited.current) {
        setTName(s.fullName ?? '')
        setTCareer(s.career ?? '')
        tInited.current = true
        // Primera vez sin nombre puesto → foco directo al campo del nombre
        const r = s.role ?? 'student'
        if (r === 'teacher' && !s.fullName?.trim()) {
          setNeedNameFocus(true)
        } else if (r === 'student' && !s.name?.trim()) {
          setDraft('')
          setEditing(true)
        }
      }
    }
    sync()
    window.addEventListener(SESSION_EVENT, sync)
    return () => window.removeEventListener(SESSION_EVENT, sync)
  }, [])

  // Stats reales del catedrático; y reset de valores inflados del estudiante
  useEffect(() => {
    const s = getSession()
    if (s?.role === 'teacher' && s.id) getAssistantOverview(s.id).then(setOv)
    else if (s?.role !== 'teacher') {
      normalizeStudentStats()
      void syncStudentStats() // stats reales de la tabla (si existe)
    }
  }, [])

  // Coloca el cursor en el nombre del catedrático (cuando ya está renderizado)
  useEffect(() => {
    if (needNameFocus && nameRef.current) {
      nameRef.current.focus()
      setNeedNameFocus(false)
    }
  }, [needNameFocus])

  if (!session) return null

  const name = displayName(session)
  const avatar = session.avatar
  const currentRole: Role = session.role ?? 'student'
  const roleLabel = (r: Role) =>
    r === 'teacher' ? t('prof.role_teacher') : r === 'visitor' ? t('prof.role_visitor') : t('prof.role_student')
  const role = roleLabel(currentRole)
  const isStudent = currentRole === 'student'
  const coins = session.coins ?? DEFAULT_COINS
  const xp = session.xp ?? DEFAULT_XP
  const group = session.group
  const rk = rankFromXp(xp)
  const lv = levelFromXp(xp)

  function startEdit() {
    setDraft(name)
    setEditing(true)
  }
  function saveEdit() {
    const v = draft.trim()
    if (v) patchSession({ name: v })
    setEditing(false)
  }

  return (
    <>
      <Header
        title={t('head.profile.title')}
        subtitle={t('head.profile.sub')}
        action={
          <div className="neo-lang">
            <button
              onClick={() => setLang('es')}
              className={`neo-lang-btn ${lang === 'es' ? 'neo-lang-btn--active' : ''}`}
            >
              ES
            </button>
            <button
              onClick={() => setLang('en')}
              className={`neo-lang-btn ${lang === 'en' ? 'neo-lang-btn--active' : ''}`}
            >
              EN
            </button>
          </div>
        }
      />

      <main className="flex-1 overflow-auto p-8 space-y-8">
        {/* Tarjeta principal */}
        <div className="neo-panel p-8">
          <div className="flex flex-col items-center gap-8 md:flex-row md:items-start">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <button onClick={() => setPicker(true)} className="neo-avatar-big" title={t('prof.change')}>
                {avatar ? (
                  <PresetAvatar src={avatar} index={presetIndex(avatar) ?? 1} size={140} className="h-full w-full" />
                ) : (
                  <span className="neo-avatar-initial !text-4xl">{name.charAt(0).toUpperCase()}</span>
                )}
                <span className="neo-avatar-big-edit inline-flex items-center gap-1"><PencilIcon size={13} /> {t('prof.change')}</span>
              </button>
              {isStudent && (
                <span className="neo-avatar-rank">
                  <Icon3D src="/icons/rank-gold.png" alt="rank" size={30} fallback="◆" />
                </span>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 w-full">
              <div className="flex items-center gap-3">
                {editing ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                    onBlur={saveEdit}
                    className="neo-input max-w-xs text-xl font-bold"
                  />
                ) : (
                  <>
                    <h2 className="text-3xl font-bold text-white">
                      {!isStudent && tName.trim() ? tName : name}
                    </h2>
                    {isStudent && (
                      <button onClick={startEdit} className="text-neutral-500 hover:text-accent-violet" title="Editar nombre">
                        <PencilIcon size={16} />
                      </button>
                    )}
                  </>
                )}
                <span className="neo-chip neo-chip--progress">{role}</span>
              </div>

              <p className="mt-1 text-sm text-neutral-500">{session.user}</p>
              {isStudent && session.account && (
                <p className="mt-1 inline-flex items-center gap-2 font-mono text-xs text-neutral-400">
                  <span className="text-neutral-600">N.º cuenta:</span> {session.account}
                </p>
              )}

              {/* Catedrático: nombre completo + carrera (editable) + código docente */}
              {!isStudent && (
                <div className="mt-3 space-y-3">
                  <div className="grid max-w-lg gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="neo-label">{t('tw.fullname')}</label>
                      <input
                        ref={nameRef}
                        value={tName}
                        onChange={(e) => setTName(e.target.value)}
                        onBlur={saveTeacher}
                        placeholder={t('tw.fullname_ph')}
                        className="neo-input w-full"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="neo-label">{t('tw.career')}</label>
                      <input
                        value={tCareer}
                        onChange={(e) => setTCareer(e.target.value)}
                        onBlur={saveTeacher}
                        placeholder={t('tw.career_ph')}
                        className="neo-input w-full"
                      />
                    </div>
                  </div>
                  {session.teacherCode && (
                    <span className="inline-flex items-center gap-2 rounded-lg bg-black/25 px-3 py-1.5 font-mono text-sm font-bold tracking-widest text-accent-violet shadow-[inset_2px_2px_5px_rgba(0,0,0,0.5)]">
                      {session.teacherCode}
                    </span>
                  )}
                </div>
              )}

              {/* Chips: solo estudiante (rango/grupo) */}
              {isStudent && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="neo-chip neo-chip--gold">{rk.label} · {t('prof.level')} {lv.level}</span>
                  <span className="neo-chip">{group ?? t('prof.no_group')}</span>
                  {!group && (
                    <Link href="/dashboard/classes" className="text-xs text-accent-violet hover:text-accent-violetBright">
                      {t('prof.join_group')} →
                    </Link>
                  )}
                </div>
              )}

              {/* Stats: estudiante (juego) vs catedrático (docencia) */}
              {isStudent ? (
                <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Stat label={t('prof.coins')} value={coins.toLocaleString()} icon="/icons/coin.png" emoji="◆" />
                  <Stat label={t('prof.xp')} value={xp.toLocaleString()} />
                  <Stat label={t('prof.rank')} value={rk.label} icon={`/icons/rank-${rk.key}.png`} emoji="◆" />
                  <Stat label={t('prof.level')} value={String(lv.level)} />
                </div>
              ) : (
                <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Stat label={t('prof.t_classes')} value={String(ov?.classCount ?? 0)} />
                  <Stat label={t('prof.t_students')} value={String(ov?.studentCount ?? 0)} />
                  <Stat label={t('prof.t_groups')} value={String(ov?.groupCount ?? 0)} />
                  <Stat label={t('prof.t_reviewed')} value={String(ov?.gradedCount ?? 0)} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Progreso de rango (carrusel) — solo estudiante */}
        {isStudent && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500 mb-4">{t('prof.rank_progress')}</h3>
          <div className="neo-panel p-6">
            <div className="neo-scroll-x">
              {RANKS.map((r, i) => (
                <div key={r.key} className="flex min-w-[92px] flex-col items-center gap-2">
                  <div className={`neo-gem ${i <= rk.index ? 'neo-gem--active' : 'neo-gem--locked'}`}>
                    <Icon3D src={`/icons/rank-${r.key}.png`} alt={r.label} size={38} fallback="◆" />
                  </div>
                  <span className={`text-[11px] ${i === rk.index ? 'text-white font-semibold' : 'text-neutral-500'}`}>
                    {r.label}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-black/40 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.5)]">
              <div className="h-full rounded-full bg-gradient-to-r from-[#b89bff] to-[#8b5cf6]" style={{ width: '58%' }} />
            </div>
          </div>
        </section>
        )}

        {/* Logros (carrusel) — solo estudiante */}
        {isStudent && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">{t('prof.achievements')}</h3>
            <Link href="/dashboard/rewards" className="text-xs text-accent-violet hover:text-accent-violetBright">
              {t('prof.view_all')} →
            </Link>
          </div>
          <div className="neo-panel p-6">
            <div className="neo-marquee">
              <div className="neo-marquee-track">
                {Array.from({ length: 6 })
                  .flatMap(() => ACHIEVEMENTS)
                  .map((a, idx) => (
                    <div
                      key={idx}
                      className={`neo-ach min-w-[100px] ${a.unlocked ? '' : 'neo-ach--locked'}`}
                    >
                      <div className="neo-ach-circle">
                        <Icon3D src={a.icon} alt={a.name} size={44} fallback={a.emoji} />
                      </div>
                      <span className="neo-ach-label">{a.name}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </section>
        )}
      </main>

      {picker && <AvatarPicker current={avatar} onClose={() => setPicker(false)} />}
    </>
  )
}

function Stat({ label, value, icon, emoji }: { label: string; value: string; icon?: string; emoji?: string }) {
  return (
    <div className="rounded-xl bg-black/20 p-4 shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-2px_-2px_6px_rgba(255,255,255,0.02)]">
      <p className="text-[11px] uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="mt-1 flex items-center gap-2 text-xl font-bold text-neutral-100">
        {icon && <Icon3D src={icon} alt="" size={20} fallback={emoji} />}
        {value}
      </p>
    </div>
  )
}
