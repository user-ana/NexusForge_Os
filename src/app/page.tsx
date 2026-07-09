'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from '@/frontend/session/session'

/** Raíz: redirige según haya sesión o no (sin landing intermedia). */
export default function Home() {
  const router = useRouter()
  useEffect(() => {
    router.replace(getSession() ? '/dashboard' : '/auth/login')
  }, [router])

  return (
    <div className="neo-scene flex min-h-screen items-center justify-center">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-accent-violet border-t-transparent" />
    </div>
  )
}
