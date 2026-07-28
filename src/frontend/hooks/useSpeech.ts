'use client'

/**
 * VOZ del asistente — reconocimiento (hablar → texto) y síntesis (texto → voz)
 * con la Web Speech API del navegador. Sin servidor: gratis, en el equipo.
 *
 * Nota: el reconocimiento funciona bien en Chrome y Edge. Algunos navegadores
 * (p. ej. Brave) traen la API pero la bloquean; por eso `start` reporta el error
 * y la UI puede avisar en vez de quedarse callada.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/* eslint-disable @typescript-eslint/no-explicit-any */

export function useSpeech(lang = 'es-ES') {
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(false)
  const recRef = useRef<any>(null)

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setSupported(!!SR)
    return () => { try { recRef.current?.abort?.() } catch { /* noop */ } }
  }, [])

  /**
   * Empieza a escuchar. `onText` recibe el texto parcial en vivo; `onFinal` el
   * texto ya cerrado; `onError` un código de error del navegador.
   */
  const start = useCallback((onText: (t: string) => void, onFinal: (t: string) => void, onError?: (e: string) => void) => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { onError?.('unsupported'); return }
    try { recRef.current?.abort?.() } catch { /* noop */ }

    const rec = new SR()
    rec.lang = lang
    rec.interimResults = true
    rec.continuous = false
    rec.maxAlternatives = 1

    rec.onresult = (e: any) => {
      let interim = '', final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) final += t
        else interim += t
      }
      onText((final || interim).trim())
      if (final.trim()) onFinal(final.trim())
    }
    rec.onerror = (e: any) => { setListening(false); onError?.(e?.error ?? 'error') }
    rec.onend = () => setListening(false)

    recRef.current = rec
    setListening(true)
    try { rec.start() } catch { setListening(false) }
  }, [lang])

  const stop = useCallback(() => {
    try { recRef.current?.stop?.() } catch { /* noop */ }
    setListening(false)
  }, [])

  /** Lee un texto en voz alta (texto → voz). */
  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text.slice(0, 500)) // no leer ensayos enteros
    u.lang = lang
    u.rate = 1.03
    window.speechSynthesis.speak(u)
  }, [lang])

  const shutUp = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
  }, [])

  return { listening, supported, start, stop, speak, shutUp }
}
