'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession, clearSession } from '@/frontend/session/session'
import { supabase } from '@/backend/supabase'
import { bridgeUser } from '@/frontend/session/authBridge'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!getSession()) {
      router.replace('/auth/login')
      return
    }
    setReady(true)

    if (!supabase) return
    const sb = supabase

    // Si la sesión de Supabase ya no es válida → al login (en vez de 401 en silencio)
    const check = async () => {
      const { data, error } = await sb.auth.getUser()
      if (error || !data.user) {
        clearSession()
        router.replace('/auth/login')
        return
      }
      bridgeUser(data.user)
    }
    check()

    // Si el token se vence/refresca y Supabase cierra sesión → al login
    const { data: sub } = sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        clearSession()
        router.replace('/auth/login')
      }
    })
    // Revalida al volver a la pestaña (token pudo vencer estando inactiva)
    const onFocus = () => check()
    window.addEventListener('focus', onFocus)

    return () => {
      sub.subscription.unsubscribe()
      window.removeEventListener('focus', onFocus)
    }
  }, [router])

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-dark-0">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-violet border-t-transparent" />
      </div>
    )
  }

  return <>{children}</>
}
