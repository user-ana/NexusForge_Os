'use client'
/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useSpeech, speechVoiceFor } from '@/frontend/hooks/useSpeech'
import { useForeignListen } from './useForeignListen'
import { getSession, displayName, SESSION_EVENT, type Role } from '@/frontend/session/session'
import { supabase } from '@/backend/supabase'
import { getAssistantContext } from '@/backend/services/studentSearch'
import { getStudentContext } from '@/backend/services/studentContext'
import { generateTaskDescription } from '@/backend/services/classTasks'
import {
  type ToolCall,
  nextMissing,
  actionWarning,
  describeAction,
  executeToolCall,
  correctTool,
  findClass,
} from './actions'
import { LANGUAGES, extractPdfText, readTextFile, imageToBase64, toPlain, fold } from './nexusUtils'
import { Icon } from './NexusIcons'

/**
 * Poses del robot. Nexus cambia de postura según lo que está haciendo, así que
 * el estado del asistente se lee sin necesidad de texto: saluda al recibirte,
 * se lleva la mano a la sien cuando te escucha y piensa mientras responde.
 */
const ROBOT_POSE: Record<string, string> = {
  idle: '/robot/robot-nexus-saludando-transparente.png',
  listening: '/robot/robot-nexus-pensando-sien-transparente.png',
  thinking: '/robot/robot-nexus-pensando-transparente.png',
  speaking: '/robot/robot-nexus-transparente.png',
}
/** Pose neutra: la del avatar pequeño de la cabecera y de los mensajes. */
const ROBOT = ROBOT_POSE.speaking

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type ActionState = {
  tc: ToolCall
  status: 'pending' | 'running' | 'done' | 'cancelled' | 'error'
  message?: string
  warning?: string
  descLoading?: boolean
  descSource?: 'ai' | 'none'
}

type Msg = {
  id: number
  role: 'user' | 'ai'
  text: string
  imgPreview?: string
  trans?: { original: string; from: string }
  action?: ActionState
}

type Attachment = { name: string; kind: 'file' | 'image'; text?: string; b64?: string; dataUrl?: string }
type TermLine = { t: string; kind: 'in' | 'run' | 'ok' | 'err' }
/** `ok` solo existe cuando `done`: dice si la acción salió bien (decide el cierre solo). */
type Term = { title: string; lines: TermLine[]; done: boolean; ok?: boolean }

/** Cuánto se queda la terminal en pantalla tras un final feliz, antes de irse sola. */
const TERM_AUTOCLOSE_MS = 4000
const TERM_EXIT_MS = 280

const ACTION_RE = /\b(crea|crear|cre[aá]|agrega|agregar|a[ñn]ade|a[ñn]adir|arma|armar|genera|generar|asigna|asignar|registra|registrar|nuev[oa]s?|elimina|eliminar|borra|borrar|quita|quitar|da de baja|haz(?:me)?)\b/i

const SUGGESTIONS: Record<Role, string[]> = {
  teacher: ['Crea una clase de Bases de Datos', 'Publica una tarea para mi clase', 'Redáctame preguntas de examen', 'Ideas para un nuevo proyecto'],
  student: ['Explícame un tema difícil', 'Ayúdame a planear mi proyecto', 'Resúmeme este archivo', 'Practica un examen conmigo'],
  visitor: ['¿Qué es NexusForge OS?', 'Explícame un tema de ingeniería', 'Recomiéndame cómo empezar', 'Ayúdame a estudiar'],
}

export default function NexusAssistant() {
  const [role, setRole] = useState<Role>('student')
  const [meId, setMeId] = useState('')
  const [name, setName] = useState('')
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [muted, setMuted] = useState(false)
  const [handsFree, setHandsFree] = useState(false)
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [uploading, setUploading] = useState('')
  const [toast, setToast] = useState('')
  const [pending, setPending] = useState<{ tc: ToolCall; field: string } | null>(null)
  const [ctx, setCtx] = useState<string | null>(null)
  const [term, setTerm] = useState<Term | null>(null)
  const [termClosing, setTermClosing] = useState(false)
  const [awaitingConfirm, setAwaitingConfirm] = useState<{ id: number; tc: ToolCall } | null>(null)

  const [translateTo, setTranslateTo] = useState<{ label: string; name: string } | null>(null)
  const [menu, setMenu] = useState<'translate' | 'live' | null>(null)
  const [liveOn, setLiveOn] = useState(false)
  const [liveLang, setLiveLang] = useState(LANGUAGES[1])

  const speech = useSpeech('es-ES')
  const foreign = useForeignListen()
  const voiceRef = useRef(false)
  const mutedRef = useRef(false)
  const wakeWantedRef = useRef(false)
  const sendRef = useRef<(t?: string) => void>(() => {})
  const dictTimerRef = useRef<number | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)

  useEffect(() => { mutedRef.current = muted }, [muted])

  useEffect(() => {
    const sync = () => {
      const s = getSession()
      setRole(s?.role ?? 'student')
      setMeId(s?.id ?? '')
      setName(displayName(s).split(' ')[0] || '')
    }
    sync()
    window.addEventListener(SESSION_EVENT, sync)
    return () => window.removeEventListener(SESSION_EVENT, sync)
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  // Reloj de la cabecera. Se arranca ya montado para que el HTML del servidor
  // no discuta con el del navegador, y se refresca cada medio minuto.
  const [clock, setClock] = useState<{ time: string; date: string; zone: string } | null>(null)
  useEffect(() => {
    const tick = () => {
      const d = new Date()
      const zone = new Intl.DateTimeFormat('es-HN', { timeZoneName: 'short' })
        .formatToParts(d)
        .find((p) => p.type === 'timeZoneName')?.value ?? ''
      setClock({
        time: new Intl.DateTimeFormat('es-HN', { hour: 'numeric', minute: '2-digit', hour12: true }).format(d).toUpperCase(),
        date: new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(d).replace(/\./g, '').toUpperCase(),
        zone,
      })
    }
    tick()
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(''), 2800)
    return () => window.clearTimeout(id)
  }, [toast])

  /**
   * Ficha real de las clases del catedrático (clases, inscritos, grupos,
   * proyectos y notas). Se carga al entrar, no al preguntar, por dos razones:
   * la pregunta no paga la espera de las consultas, y Nexus deja de responder
   * "no tengo acceso a esa información" cuando le preguntas por tus alumnos.
   * Al quedar en null tras una acción, este efecto la vuelve a traer.
   */
  useEffect(() => {
    if (!meId || ctx != null) return
    if (role !== 'teacher' && role !== 'student') return
    let alive = true
    // Cada rol trae SU ficha: el catedrático la de sus clases, el estudiante la
    // suya (sus tareas, su grupo, su proyecto, sus notas). Las dos se arman en
    // el navegador con la sesión de quien pregunta, así que RLS decide qué se
    // puede leer.
    const cargar = role === 'teacher' ? getAssistantContext(meId) : getStudentContext(meId)
    cargar
      .then((c) => { if (alive) setCtx(c) })
      .catch(() => { /* sin ficha: Nexus sigue respondiendo, solo sin datos */ })
    return () => { alive = false }
  }, [role, meId, ctx])

  useEffect(() => () => {
    if (dictTimerRef.current) window.clearTimeout(dictTimerRef.current)
    foreign.stop(); speech.stopWake(); window.speechSynthesis?.cancel()
  }, [foreign.stop, speech.stopWake])

  /* ────────── voz ────────── */
  /**
   * Lee una respuesta en voz alta, partida en frases.
   *
   * El motor de voz de Chrome corta las frases largas: pasado cierto tamaño
   * deja de hablar a media palabra o se salta trozos (por eso "se entrecortaba
   * y no decía bien las cosas"). La solución que funciona es no darle nunca un
   * bloque grande: se trocea por puntuación en pedazos cortos y se encolan uno
   * tras otro, encadenando cada uno al final del anterior.
   */
  const speak = useCallback((text: string, onDone?: () => void) => {
    if (mutedRef.current || typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const clean = toPlain(text)
    if (!clean) return

    // Trocea respetando el final de frase; si una frase es larguísima, la parte
    // por comas para no pasarse del tamaño que el motor aguanta bien.
    const MAX = 170
    const trozos: string[] = []
    for (const frase of clean.match(/[^.!?…]+[.!?…]*\s*/g) ?? [clean]) {
      if (frase.length <= MAX) { trozos.push(frase.trim()); continue }
      let resto = frase.trim()
      while (resto.length > MAX) {
        const corte = resto.lastIndexOf(',', MAX) > 40 ? resto.lastIndexOf(',', MAX) + 1 : resto.lastIndexOf(' ', MAX)
        const i = corte > 40 ? corte : MAX
        trozos.push(resto.slice(0, i).trim())
        resto = resto.slice(i).trim()
      }
      if (resto) trozos.push(resto)
    }
    const cola = trozos.filter(Boolean)
    if (!cola.length) return

    // La voz se elige por el idioma del texto (inglés → voz inglesa, etc.).
    const { voice, lang } = speechVoiceFor(clean)
    window.speechSynthesis.cancel()
    setSpeaking(true)

    const decir = (i: number) => {
      // Se vuelve a mirar el silencio en CADA trozo: si lo apagas a mitad de una
      // respuesta larga, tiene que callarse ahí mismo, no al terminar la cola.
      if (mutedRef.current) { window.speechSynthesis.cancel(); setSpeaking(false); return }
      if (i >= cola.length) { setSpeaking(false); onDone?.(); return }
      const u = new SpeechSynthesisUtterance(cola[i])
      if (voice) { u.voice = voice; u.lang = voice.lang } else u.lang = lang
      u.onend = () => decir(i + 1)
      // Si un trozo falla, se sigue con el siguiente en vez de callarse del todo.
      u.onerror = () => decir(i + 1)
      window.speechSynthesis.speak(u)
    }
    // Un respiro tras cancel(): si se encola en el mismo instante, Chrome se
    // come el arranque y la primera frase no suena.
    window.setTimeout(() => decir(0), 60)
  }, [])

  const speakMaybe = useCallback((text: string) => {
    if (voiceRef.current) { speak(text); voiceRef.current = false }
  }, [speak])

  /**
   * Silenciar tiene que callar lo que ya está sonando, no solo lo siguiente.
   * mutedRef se actualiza aquí mismo porque el efecto que lo sincroniza corre
   * después del render, y para entonces el trozo en curso ya habría arrancado.
   */
  const toggleMute = useCallback(() => {
    setMuted((v) => {
      const next = !v
      mutedRef.current = next
      if (next) {
        window.speechSynthesis?.cancel()
        setSpeaking(false)
      }
      return next
    })
  }, [])

  /* ────────── mensajes ────────── */
  const push = useCallback((m: Omit<Msg, 'id'>) => {
    setMessages((cur) => [...cur, { id: Date.now() + Math.floor(Math.random() * 1000), ...m }])
  }, [])

  const updateAction = useCallback((id: number, patch: Partial<ActionState> | ((a: ActionState) => Partial<ActionState>)) => {
    setMessages((cur) => cur.map((m) => {
      if (m.id !== id || !m.action) return m
      const p = typeof patch === 'function' ? patch(m.action) : patch
      return { ...m, action: { ...m.action, ...p } }
    }))
  }, [])

  const recentHistory = () =>
    messages.filter((m) => !m.action && m.text).slice(-6).map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text }))

  async function postJSON(url: string, body: Record<string, unknown>) {
    const { data: sess } = supabase ? await supabase.auth.getSession() : { data: { session: null } }
    const token = sess.session?.access_token
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    })
    let data: Record<string, unknown> = {}
    try { data = await r.json() } catch { /* sin cuerpo */ }
    return { ok: r.ok, data }
  }

  /**
   * Igual que postJSON pero para respuestas en streaming: crea la burbuja de
   * Nexus vacía y le va añadiendo el texto tal cual llega del modelo, en vez de
   * esperar a que termine de generar. Devuelve la respuesta completa.
   */
  async function postStream(url: string, body: Record<string, unknown>): Promise<{ ok: boolean; text: string }> {
    const { data: sess } = supabase ? await supabase.auth.getSession() : { data: { session: null } }
    const token = sess.session?.access_token
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    })

    // Si algo falla, el servidor responde JSON con el error (no un flujo).
    if (!r.ok || !r.body || !(r.headers.get('content-type') ?? '').startsWith('text/plain')) {
      let msg = 'No pude responder ahora. Intenta de nuevo.'
      try {
        const j = await r.json()
        if (typeof j?.error === 'string') msg = j.error
      } catch { /* sin cuerpo */ }
      return { ok: false, text: msg }
    }

    const id = Date.now() + Math.floor(Math.random() * 1000)
    setMessages((cur) => [...cur, { id, role: 'ai', text: '' }])
    setLoading(false) // ya hay burbuja: los tres puntitos sobran

    const reader = r.body.getReader()
    const decoder = new TextDecoder()
    let full = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      full += decoder.decode(value, { stream: true })
      setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, text: full } : m)))
    }
    return { ok: true, text: full.trim() }
  }

  async function translate(text: string, toName: string, fromName?: string): Promise<string | null> {
    const { ok, data } = await postJSON('/api/translate', { text, to: toName, from: fromName })
    if (ok && typeof data.translation === 'string') return data.translation
    setToast(typeof data.error === 'string' ? data.error : 'No pude traducir ahora.')
    return null
  }

  /* ────────── envío ────────── */
  async function send(raw?: string) {
    const q = (raw ?? input).trim()
    if ((!q && !attachment) || loading) return
    setInput('')
    setMenu(null)

    // Manos libres: si hay una confirmación pendiente y respondiste por voz,
    // interpretamos "sí/no" para confirmar o cancelar sin tocar botones.
    if (awaitingConfirm) {
      // Se compara SIN tildes: en JavaScript `\b` no reconoce la í, así que
      // /\bsí\b/ jamás casaba con un "Sí." dicho por voz (ver fold()).
      const plano = fold(q)
      const yes = /\b(si|confirm\w*|dale|publica\w*|adelante|hazlo|ok|okey|vale|correcto|claro|asi es|de acuerdo)\b/i.test(plano)
      const no = /\b(no|cancel\w*|mejor no|espera|deten\w*|olvidalo)\b/i.test(plano)
      // Por voz siempre se interpreta; escrito, solo si de verdad dijo sí o no
      // (si escribió otra cosa, sigue el flujo normal en vez de trabarse aquí).
      if (voiceRef.current || yes || no) {
        voiceRef.current = false
        const a = awaitingConfirm
        setAwaitingConfirm(null)
        push({ role: 'user', text: q })
        if (yes) runAction(a.id, a.tc)
        else if (no) updateAction(a.id, { status: 'cancelled' })
        else { push({ role: 'ai', text: '¿Lo confirmo o lo cancelo? Di "sí" o "no".' }); setAwaitingConfirm(a); askByVoice('¿Confirmo o cancelo?') }
        return
      }
    }

    if (translateTo && q) {
      push({ role: 'user', text: q })
      setLoading(true)
      const tr = await translate(q, translateTo.name)
      setLoading(false)
      if (tr) { push({ role: 'ai', text: tr, trans: { original: q, from: 'texto' } }); speakMaybe(tr) }
      return
    }

    if (pending) {
      const tc: ToolCall = { name: pending.tc.name, args: { ...pending.tc.args } }
      tc.args[pending.field] = pending.field === 'cantidad' ? Number(q.match(/\d+/)?.[0]) || 0 : q
      push({ role: 'user', text: q })
      const fullText = [...messages.filter((m) => m.role === 'user').map((m) => m.text), q].join(' ')
      proceedWithAction(tc, fullText)
      return
    }

    const attach = attachment
    const shown = q || (attach ? (attach.kind === 'image' ? 'Analiza esta imagen' : `Analiza «${attach.name}»`) : '')
    push({ role: 'user', text: shown, imgPreview: attach?.kind === 'image' ? attach.dataUrl : undefined })
    setAttachment(null)
    setLoading(true)

    try {
      if (role === 'teacher' && !attach && ACTION_RE.test(q)) {
        const context = ctx ?? (await getAssistantContext(meId))
        if (ctx == null) setCtx(context)
        const { ok, data } = await postJSON('/api/assistant', { question: q, context })
        if (ok && data.toolCall) { setLoading(false); proceedWithAction(correctTool(data.toolCall as ToolCall, q), q); return }
        if (ok && typeof data.answer === 'string') { push({ role: 'ai', text: data.answer }); setLoading(false); speakMaybe(data.answer); return }
        throw new Error(String(data.error ?? 'IA no disponible'))
      }

      const askText = q || (attach?.text ? 'Resume y explica el documento adjunto.' : '')
      const payload: Record<string, unknown> = { question: askText, history: recentHistory() }
      if (attach?.text) { payload.context = attach.text; payload.contextLabel = attach.name }
      if (attach?.b64) { payload.image = attach.b64 }
      // Con la ficha cargada, Nexus contesta con datos reales: el catedrático
      // sobre sus alumnos y notas, el estudiante sobre lo suyo. El rol lo
      // vuelve a resolver el servidor; aquí no se manda.
      if (ctx) payload.platform = ctx
      const { ok, text } = await postStream('/api/nexus', payload)
      if (ok && text) speakMaybe(text)
      else if (!ok) push({ role: 'ai', text })
    } catch {
      push({ role: 'ai', text: 'No pude conectar con la IA. Verifica que esté activa e inténtalo de nuevo.' })
    } finally {
      setLoading(false)
    }
  }

  /* ────────── acciones del catedrático + terminal en vivo ────────── */
  function proceedWithAction(tc: ToolCall, userText: string) {
    const missing = nextMissing(tc, userText)
    if (missing) {
      push({ role: 'ai', text: missing.question })
      setPending({ tc, field: missing.field })
      if (handsFree) askByVoice(missing.question) // manos libres: abre la voz para responder
      return
    }
    setPending(null)
    const warning = actionWarning(meId, tc)
    const id = Date.now() + Math.floor(Math.random() * 1000)
    const isTask = tc.name === 'crear_tarea'
    setMessages((cur) => [...cur, { id, role: 'ai', text: '', action: { tc, status: 'pending', warning, descLoading: isTask } }])

    if (isTask) {
      const cls = findClass(meId, String(tc.args.clase ?? ''))
      generateTaskDescription({ titulo: String(tc.args.titulo ?? ''), tema: String(tc.args.tema ?? ''), className: cls?.name }).then((text) => {
        updateAction(id, (prev) => ({ descLoading: false, descSource: text ? 'ai' : 'none', tc: { ...prev.tc, args: { ...prev.tc.args, descripcion: text } } }))
      })
    }

    // Manos libres: pide confirmar por voz ("sí"/"no").
    if (handsFree) { setAwaitingConfirm({ id, tc }); askByVoice(isTask ? 'Preparé la tarea. ¿La publico? Di sí o no.' : '¿Lo confirmo? Di sí o no.') }
  }

  /**
   * La terminal se cierra sola cuando la acción SALIÓ BIEN: ya cumplió su
   * función de contar lo que pasó. Si algo falló se queda hasta que la cierres,
   * porque ahí sí hay un mensaje que leer con calma.
   */
  useEffect(() => {
    if (!term?.done || !term.ok) return
    const irse = window.setTimeout(() => setTermClosing(true), TERM_AUTOCLOSE_MS)
    const quitar = window.setTimeout(() => {
      setTerm(null)
      setTermClosing(false)
    }, TERM_AUTOCLOSE_MS + TERM_EXIT_MS)
    return () => {
      window.clearTimeout(irse)
      window.clearTimeout(quitar)
    }
  }, [term?.done, term?.ok])

  function closeTerm() {
    setTerm(null)
    setTermClosing(false)
  }

  async function termLine(t: string, kind: TermLine['kind'], delay: number) {
    setTerm((cur) => (cur ? { ...cur, lines: [...cur.lines, { t, kind }] } : cur))
    await sleep(delay)
  }

  async function runAction(id: number, tc: ToolCall) {
    setAwaitingConfirm(null)
    updateAction(id, { status: 'running' })
    const danger = tc.name.startsWith('eliminar')
    setTerm({ title: `nexus · ${danger ? 'eliminar' : 'ejecutar'}`, lines: [], done: false })
    await termLine(`$ nexus ${tc.name}`, 'in', 240)
    await termLine('> Conectando con NexusForge…', 'run', 420)
    await termLine(`> ${describeAction(tc)}`, 'run', 560)
    await termLine(danger ? '> Eliminando registros…' : '> Guardando cambios en la base de datos…', 'run', 640)
    const { ok, message } = await executeToolCall(meId, tc)
    await termLine(`${ok ? '✓' : '✗'} ${message}`, ok ? 'ok' : 'err', 240)
    await termLine('> Proceso finalizado.', 'in', 150)
    setTerm((t) => (t ? { ...t, done: true, ok } : t))
    updateAction(id, { status: ok ? 'done' : 'error', message })
    if (ok) setCtx(null)
  }

  /* ────────── micrófono (dictado) + manos libres ("Nexus") ────────── */
  function startDictation() {
    if (dictTimerRef.current) window.clearTimeout(dictTimerRef.current)
    window.speechSynthesis?.cancel()
    speech.stopWake() // suelta el micrófono de "Nexus"; el efecto re-arma al terminar
    // Pausa breve: si abrimos el dictado en el mismo instante que se libera el
    // micrófono, el navegador lo cierra de golpe (parece que "no te deja hablar").
    dictTimerRef.current = window.setTimeout(() => {
      speech.start(
        (t) => setInput(t),
        (finalText) => { voiceRef.current = true; sendRef.current(finalText) },
        () => setToast('No pude usar el micrófono. Revisa los permisos (Chrome o Edge).'),
      )
    }, 350)
  }

  function toggleMic() {
    if (speech.listening) { speech.stop(); return }
    startDictation()
  }

  // Manos libres: lee la pregunta/confirmación y abre la voz para responder.
  function askByVoice(text: string) {
    speech.stopWake()
    const canSpeak = !mutedRef.current && typeof window !== 'undefined' && 'speechSynthesis' in window
    if (!canSpeak) { startDictation(); return }
    speak(text, () => startDictation())
  }

  // La última versión del manejador de voz se guarda en un ref para que el
  // reconocedor (memoizado) use SIEMPRE el estado actual (rol, meId, etc.) y no
  // el del primer render.
  const onWakeCmdRef = useRef<(cmd: string) => void>(() => {})
  useEffect(() => {
    sendRef.current = send
    onWakeCmdRef.current = (cmd: string) => {
      if (cmd.length < 4) { startDictation(); return } // solo "Nexus" → abre el modo de voz
      voiceRef.current = true
      send(cmd)
    }
  })

  const enableWake = useCallback(() => {
    speech.startWake(
      (cmd) => onWakeCmdRef.current(cmd),
      (err) => setToast(err === 'unsupported' ? 'El modo manos libres necesita Chrome o Edge.' : 'Dale permiso al micrófono para el modo manos libres.'),
    )
  }, [speech.startWake])

  // Re-arma "Nexus" cuando termina un dictado, si el modo manos libres sigue querido.
  useEffect(() => {
    if (speech.listening || speech.waking || !wakeWantedRef.current) return
    if (pending || awaitingConfirm) return // en medio de un diálogo por voz: no re-armes "Nexus"
    const id = window.setTimeout(() => { if (wakeWantedRef.current && !speech.waking) enableWake() }, 450)
    return () => window.clearTimeout(id)
  }, [speech.listening, speech.waking, enableWake, pending, awaitingConfirm])

  function toggleWake() {
    if (wakeWantedRef.current) {
      wakeWantedRef.current = false
      setHandsFree(false)
      speech.stopWake()
      setToast('Manos libres desactivado')
      return
    }
    wakeWantedRef.current = true
    setHandsFree(true)
    enableWake()
    setToast('Manos libres activo — di "Nexus…"')
  }

  /* ────────── conversación en vivo ────────── */
  function toggleLive(lang = liveLang) {
    if (liveOn) { foreign.stop(); setLiveOn(false); return }
    setLiveLang(lang); setMenu(null); setLiveOn(true)
    foreign.start(
      lang.code,
      async (utterance) => {
        const tr = await translate(utterance, 'español', lang.name)
        if (tr) { push({ role: 'ai', text: tr, trans: { original: utterance, from: lang.label } }); speak(tr) }
      },
      () => { setLiveOn(false); setToast('El modo conversación necesita permiso de micrófono (Chrome o Edge).') },
    )
  }

  /* ────────── archivos / imágenes ────────── */
  async function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setUploading(f.name)
    try {
      const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
      const text = isPdf ? await extractPdfText(f) : await readTextFile(f)
      if (!text.trim()) { setToast('No pude extraer texto de ese archivo.'); setUploading(''); return }
      setAttachment({ name: f.name, kind: 'file', text })
      setToast(`${f.name} — listo para analizar`)
    } catch { setToast('No pude leer el archivo.') }
    setUploading('')
  }

  async function onPickImage(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setUploading(f.name)
    try {
      const b64 = await imageToBase64(f)
      setAttachment({ name: f.name, kind: 'image', b64, dataUrl: `data:${f.type};base64,${b64}` })
      setToast(`${f.name} — lista para analizar`)
    } catch { setToast('No pude leer la imagen.') }
    setUploading('')
  }

  function handleTool(key: string) {
    if (key === 'files') fileRef.current?.click()
    else if (key === 'images') imageRef.current?.click()
    else if (key === 'translate') setMenu((m) => (m === 'translate' ? null : 'translate'))
    else if (key === 'audio') toggleMic()
  }

  function newChat() {
    window.speechSynthesis?.cancel()
    foreign.stop(); setLiveOn(false)
    setMessages([]); setInput(''); setAttachment(null); setPending(null); setTranslateTo(null); setMenu(null); setTerm(null); setAwaitingConfirm(null)
  }

  const home = messages.length === 0
  const listening = speech.listening
  const active = speaking ? 'speaking' : listening || liveOn ? 'listening' : loading ? 'thinking' : 'idle'

  return (
    <div className="neo-nx">
      <div className="neo-nx-main">
        <header className="neo-nx-head">
          {/* Píldora de estado: hora, zona y fecha, como el panel de una cabina */}
          <span className="neo-nx-status">
            <span className={`neo-nx-status-dot ${active !== 'idle' ? 'is-busy' : ''}`} />
            {clock ? (
              <>
                {clock.time}
                <em>·</em>
                {clock.zone}
                <em>·</em>
                {clock.date}
              </>
            ) : (
              <>&nbsp;</>
            )}
          </span>

          <span className="neo-nx-head-state">
            {handsFree ? 'Manos libres · di “Nexus…”' : liveOn ? `En vivo · ${liveLang.label}` : muted ? 'Silencio · solo texto' : ''}
          </span>

          <button className={`neo-nx-iconbtn ${muted ? 'neo-nx-iconbtn--muted' : ''}`} onClick={toggleMute}
            title={muted ? 'Voz apagada — toca para que lea las respuestas' : 'Silenciar la voz (solo leer)'} aria-label="Silenciar voz">
            <Icon name={muted ? 'mute' : 'sound'} size={18} />
          </button>
          {speech.supported && (
            <button className={`neo-nx-iconbtn ${handsFree ? 'neo-nx-iconbtn--on' : ''}`} onClick={toggleWake}
              title={handsFree ? 'Manos libres activo — toca para apagar' : 'Manos libres: di “Nexus”'} aria-label="Manos libres">
              <Icon name="wave" size={18} />
            </button>
          )}
          <button className={`neo-nx-iconbtn ${translateTo ? 'neo-nx-iconbtn--on' : ''}`} onClick={() => setMenu((m) => (m === 'translate' ? null : 'translate'))}
            title="Traducir mis mensajes" aria-label="Traducir">
            <Icon name="translate" size={18} />
          </button>
          <button className={`neo-nx-iconbtn ${liveOn ? 'neo-nx-iconbtn--on' : ''}`} onClick={() => setMenu((m) => (m === 'live' ? null : 'live'))}
            title="Conversación en vivo (traducir lo que otra persona dice)" aria-label="Conversación en vivo">
            <Icon name="globe" size={18} />
          </button>
          <button className="neo-nx-iconbtn" onClick={newChat} title="Nueva conversación" aria-label="Nueva conversación">
            <Icon name="plus" size={18} />
          </button>
        </header>

        <div className="neo-nx-scroll">
          {home ? (
            <div className="neo-nx-hero">
              <div className="neo-nx-hero-l">
                <span className="neo-nx-badge">
                  <i />
                  NEXUS AI ASSISTANT
                </span>

                <h2 className="neo-nx-hero-title">
                  Hola, <b>{name || 'de nuevo'}</b>.
                  <br />
                  ¿En qué puedo ayudarte hoy?
                </h2>

                <p className="neo-nx-hero-sub">
                  {role === 'teacher'
                    ? 'Tu asistente académico inteligente, siempre a tu lado.'
                    : 'Tu compañero de estudio, siempre a tu lado.'}
                </p>

                <div className="neo-nx-cards">
                  {HERO_CARDS[role].map((c, i) => (
                    <button
                      key={c.key}
                      className="neo-nx-card"
                      style={{ animationDelay: `${i * 70}ms` }}
                      onClick={() => (c.tool ? handleTool(c.tool) : send(c.prompt!))}
                    >
                      <span className="neo-nx-card-ic"><Icon name={c.icon} size={17} /></span>
                      <strong>{c.title}</strong>
                      <small>{c.sub}</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className="neo-nx-hero-r">
                <div className="neo-nx-hero-robot" data-state={active}>
                  <span className="neo-nx-hero-orbit" />
                  <span className="neo-nx-hero-glow" />
                  {/* Las cuatro poses van apiladas y se funden entre sí: así el
                      navegador ya las tiene cargadas y el cambio de estado no
                      parpadea (cada PNG pesa cerca de un mega). */}
                  {Object.keys(ROBOT_POSE).map((pose) => (
                    <img
                      key={pose}
                      src={ROBOT_POSE[pose]}
                      data-pose={pose}
                      alt={pose === 'idle' ? 'Nexus' : ''}
                      aria-hidden={pose !== 'idle'}
                    />
                  ))}
                  <span className="neo-nx-hero-floor" />
                </div>
              </div>
            </div>
          ) : (
            <div className="neo-nx-msgs">
              {messages.map((m) => (m.action ? (
                <ActionMsg key={m.id} a={m.action}
                  onConfirm={() => runAction(m.id, m.action!.tc)}
                  onCancel={() => { setAwaitingConfirm(null); updateAction(m.id, { status: 'cancelled' }) }}
                  onEditDesc={(text) => updateAction(m.id, (prev) => ({ tc: { ...prev.tc, args: { ...prev.tc.args, descripcion: text } } }))}
                />
              ) : (
                <MessageRow key={m.id} m={m} onSpeak={() => { voiceRef.current = false; speak(m.text) }} />
              )))}
              {loading && (
                <div className="neo-nx-row neo-nx-row--ai">
                  <span className="neo-nx-av"><img src={ROBOT} alt="" /></span>
                  <div className="neo-nx-typing"><i /><i /><i /></div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <div className="neo-nx-composer-zone">
          {(attachment || translateTo || liveOn) && (
            <div className="neo-nx-chips">
              {attachment && (
                <span className="neo-nx-chip">
                  <Icon name={attachment.kind === 'image' ? 'image' : 'file'} size={13} />{attachment.name}
                  <button onClick={() => setAttachment(null)} aria-label="Quitar"><Icon name="close" size={12} /></button>
                </span>
              )}
              {translateTo && (
                <span className="neo-nx-chip neo-nx-chip--accent">
                  <Icon name="translate" size={13} /> Traduciendo a {translateTo.label}
                  <button onClick={() => setTranslateTo(null)} aria-label="Quitar"><Icon name="close" size={12} /></button>
                </span>
              )}
              {liveOn && (
                <span className="neo-nx-chip neo-nx-chip--live">
                  <span className="neo-nx-live-dot" /> En vivo · {liveLang.label}
                  <button onClick={() => toggleLive()} aria-label="Detener"><Icon name="close" size={12} /></button>
                </span>
              )}
            </div>
          )}

          <div className={`neo-nx-composer ${listening ? 'is-listening' : ''}`}>
            <span className="neo-nx-composer-badge">N</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send() }}
              placeholder={listening ? 'Te estoy escuchando…' : translateTo ? `Escribe para traducir a ${translateTo.label}…` : 'Escribe o pregunta cualquier cosa…'}
              aria-label="Mensaje para Nexus"
            />
            <button className="neo-nx-attach" onClick={() => fileRef.current?.click()} title="Adjuntar archivo" aria-label="Adjuntar archivo"><Icon name="paperclip" size={19} /></button>
            <button className="neo-nx-attach" onClick={() => imageRef.current?.click()} title="Analizar una imagen" aria-label="Analizar imagen"><Icon name="image" size={19} /></button>
            <button className={`neo-nx-mic ${listening ? 'is-on' : ''}`} onClick={toggleMic} aria-label="Hablar"><Icon name="mic" size={19} /></button>
            <button className="neo-nx-send" onClick={() => send()} disabled={loading || (!input.trim() && !attachment)} aria-label="Enviar"><Icon name="send" size={18} /></button>
          </div>

          {/* Atajos de conversación: solo mientras no hay charla empezada */}
          {home && (
            <div className="neo-nx-sugs">
              {SUGGESTIONS[role].map((s, i) => (
                <button key={s} className="neo-nx-sug" style={{ animationDelay: `${i * 60}ms` }} onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}

          <p className="neo-nx-note">Nexus puede cometer errores. Verifica la información importante.</p>
        </div>

        {menu && (
          <div className="neo-nx-menu" role="menu">
            <p className="neo-nx-menu-title">{menu === 'translate' ? 'Traducir mis mensajes a…' : 'Escuchar y traducir desde…'}</p>
            <div className="neo-nx-menu-grid">
              {LANGUAGES.map((l) => (
                <button key={l.code} className="neo-nx-menu-item" onClick={() => {
                  if (menu === 'translate') { setTranslateTo({ label: l.label, name: l.name }); setMenu(null); setToast(`Modo traducir a ${l.label}`) }
                  else toggleLive(l)
                }}>{l.label}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" className="hidden" accept=".pdf,.txt,.md,.csv" onChange={onPickFile} />
      <input ref={imageRef} type="file" className="hidden" accept="image/*" onChange={onPickImage} />

      {listening && (
        <div className="neo-nx-listen" onClick={() => speech.stop()}>
          <div className="neo-nx-listen-card" onClick={(e) => e.stopPropagation()}>
            <button className="neo-nx-listen-x" onClick={() => speech.stop()} aria-label="Detener"><Icon name="close" size={18} /></button>
            <div className="neo-nx-listen-robot"><img src={ROBOT} alt="" /><span /></div>
            <p className="neo-nx-listen-kicker">NEXUS VOICE</p>
            <h3>Te estoy escuchando…</h3>
            <div className="neo-nx-wave">
              {Array.from({ length: 22 }).map((_, i) => <i key={i} style={{ animationDelay: `${i * 0.04}s` }} />)}
            </div>
            <small>Habla con naturalidad. Toca para detener.</small>
          </div>
        </div>
      )}

      {term && (
        <div className={`neo-nx-term ${termClosing ? 'is-closing' : ''}`}>
          <div className="neo-nx-term-bar">
            <span className="neo-nx-term-dot r" /><span className="neo-nx-term-dot y" /><span className="neo-nx-term-dot g" />
            <span className="neo-nx-term-title">{term.title}</span>
            <button className="neo-nx-term-x" onClick={closeTerm} aria-label="Cerrar"><Icon name="close" size={14} /></button>
          </div>
          <div className="neo-nx-term-body">
            {term.lines.map((l, i) => <div key={i} className={`neo-nx-term-line ${l.kind}`}>{l.t}</div>)}
            {!term.done && <div className="neo-nx-term-line run"><span className="neo-nx-term-cursor" /></div>}
          </div>
        </div>
      )}

      {uploading && (
        <div className="neo-nx-upload">
          <span className="neo-nx-upload-spin" />
          <div><strong>Procesando…</strong><small>{uploading}</small></div>
        </div>
      )}

      {toast && <div className="neo-nx-toast">{toast}</div>}
    </div>
  )
}

/**
 * Tarjetas de la portada: lo que Nexus puede hacer por ti, por rol. Unas mandan
 * una orden al asistente y otras abren directamente el selector de archivos.
 */
type HeroCard = { key: string; title: string; sub: string; icon: string; prompt?: string; tool?: string }

const HERO_CARDS: Record<Role, HeroCard[]> = {
  teacher: [
    { key: 'class', title: 'Crear clase', sub: 'Desde cero', icon: 'sparkles', prompt: 'Crea una clase nueva' },
    { key: 'task', title: 'Publicar tarea', sub: 'Para mi clase', icon: 'file', prompt: 'Publica una tarea para mi clase' },
    { key: 'analyze', title: 'Analizar archivo', sub: 'PDF, TXT, etc.', icon: 'paperclip', tool: 'files' },
    { key: 'write', title: 'Generar contenido', sub: 'Con IA', icon: 'translate', prompt: 'Redáctame material de estudio para mi clase' },
  ],
  student: [
    // Va primero porque es lo que más se pregunta, y ahora Nexus lo sabe de
    // verdad: la ficha del estudiante trae sus tareas, fechas y notas.
    { key: 'pending', title: 'Mis pendientes', sub: 'Qué debo entregar', icon: 'file', prompt: '¿Qué tareas tengo pendientes y cuándo vence cada una?' },
    { key: 'explain', title: 'Explicar tema', sub: 'Paso a paso', icon: 'sparkles', prompt: 'Explícame un tema difícil paso a paso' },
    { key: 'plan', title: 'Planear proyecto', sub: 'Con guía', icon: 'file', prompt: 'Ayúdame a planear mi proyecto de clase' },
    { key: 'analyze', title: 'Analizar archivo', sub: 'PDF, TXT, etc.', icon: 'paperclip', tool: 'files' },
    { key: 'quiz', title: 'Practicar examen', sub: 'Con preguntas', icon: 'translate', prompt: 'Practica un examen conmigo' },
  ],
  visitor: [
    { key: 'what', title: 'Qué es NexusForge', sub: 'Conoce la plataforma', icon: 'sparkles', prompt: '¿Qué es NexusForge OS?' },
    { key: 'topic', title: 'Explicar tema', sub: 'De ingeniería', icon: 'file', prompt: 'Explícame un tema de ingeniería' },
    { key: 'analyze', title: 'Analizar archivo', sub: 'PDF, TXT, etc.', icon: 'paperclip', tool: 'files' },
    { key: 'start', title: 'Cómo empezar', sub: 'Primeros pasos', icon: 'translate', prompt: 'Recomiéndame cómo empezar' },
  ],
}

function MessageRow({ m, onSpeak }: { m: Msg; onSpeak: () => void }) {
  if (m.role === 'user') {
    return (
      <div className="neo-nx-row neo-nx-row--user">
        <div className="neo-nx-bubble neo-nx-bubble--user">
          {m.imgPreview && <img className="neo-nx-bubble-img" src={m.imgPreview} alt="" />}
          {m.text && <p>{m.text}</p>}
        </div>
      </div>
    )
  }
  return (
    <div className="neo-nx-row neo-nx-row--ai">
      <span className="neo-nx-av"><img src={ROBOT} alt="Nexus" /></span>
      <div className="neo-nx-bubble neo-nx-bubble--ai">
        {m.trans && <span className="neo-nx-trans-orig"><Icon name="globe" size={12} /> {m.trans.from}: “{m.trans.original}”</span>}
        <p>{m.text}</p>
        <button className="neo-nx-speak" onClick={onSpeak} aria-label="Escuchar"><Icon name="wave" size={14} /></button>
      </div>
    </div>
  )
}

function ActionMsg({ a, onConfirm, onCancel, onEditDesc }: {
  a: ActionState; onConfirm: () => void; onCancel: () => void; onEditDesc: (text: string) => void
}) {
  const danger = a.tc.name.startsWith('eliminar')
  const isTask = a.tc.name === 'crear_tarea'
  const desc = String(a.tc.args.descripcion ?? '')
  return (
    <div className={`neo-nx-action ${danger ? 'is-danger' : ''}`}>
      <div className="neo-nx-action-head">
        <span className="neo-nx-action-icon"><Icon name="sparkles" size={15} /></span>
        <p>{danger ? 'La IA quiere ELIMINAR esto' : 'La IA quiere hacer esto'}</p>
      </div>
      <p className="neo-nx-action-desc">{describeAction(a.tc)}</p>

      {isTask && (a.status === 'pending' || a.status === 'running') && (
        <div className="neo-nx-action-field">
          <p className="neo-nx-action-label"><Icon name="sparkles" size={12} /> Explicación para los estudiantes</p>
          {a.descLoading ? (
            <div className="neo-nx-writing"><span /> La IA está redactando…</div>
          ) : (
            <textarea value={desc} rows={4} disabled={a.status !== 'pending'} onChange={(e) => onEditDesc(e.target.value)}
              placeholder="Puedes escribir la explicación aquí." className="neo-nx-textarea" />
          )}
        </div>
      )}

      {a.warning && a.status === 'pending' && <p className="neo-nx-action-warn">{a.warning}</p>}

      {a.status === 'pending' && (
        <div className="neo-nx-action-btns">
          <button className={danger ? 'neo-nx-btn-danger' : 'neo-nx-btn'} disabled={isTask && a.descLoading} onClick={onConfirm}>
            {danger ? 'Sí, eliminar' : isTask ? 'Publicar tarea' : 'Confirmar'}
          </button>
          <button className="neo-nx-btn-ghost" onClick={onCancel}>Cancelar</button>
        </div>
      )}
      {a.status === 'running' && <p className="neo-nx-action-note">Ejecutando…</p>}
      {a.status === 'done' && <p className="neo-nx-action-ok">✓ {a.message}</p>}
      {a.status === 'cancelled' && <p className="neo-nx-action-note">Cancelado.</p>}
      {a.status === 'error' && <p className="neo-nx-action-err">{a.message}</p>}
    </div>
  )
}
