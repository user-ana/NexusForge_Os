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
            <div className="neo-reveal mt-5 space-y-2 text-left">
              <label className="neo-label">Clave de docente</label>
              <input
                value={teacherKey}
                onChange={(e) => {
                  setTeacherKey(e.target.value)
                  setKeyErr('')
                }}
                placeholder="Clave que entrega tu institución"
                autoComplete="off"
                spellCheck={false}
                className="neo-input w-full font-mono"
              />
              {keyErr ? (
                <p className="text-[11px] text-red-400">{keyErr}</p>
              ) : (
                <p className="text-[11px] text-neutral-500">
                  Solo el personal docente la tiene. Sin la clave correcta no podrás continuar como catedrático.
                </p>
              )}
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
