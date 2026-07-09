'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import NexusScene from '@/frontend/components/ui/NexusScene'
import { setSession } from '@/frontend/session/session'
import { supabase, isSupabaseReady } from '@/backend/supabase'
import { bridgeUser } from '@/frontend/session/authBridge'
import { generateTeacherCode, isValidTeacherKey, isInstitutionalEmail, isValidAccount } from '@/shared/roles'

type Mode = 'signin' | 'signup'
type Role = 'student' | 'teacher'
type ToastType = 'success' | 'warning'
type Toast = { id: number; type: ToastType; message: string; leaving?: boolean }

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

export default function AuthCard({ initialMode = 'signin' }: { initialMode?: Mode }) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>(initialMode)
  const [showPassword, setShowPassword] = useState(false)

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
      { label: '8+ caracteres', ok: password.length >= 8 },
      { label: 'Mayúscula', ok: /[A-Z]/.test(password) },
      { label: 'Minúscula', ok: /[a-z]/.test(password) },
      { label: 'Número', ok: /\d/.test(password) },
      { label: 'Signo especial', ok: /[^A-Za-z0-9]/.test(password) },
    ],
    [password],
  )
  // Se "acepta" solo cuando cumple todos los requisitos
  const accepted = reqs.every((r) => r.ok)
  const showConfirm = isSignup && accepted
  const confirmState: 'idle' | 'ok' | 'bad' =
    confirm.length === 0 ? 'idle' : confirm === password ? 'ok' : 'bad'

  // ----- Notificaciones (toasts) -----
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)
  function dismiss(id: number) {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)))
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 400)
  }
  function notify(type: ToastType, message: string) {
    const id = ++toastId.current
    setToasts((t) => {
      // evita duplicar un mensaje que ya está activo
      if (t.some((x) => !x.leaving && x.message === message)) return t
      // agrupa: máximo 4 visibles
      return [...t, { id, type, message }].slice(-4)
    })
    setTimeout(() => dismiss(id), 3800)
  }

  function toggle() {
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
    setShowPassword(false)
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
      // ---- Candado del rol catedrático: clave institucional ----
      if (role === 'teacher') {
        const ok = await isValidTeacherKey(teacherKey)
        if (!ok) {
          setTeacherKey('')
          teacherKeyRef.current?.focus()
          return notify('warning', 'Clave de docente inválida. Si no eres catedrático, regístrate como estudiante.')
        }
      }
      // ---- Supabase ----
      if (isSupabaseReady && supabase) {
        const meta: Record<string, unknown> = { username: username.trim(), role }
        if (role === 'teacher') meta.teacher_code = teacherCode
        if (role === 'student') meta.account_number = account.trim()
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: meta },
        })
        if (error) return notify('warning', error.message)
        if (data.session && data.user) {
          bridgeUser(data.user)
          notify('success', `¡Cuenta creada! Bienvenido, ${username.trim()}.`)
          return void setTimeout(() => router.push('/dashboard'), 800)
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
      // ---- Supabase (requiere email) ----
      if (isSupabaseReady && supabase) {
        if (!isEmail(identifier)) return notify('warning', 'Inicia sesión con tu correo.')
        const { data, error } = await supabase.auth.signInWithPassword({ email: identifier.trim(), password })
        if (error) {
          setPassword('')
          passwordRef.current?.focus()
          return notify('warning', error.message)
        }
        if (data.user) {
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

  // ----- Restablecer contraseña (panel flotante, sin correo) -----
  const [resetOpen, setResetOpen] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetPw, setResetPw] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')
  const [resetBusy, setResetBusy] = useState(false)
  const [resetMsg, setResetMsg] = useState<{ type: 'ok' | 'bad'; text: string } | null>(null)
  const [portalReady, setPortalReady] = useState(false)
  useEffect(() => setPortalReady(true), [])
  const resetOk = resetPw.length >= 8 && /[A-Z]/.test(resetPw) && /[a-z]/.test(resetPw) && /\d/.test(resetPw)

  function forgotPassword() {
    setResetEmail(isEmail(identifier) ? identifier.trim() : '')
    setResetPw('')
    setResetConfirm('')
    setResetMsg(null)
    setResetOpen(true)
  }

  async function doReset() {
    if (!isEmail(resetEmail)) return setResetMsg({ type: 'bad', text: 'Ingresa un correo válido.' })
    if (!resetOk) return setResetMsg({ type: 'bad', text: 'Mínimo 8 caracteres, con mayúscula, minúscula y número.' })
    if (resetPw !== resetConfirm) return setResetMsg({ type: 'bad', text: 'Las contraseñas no coinciden.' })
    setResetBusy(true)
    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail.trim(), password: resetPw }),
      })
      const json = await res.json()
      if (!res.ok) {
        setResetBusy(false)
        return setResetMsg({ type: 'bad', text: json.error ?? 'No se pudo cambiar la contraseña.' })
      }
    } catch {
      setResetBusy(false)
      return setResetMsg({ type: 'bad', text: 'Error de conexión.' })
    }
    // Cambiada: inicia sesión automáticamente con la nueva contraseña
    if (isSupabaseReady && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: resetEmail.trim(),
        password: resetPw,
      })
      setResetBusy(false)
      setResetOpen(false)
      if (error || !data.user) {
        return notify('success', 'Contraseña cambiada. Ya puedes iniciar sesión.')
      }
      bridgeUser(data.user)
      notify('success', '¡Contraseña cambiada! Entrando…')
      setTimeout(() => router.push('/dashboard'), 800)
      return
    }
    setResetBusy(false)
    setResetOpen(false)
    notify('success', 'Contraseña cambiada.')
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
                Escribe tu correo y tu nueva contraseña. Entrarás de una.
              </p>

              <div className="space-y-2">
                <label className="neo-label">Correo</label>
                <input
                  value={resetEmail}
                  onChange={(e) => { setResetEmail(e.target.value); setResetMsg(null) }}
                  placeholder="tucorreo@ejemplo.com"
                  autoFocus
                  className="neo-input w-full"
                />
              </div>
              <div className="space-y-2">
                <label className="neo-label">Nueva contraseña</label>
                <input
                  type="password"
                  value={resetPw}
                  onChange={(e) => { setResetPw(e.target.value); setResetMsg(null) }}
                  placeholder="••••••••••"
                  autoComplete="new-password"
                  className="neo-input w-full"
                />
                {resetPw.length > 0 && !resetOk && (
                  <p className="text-[11px] text-neutral-500">Mínimo 8 caracteres, con mayúscula, minúscula y número.</p>
                )}
              </div>
              <div className="space-y-2">
                <label className="neo-label">Confirmar contraseña</label>
                <input
                  type="password"
                  value={resetConfirm}
                  onChange={(e) => { setResetConfirm(e.target.value); setResetMsg(null) }}
                  onKeyDown={(e) => e.key === 'Enter' && doReset()}
                  placeholder="••••••••••"
                  autoComplete="new-password"
                  className="neo-input w-full"
                />
              </div>

              {resetMsg && (
                <p className={`text-xs ${resetMsg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{resetMsg.text}</p>
              )}

              <button onClick={doReset} disabled={resetBusy} className="neo-btn w-full justify-center">
                {resetBusy ? 'Cambiando…' : 'Cambiar contraseña'}
              </button>
            </div>
          </div>,
          document.body,
        )}


      <div className="neo-frame w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 overflow-hidden">
        {/* ---------- Panel izquierdo: formulario ---------- */}
        <div className="relative px-8 py-10 md:px-14 md:py-12 flex flex-col min-h-[600px]">
          {/* Controles de ventana */}
          <div className="flex items-center gap-2 mb-8">
            <span className="neo-dot" />
            <span className="neo-dot" />
            <span className="neo-dot neo-dot--bright" />
          </div>

          {/* key={mode} → reinicia la animación de entrada al alternar */}
          <div key={mode} className="neo-stagger flex-1 flex flex-col justify-center max-w-sm w-full mx-auto">
            <div className="mb-7">
              <h1 className="text-3xl md:text-4xl font-semibold text-white tracking-tight">
                {isSignup ? 'Create account' : 'Sign in'}
              </h1>
              <p className="text-neutral-500 text-sm mt-2">
                {isSignup
                  ? 'Crea tu identidad en NexusForge.'
                  : 'Accede a tu centro de mando de ingeniería.'}
              </p>
            </div>

            {/* Username (solo registro) */}
            {isSignup && (
              <Field label="Username" className="mb-4">
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
            )}

            {/* Identificador */}
            {isSignup ? (
              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between">
                  <label htmlFor="email" className="neo-label">Email</label>
                  {role === 'student' && email.length > 0 && (
                    isInstitutionalEmail(email) ? (
                      <span className="neo-hint neo-hint--ok"><CheckIcon /> Correo UTH</span>
                    ) : (
                      <span className="neo-hint neo-hint--medium">Debe ser @uth.hn</span>
                    )
                  )}
                </div>
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
              </div>
            ) : (
              <Field label="Email o username" className="mb-5">
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

            {/* Password */}
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="neo-label">Password</label>
                {!isSignup && (
                  <button type="button" onClick={forgotPassword} className="neo-label neo-label--link">
                    Forget password?
                  </button>
                )}
                {isSignup && strength.label && (
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
                  className="neo-input w-full pr-12"
                />
                <button
                  type="button"
                  aria-label="Toggle password visibility"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-accent-violet transition"
                >
                  {showPassword ? <EyeIcon /> : <EyeOffIcon />}
                </button>
              </div>
              {/* Requisitos en vivo (registro) */}
              {isSignup && password.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1.5">
                  {reqs.map((r) => (
                    <span key={r.label} className={`neo-req ${r.ok ? 'neo-req--ok' : ''}`}>
                      {r.ok ? <CheckIcon /> : <span className="neo-req-dot" />}
                      {r.label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Confirmar password — espacio reservado para que el panel NO crezca al revelarse */}
            <div className="mb-4 min-h-[84px]">
            {showConfirm && (
              <div className="neo-reveal space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="confirm" className="neo-label">Confirm password</label>
                  {confirmState === 'ok' && (
                    <span className="neo-hint neo-hint--ok"><CheckIcon /> Coincide</span>
                  )}
                  {confirmState === 'bad' && (
                    <span className="neo-hint neo-hint--bad">No coincide</span>
                  )}
                </div>
                <input
                  ref={confirmRef}
                  id="confirm"
                  name="nf-confirm"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••••"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="neo-input w-full"
                />
              </div>
            )}
            </div>

            {/* Rol (registro) */}
            {isSignup && (
              <div className="space-y-2 mb-6">
                <span className="neo-label">I am a</span>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setRole('student')}
                    className={`neo-pill ${role === 'student' ? 'neo-pill--active' : ''}`}
                  >
                    Estudiante
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRole('teacher'); setTeacherCode((c) => c || generateTeacherCode()) }}
                    className={`neo-pill ${role === 'teacher' ? 'neo-pill--active' : ''}`}
                  >
                    Catedrático
                  </button>
                </div>
                {role === 'student' && (
                  <div className="neo-reveal space-y-1.5 pt-1">
                    <label htmlFor="account" className="neo-label">Número de cuenta</label>
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
                    <p className="text-[10px] leading-relaxed text-neutral-500">
                      Regístrate con tu correo institucional <span className="text-neutral-400">@uth.hn</span> y tu número de cuenta.
                    </p>
                  </div>
                )}
                {role === 'teacher' && (
                  <div className="neo-reveal space-y-1.5 pt-1">
                    <label htmlFor="tkey" className="neo-label flex items-center gap-1.5">
                      <LockMini /> Clave de docente
                    </label>
                    <input
                      id="tkey"
                      ref={teacherKeyRef}
                      name="nf-tkey"
                      value={teacherKey}
                      onChange={(e) => setTeacherKey(e.target.value)}
                      placeholder="Clave que entrega tu institución"
                      autoComplete="off"
                      spellCheck={false}
                      className="neo-input w-full font-mono"
                    />
                    <p className="text-[10px] leading-relaxed text-neutral-500">
                      Solo el personal docente la tiene. Sin la clave correcta no podrás registrarte como catedrático.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Botón principal */}
            <button type="button" onClick={handleSubmit} className="neo-cta w-full">
              {isSignup ? 'Create account' : 'Sign in'}
            </button>

            {/* Alternar modo (sin recargar) */}
            <div className="text-center text-xs text-neutral-500 mt-5">
              {isSignup ? '¿Ya tienes una cuenta? ' : '¿No tienes una cuenta? '}
              <button type="button" onClick={toggle} className="neo-toggle">
                {isSignup ? 'Sign in' : 'Sign up'}
              </button>
            </div>
          </div>
        </div>

        {/* ---------- Panel derecho: red NexusForge + sociales ---------- */}
        <NexusScene>
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-neutral-400">
              <span className="h-px flex-1 bg-white/10" />
              {isSignup ? 'O regístrate con' : 'O continúa con'}
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
  return { score: 4, label: 'Fuerte', tone: 'strong', color: '#a78bfa' }
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
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
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
