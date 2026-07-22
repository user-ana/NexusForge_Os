'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import NexusScene from '@/frontend/components/ui/NexusScene'
import { setSession } from '@/frontend/session/session'
import { supabase, isSupabaseReady } from '@/backend/supabase'
import { bridgeUser } from '@/frontend/session/authBridge'
import { generateTeacherCode, isInstitutionalEmail, isValidAccount } from '@/shared/roles'
import { verifyTeacherKey } from '@/frontend/session/teacherKey'
import { loginAllowed, loginFailed, loginSucceeded } from '@/frontend/session/loginGuard'
import ThemeToggle from '@/frontend/components/ui/ThemeToggle'
import { useT } from '@/frontend/hooks/useT'
import { GradCapIcon, TeacherIcon } from '@/frontend/components/ui/Icons'

type Mode = 'signin' | 'signup'
type Role = 'student' | 'teacher'
type ToastType = 'success' | 'warning'
type Toast = { id: number; type: ToastType; message: string; leaving?: boolean }

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

export default function AuthCard({ initialMode = 'signin' }: { initialMode?: Mode }) {
  const router = useRouter()
  const { t, lang, setLang } = useT()
  const [mode, setMode] = useState<Mode>(initialMode)
  const [showPassword, setShowPassword] = useState(false)
  const [showTeacherKey, setShowTeacherKey] = useState(false) // mostrar/ocultar clave docente
  const [teacherHelpOpen, setTeacherHelpOpen] = useState(false) // tarjeta "no tengo la clave"

  const [identifier, setIdentifier] = useState('') // email o username (sign in)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [role, setRole] = useState<Role>('student')
  const [teacherCode, setTeacherCode] = useState('')
  const [teacherKey, setTeacherKey] = useState('') // clave institucional (candado del rol docente)
  const [account, setAccount] = useState('') // número de cuenta (estudiante UTH)

  // Refs para auto-foco y limpiar/enfocar el campo equivocado
  const identifierRef = useRef<HTMLInputElement>(null)
  const usernameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)
  const teacherKeyRef = useRef<HTMLInputElement>(null)
  const accountRef = useRef<HTMLInputElement>(null)

  const isSignup = mode === 'signup'
  const strength = useMemo(() => getStrength(password), [password])
  // Requisitos en vivo de la contraseña
  const reqs = useMemo(
    () => [
      { label: '8+ car.', ok: password.length >= 8 },
      { label: 'Mayús.', ok: /[A-Z]/.test(password) },
      { label: 'Minús.', ok: /[a-z]/.test(password) },
      { label: 'Número', ok: /\d/.test(password) },
      { label: 'Signo', ok: /[^A-Za-z0-9]/.test(password) },
    ],
    [password],
  )
  // Se "acepta" solo cuando cumple todos los requisitos
  const accepted = reqs.every((r) => r.ok)
  const confirmState: 'idle' | 'ok' | 'bad' =
    confirm.length === 0 ? 'idle' : confirm === password ? 'ok' : 'bad'

  // ----- Notificaciones (toasts) -----
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)
  function dismiss(id: number) {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)))
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 400)
  }
  // ----- Aviso de error DENTRO de la tarjeta -----
  // Los errores del formulario se muestran junto al botón, que es donde la
  // persona está mirando al momento de fallar. En la esquina de la pantalla
  // pasaban desapercibidos. Los mensajes de éxito sí siguen como toast, porque
  // ahí la persona ya logró lo que quería y solo necesita confirmación.
  const [formError, setFormError] = useState<string | null>(null)
  // Contador: cambia con cada error aunque el texto se repita, para que la
  // animación vuelva a correr y se note que hubo un intento nuevo.
  const [errorSeq, setErrorSeq] = useState(0)

  // ----- Bloqueo por intentos fallidos (anti fuerza bruta) -----
  // Se muestra un contador que baja solo y una barra que se vacía, para que la
  // persona vea cuánto falta sin tener que reintentar a ciegas.
  const [lock, setLock] = useState<{ until: number; total: number } | null>(null)
  const [, forceTick] = useState(0)
  useEffect(() => {
    if (!lock) return
    const id = setInterval(() => {
      if (Date.now() >= lock.until) {
        setLock(null)
        setFormError(null)
      } else {
        forceTick((n) => n + 1) // solo repinta el número; la barra la anima el CSS
      }
    }, 200)
    return () => clearInterval(id)
  }, [lock])

  const lockLeft = lock ? Math.max(0, lock.until - Date.now()) : 0
  const locked = lockLeft > 0
  const lockSecs = Math.ceil(lockLeft / 1000)

  function blockFor(seconds: number) {
    setLock({ until: Date.now() + seconds * 1000, total: seconds * 1000 })
  }

  // Si recarga la página durante un bloqueo, el contador sigue donde iba:
  // los intentos se guardan localmente, así que no se gana nada recargando.
  useEffect(() => {
    const g = loginAllowed()
    if (!g.ok) blockFor(g.retryAfter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function notify(type: ToastType, message: string) {
    if (type === 'warning') {
      setErrorSeq((n) => n + 1)
      setFormError(message)
      return
    }
    const id = ++toastId.current
    setToasts((t) => {
      // evita duplicar un mensaje que ya está activo
      if (t.some((x) => !x.leaving && x.message === message)) return t
      // agrupa: máximo 4 visibles
      return [...t, { id, type, message }].slice(-4)
    })
    setTimeout(() => dismiss(id), 3800)
  }

  // El aviso se borra cuando la persona corrige algo, para no dejar un mensaje
  // viejo colgado. Ojo: al fallar, el propio formulario vacía campos (ej. la
  // contraseña), y eso NO debe contar como corrección — si contara, el aviso se
  // borraría en el mismo instante en que aparece y nunca se vería. Por eso
  // guardamos una "foto" de los campos en el momento del error y solo lo
  // borramos cuando de verdad se apartan de esa foto.
  const fields = [identifier, email, username, password, confirm, account, teacherKey, role].join('|')
  const snapshot = useRef(fields)
  const lastSeq = useRef(0)
  useEffect(() => {
    if (lastSeq.current !== errorSeq) {
      lastSeq.current = errorSeq
      snapshot.current = fields // error recién mostrado: esta es la foto
      return
    }
    if (formError && fields !== snapshot.current) setFormError(null)
  }, [fields, errorSeq, formError])

  // El aviso no se queda para siempre: si la persona no toca nada, se va solo.
  // (Así "Inicia sesión con tu correo" no parece un error permanente.)
  useEffect(() => {
    if (!formError) return
    const id = setTimeout(() => setFormError(null), 6000)
    return () => clearTimeout(id)
  }, [formError, errorSeq])

  function toggle() {
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
    setShowPassword(false)
    setFormError(null)
  }

  // Auto-foco en el primer campo al cargar y al cambiar de modo
  useEffect(() => {
    const el = isSignup ? usernameRef.current : identifierRef.current
    el?.focus()
  }, [isSignup])

  // Éxito (modo demo): guarda sesión local, notifica y entra al dashboard
  function enter(message: string, session: Parameters<typeof setSession>[0]) {
    setSession(session)
    notify('success', message)
    setTimeout(() => router.push('/dashboard'), 1000)
  }

  // ----- Validación + envío (limpia y enfoca el campo equivocado) -----
  async function handleSubmit() {
    if (isSignup) {
      if (username.trim().length < 3) {
        usernameRef.current?.focus()
        return notify('warning', 'El username debe tener al menos 3 caracteres.')
      }
      if (!isEmail(email)) {
        setEmail('')
        emailRef.current?.focus()
        return notify('warning', 'Ingresa un email válido.')
      }
      // ---- Verificación de estudiante: correo institucional + número de cuenta ----
      if (role === 'student') {
        if (!isInstitutionalEmail(email)) {
          emailRef.current?.focus()
          return notify('warning', 'Usa tu correo institucional @uth.hn para registrarte como estudiante.')
        }
        if (!isValidAccount(account)) {
          accountRef.current?.focus()
          return notify('warning', 'Ingresa un número de cuenta válido (solo dígitos).')
        }
      }
      if (!accepted) {
        passwordRef.current?.focus()
        return notify('warning', 'La contraseña no cumple los requisitos.')
      }
      if (confirm !== password) {
        setConfirm('')
        confirmRef.current?.focus()
        return notify('warning', 'Las contraseñas no coinciden.')
      }
      // Candado del rol catedrático: solo comprobamos que escribió algo.
      // La clave se VERIFICA EN EL SERVIDOR después de crear la cuenta.
      if (role === 'teacher' && !teacherKey.trim()) {
        teacherKeyRef.current?.focus()
        return notify('warning', 'Ingresa la clave de docente.')
      }
      // ---- Supabase ----
      if (isSupabaseReady && supabase) {
        // SEGURIDAD: nunca pedimos el rol 'teacher' desde el cliente. La cuenta
        // nace como estudiante y solo el servidor la promueve tras validar la clave.
        const meta: Record<string, unknown> = { username: username.trim(), role: 'student' }
        if (role === 'teacher') meta.teacher_code = teacherCode
        if (role === 'student') meta.account_number = account.trim()
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: meta },
        })
        if (error) return notify('warning', error.message)
        if (data.session && data.user) {
          // Si pidió ser catedrático, el servidor valida la clave y otorga el rol.
          if (role === 'teacher') {
            const vk = await verifyTeacherKey(teacherKey)
            if (!vk.ok) {
              setTeacherKey('')
              teacherKeyRef.current?.focus()
              notify('warning', `${vk.error ?? 'Clave inválida.'} Tu cuenta quedó como estudiante.`)
            }
          }
          const { data: fresh } = await supabase.auth.getUser()
          if (fresh.user) bridgeUser(fresh.user)
          notify('success', `¡Cuenta creada! Bienvenido, ${username.trim()}.`)
          return void setTimeout(() => router.push('/dashboard'), 900)
        }
        // Sin sesión = Supabase pide confirmar el correo. Lo llevamos al
        // inicio de sesión con su correo ya puesto (en vez de dejarlo colgado).
        notify('success', 'Cuenta creada. Confirma tu correo y luego inicia sesión.')
        setIdentifier(email.trim())
        setPassword('')
        setConfirm('')
        setMode('signin')
        return
      }
      // ---- Demo ----
      enter(`¡Cuenta creada! Bienvenido, ${username.trim()}.`, {
        user: username.trim(),
        role,
        provider: 'password',
        teacherCode: role === 'teacher' ? teacherCode : undefined,
        account: role === 'student' ? account.trim() : undefined,
      })
    } else {
      if (!identifier.trim()) {
        setPassword('')
        identifierRef.current?.focus()
        return notify('warning', 'Ingresa tu email o username.')
      }
      if (identifier.includes('@') && !isEmail(identifier)) {
        setIdentifier('')
        setPassword('')
        identifierRef.current?.focus()
        return notify('warning', 'El email no tiene un formato válido.')
      }
      if (!password) {
        setIdentifier('')
        identifierRef.current?.focus()
        return notify('warning', 'Ingresa tu contraseña.')
      }
      // ANTI FUERZA BRUTA: si acumuló fallos, hay que esperar antes de reintentar.
      const gate = loginAllowed()
      if (!gate.ok) {
        setPassword('')
        blockFor(gate.retryAfter)
        return notify('warning', 'Demasiados intentos fallidos')
      }
      // ---- Supabase (requiere email) ----
      if (isSupabaseReady && supabase) {
        if (!isEmail(identifier)) return notify('warning', 'Inicia sesión con tu correo.')
        const { data, error } = await supabase.auth.signInWithPassword({ email: identifier.trim(), password })
        if (error) {
          const f = loginFailed()
          setPassword('')
          passwordRef.current?.focus()
          if (f.retryAfter > 0) blockFor(f.retryAfter)
          // Mensaje genérico a propósito: no revelamos si el correo existe o no.
          return notify('warning', 'Correo o contraseña incorrectos')
        }
        if (data.user) {
          loginSucceeded()
          bridgeUser(data.user)
          notify('success', `¡Sesión iniciada! Hola, ${identifier.trim()}.`)
          return void setTimeout(() => router.push('/dashboard'), 800)
        }
        return
      }
      // ---- Demo ----
      enter(`¡Sesión iniciada! Hola, ${identifier.trim()}.`, { user: identifier.trim(), provider: 'password' })
    }
  }

  // ----- Recuperar contraseña (ENLACE SEGURO al correo) -----
  const [resetOpen, setResetOpen] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetBusy, setResetBusy] = useState(false)
  const [resetMsg, setResetMsg] = useState<{ type: 'ok' | 'bad'; text: string } | null>(null)
  const [portalReady, setPortalReady] = useState(false)
  useEffect(() => setPortalReady(true), [])

  function forgotPassword() {
    setResetEmail(isEmail(identifier) ? identifier.trim() : '')
    setResetMsg(null)
    setResetOpen(true)
  }

  /**
   * SEGURIDAD: envía un ENLACE de recuperación al correo. Solo quien controla ese
   * correo puede cambiar la contraseña. (Antes, cualquiera que supiera el correo
   * podía cambiarla directamente: eso permitía robar cuentas.)
   */
  async function doReset() {
    if (!isEmail(resetEmail)) return setResetMsg({ type: 'bad', text: 'Ingresa un correo válido.' })
    if (!isSupabaseReady || !supabase) return setResetMsg({ type: 'bad', text: 'No disponible en este momento.' })
    setResetBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/auth/callback`,
    })
    setResetBusy(false)
    if (error) return setResetMsg({ type: 'bad', text: error.message })
    // Respuesta neutra: no revelamos si el correo existe (evita enumerar usuarios)
    setResetMsg({
      type: 'ok',
      text: 'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña. Revisa tu bandeja.',
    })
  }

  // OAuth (Microsoft / GitHub) vía Supabase, o demo si no está configurado
  async function social(provider: 'azure' | 'google' | 'github') {
    if (isSupabaseReady && supabase) {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: provider === 'azure' ? 'email openid profile' : undefined,
          // Microsoft/Google: deja elegir cuenta en vez de entrar con la última.
          queryParams: provider === 'github' ? undefined : { prompt: 'select_account' },
        },
      })
      if (error) notify('warning', error.message)
      return
    }
    const label = provider === 'azure' ? 'Microsoft' : provider === 'google' ? 'Google' : 'GitHub'
    enter(`Conectando con ${label}…`, { user: `${provider} user`, provider })
  }

  return (
    <div className="neo-scene min-h-screen w-full flex items-center justify-center p-6">
      {/* Notificaciones */}
      <div className="neo-toast-wrap">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => dismiss(t.id)}
            className={`neo-toast neo-toast--${t.type} ${t.leaving ? 'neo-toast--leaving' : ''}`}
          >
            <span className="neo-toast-icon">
              {t.type === 'success' ? <CheckIcon /> : <WarnIcon />}
            </span>
            <span className="neo-toast-msg">{t.message}</span>
          </div>
        ))}
      </div>

      {/* Panel flotante: restablecer contraseña (sin correo) */}
      {resetOpen && portalReady &&
        createPortal(
          <div className="neo-modal-backdrop" onClick={() => setResetOpen(false)}>
            <div className="neo-modal space-y-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-white">Restablecer contraseña</h3>
                <button onClick={() => setResetOpen(false)} className="text-neutral-500 hover:text-white">✕</button>
              </div>
              <p className="-mt-1 text-xs text-neutral-500">
                Escribe tu correo y te enviaremos un enlace seguro para crear una contraseña nueva.
              </p>

              <div className="space-y-2">
                <label className="neo-label">Correo</label>
                <input
                  value={resetEmail}
                  onChange={(e) => { setResetEmail(e.target.value); setResetMsg(null) }}
                  onKeyDown={(e) => e.key === 'Enter' && doReset()}
                  placeholder="tucorreo@ejemplo.com"
                  autoFocus
                  className="neo-input w-full"
                />
              </div>

              {resetMsg && (
                <p className={`text-xs ${resetMsg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{resetMsg.text}</p>
              )}

              <button onClick={doReset} disabled={resetBusy} className="neo-btn w-full justify-center">
                {resetBusy ? 'Enviando…' : 'Enviar enlace de recuperación'}
              </button>
            </div>
          </div>,
          document.body,
        )}


      <div className="neo-frame w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 overflow-hidden">
        {/* ---------- Panel izquierdo: formulario ---------- */}
        <div className="neo-auth-left relative px-8 py-7 md:px-12 md:py-8 flex flex-col min-h-[520px]">
          {/* Controles de ventana + tema + selector de idioma
              (pegados al formulario: sin tanto aire arriba) */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="neo-dot" />
              <span className="neo-dot" />
              <span className="neo-dot neo-dot--bright" />
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <div className="flex gap-1 rounded-lg border border-white/8 bg-white/[0.03] p-0.5 text-[11px] font-semibold">
                <button type="button" onClick={() => setLang('es')} className={`rounded-md px-2.5 py-1 transition ${lang === 'es' ? 'bg-accent-violet text-white' : 'text-neutral-500 hover:text-neutral-300'}`}>ES</button>
                <button type="button" onClick={() => setLang('en')} className={`rounded-md px-2.5 py-1 transition ${lang === 'en' ? 'bg-accent-violet text-white' : 'text-neutral-500 hover:text-neutral-300'}`}>EN</button>
              </div>
            </div>
          </div>

          {/* key={mode} → reinicia la animación de entrada al alternar */}
          <div key={mode} className="neo-stagger flex-1 flex flex-col justify-center max-w-sm w-full mx-auto">
            <div className="mb-6">
              <h1 className="text-3xl md:text-4xl font-semibold text-white tracking-tight">
                {isSignup ? t('auth.signup_title') : t('auth.signin_title')}
              </h1>
              <p className="text-neutral-500 text-sm mt-2">
                {isSignup ? t('auth.signup_sub') : t('auth.signin_sub')}
              </p>
            </div>

            {/* Rol (registro) — tarjetas arriba: una para estudiante, otra para catedratico */}
            {isSignup && (
              <div className="mb-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole('student')}
                  className={`neo-rolecard ${role === 'student' ? 'neo-rolecard--active' : ''}`}
                >
                  <span className="neo-rolecard-ic"><GradCapIcon size={20} /></span>
                  <span className="neo-rolecard-t">{t('auth.student')}</span>
                  <span className="neo-rolecard-d">{t('auth.student_desc')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setRole('teacher'); setTeacherCode((c) => c || generateTeacherCode()) }}
                  className={`neo-rolecard ${role === 'teacher' ? 'neo-rolecard--active' : ''}`}
                >
                  <span className="neo-rolecard-ic"><TeacherIcon size={20} /></span>
                  <span className="neo-rolecard-t">{t('auth.teacher')}</span>
                  <span className="neo-rolecard-d">{t('auth.teacher_desc')}</span>
                </button>
              </div>
            )}

            {/* Registro: usuario + correo lado a lado. Login: un solo campo. */}
            {isSignup ? (
              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={t('auth.username')}>
                  <input
                    ref={usernameRef}
                    id="username"
                    name="nf-username"
                    type="text"
                    placeholder="comandante_nova"
                    autoComplete="off"
                    spellCheck={false}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="neo-input w-full"
                  />
                </Field>
                <div className="space-y-2">
                  <label htmlFor="email" className="neo-label">{t('auth.email')}</label>
                  <input
                    ref={emailRef}
                    id="email"
                    name="nf-email"
                    type="email"
                    placeholder="tucuenta@uth.hn"
                    autoComplete="off"
                    spellCheck={false}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="neo-input w-full"
                  />
                  {role === 'student' && email.length > 0 && (
                    isInstitutionalEmail(email) ? (
                      <span className="neo-hint neo-hint--ok"><CheckIcon /> {t('auth.email_ok')}</span>
                    ) : (
                      <span className="neo-hint neo-hint--medium">{t('auth.email_bad')}</span>
                    )
                  )}
                </div>
              </div>
            ) : (
              <Field label={t('auth.identifier')} className="mb-5">
                <input
                  ref={identifierRef}
                  id="identifier"
                  name="nf-identifier"
                  type="text"
                  placeholder="operador@nexusforge.io"
                  autoComplete="off"
                  spellCheck={false}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="neo-input w-full"
                />
              </Field>
            )}

            {/* Contraseña: registro = contraseña + confirmar lado a lado; login = solo contraseña */}
            {isSignup ? (
              <>
                <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {/* Contraseña */}
                  <div className="space-y-2">
                    <div className="flex min-h-[22px] items-center justify-between">
                      <label htmlFor="password" className="neo-label">{t('auth.password')}</label>
                      {strength.label && (
                        <span className={`neo-hint neo-hint--${strength.tone}`}>{strength.label}</span>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        ref={passwordRef}
                        id="password"
                        name="nf-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••••"
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="neo-input w-full pr-11"
                      />
                      <button
                        type="button"
                        aria-label="Mostrar u ocultar contraseña"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-500 transition hover:text-accent-violet"
                      >
                        {showPassword ? <EyeIcon /> : <EyeOffIcon />}
                      </button>
                    </div>
                  </div>
                  {/* Confirmar contraseña — se activa cuando la contraseña ya es valida */}
                  <div className="space-y-2">
                    <div className="flex min-h-[22px] items-center justify-between">
                      <label htmlFor="confirm" className={`neo-label ${!accepted ? 'opacity-50' : ''}`}>{t('auth.confirm')}</label>
                      {accepted && confirmState === 'ok' && (
                        <span className="neo-hint neo-hint--ok"><CheckIcon /> {t('auth.match')}</span>
                      )}
                      {accepted && confirmState === 'bad' && (
                        <span className="neo-hint neo-hint--bad">{t('auth.nomatch')}</span>
                      )}
                    </div>
                    <input
                      ref={confirmRef}
                      id="confirm"
                      name="nf-confirm"
                      type={showPassword ? 'text' : 'password'}
                      placeholder={accepted ? '••••••••••' : t('auth.confirm_wait')}
                      autoComplete="new-password"
                      disabled={!accepted}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className={`neo-input w-full transition-opacity duration-300 ${!accepted ? 'cursor-not-allowed opacity-45' : ''}`}
                    />
                  </div>
                </div>
                {/* Requisitos en vivo (ancho completo) */}
                {password.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-1.5 pt-1">
                    {reqs.map((r) => (
                      <span key={r.label} className={`neo-req ${r.ok ? 'neo-req--ok' : ''}`}>
                        {r.ok ? <CheckIcon /> : <span className="neo-req-dot" />}
                        {r.label}
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="neo-label">{t('auth.password')}</label>
                  <button type="button" onClick={forgotPassword} className="neo-label neo-label--link">
                    {t('auth.forgot')}
                  </button>
                </div>
                <div className="relative">
                  <input
                    ref={passwordRef}
                    id="password"
                    name="nf-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••••"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="neo-input w-full pr-12"
                  />
                  <button
                    type="button"
                    aria-label="Mostrar u ocultar contraseña"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 transition hover:text-accent-violet"
                  >
                    {showPassword ? <EyeIcon /> : <EyeOffIcon />}
                  </button>
                </div>
              </div>
            )}

            {/* Campo especifico del rol elegido arriba: cuenta del estudiante o clave del docente */}
            {isSignup && (
              <div className="mb-4">
                {role === 'student' && (
                  <div className="neo-reveal space-y-1.5 pt-1">
                    <label htmlFor="account" className="neo-label">{t('auth.account')}</label>
                    <input
                      id="account"
                      ref={accountRef}
                      name="nf-account"
                      inputMode="numeric"
                      value={account}
                      onChange={(e) => setAccount(e.target.value.replace(/\D/g, ''))}
                      placeholder="Ej. 202120030068"
                      autoComplete="off"
                      spellCheck={false}
                      className="neo-input w-full font-mono tracking-wide"
                    />
                    <p className="text-[10px] leading-relaxed text-neutral-500">{t('auth.account_hint')}</p>
                  </div>
                )}
                {role === 'teacher' && (
                  <div className="neo-reveal space-y-2 pt-1">
                    <label htmlFor="tkey" className="neo-label">{t('auth.tkey')}</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500">
                        <LockMini />
                      </span>
                      <input
                        id="tkey"
                        ref={teacherKeyRef}
                        name="nf-tkey"
                        type={showTeacherKey ? 'text' : 'password'}
                        value={teacherKey}
                        onChange={(e) => setTeacherKey(e.target.value)}
                        placeholder={t('auth.tkey_ph')}
                        autoComplete="off"
                        spellCheck={false}
                        style={{ paddingLeft: '2.75rem', paddingRight: '3rem' }}
                        className="neo-input w-full font-mono tracking-wider"
                      />
                      <button
                        type="button"
                        aria-label={showTeacherKey ? 'Ocultar clave' : 'Mostrar clave'}
                        onClick={() => setShowTeacherKey((s) => !s)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 transition hover:text-accent-violet"
                      >
                        {showTeacherKey ? <EyeIcon /> : <EyeOffIcon />}
                      </button>
                    </div>
                    <p className="text-[10px] leading-relaxed text-neutral-500">{t('auth.tkey_hint')}</p>

                    {/* Tarjeta desplegable: no tengo la clave */}
                    <button
                      type="button"
                      onClick={() => setTeacherHelpOpen((o) => !o)}
                      className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-2.5 text-left transition-all duration-300 hover:border-accent-violet/30 hover:bg-white/[0.05]"
                    >
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-violet/12 text-accent-violet transition-colors duration-300 group-hover:bg-accent-violet/20">
                        <HelpMini />
                      </span>
                      <span className="flex-1 text-[12px] font-medium text-neutral-100">{t('auth.tkey_help')}</span>
                      <ChevronMini className={`text-neutral-500 transition-transform duration-300 ${teacherHelpOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <div className={`grid transition-[grid-template-rows] duration-[350ms] ease-out ${teacherHelpOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                      <div className="overflow-hidden">
                        <div className="rounded-xl border-l-2 border-accent-violet bg-accent-violet/[0.06] px-3.5 py-2.5 text-[11px] leading-relaxed text-neutral-300">
                          {t('auth.tkey_help_body')}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Aviso de error: sin caja, solo el texto, con una línea que se traza */}
            {formError && (
              <div key={errorSeq} className="neo-alert" role="alert" aria-live="assertive">
                <span className="neo-alert-row">
                  <span className="neo-alert-icon">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M12 8v5" />
                      <circle cx="12" cy="16.6" r="0.6" fill="currentColor" stroke="none" />
                      <path d="M10.3 3.9 2.6 17.4a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="neo-alert-text">{formError}</span>
                </span>
                <span className="neo-alert-line" />
              </div>
            )}

            {/* Botón principal. Durante el bloqueo se vuelve el propio contador:
                se vacía una barra y el número baja hasta desbloquear. */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={locked}
              className={`neo-cta w-full ${locked ? 'neo-cta--locked' : ''}`}
            >
              {locked && lock && (
                <span
                  key={lock.until}
                  className="neo-cta-drain"
                  style={{ animationDuration: `${lock.total}ms` }}
                />
              )}
              <span className="neo-cta-label">
                {locked ? (
                  <>
                    <LockMini />
                    Espera
                    <span className="neo-cta-secs">
                      <b key={lockSecs}>{lockSecs}</b>
                    </span>
                    s
                  </>
                ) : isSignup ? (
                  t('auth.create_btn')
                ) : (
                  t('auth.signin_btn')
                )}
              </span>
            </button>

            {/* Alternar modo (sin recargar) */}
            <div className="text-center text-xs text-neutral-500 mt-5">
              {isSignup ? t('auth.have_account') : t('auth.no_account')}
              <button type="button" onClick={toggle} className="neo-toggle">
                {isSignup ? t('auth.to_signin') : t('auth.to_signup')}
              </button>
            </div>
          </div>
        </div>

        {/* ---------- Panel derecho: red NexusForge + sociales ---------- */}
        <NexusScene tagline={t('auth.tagline')}>
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-neutral-400">
              <span className="h-px flex-1 bg-white/10" />
              {isSignup ? t('auth.or_signup') : t('auth.or_signin')}
              <span className="h-px flex-1 bg-white/10" />
            </div>
            <button type="button" onClick={() => social('azure')} className="neo-social">
              <MicrosoftIcon /> Microsoft
            </button>
            <button type="button" onClick={() => social('google')} className="neo-social">
              <GoogleIcon /> Google
            </button>
            <button type="button" onClick={() => social('github')} className="neo-social">
              <GitHubIcon /> GitHub
            </button>
          </div>
        </NexusScene>
      </div>
    </div>
  )
}

/* ---------- Helpers ---------- */

function Field({
  label,
  className = '',
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      <span className="neo-label">{label}</span>
      {children}
    </div>
  )
}

function getStrength(pw: string): { score: number; label: string; tone: string; color: string } {
  if (pw.length === 0) return { score: 0, label: '', tone: '', color: 'transparent' }
  let s = 0
  if (pw.length >= 8) s++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++
  if (/[0-9]/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  if (s <= 1) return { score: 1, label: 'Débil', tone: 'weak', color: '#f87171' }
  if (s === 2) return { score: 2, label: 'Media', tone: 'medium', color: '#fbbf24' }
  if (s === 3) return { score: 3, label: 'Buena', tone: 'medium', color: '#fbbf24' }
  return { score: 4, label: 'Fuerte', tone: 'strong', color: '#3fc3e8' }
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

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function WarnIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
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

function HelpMini() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7" />
      <path d="M12 17h.01" />
    </svg>
  )
}

function ChevronMini({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.4-1.6 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.9 1.5l2.7-2.6C16.8 2.9 14.6 2 12 2 6.9 2 2.8 6.1 2.8 11.2S6.9 20.4 12 20.4c5.9 0 9.8-4.1 9.8-9.9 0-.7-.1-1.2-.2-1.7H12z" />
    </svg>
  )
}

function MicrosoftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden="true">
      <path fill="#F25022" d="M1 1h10v10H1z" />
      <path fill="#7FBA00" d="M12 1h10v10H12z" />
      <path fill="#00A4EF" d="M1 12h10v10H1z" />
      <path fill="#FFB900" d="M12 12h10v10H12z" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.55-1.14-4.55-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05A9.36 9.36 0 0 1 12 6.84c.85 0 1.71.12 2.51.34 1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.6.69.49A10.26 10.26 0 0 0 22 12.25C22 6.58 17.52 2 12 2z" />
    </svg>
  )
}
