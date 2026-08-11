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

/** Nombres de voces conocidas por idioma, de mejor a peor dentro de su familia. */
const VOICE_PREFER: Record<'es' | 'en', string[]> = {
  es: ['dalia', 'jorge', 'elvira', 'alvaro', 'paloma', 'helena', 'laura', 'sabina'],
  en: ['aria', 'jenny', 'michelle', 'ava', 'guy', 'zira', 'david'],
}

/**
 * Detecta si un texto está en español o inglés (heurística ligera). Se usa para
 * NO leer un texto en inglés con voz española (sonaba "masticado"): cada idioma
 * se lee con una voz nativa de ese idioma.
 */
export function detectLang(text: string): 'es' | 'en' {
  const t = text.toLowerCase()
  if (/[ñáéíóú¿¡]/.test(t)) return 'es' // señales inequívocas de español
  const es = (t.match(/\b(que|de|la|el|los|las|un|una|para|con|como|qué|hola|gracias|ayuda|estudiante|clase|tarea|sí|está|puedo|puedes|necesitas)\b/g) || []).length
  const en = (t.match(/\b(the|and|you|is|are|to|of|with|for|hello|hi|what|how|can|help|please|this|that|do|does|your|about)\b/g) || []).length
  return en > es ? 'en' : 'es'
}

/**
 * La mejor voz disponible para un idioma.
 *
 * Antes devolvía la PRIMERA que coincidiera con la lista, así que bastaba con
 * que el equipo tuviera una voz vieja con un nombre de la lista para que ganara
 * a una neuronal mucho mejor. Ahora se puntúan todas y gana la de más nota:
 * las "Natural"/"Neural" de Microsoft y las de Google suenan como una persona;
 * las antiguas (Sabina, Helena, Raul) suenan a robot de los noventa.
 */
function pickVoiceFor(lang: 'es' | 'en'): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices?.() ?? []
  const cand = voices.filter((v) => v.lang.toLowerCase().startsWith(lang))
  if (!cand.length) return null

  const score = (v: SpeechSynthesisVoice): number => {
    const n = v.name.toLowerCase()
    let s = 0
    if (n.includes('natural')) s += 120 // Microsoft neuronal: la mejor con diferencia
    if (n.includes('neural')) s += 120
    if (n.includes('online')) s += 40 // servidor de Microsoft, también neuronal
    if (n.includes('google')) s += 60
    if (n.includes('premium') || n.includes('enhanced')) s += 50 // Apple
    const i = VOICE_PREFER[lang].findIndex((p) => n.includes(p))
    if (i >= 0) s += 20 - i // dentro de la misma familia, el orden de la lista
    if (v.default) s += 2
    return s
  }

  return cand.slice().sort((a, b) => score(b) - score(a))[0]
}

/** Elige voz + idioma según el idioma detectado del texto (para leerlo nativo). */
export function speechVoiceFor(text: string): { voice: SpeechSynthesisVoice | null; lang: string } {
  const l = detectLang(text)
  const voice = pickVoiceFor(l)
  return { voice, lang: voice?.lang ?? (l === 'en' ? 'en-US' : 'es-ES') }
}

/** Elige la mejor voz en español disponible (prefiere las naturales). */
function pickSpanishVoice(): SpeechSynthesisVoice | null {
  return pickVoiceFor('es')
}

export function useSpeech(lang = 'es-ES') {
  const [listening, setListening] = useState(false)
  const [waking, setWaking] = useState(false) // modo manos libres: escuchando "Nexus"
  const [supported, setSupported] = useState(false)
  const recRef = useRef<any>(null)
  const wakeRef = useRef<any>(null)
  const wakeOnRef = useRef(false) // ¿el modo manos libres sigue activo? (para reiniciar)
  const dictOnRef = useRef(false) // ¿el dictado sigue abierto? (para relanzarlo)
  const silenceRef = useRef<number | null>(null) // cierre por silencio tras hablar
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
      dictOnRef.current = false
      if (silenceRef.current) window.clearTimeout(silenceRef.current)
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

    // El dictado se cierra SOLO cuando lo pide el usuario o cuando ya recogimos
    // una frase y llega el silencio. Antes usaba continuous=false y el navegador
    // lo cortaba a los pocos segundos de no oír nada ("se cierra rápido"), o al
    // primer respiro en mitad de una frase.
    dictOnRef.current = true
    let buffer = ''

    const clearSilence = () => {
      if (silenceRef.current) { window.clearTimeout(silenceRef.current); silenceRef.current = null }
    }
    const finish = () => {
      clearSilence()
      dictOnRef.current = false
      try { recRef.current?.stop?.() } catch { /* noop */ }
      setListening(false)
      const text = buffer.trim()
      buffer = ''
      if (text) onFinal(text)
    }

    const arrancar = () => {
      if (!dictOnRef.current) return
      const rec = new SR()
      rec.lang = lang
      rec.interimResults = true
      // continuo: un respiro a mitad de la frase ya no corta el dictado
      rec.continuous = true
      rec.maxAlternatives = 1

      rec.onresult = (e: any) => {
        let interim = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript
          if (e.results[i].isFinal) buffer += `${t} `
          else interim += t
        }
        onText(`${buffer}${interim}`.trim())
        // Ya hay algo dicho: al callar un rato, se envía. El margen es amplio a
        // propósito — con 1,5 s cortaba a mitad de frase en cuanto la persona se
        // paraba a pensar el nombre de algo ("Creó una tarea llamada…").
        clearSilence()
        if (buffer.trim()) silenceRef.current = window.setTimeout(finish, 3200)
      }

      rec.onerror = (e: any) => {
        const err = e?.error ?? 'error'
        // 'no-speech' y 'aborted' son ruido normal: se reintenta en vez de cerrar
        // la ventana en la cara del usuario mientras piensa qué decir.
        if (err === 'no-speech' || err === 'aborted') return
        dictOnRef.current = false
        clearSilence()
        setListening(false)
        onError?.(err)
      }

      // El navegador corta cada pocos segundos aunque sea continuo: se relanza
      // mientras el usuario no haya cerrado el dictado.
      rec.onend = () => {
        if (!dictOnRef.current) { setListening(false); return }
        try { rec.start() } catch { try { arrancar() } catch { /* noop */ } }
      }

      recRef.current = rec
      try { rec.start() } catch { dictOnRef.current = false; setListening(false) }
    }

    setListening(true)
    arrancar()
  }, [lang])

  const stop = useCallback(() => {
    dictOnRef.current = false
    if (silenceRef.current) { window.clearTimeout(silenceRef.current); silenceRef.current = null }
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
    // La voz se elige por el idioma del TEXTO (no fijo español): así el inglés se
    // lee con voz inglesa y no con acento español.
    const { voice, lang: vlang } = speechVoiceFor(limpio)
    if (voice) { u.voice = voice; u.lang = voice.lang } else { u.lang = vlang }
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
    // abort (no stop): suelta el micrófono de inmediato y NO entrega un último
    // resultado. Así el dictado que abre justo después no choca por el micrófono
    // ocupado, y la voz del propio asistente no se cuela como comando.
    try { wakeRef.current?.abort?.() } catch { /* noop */ }
  }, [])

  return { listening, waking, supported, start, stop, speak, shutUp, startWake, stopWake }
}
