'use client'

/**
 * Escucha CONTINUA en un idioma extranjero, para el modo "conversación en vivo":
 * otra persona habla (p. ej. en inglés) y cada frase cerrada se entrega para
 * traducirla al español al vuelo.
 *
 * Es un reconocedor aparte del de useSpeech (que dicta en español) para poder
 * escuchar en un idioma distinto sin pisar el dictado normal. Se reinicia solo
 * cuando la API se corta tras un silencio, mientras el modo siga activo.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/* eslint-disable @typescript-eslint/no-explicit-any */

export function useForeignListen() {
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(false)
  const recRef = useRef<any>(null)
  const onRef = useRef(false)

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setSupported(!!SR)
    return () => {
      onRef.current = false
      try { recRef.current?.abort?.() } catch { /* noop */ }
    }
  }, [])

  const start = useCallback((lang: string, onUtterance: (text: string) => void, onError?: (e: string) => void) => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { onError?.('unsupported'); return }
    if (onRef.current) return
    onRef.current = true

    const arrancar = () => {
      if (!onRef.current) return
      const rec = new SR()
      rec.lang = lang
      rec.interimResults = false
      rec.continuous = true
      rec.onresult = (e: any) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (!e.results[i].isFinal) continue
          const t = String(e.results[i][0].transcript || '').trim()
          if (t) onUtterance(t)
        }
      }
      rec.onerror = (e: any) => {
        const err = e?.error ?? 'error'
        if (err === 'not-allowed' || err === 'service-not-allowed' || err === 'unsupported') {
          onRef.current = false
          setListening(false)
          onError?.(err)
        }
      }
      rec.onend = () => { if (onRef.current) { try { rec.start() } catch { /* reintento */ } } }
      recRef.current = rec
      try { rec.start() } catch { /* noop */ }
    }

    setListening(true)
    arrancar()
  }, [])

  const stop = useCallback(() => {
    onRef.current = false
    setListening(false)
    try { recRef.current?.stop?.() } catch { /* noop */ }
  }, [])

  return { listening, supported, start, stop }
}
