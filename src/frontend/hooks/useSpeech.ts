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

/**
 * Limpia el texto antes de leerlo: quita el markdown (**negrita**, ###, `código`,
 * viñetas, enlaces) y los símbolos sueltos, para que la voz NO lea "asterisco".
 */
function forSpeech(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // enlaces -> solo el texto
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/[*_#`>|~✓→•]/g, ' ') // símbolos que no se leen
    .replace(/\s+/g, ' ')
    .trim()
}

/** Elige la mejor voz en español disponible (prefiere las naturales). */
function pickSpanishVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  const es = voices.filter((v) => v.lang.toLowerCase().startsWith('es'))
  if (!es.length) return null
  // Voces naturales de Microsoft/Google y nombres neutros/femeninos conocidos.
  const prefer = ['natural', 'dalia', 'sabina', 'elvira', 'paloma', 'helena', 'laura', 'google español', 'español de méxico', 'español (méxico)']
  for (const p of prefer) {
    const v = es.find((x) => x.name.toLowerCase().includes(p))
    if (v) return v
  }
  return es[0]
}

export function useSpeech(lang = 'es-ES') {
  const [listening, setListening] = useState(false)
  const [waking, setWaking] = useState(false) // modo manos libres: escuchando "Nexus"
  const [supported, setSupported] = useState(false)
  const recRef = useRef<any>(null)
  const wakeRef = useRef<any>(null)
  const wakeOnRef = useRef(false) // ¿el modo manos libres sigue activo? (para reiniciar)
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setSupported(!!SR)
    // Las voces cargan de forma asíncrona: elegimos la española cuando lleguen.
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const load = () => { voiceRef.current = pickSpanishVoice() }
      load()
      window.speechSynthesis.onvoiceschanged = load
    }
    return () => {
      wakeOnRef.current = false
      try { recRef.current?.abort?.() } catch { /* noop */ }
      try { wakeRef.current?.abort?.() } catch { /* noop */ }
    }
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

  /** Lee un texto en voz alta (texto → voz), limpio y con voz natural. */
  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const limpio = forSpeech(text)
    if (!limpio) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(limpio.slice(0, 500)) // no leer ensayos enteros
    const v = voiceRef.current ?? pickSpanishVoice()
    if (v) { u.voice = v; u.lang = v.lang } else { u.lang = lang }
    u.rate = 1.0
    u.pitch = 1.0
    window.speechSynthesis.speak(u)
  }, [lang])

  const shutUp = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
  }, [])

  /**
   * MODO MANOS LIBRES: escucha en continuo y, cuando oye "Nexus …", entrega lo
   * que sigue como comando. Si solo dice "Nexus", entrega '' (para responder
   * "¿sí?"). Se reinicia solo al cortarse (la API se detiene tras un silencio),
   * mientras el modo siga activo.
   */
  const startWake = useCallback((onCommand: (cmd: string) => void, onError?: (e: string) => void) => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { onError?.('unsupported'); return }
    if (wakeOnRef.current) return // ya está escuchando: no arranques un segundo reconocedor
    wakeOnRef.current = true

    const arrancar = () => {
      if (!wakeOnRef.current) return
      const rec = new SR()
      rec.lang = lang
      rec.interimResults = false
      rec.continuous = true
      rec.onresult = (e: any) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (!e.results[i].isFinal) continue
          const t = String(e.results[i][0].transcript || '').trim()
          // "nexus", "néxus", "nexo", "next"… seguido del comando
          const m = t.toLowerCase().match(/\b(n[eé]xus|nexo|nexos|next)\b[\s,:.-]*(.*)$/)
          if (m) onCommand(m[2].trim())
        }
      }
      rec.onerror = (e: any) => {
        const err = e?.error ?? 'error'
        // 'no-speech'/'aborted' son normales en continuo: no molestamos.
        if (err === 'not-allowed' || err === 'service-not-allowed' || err === 'unsupported') {
          wakeOnRef.current = false
          setWaking(false)
          onError?.(err)
        }
      }
      rec.onend = () => { if (wakeOnRef.current) { try { rec.start() } catch { /* reintento */ } } }
      wakeRef.current = rec
      try { rec.start() } catch { /* noop */ }
    }

    setWaking(true)
    arrancar()
  }, [lang])

  const stopWake = useCallback(() => {
    wakeOnRef.current = false
    setWaking(false)
    try { wakeRef.current?.stop?.() } catch { /* noop */ }
  }, [])

  return { listening, waking, supported, start, stop, speak, shutUp, startWake, stopWake }
}
