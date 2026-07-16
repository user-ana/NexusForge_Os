'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/backend/supabase'
import { bridgeUser } from '@/frontend/session/authBridge'
import { useT } from '@/frontend/hooks/useT'
import { generateTeacherCode, isValidTeacherKey, isInstitutionalEmail } from '@/shared/roles'
import { GradCapIcon, TeacherIcon } from '@/frontend/components/ui/Icons'

export default function OnboardingPage() {
  const router = useRouter()
  const { t } = useT()
  const [ready, setReady] = useState(false)
  const [role, setRole] = useState<'student' | 'teacher' | null>(null)
  const [code, setCode] = useState('')
  const [teacherKey, setTeacherKey] = useState('') // clave institucional (candado docente)
  const [keyErr, setKeyErr] = useState('')
  const [showKey, setShowKey] = useState(false) // mostrar/ocultar la clave
  const [helpOpen, setHelpOpen] = useState(false) // tarjeta "no tengo la clave"
  const [email, setEmail] = useState('') // correo del proveedor (para verificar @uth.hn)
  const [accErr, setAccErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supabase) {
      router.replace('/auth/login')
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace('/auth/login')
      else {
        setEmail(data.session.user.email ?? '')
        setReady(true)
      }
    })
  }, [router])

  function chooseTeacher() {
    setRole('teacher')
    setCode((c) => c || generateTeacherCode())
  }

  // Al elegir Estudiante verificamos el correo de una vez: si no es @uth.hn,
  // cerramos la sesión y volvemos al login (el correo lo fija el proveedor).
  async function chooseStudent() {
    setKeyErr('')
    if (!isInstitutionalEmail(email)) {
      setRole('student')
      setAccErr('Tu correo no es institucional (@uth.hn). Te regresamos al inicio de sesión para entrar con tu correo de la UTH…')
      setBusy(true)
      if (supabase) {
        try {
          await supabase.auth.signOut()
        } catch {
          /* ignore */
        }
      }
      setTimeout(() => router.replace('/auth/login?focus=email'), 1600)
      return
    }
    setAccErr('')
    setRole('student')
  }

  async function confirm() {
    if (!role || busy) return
    // Candado del rol catedrático: exige la clave institucional válida.
    if (role === 'teacher') {
      const ok = await isValidTeacherKey(teacherKey)
      if (!ok) {
        setKeyErr('Clave de docente inválida. Si no eres catedrático, elige Estudiante.')
        return
      }
    }
    // Estudiante por OAuth: el correo @uth.hn ya lo verifica (no pedimos cuenta).
    if (role === 'student' && !isInstitutionalEmail(email)) {
      setAccErr('Tu correo no es institucional (@uth.hn). Te regresamos al inicio de sesión para entrar con tu correo de la UTH…')
      setBusy(true)
      if (supabase) {
        try {
          await supabase.auth.signOut()
        } catch {
          /* ignore */
        }
      }
      setTimeout(() => router.replace('/auth/login?focus=email'), 1600)
      return
    }
    setBusy(true)
    if (supabase) {
      const data: Record<string, unknown> = { role }
      if (role === 'teacher') data.teacher_code = code
      await supabase.auth.updateUser({ data })
      const { data: u } = await supabase.auth.getUser()
      if (u.user) bridgeUser(u.user)
    }
    // Catedrático → directo a su perfil para completar su nombre
    router.replace(role === 'teacher' ? '/dashboard/profile' : '/dashboard')
  }

  if (!ready) {
    return (
      <div className="neo-scene flex min-h-screen items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-accent-violet border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="neo-scene flex min-h-screen items-center justify-center p-6">
      <div className="neo-frame w-full max-w-2xl p-8 md:p-12">
        <div className="neo-stagger mx-auto max-w-md text-center">
          <h1 className="text-2xl font-semibold text-white md:text-3xl">{t('onb.title')}</h1>
          <p className="mt-2 text-sm text-neutral-500">{t('onb.sub')}</p>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <button
              onClick={chooseStudent}
              className={`neo-role ${role === 'student' ? 'neo-role--active' : ''}`}
            >
              <span className="text-accent-violet"><GradCapIcon size={30} /></span>
              <span className="mt-2 font-semibold text-white">{t('onb.student')}</span>
              <span className="mt-1 text-xs text-neutral-500">{t('onb.student_desc')}</span>
            </button>
            <button
              onClick={chooseTeacher}
              className={`neo-role ${role === 'teacher' ? 'neo-role--active' : ''}`}
            >
              <span className="text-accent-violet"><TeacherIcon size={30} /></span>
              <span className="mt-2 font-semibold text-white">{t('onb.teacher')}</span>
              <span className="mt-1 text-xs text-neutral-500">{t('onb.teacher_desc')}</span>
            </button>
          </div>

          {role === 'student' && (
            <div className="neo-reveal mt-5 text-left">
              {accErr ? (
                <p className="rounded-xl bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{accErr}</p>
              ) : (
                <div className="flex items-center gap-3 rounded-xl bg-emerald-500/8 px-4 py-3 shadow-[inset_2px_2px_6px_rgba(0,0,0,0.35)]">
                  <span className="text-emerald-400">✓</span>
                  <p className="text-[12px] text-neutral-300">
                    Verificado con tu correo institucional{' '}
                    <span className="font-medium text-neutral-100">{email}</span>
                  </p>
                </div>
              )}
            </div>
          )}
          {role === 'teacher' && (
            <div className="neo-reveal mt-5 space-y-3 text-left">
              <label className="neo-label">Clave de docente</label>
              {/* Campo oculto: candado a la izquierda, ojo a la derecha */}
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500">
                  <LockMini />
                </span>
                <input
                  type={showKey ? 'text' : 'password'}
                  value={teacherKey}
                  onChange={(e) => {
                    setTeacherKey(e.target.value)
                    setKeyErr('')
                  }}
                  placeholder="Clave que entrega tu institución"
                  autoComplete="off"
                  spellCheck={false}
                  style={{ paddingLeft: '2.75rem', paddingRight: '3rem' }}
                  className="neo-input w-full font-mono tracking-wider"
                />
                <button
                  type="button"
                  aria-label={showKey ? 'Ocultar clave' : 'Mostrar clave'}
                  onClick={() => setShowKey((s) => !s)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 transition hover:text-accent-violet"
                >
                  {showKey ? <EyeIcon /> : <EyeOffIcon />}
                </button>
              </div>
              {keyErr ? (
                <p className="text-[11px] text-red-400">{keyErr}</p>
              ) : (
                <p className="text-[11px] text-neutral-500">
                  Solo el personal docente la tiene. Sin la clave correcta no podrás continuar como catedrático.
                </p>
              )}

              {/* Tarjeta desplegable: no tengo la clave */}
              <button
                type="button"
                onClick={() => setHelpOpen((o) => !o)}
                className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-left transition-all duration-300 hover:border-accent-violet/30 hover:bg-white/[0.05]"
              >
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent-violet/12 text-accent-violet transition-colors duration-300 group-hover:bg-accent-violet/20">
                  <HelpIcon />
                </span>
                <span className="flex-1">
                  <span className="block text-[13px] font-medium text-neutral-100">¿No tienes la clave de docente?</span>
                  <span className="block text-[11px] text-neutral-500">Te decimos cómo obtenerla</span>
                </span>
                <ChevronDownMini className={`text-neutral-500 transition-transform duration-300 ${helpOpen ? 'rotate-180' : ''}`} />
              </button>
              <div className={`grid transition-[grid-template-rows] duration-[350ms] ease-out ${helpOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                  <div className="rounded-xl border-l-2 border-accent-violet bg-accent-violet/[0.06] px-4 py-3 text-[12px] leading-relaxed text-neutral-300">
                    Solicítala al <span className="font-semibold text-neutral-100">administrador de la plataforma</span> o a la{' '}
                    <span className="font-semibold text-neutral-100">coordinación académica</span> de tu institución. Es una clave
                    única para el personal docente; con ella podrás crear clases y gestionar tus grupos. Si eres estudiante,
                    elige <span className="font-semibold text-neutral-100">Soy Estudiante</span>.
                  </div>
                </div>
              </div>
            </div>
          )}

          <button onClick={confirm} disabled={!role || busy} className={`neo-cta mt-7 w-full ${!role ? 'opacity-50' : ''}`}>
            {t('onb.continue')}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------- Iconos ---------- */

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function LockMini() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function HelpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7" />
      <path d="M12 17h.01" />
    </svg>
  )
}

function ChevronDownMini({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}
