'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import Header from '@/frontend/components/layout/Header'
import { getSession, displayName, SESSION_EVENT, type Role } from '@/frontend/session/session'
import { getClasses, loadClasses, subscribeClasses, createClass, joinByCode, CLASSES_EVENT, type Klass } from '@/backend/services/classes'
import Icon3D from '@/frontend/components/ui/Icon3D'
import { useT } from '@/frontend/hooks/useT'

const EMBLEMS = [
  '/icons/emblem-1.png',
  '/icons/emblem-2.png',
  '/icons/emblem-3.png',
  '/icons/emblem-4.png',
  '/icons/emblem-5.png',
]

// Periodo actual: ej. "2P26 Cuatrimestral" (1P ene-abr, 2P may-ago, 3P sep-dic)
function currentPeriod() {
  const now = new Date()
  const m = now.getMonth() + 1
  const tri = m <= 4 ? 1 : m <= 8 ? 2 : 3
  return `${tri}P${String(now.getFullYear()).slice(2)} Cuatrimestral`
}
// Código auto desde el nombre: "Sistemas Abiertos 2" + "2P26" → "SA2-2026-P2"
function autoCode(name: string, period: string) {
  const initials = name
    .replace(/[^a-zA-Z0-9áéíóúñ ]/gi, '')
    .trim()
    .split(/\s+/)
    .map((w) => (/^\d+$/.test(w) ? w : (w[0] ?? '')))
    .join('')
    .toUpperCase()
  if (!initials) return ''
  const pm = period.match(/(\d)P(\d{2})/i)
  return pm ? `${initials}-20${pm[2]}-P${pm[1]}` : initials
}

export default function ClassesPage() {
  const { t } = useT()
  const [role, setRole] = useState<Role>('student')
  const [me, setMe] = useState('')
  const [all, setAll] = useState<Klass[]>([])
  const [creating, setCreating] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joinMsg, setJoinMsg] = useState('')

  // form crear (curso)
  const [name, setName] = useState('')
  const [section, setSection] = useState('')
  const [period, setPeriod] = useState('')
  const [code, setCode] = useState('')
  const [emblem, setEmblem] = useState(EMBLEMS[0])
  const [codeTouched, setCodeTouched] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)

  // Abre el modal automáticamente si viene ?create=1 (desde el panel)
  useEffect(() => {
    setMounted(true)
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('create') === '1') {
      setPeriod((p) => p || currentPeriod())
      setCreating(true)
      // Limpia el query para que un refresh NO reabra el modal
      window.history.replaceState(null, '', '/dashboard/classes')
    }
  }, [])

  // Nombre → autocompleta código (si no lo editaron a mano)
  function onName(v: string) {
    setName(v)
    const p = period || currentPeriod()
    if (!period) setPeriod(p)
    if (!codeTouched) setCode(autoCode(v, p))
  }
  function openCreate() {
    if (!creating && !period) setPeriod(currentPeriod())
    setCreating((v) => !v)
  }

  const [meName, setMeName] = useState('')

  useEffect(() => {
    const sync = () => {
      const s = getSession()
      setRole(s?.role ?? 'student')
      setMe(s?.id ?? '') // uuid estable (Supabase)
      setMeName(displayName(s))
      setAll(getClasses())
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

  const isTeacher = role === 'teacher'
  // loadClasses ya trae solo las clases del usuario: el profe filtra las suyas; el alumno ve todas (sus inscritas)
  const myClasses = isTeacher ? all.filter((c) => c.teacher === me) : all

  async function submitCreate() {
    if (!name.trim()) return
    await createClass({ name, section, period, code, emblem, teacherName: meName })
    setName('')
    setSection('')
    setPeriod('')
    setCode('')
    setEmblem(EMBLEMS[0])
    setCodeTouched(false)
    setCreating(false)
  }

  async function submitJoin() {
    const k = await joinByCode(joinCode)
    setJoinMsg(k ? `✓ ${k.name}` : '✗')
    setJoinCode('')
  }

  return (
    <>
      <Header
        title={t('head.classes.title')}
        subtitle={t('head.classes.sub')}
        action={
          isTeacher ? (
            <button onClick={openCreate} className="neo-btn">{t('cls.create')}</button>
          ) : role === 'student' ? (
            <a href="#join" className="neo-btn">{t('cls.join_btn')}</a>
          ) : null
        }
      />

      <main className="flex-1 overflow-auto p-8 space-y-6">
        {/* Crear clase (catedrático) — modal flotante */}
        {isTeacher && creating && mounted &&
          createPortal(
            <div className="neo-modal-backdrop" onClick={() => setCreating(false)}>
              <div className="neo-modal neo-modal--lg space-y-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-white">{t('cls.create_title')}</h3>
                  <button onClick={() => setCreating(false)} className="text-neutral-500 hover:text-white">✕</button>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Field label={t('cls.course')}>
                      <input value={name} onChange={(e) => onName(e.target.value)} placeholder={t('cls.course_ph')} className="neo-input w-full" autoFocus />
                    </Field>
                  </div>
                  <Field label={t('cls.section')}>
                    <input value={section} onChange={(e) => setSection(e.target.value)} placeholder={t('cls.section_ph')} className="neo-input w-full" />
                  </Field>
                  <Field label={t('cls.period')}>
                    <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder={t('cls.period_ph')} className="neo-input w-full" />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label={t('cls.code')}>
                      <input value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeTouched(true) }} placeholder={t('cls.code_ph2')} className="neo-input w-full font-mono" />
                    </Field>
                  </div>
                </div>

                {/* Emblema de clase */}
                <div className="space-y-2">
                  <label className="neo-label">{t('cls.emblem')}</label>
                  <div className="flex flex-wrap gap-3">
                    {EMBLEMS.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => setEmblem(em)}
                        className={`neo-emblem-opt ${emblem === em ? 'neo-emblem-opt--active' : ''}`}
                      >
                        <Icon3D src={em} alt="" size={46} fallback="◆" />
                      </button>
                    ))}
                  </div>
                </div>

                <button onClick={submitCreate} className="neo-btn w-full justify-center">{t('cls.create_btn')}</button>
              </div>
            </div>,
            document.body,
          )}

        {/* Lista de clases */}
        {loading && myClasses.length === 0 ? (
          <div className="neo-panel flex items-center justify-center p-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-violet border-t-transparent" />
          </div>
        ) : myClasses.length === 0 ? (
          <div className="neo-panel p-10 text-center text-sm text-neutral-500">
            {isTeacher ? t('cls.no_classes_t') : t('cls.no_classes_s')}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {myClasses.map((cls) => (
              <div key={cls.id} className="neo-panel neo-panel--hover h-full p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {cls.emblem && <Icon3D src={cls.emblem} alt="" size={40} fallback="◆" />}
                    <div>
                      <h3 className="text-base font-semibold leading-snug text-white">
                        {cls.name}
                        {cls.section && <span className="text-neutral-400"> ({cls.section})</span>}
                      </h3>
                      <p className="mt-1 text-xs text-neutral-500">{t('cls.period')}: {cls.period}</p>
                      <p className="mt-0.5 text-xs text-neutral-600">
                        {t('cls.code')}: <span className="font-mono text-accent-violet">{cls.code}</span>
                      </p>
                    </div>
                  </div>
                  <span className="neo-live"><span className="neo-live-dot" />{t('status.active')}</span>
                </div>
                <div className="mt-4 flex items-end justify-between border-t border-white/5 pt-4">
                  <div className="flex gap-6 text-sm">
                    <div>
                      <p className="text-xs text-neutral-600">{t('cls.enrolled')}</p>
                      <p className="text-lg font-bold text-neutral-100">{cls.students.length}</p>
                    </div>
                    {!isTeacher && (
                      <div>
                        <p className="text-xs text-neutral-600">{t('cls.instructor')}</p>
                        <p className="font-medium text-neutral-200">{cls.teacherName ?? cls.teacher}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isTeacher && (
                      <Link href={`/dashboard/classes/${cls.id}`} className="neo-btn-ghost text-sm">
                        {t('cls.projects')}
                      </Link>
                    )}
                    <Link href={`/aula/${cls.id}`} className="neo-btn text-sm">
                      {t('cls.enter')} →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Unirse por código (estudiante) */}
        {role === 'student' && (
          <div id="join" className="neo-panel p-6">
            <h3 className="mb-2 text-lg font-semibold text-white">{t('cls.join_title')}</h3>
            <p className="mb-4 text-sm text-neutral-500">{t('cls.join_sub')}</p>
            <div className="flex items-center gap-2">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitJoin()}
                placeholder={t('cls.code_ph')}
                maxLength={10}
                className="neo-input flex-1"
              />
              <button onClick={submitJoin} className="neo-btn">{t('cls.join_btn')}</button>
              {joinMsg && <span className="text-sm text-neutral-400">{joinMsg}</span>}
            </div>
          </div>
        )}
      </main>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="neo-label">{label}</label>
      {children}
    </div>
  )
}
