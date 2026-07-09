'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Icon3D from '@/frontend/components/ui/Icon3D'
import PresetAvatar, { presetIndex } from '@/frontend/components/ui/PresetAvatar'
import { getSession, clearSession, displayName, SESSION_EVENT, DEFAULT_COINS, type Session } from '@/frontend/session/session'
import { supabase } from '@/backend/supabase'
import { useT } from '@/frontend/hooks/useT'

export default function ProfileBar() {
  const router = useRouter()
  const { t } = useT()
  const [session, setSessionState] = useState<Session | null>(null)
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const chipRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setMounted(true)
    const sync = () => setSessionState(getSession())
    sync()
    window.addEventListener(SESSION_EVENT, sync)
    return () => window.removeEventListener(SESSION_EVENT, sync)
  }, [])

  if (!session) return null

  const name = displayName(session)
  const avatar = session.avatar
  const group = session.group
  const coins = session.coins ?? DEFAULT_COINS
  const role = session.role ?? 'student'
  const isStudent = role === 'student'

  function toggle() {
    if (!open && chipRef.current) {
      const r = chipRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 10, right: window.innerWidth - r.right })
    }
    setOpen((o) => !o)
  }
  function go(path: string) {
    setOpen(false)
    router.push(path)
  }
  async function signOut() {
    setOpen(false)
    // Cierra también la sesión de Supabase para que no te vuelva a entrar solo.
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
    <div className="flex items-center gap-3">
      {/* Monedas: solo estudiante */}
      {isStudent && (
        <div className="neo-coins">
          <Icon3D src="/icons/coin.png" alt="coins" size={18} fallback="◆" />
          <span className="font-semibold text-white">{coins.toLocaleString()}</span>
        </div>
      )}

      <button
        ref={chipRef}
        onClick={toggle}
        className={`neo-profile-chip ${open ? 'neo-profile-chip--open' : ''}`}
        title={name}
      >
        <div className="text-right leading-tight">
          <p className="text-sm font-semibold text-neutral-100">{name}</p>
          {isStudent ? (
            <p className="flex items-center justify-end gap-1.5 text-[11px] text-neutral-500">
              <Icon3D src="/icons/rank-gold.png" alt="rank" size={13} fallback="◆" />
              Gold
              <span className="text-neutral-700">·</span>
              <span className={group ? 'text-neutral-400' : 'text-neutral-600'}>
                {group ?? t('prof.no_group')}
              </span>
            </p>
          ) : (
            <p className="text-[11px] font-medium text-accent-violet">
              {role === 'teacher' ? t('prof.role_teacher') : t('prof.role_visitor')}
            </p>
          )}
        </div>
        <div className="neo-avatar !h-11 !w-11">
          {avatar ? (
            <PresetAvatar src={avatar} index={presetIndex(avatar) ?? 1} size={44} className="h-full w-full" />
          ) : (
            <span className="neo-avatar-initial">{name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <ChevronIcon className={`neo-chevron ${open ? 'neo-chevron--up' : ''}`} />
      </button>

      {open &&
        mounted &&
        createPortal(
          <>
            <div className="neo-menu-backdrop" onClick={() => setOpen(false)} />
            <div className="neo-menu" style={{ position: 'fixed', top: pos.top, right: pos.right }}>
              <button onClick={() => go('/dashboard/profile')} className="neo-menu-item">
                <UserIcon /> {t('prof.view_profile')}
              </button>
              <button onClick={() => go('/dashboard/settings')} className="neo-menu-item">
                <GearIcon /> {t('nav.settings')}
              </button>
              <div className="neo-menu-sep" />
              <button onClick={signOut} className="neo-menu-item neo-menu-item--danger">
                <LogoutIcon /> {t('nav.signout')}
              </button>
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}

function ChevronIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}
