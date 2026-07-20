'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/frontend/components/layout/Header'
import { useT } from '@/frontend/hooks/useT'
import { supabase } from '@/backend/supabase'
import { getSession, patchSession, clearSession, displayName } from '@/frontend/session/session'
import { loginAllowed, loginFailed, loginSucceeded } from '@/frontend/session/loginGuard'

type Msg = { type: 'ok' | 'bad'; text: string } | null

export default function SettingsPage() {
  const { t } = useT()
  const router = useRouter()

  // ---- Datos de perfil ----
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [email, setEmail] = useState('')
  const [bio, setBio] = useState('')
  const loaded = useRef({ first: '', last: '', bio: '' })
  const [profMsg, setProfMsg] = useState<Msg>(null)
  const [profBusy, setProfBusy] = useState(false)

  // ---- Contraseña ----
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confPw, setConfPw] = useState('')
  const [pwMsg, setPwMsg] = useState<Msg>(null)
  const [pwBusy, setPwBusy] = useState(false)

  // ---- Preferencias ----
  const [prefs, setPrefs] = useState({ emailNotif: true, publicProfile: true, recommend: false })

  // ---- Eliminar cuenta ----
  const [delOpen, setDelOpen] = useState(false)
  const [delText, setDelText] = useState('')
  const [delBusy, setDelBusy] = useState(false)

  useEffect(() => {
    const s = getSession()
    const name = s ? displayName(s) : ''
    const parts = name.trim().split(/\s+/).filter(Boolean)
    const f = parts[0] ?? ''
    const l = parts.slice(1).join(' ')
    setFirst(f)
    setLast(l)
    loaded.current = { first: f, last: l, bio: '' }
    if (supabase) {
      supabase.auth.getUser().then(({ data }) => {
        setEmail(data.user?.email ?? '')
        const b = (data.user?.user_metadata?.bio as string | undefined) ?? ''
        setBio(b)
        loaded.current.bio = b
      })
    }
    try {
      const raw = localStorage.getItem('nf_prefs')
      if (raw) setPrefs((p) => ({ ...p, ...JSON.parse(raw) }))
    } catch {
      /* ignore */
    }
  }, [])

  async function saveProfile() {
    setProfMsg(null)
    setProfBusy(true)
    const full = `${first} ${last}`.trim()
    patchSession({ fullName: full, name: full })
    if (supabase) {
      await supabase.auth.updateUser({ data: { nf_full_name: full, full_name: full, bio } }).catch(() => {})
    }
    loaded.current = { first, last, bio }
    setProfBusy(false)
    setProfMsg({ type: 'ok', text: t('set.saved') })
  }

  function cancelProfile() {
    setFirst(loaded.current.first)
    setLast(loaded.current.last)
    setBio(loaded.current.bio)
    setProfMsg(null)
  }

  async function updatePassword() {
    setPwMsg(null)
    const strong = newPw.length >= 8 && /[A-Z]/.test(newPw) && /[a-z]/.test(newPw) && /\d/.test(newPw)
    if (!strong) return setPwMsg({ type: 'bad', text: t('set.pw_weak') })
    if (newPw !== confPw) return setPwMsg({ type: 'bad', text: t('set.pw_nomatch') })
    if (!supabase) return setPwMsg({ type: 'bad', text: t('set.pw_unavailable') })
    // ANTI FUERZA BRUTA: aquí se comprueba la contraseña actual, así que también
    // hay que frenar los intentos (si no, sirve para adivinarla desde una sesión robada).
    const gate = loginAllowed('password')
    if (!gate.ok) {
      return setPwMsg({ type: 'bad', text: `Demasiados intentos. Espera ${gate.retryAfter} s.` })
    }
    setPwBusy(true)
    // Verifica la contraseña actual re-autenticando (falla si la cuenta es de proveedor OAuth).
    const { error: signErr } = await supabase.auth.signInWithPassword({ email, password: curPw })
    if (signErr) {
      const f = loginFailed('password')
      setPwBusy(false)
      setCurPw('')
      const base = t('set.pw_current_bad')
      return setPwMsg({ type: 'bad', text: f.retryAfter > 0 ? `${base} Espera ${f.retryAfter} s.` : base })
    }
    loginSucceeded('password')
    const { error } = await supabase.auth.updateUser({ password: newPw })
    setPwBusy(false)
    if (error) return setPwMsg({ type: 'bad', text: error.message })
    setCurPw('')
    setNewPw('')
    setConfPw('')
    setPwMsg({ type: 'ok', text: t('set.pw_ok') })
  }

  function togglePref(key: keyof typeof prefs) {
    setPrefs((p) => {
      const next = { ...p, [key]: !p[key] }
      try {
        localStorage.setItem('nf_prefs', JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  async function deleteAccount() {
    setDelBusy(true)
    if (supabase) {
      try {
        // Enviamos el token de sesión: el servidor borra SOLO la cuenta de quien llama.
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (token) {
          await fetch('/api/delete-account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          })
        }
      } catch {
        /* aunque falle el borrado remoto, cerramos sesión localmente */
      }
    }
    if (supabase) {
      try {
        await supabase.auth.signOut()
      } catch {
        /* ignore */
      }
    }
    clearSession()
    router.replace('/auth/login')
  }

  return (
    <>
      <Header title={t('head.settings.title')} subtitle={t('head.settings.sub')} />

      <main className="flex-1 overflow-auto p-8">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-6 lg:grid-cols-2">
          {/* Datos de perfil */}
          <section className="neo-panel p-6">
            <h3 className="mb-5 text-lg font-semibold text-white">{t('set.profile')}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('set.first_name')}>
                <input value={first} onChange={(e) => setFirst(e.target.value)} className="neo-input w-full" placeholder={t('set.first_name')} />
              </Field>
              <Field label={t('set.last_name')}>
                <input value={last} onChange={(e) => setLast(e.target.value)} className="neo-input w-full" placeholder={t('set.last_name')} />
              </Field>
              <Field label={t('set.email')} full>
                <input value={email} disabled className="neo-input w-full cursor-not-allowed opacity-60" placeholder="—" />
                <p className="text-[11px] text-neutral-600">{t('set.email_locked')}</p>
              </Field>
              <Field label={t('set.bio')} full>
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className="neo-input w-full resize-none" placeholder={t('set.bio_ph')} />
              </Field>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <button onClick={saveProfile} disabled={profBusy} className="neo-btn">{profBusy ? '…' : t('set.save')}</button>
              <button onClick={cancelProfile} className="neo-btn-ghost">{t('set.cancel')}</button>
              {profMsg && <span className={`text-xs ${profMsg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{profMsg.text}</span>}
            </div>
          </section>

          {/* Contraseña y seguridad */}
          <section className="neo-panel p-6">
            <h3 className="mb-5 text-lg font-semibold text-white">{t('set.security')}</h3>
            <div className="space-y-4">
              <Field label={t('set.current_pw')}>
                <input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} className="neo-input w-full" placeholder="••••••••" autoComplete="current-password" />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t('set.new_pw')}>
                  <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="neo-input w-full" placeholder="••••••••" autoComplete="new-password" />
                </Field>
                <Field label={t('set.confirm_pw')}>
                  <input type="password" value={confPw} onChange={(e) => setConfPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && updatePassword()} className="neo-input w-full" placeholder="••••••••" autoComplete="new-password" />
                </Field>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <button onClick={updatePassword} disabled={pwBusy} className="neo-btn">{pwBusy ? '…' : t('set.update_pw')}</button>
              {pwMsg && <span className={`text-xs ${pwMsg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{pwMsg.text}</span>}
            </div>
          </section>

          {/* Preferencias */}
          <section className="neo-panel p-6">
            <h3 className="mb-5 text-lg font-semibold text-white">{t('set.prefs')}</h3>
            <div className="space-y-2">
              <Toggle label={t('set.email_notif')} checked={prefs.emailNotif} onChange={() => togglePref('emailNotif')} />
              <Toggle label={t('set.public_profile')} checked={prefs.publicProfile} onChange={() => togglePref('publicProfile')} />
              <Toggle label={t('set.recommend')} checked={prefs.recommend} onChange={() => togglePref('recommend')} />
            </div>
          </section>

          {/* Zona de peligro */}
          <section className="neo-panel border border-red-500/30 p-6">
            <h3 className="mb-2 text-lg font-semibold text-red-400">{t('set.danger')}</h3>
            <p className="mb-4 text-sm text-neutral-500">{t('set.danger_text')}</p>
            <button onClick={() => { setDelText(''); setDelOpen(true) }} className="neo-btn-danger">{t('set.delete')}</button>
          </section>
        </div>
      </main>

      {/* Confirmación de eliminar cuenta */}
      {delOpen && (
        <div className="neo-modal-backdrop" onClick={() => !delBusy && setDelOpen(false)}>
          <div className="neo-modal space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-red-400">{t('set.delete')}</h3>
            <p className="text-sm text-neutral-400">{t('set.danger_text')}</p>
            <p className="text-xs text-neutral-500">{t('set.delete_confirm_hint')}</p>
            <input
              value={delText}
              onChange={(e) => setDelText(e.target.value)}
              placeholder="ELIMINAR"
              autoFocus
              className="neo-input w-full text-center font-mono tracking-widest"
            />
            <div className="flex gap-3">
              <button onClick={() => setDelOpen(false)} disabled={delBusy} className="neo-btn-ghost flex-1 justify-center">{t('set.cancel')}</button>
              <button
                onClick={deleteAccount}
                disabled={delBusy || delText.trim().toUpperCase() !== 'ELIMINAR'}
                className={`neo-btn-danger flex-1 justify-center ${delText.trim().toUpperCase() !== 'ELIMINAR' ? 'opacity-50' : ''}`}
              >
                {delBusy ? '…' : t('set.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={`space-y-2 ${full ? 'sm:col-span-2' : ''}`}>
      <label className="neo-label">{label}</label>
      {children}
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="neo-row flex cursor-pointer items-center justify-between p-3 text-sm text-neutral-300">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={onChange} className="neo-check" />
    </label>
  )
}
