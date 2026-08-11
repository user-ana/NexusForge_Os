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

/**
 * Métricas que describen la CARGA DEL DOCUMENTO, no la navegación actual.
 *
 * El navegador no las da por cerradas hasta que se oculta la pestaña, y para
 * entonces el usuario ya navegó a otra ruta (la navegación dentro del panel no
 * recarga la página). Si se les pega la ruta del momento del reporte, todas las
 * mediciones de una misma carga aterrizan sobre la última ruta visitada — y la
 * tabla por ruta deja de significar nada.
 */
const LOAD_METRICS = new Set(['LCP', 'FCP', 'TTFB', 'FID', 'CLS', 'Next.js-hydration'])

/** De las anteriores, las que son un INSTANTE en milisegundos (CLS es un score). */
const TIMING_METRICS = new Set(['LCP', 'FCP', 'TTFB', 'FID', 'Next.js-hydration'])

export default function WebVitalsReporter() {
  const pathname = usePathname()
  const buffer = useRef<Sample[]>([])
  const token = useRef<string | null>(null)
  const route = useRef(pathname)
  /** Ruta con la que se cargó el documento. No cambia al navegar. */
  const entryRoute = useRef(pathname)
  /**
   * Momento en que la pestaña se ocultó por primera vez (Infinity si nunca).
   *
   * Si la página se carga en una pestaña que el usuario no está mirando, el
   * navegador APLAZA el pintado hasta que la trae al frente, y luego reporta
   * ese retraso como si la página hubiera tardado en cargar. Así aparecen
   * valores absurdos —90 segundos de LCP— que no describen la aplicación sino
   * el comportamiento del navegador. Se descartan.
   */
  const firstHidden = useRef(Infinity)

  useEffect(() => {
    if (document.visibilityState === 'hidden') firstHidden.current = 0
    const marcar = () => {
      if (document.visibilityState === 'hidden') {
        firstHidden.current = Math.min(firstHidden.current, performance.now())
      }
    }
    document.addEventListener('visibilitychange', marcar, true)
    return () => document.removeEventListener('visibilitychange', marcar, true)
  }, [])

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
    // Si la pestaña estuvo oculta antes de que esto se midiera, el dato no
    // describe la aplicación: describe que el navegador aplazó el pintado.
    // Guardarlo contaminaría el percentil de todos los demás.
    const enSegundoPlano =
      firstHidden.current === 0 ||
      (TIMING_METRICS.has(metric.name) && metric.value > firstHidden.current)
    if (LOAD_METRICS.has(metric.name) && enSegundoPlano) return

    buffer.current.push({
      kind: 'web_vital',
      name: metric.name,
      // CLS es un score sin unidad y muy pequeño: se guarda x1000 para no
      // perderlo al redondear. El panel lo vuelve a dividir al mostrarlo.
      value: metric.name === 'CLS' ? metric.value * 1000 : metric.value,
      // Carga del documento -> ruta de entrada. Interacción (INP) -> ruta donde
      // ocurrió el clic, que es la que de verdad respondió lento.
      route: LOAD_METRICS.has(metric.name) ? entryRoute.current : route.current,
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
