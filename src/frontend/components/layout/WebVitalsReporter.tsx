'use client'

import { useCallback, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useReportWebVitals } from 'next/web-vitals'
import { supabase } from '@/backend/supabase'
import { getSession } from '@/frontend/session/session'

/**
 * Mide el rendimiento REAL que percibe cada usuario (Core Web Vitals) y lo
 * manda a /api/metrics para el panel de monitoreo.
 *
 * No inventa numeros: LCP, CLS, INP, FCP y TTFB los mide el propio navegador
 * con la API de rendimiento del estandar web. Por eso reflejan la experiencia
 * de verdad (conexion lenta incluida) y no lo que se ve en la maquina del
 * desarrollador.
 *
 * Cuando se envia: los vitales no estan listos al cargar (CLS e INP solo se
 * conocen del todo cuando la pestana se oculta), asi que se acumulan en un
 * buffer y se sueltan al ocultar la pestana, al cambiar de ruta o cada 20 s.
 *
 * Ver: src/app/api/metrics/route.ts
 */

type Sample = {
  kind: 'web_vital' | 'event'
  name: string
  value: number
  route: string
  rating?: string
  role?: string
}

const FLUSH_EVERY_MS = 20_000

export default function WebVitalsReporter() {
  const pathname = usePathname()
  const buffer = useRef<Sample[]>([])
  const token = useRef<string | null>(null)
  const route = useRef(pathname)

  route.current = pathname

  /** Token de sesion cacheado: en `pagehide` no da tiempo de pedirlo. */
  useEffect(() => {
    if (!supabase) return
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (alive) token.current = data.session?.access_token ?? null
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      token.current = session?.access_token ?? null
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const flush = useCallback(() => {
    if (!buffer.current.length) return
    const metrics = buffer.current.splice(0, buffer.current.length)
    const body = JSON.stringify({ metrics })

    // keepalive deja que la peticion termine aunque la pestana se cierre.
    // Con token la metrica queda asociada al usuario; sin el, anonima.
    try {
      fetch('/api/metrics', {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          ...(token.current ? { Authorization: `Bearer ${token.current}` } : {}),
        },
        body,
      }).catch(() => {})
    } catch {
      try {
        navigator.sendBeacon?.('/api/metrics', new Blob([body], { type: 'application/json' }))
      } catch {
        // El monitoreo nunca debe romper la navegacion.
      }
    }
  }, [])

  useReportWebVitals((metric) => {
    buffer.current.push({
      kind: 'web_vital',
      name: metric.name,
      // CLS es un score sin unidad y muy pequeño: se guarda x1000 para no
      // perderlo al redondear. El panel lo vuelve a dividir al mostrarlo.
      value: metric.name === 'CLS' ? metric.value * 1000 : metric.value,
      route: route.current,
      rating: (metric as { rating?: string }).rating,
      role: getSession()?.role ?? '',
    })
  })

  // Una vista de pagina por navegacion (trafico real del panel)
  useEffect(() => {
    buffer.current.push({
      kind: 'event',
      name: 'pageview',
      value: 0,
      route: pathname,
      role: getSession()?.role ?? '',
    })
  }, [pathname])

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    const timer = window.setInterval(flush, FLUSH_EVERY_MS)
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [flush])

  return null
}
