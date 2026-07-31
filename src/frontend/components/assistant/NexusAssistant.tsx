'use client'
/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useSpeech, speechVoiceFor } from '@/frontend/hooks/useSpeech'
import { useForeignListen } from './useForeignListen'
import { getSession, displayName, SESSION_EVENT, type Role } from '@/frontend/session/session'
import { supabase } from '@/backend/supabase'
import { getAssistantContext } from '@/backend/services/studentSearch'
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
import { LANGUAGES, extractPdfText, readTextFile, imageToBase64, toPlain } from './nexusUtils'
import { Icon } from './NexusIcons'

const ROBOT = '/assets/nexus-robot.png'
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
type Term = { title: string; lines: TermLine[]; done: boolean }

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

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(''), 2800)
    return () => window.clearTimeout(id)
  }, [toast])

  useEffect(() => () => {
    if (dictTimerRef.current) window.clearTimeout(dictTimerRef.current)
    foreign.stop(); speech.stopWake(); window.speechSynthesis?.cancel()
  }, [foreign.stop, speech.stopWake])

  /* ────────── voz ────────── */
  const speak = useCallback((text: string, onDone?: () => void) => {
    if (mutedRef.current || typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const clean = toPlain(text)
    if (!clean) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(clean.slice(0, 500))
    // La voz se elige por el idioma del texto (inglés → voz inglesa, etc.).
    const { voice, lang } = speechVoiceFor(clean)
    if (voice) { u.voice = voice; u.lang = voice.lang } else u.lang = lang
    u.onstart = () => setSpeaking(true)
    u.onend = () => { setSpeaking(false); onDone?.() }
    u.onerror = () => { setSpeaking(false); onDone?.() }
    window.speechSynthesis.speak(u)
  }, [])

  const speakMaybe = useCallback((text: string) => {
    if (voiceRef.current) { speak(text); voiceRef.current = false }
  }, [speak])

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
    if (awaitingConfirm && voiceRef.current) {
      voiceRef.current = false
      const a = awaitingConfirm
      setAwaitingConfirm(null)
      push({ role: 'user', text: q })
      const yes = /\b(s[ií]|confirm\w*|dale|publica\w*|adelante|hazlo|ok|correcto|claro|as[ií])\b/i.test(q)
      const no = /\b(no|cancel\w*|mejor no|espera|det[eé]n\w*)\b/i.test(q)
      if (yes) runAction(a.id, a.tc)
      else if (no) updateAction(a.id, { status: 'cancelled' })
      else { push({ role: 'ai', text: '¿Lo confirmo o lo cancelo? Di "sí" o "no".' }); setAwaitingConfirm(a); askByVoice('¿Confirmo o cancelo?') }
      return
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
      const payload: Record<string, unknown> = { question: askText, role, history: recentHistory() }
      if (attach?.text) { payload.context = attach.text; payload.contextLabel = attach.name }
      if (attach?.b64) { payload.image = attach.b64 }
      const { ok, data } = await postJSON('/api/nexus', payload)
      if (ok && typeof data.answer === 'string') { push({ role: 'ai', text: data.answer }); speakMaybe(data.answer) }
      else push({ role: 'ai', text: typeof data.error === 'string' ? data.error : 'No pude responder ahora. Intenta de nuevo.' })
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
    setTerm((t) => (t ? { ...t, done: true } : t))
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
          <span className="neo-nx-avatar" data-state={active}><img src={ROBOT} alt="Nexus" /></span>
          <div className="min-w-0 flex-1">
            <p className="neo-nx-head-title">Nexus</p>
            <p className="neo-nx-head-sub">
              {handsFree ? 'Manos libres · di “Nexus…”' : liveOn ? `Conversación en vivo · ${liveLang.label}` : muted ? 'Silencio · solo texto' : 'Tu asistente inteligente'}
            </p>
          </div>
          <button className={`neo-nx-iconbtn ${muted ? 'neo-nx-iconbtn--muted' : ''}`} onClick={() => setMuted((v) => !v)}
            title={muted ? 'Voz apagada — toca para que lea las respuestas' : 'Silenciar la voz (solo leer)'} aria-label="Silenciar voz">
            <Icon name={muted ? 'mute' : 'sound'} size={18} />
          </button>
          {speech.supported && (
            <button className={`neo-nx-iconbtn ${handsFree ? 'neo-nx-iconbtn--on' : ''}`} onClick={toggleWake}
              title={handsFree ? 'Manos libres activo — toca para apagar' : 'Manos libres: di “Nexus”'} aria-label="Manos libres">
              <Icon name="wave" size={18} />
            </button>
          )}
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
              <div className="neo-nx-hero-robot" data-state={active}>
                <span className="neo-nx-hero-glow" />
                <img src={ROBOT} alt="Nexus" />
              </div>
              <h2>Hola{name ? `, ${name}` : ''}. ¿Cómo puedo ayudarte?</h2>
              <p>{role === 'teacher'
                ? 'Pídeme crear clases o tareas, redactar material, traducir o analizar un archivo.'
                : 'Puedo explicarte un tema, ayudarte a planear, traducir en vivo o analizar tus archivos.'}</p>
              <div className="neo-nx-sugs">
                {SUGGESTIONS[role].map((s, i) => (
                  <button key={s} className="neo-nx-sug" style={{ animationDelay: `${i * 60}ms` }} onClick={() => send(s)}>
                    <Icon name="sparkles" size={14} />{s}
                  </button>
                ))}
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
          <div className="neo-nx-tools">
            {TOOLS.map((t, i) => (
              <button key={t.key} className={`neo-nx-tool neo-nx-tool--${t.tone} ${t.key === 'audio' && listening ? 'is-on' : ''}`}
                style={{ animationDelay: `${i * 0.4}s` }} onClick={() => handleTool(t.key)}>
                <span className="neo-nx-tool-icon"><Icon name={t.icon} size={20} /></span>
                <span className="neo-nx-tool-text"><strong>{t.title}</strong><small>{t.sub}</small></span>
              </button>
            ))}
          </div>

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
            <button className="neo-nx-attach" onClick={() => fileRef.current?.click()} aria-label="Adjuntar archivo"><Icon name="paperclip" size={19} /></button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send() }}
              placeholder={listening ? 'Te estoy escuchando…' : translateTo ? `Escribe para traducir a ${translateTo.label}…` : 'Pregúntame lo que quieras…'}
              aria-label="Mensaje para Nexus"
            />
            <button className={`neo-nx-mic ${listening ? 'is-on' : ''}`} onClick={toggleMic} aria-label="Hablar"><Icon name="mic" size={19} /></button>
            <button className="neo-nx-send" onClick={() => send()} disabled={loading || (!input.trim() && !attachment)} aria-label="Enviar"><Icon name="send" size={18} /></button>
          </div>
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
        <div className="neo-nx-term">
          <div className="neo-nx-term-bar">
            <span className="neo-nx-term-dot r" /><span className="neo-nx-term-dot y" /><span className="neo-nx-term-dot g" />
            <span className="neo-nx-term-title">{term.title}</span>
            <button className="neo-nx-term-x" onClick={() => setTerm(null)} aria-label="Cerrar"><Icon name="close" size={14} /></button>
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

const TOOLS: { key: string; title: string; sub: string; icon: string; tone: string }[] = [
  { key: 'files', title: 'Archivos', sub: 'PDF, TXT y más', icon: 'file', tone: 'cyan' },
  { key: 'images', title: 'Imágenes', sub: 'Analiza tus fotos', icon: 'image', tone: 'violet' },
  { key: 'translate', title: 'Traducir', sub: 'Más de 8 idiomas', icon: 'translate', tone: 'blue' },
  { key: 'audio', title: 'Hablar', sub: 'Conversa con Nexus', icon: 'wave', tone: 'indigo' },
]

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
