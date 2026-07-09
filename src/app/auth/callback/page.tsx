'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/backend/supabase'
import { bridgeUser } from '@/frontend/session/authBridge'
import { AlertIcon } from '@/frontend/components/ui/Icons'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) {
      router.replace('/auth/login')
      return
    }
    const sb = supabase
    let done = false

    const finish = (user: Parameters<typeof bridgeUser>[0]) => {
      if (done) return
      done = true
      const hasRole = !!(user.user_metadata as Record<string, unknown> | undefined)?.role
      if (hasRole) {
        bridgeUser(user)
        router.replace('/dashboard')
      } else {
        router.replace('/auth/onboarding')
      }
    }

    // ¿El proveedor devolvió un error en la URL? (query o hash)
    const q = new URLSearchParams(window.location.search)
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const errDesc = q.get('error_description') || h.get('error_description') || q.get('error') || h.get('error')
    if (errDesc) {
      setErr(decodeURIComponent(errDesc))
      return
    }

    // Escucha el evento de sesión (PKCE intercambia el code de forma asíncrona)
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      if (session?.user) finish(session.user)
    })

    // Y además sondea getSession por si el intercambio ya ocurrió antes de escuchar
    let tries = 0
    const poll = async () => {
      if (done) return
      const { data } = await sb.auth.getSession()
      if (data.session?.user) {
        finish(data.session.user)
        return
      }
      tries++
      if (tries > 28) {
        // ~7s sin sesión: algo falló al intercambiar el código
        setErr('No se pudo completar el inicio de sesión (no se recibió la sesión). Revisa la configuración del proveedor.')
        return
      }
      setTimeout(poll, 250)
    }
    poll()

    return () => sub.subscription.unsubscribe()
  }, [router])

  if (err) {
    return (
      <div className="neo-scene flex min-h-screen items-center justify-center p-6">
        <div className="neo-frame w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-red-300">
            <AlertIcon size={22} />
          </div>
          <h1 className="text-lg font-semibold text-white">No se pudo iniciar sesión</h1>
          <p className="mt-2 break-words text-sm text-neutral-400">{err}</p>
          <button onClick={() => router.replace('/auth/login')} className="neo-btn mt-6">
            ← Volver al inicio de sesión
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="neo-scene flex min-h-screen items-center justify-center">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-accent-violet border-t-transparent" />
    </div>
  )
}
