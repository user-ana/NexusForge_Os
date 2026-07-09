'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import Header from '@/frontend/components/layout/Header'
import { getSession, displayName, addReward, SESSION_EVENT, type Role, type Session } from '@/frontend/session/session'
import {
  getMessages as commGet,
  loadMessages as commLoad,
  sendMessage as commSend,
  subscribeMessages as commSub,
  deleteMessage as commDel,
  COMMCHAT_EVENT,
} from '@/backend/services/communityChat'
import {
  getMessages as aulaGet,
  loadMessages as aulaLoad,
  sendMessage as aulaSend,
  subscribeMessages as aulaSub,
  deleteMessage as aulaDel,
  AULACHAT_EVENT,
} from '@/backend/services/aulaChat'
import { joinPresence, type PresenceUser } from '@/backend/realtime/presence'
import { joinTyping, type TypingHandle } from '@/backend/realtime/typing'
import { getProfile, loadProfiles, subscribeProfiles, PROFILES_EVENT } from '@/backend/services/profiles'
import { getClasses, loadClasses, CLASSES_EVENT, type Klass } from '@/backend/services/classes'
import { loadGroups, groupOf, CGROUPS_EVENT, type ClassGroup } from '@/backend/services/classGroups'
import EmojiButton from '@/frontend/components/ui/EmojiButton'
import Icon3D from '@/frontend/components/ui/Icon3D'
import { GlobeIcon, CodeIcon, BuildingIcon, GearIcon, TrophyIcon, TrashIcon, ExpandIcon } from '@/frontend/components/ui/Icons'
import { useT } from '@/frontend/hooks/useT'

type Chan = { key: string; icon: ReactNode; labelKey?: string; label?: string }
const CATS: { key: string; labelKey: string; channels: Chan[] }[] = [
  {
    key: 'main',
    labelKey: 'chat.cat_main',
    channels: [
      { key: 'community', labelKey: 'chat.ch_community', icon: <GlobeIcon size={16} /> },
      { key: 'soft', label: 'Software', icon: <CodeIcon size={16} /> },
    ],
  },
  {
    key: 'careers',
    labelKey: 'chat.cat_careers',
    channels: [
      { key: 'civil', label: 'Civil', icon: <BuildingIcon size={16} /> },
      { key: 'mech', label: 'Mecánica', icon: <GearIcon size={16} /> },
    ],
  },
  {
    key: 'game',
    labelKey: 'chat.cat_game',
    channels: [{ key: 'retos', labelKey: 'chat.ch_retos', icon: <TrophyIcon size={16} /> }],
  },
]

const CHALLENGES = [
  { q: '¿Qué estructura de datos sigue LIFO?', opts: ['Cola', 'Pila', 'Árbol'], a: 1 },
  { q: '¿Qué patrón crea objetos sin exponer la clase?', opts: ['Singleton', 'Factory', 'Observer'], a: 1 },
  { q: 'Complejidad de la búsqueda binaria:', opts: ['O(n)', 'O(log n)', 'O(n²)'], a: 1 },
]

const RANK_COLOR: Record<string, string> = {
  teacher: '#b89bff',
  student: '#8fd3df',
  visitor: '#9398a1',
}

// Mensaje normalizado (comunidad o aula comparten estos campos)
type ChatMsg = { id: string; author: string; name: string; role?: string; avatar?: string; text: string; edited?: boolean; ts: number }

/* eslint-disable @typescript-eslint/no-explicit-any */
const norm = (m: any): ChatMsg => ({ id: m.id, author: m.author, name: m.name, role: m.role, avatar: m.avatar, text: m.text, edited: m.edited, ts: m.ts })
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Interpreta el "channel" del estado: comunidad / clase / grupo / retos. */
function parseChannel(ch: string):
  | { type: 'comm'; key: string }
  | { type: 'class'; classId: string }
  | { type: 'group'; classId: string; groupId: string }
  | { type: 'retos' } {
  if (ch === 'retos') return { type: 'retos' }
  if (ch.startsWith('class:')) return { type: 'class', classId: ch.slice(6) }
  if (ch.startsWith('group:')) {
    const [, classId, groupId] = ch.split(':')
    return { type: 'group', classId, groupId }
  }
  return { type: 'comm', key: ch }
}

export default function ChatPage() {
  const { t } = useT()
  const [channel, setChannel] = useState('community')
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [text, setText] = useState('')
  const [session, setSession] = useState<Session | null>(null)
  const [online, setOnline] = useState<PresenceUser[]>([])
  const [typing, setTyping] = useState<string[]>([])
  const typingRef = useRef<TypingHandle | null>(null)
  const [reto, setReto] = useState(0)
  const [feedback, setFeedback] = useState<'ok' | 'no' | null>(null)
  const [, setProfTick] = useState(0)
  const [myClasses, setMyClasses] = useState<Klass[]>([])
  const [myGroups, setMyGroups] = useState<{ group: ClassGroup; classId: string }[]>([])
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sync = () => setSession(getSession())
    sync()
    window.addEventListener(SESSION_EVENT, sync)
    return () => window.removeEventListener(SESSION_EVENT, sync)
  }, [])

  // Mensajes del canal activo (comunidad O clase/grupo) + realtime
  useEffect(() => {
    const sel = parseChannel(channel)
    if (sel.type === 'retos') return
    if (sel.type === 'comm') {
      const sync = () => setMsgs(commGet(sel.key).map(norm))
      sync()
      commLoad(sel.key)
      const unsub = commSub(sel.key)
      // Respaldo: refresca cada 3s (asegura ver borrados aunque el realtime falle)
      const poll = setInterval(() => commLoad(sel.key), 3000)
      window.addEventListener(COMMCHAT_EVENT, sync)
      return () => {
        window.removeEventListener(COMMCHAT_EVENT, sync)
        clearInterval(poll)
        unsub()
      }
    }
    // clase (general) o grupo (g:<id>) → tabla 'messages' (igual que el aula)
    const ch = sel.type === 'class' ? 'general' : `g:${sel.groupId}`
    const cid = sel.classId
    const sync = () => setMsgs(aulaGet(cid, ch).map(norm))
    sync()
    aulaLoad(cid, ch)
    const unsub = aulaSub(cid, ch)
    // Respaldo: refresca cada 3s (asegura ver borrados aunque el realtime falle)
    const poll = setInterval(() => aulaLoad(cid, ch), 3000)
    window.addEventListener(AULACHAT_EVENT, sync)
    return () => {
      window.removeEventListener(AULACHAT_EVENT, sync)
      clearInterval(poll)
      unsub()
    }
  }, [channel])

  // Presencia: quién está en línea en la comunidad
  useEffect(() => {
    const s = getSession()
    if (!s?.id) return
    return joinPresence(
      'community-online',
      { id: s.id, name: displayName(s), role: s.role ?? 'student' },
      setOnline,
    )
  }, [session?.id])

  // "escribiendo…" por canal
  useEffect(() => {
    const s = getSession()
    if (!s?.id || channel === 'retos') return
    const h = joinTyping(`comm-${channel}`, { id: s.id, name: displayName(s) }, setTyping)
    typingRef.current = h
    return () => {
      h.stop()
      typingRef.current = null
      setTyping([])
    }
  }, [channel, session?.id])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [msgs, channel])

  // perfiles en vivo (foto/nombre)
  useEffect(() => {
    const sync = () => setProfTick((t) => t + 1)
    const unsub = subscribeProfiles()
    window.addEventListener(PROFILES_EVENT, sync)
    return () => {
      window.removeEventListener(PROFILES_EVENT, sync)
      unsub()
    }
  }, [])
  useEffect(() => {
    loadProfiles(msgs.map((m) => m.author))
  }, [msgs])

  // Mis clases + mis grupos (para el menú lateral)
  useEffect(() => {
    const sync = () => {
      const s = getSession()
      const uid = s?.id ?? ''
      const cls = getClasses()
      setMyClasses(cls)
      const grps: { group: ClassGroup; classId: string }[] = []
      cls.forEach((c) => {
        const g = groupOf(c.id, uid)
        if (g) grps.push({ group: g, classId: c.id })
      })
      setMyGroups(grps)
    }
    sync()
    loadClasses().then(() => {
      // carga los grupos de cada clase para saber el escuadrón del usuario
      getClasses().forEach((c) => loadGroups(c.id))
    })
    const ev = [CLASSES_EVENT, CGROUPS_EVENT, SESSION_EVENT]
    ev.forEach((e) => window.addEventListener(e, sync))
    return () => ev.forEach((e) => window.removeEventListener(e, sync))
  }, [])

  const me = displayName(session)

  function send() {
    const v = text.trim()
    if (!v || !session?.id) return
    const sel = parseChannel(channel)
    const common = { author: session.id, name: me, role: (session.role ?? 'student') as Role, avatar: session.avatar, text: v }
    if (sel.type === 'comm') commSend({ channel: sel.key, ...common })
    else if (sel.type === 'class') aulaSend({ classId: sel.classId, channel: 'general', ...common })
    else if (sel.type === 'group') aulaSend({ classId: sel.classId, channel: `g:${sel.groupId}`, ...common })
    setText('')
  }

  function delMsg(id: string) {
    parseChannel(channel).type === 'comm' ? commDel(id) : aulaDel(id)
  }

  function answer(i: number) {
    if (feedback === 'ok') return
    if (i === CHALLENGES[reto].a) {
      setFeedback('ok')
      // El catedrático no participa de la capa de juego: acierta pero no gana XP.
      if (getSession()?.role !== 'teacher') addReward(0, 50)
    } else setFeedback('no')
  }

  const channelLabel = (() => {
    const sel = parseChannel(channel)
    if (sel.type === 'class') return myClasses.find((c) => c.id === sel.classId)?.name ?? 'Clase'
    if (sel.type === 'group') return myGroups.find((g) => g.group.id === sel.groupId)?.group.name ?? 'Grupo'
    for (const c of CATS) for (const ch of c.channels) if (ch.key === channel) return (ch.labelKey ? t(ch.labelKey) : ch.label ?? '') as string
    return ''
  })()

  return (
    <>
      <Header title={t('head.chat.title')} subtitle={t('head.chat.sub')} />

      <main className="flex flex-1 overflow-hidden p-4 gap-4">
        {/* Canales */}
        <aside className="neo-panel neo-noscroll hidden w-56 flex-shrink-0 flex-col gap-4 overflow-y-auto p-4 md:flex">
          {CATS.map((cat) => (
            <div key={cat.key}>
              <p className="neo-label mb-2 px-1">{t(cat.labelKey)}</p>
              <div className="space-y-1">
                {cat.channels.map((ch) => (
                  <button
                    key={ch.key}
                    onClick={() => setChannel(ch.key)}
                    className={`neo-chan ${channel === ch.key ? 'neo-chan--active' : ''} ${ch.key === 'retos' ? 'neo-chan--reto' : ''}`}
                  >
                    <span className="text-base">{ch.icon}</span>
                    {ch.labelKey ? t(ch.labelKey) : ch.label}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Mis clases (chat inline aquí) */}
          {myClasses.length > 0 && (
            <div>
              <p className="neo-label mb-2 px-1">Mis clases</p>
              <div className="space-y-1">
                {myClasses.map((c) => {
                  const key = `class:${c.id}`
                  return (
                    <div key={c.id} className="flex items-center gap-1">
                      <button onClick={() => setChannel(key)} className={`neo-chan flex-1 ${channel === key ? 'neo-chan--active' : ''}`}>
                        {c.emblem ? <Icon3D src={c.emblem} alt="" size={18} fallback="◆" /> : <span className="neo-aula-hash">#</span>}
                        <span className="truncate">{c.name}</span>
                      </button>
                      <Link href={`/aula/${c.id}`} className="neo-chan !px-2" title="Abrir aula completa"><ExpandIcon size={14} /></Link>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Mis grupos (chat inline aquí) */}
          {myGroups.length > 0 && (
            <div>
              <p className="neo-label mb-2 px-1">Mis grupos</p>
              <div className="space-y-1">
                {myGroups.map(({ group, classId }) => {
                  const key = `group:${classId}:${group.id}`
                  return (
                    <div key={group.id} className="flex items-center gap-1">
                      <button onClick={() => setChannel(key)} className={`neo-chan flex-1 ${channel === key ? 'neo-chan--active' : ''}`}>
                        <Icon3D src={group.icon} alt="" size={18} fallback="◆" />
                        <span className="truncate">{group.name}</span>
                      </button>
                      <Link href={`/aula/${classId}?ch=${group.id}`} className="neo-chan !px-2" title="Abrir aula completa"><ExpandIcon size={14} /></Link>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </aside>

        {/* Mensajes */}
        <section className="neo-panel flex flex-1 flex-col overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
            <p className="font-semibold text-white"># {channelLabel}</p>
            <p className="flex items-center gap-1.5 text-[11px] text-neutral-500">
              <span className="neo-dot-status" style={{ background: '#34d399' }} /> {online.length} {t('chat.online_now')}
            </p>
          </div>

          {channel === 'retos' ? (
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
              <span className="neo-chip neo-chip--progress self-start inline-flex items-center gap-1"><TrophyIcon size={13} /> {t('chat.reto_label')}</span>
              <p className="text-base font-medium text-white">{CHALLENGES[reto].q}</p>
              <div className="max-w-md space-y-2">
                {CHALLENGES[reto].opts.map((o, i) => (
                  <button
                    key={o}
                    onClick={() => answer(i)}
                    className={`neo-reto-opt ${feedback && i === CHALLENGES[reto].a ? 'neo-reto-opt--ok' : ''} ${feedback === 'no' && i !== CHALLENGES[reto].a ? 'neo-reto-opt--off' : ''}`}
                  >
                    {o}
                  </button>
                ))}
              </div>
              {feedback === 'ok' && (
                <div className="flex max-w-md items-center justify-between rounded-xl bg-[rgba(52,211,153,0.1)] px-3 py-2 text-sm text-[#6ee7b7]">
                  {t('chat.correct')}
                  <button onClick={() => { setReto((r) => (r + 1) % CHALLENGES.length); setFeedback(null) }} className="neo-btn-ghost text-xs">
                    {t('chat.next_reto')}
                  </button>
                </div>
              )}
              {feedback === 'no' && <p className="text-sm text-[#f0a3a3]">{t('chat.wrong')}</p>}
            </div>
          ) : (
            <div ref={listRef} className="neo-chat-scroll flex flex-1 flex-col gap-2.5 overflow-y-auto p-5">
              {msgs.length === 0 ? (
                <p className="m-auto text-sm text-neutral-600">No hay mensajes aún. Sé el primero en escribir.</p>
              ) : (
                msgs.map((m, i) => {
                  const prev = msgs[i - 1]
                  const grouped = !!prev && prev.author === m.author && m.ts - prev.ts < 5 * 60 * 1000
                  return (
                    <CommBubble
                      key={m.id}
                      m={m}
                      grouped={grouped}
                      mine={m.author === session?.id}
                      onDelete={() => delMsg(m.id)}
                    />
                  )
                })
              )}
            </div>
          )}

          {/* Input */}
          {channel !== 'retos' && (
            <div className="relative border-t border-white/5 p-3">
              {typing.length > 0 && (
                <p className="neo-typing px-1">
                  <span className="neo-typing-dots"><span /><span /><span /></span>
                  {typing.join(', ')} {typing.length === 1 ? 'está' : 'están'} escribiendo…
                </p>
              )}
              <div className="flex items-center gap-2">
                <EmojiButton onPick={(e) => setText((x) => x + e)} className="neo-chat-tool" />
                <input value={text} onChange={(e) => { setText(e.target.value); typingRef.current?.notify() }} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder={t('chat.placeholder')} className="neo-input flex-1" />
                <button onClick={send} className="neo-chat-send" aria-label="Enviar"><SendIcon /></button>
              </div>
            </div>
          )}
        </section>

        {/* En línea (real) */}
        <aside className="neo-panel neo-noscroll hidden w-52 flex-shrink-0 flex-col gap-3 overflow-y-auto p-4 lg:flex">
          <p className="neo-label px-1">{t('chat.online_now')} · {online.length}</p>
          {online.length === 0 ? (
            <p className="px-1 text-xs text-neutral-600">Nadie más en línea ahora.</p>
          ) : (
            online.map((u) => (
              <div key={u.id} className="flex items-center gap-2.5">
                <span className="neo-chat-avatar !h-8 !w-8" style={{ background: RANK_COLOR[u.role ?? 'student'] ?? '#a78bfa' }}>
                  {u.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm text-neutral-200">{u.name}</p>
                  <p className="text-[10px] text-neutral-500">{u.role === 'teacher' ? 'Catedrático' : u.role === 'visitor' ? 'Visitante' : 'Estudiante'}</p>
                </div>
              </div>
            ))
          )}
        </aside>
      </main>
    </>
  )
}

function CommBubble({
  m,
  grouped,
  mine,
  onDelete,
}: {
  m: ChatMsg
  grouped: boolean
  mine: boolean
  onDelete: () => void
}) {
  const color = RANK_COLOR[m.role ?? 'student'] ?? '#a78bfa'
  const prof = getProfile(m.author)
  const name = prof?.name ?? m.name
  const avatar = prof?.avatar ?? m.avatar
  return (
    <div className={`neo-bubble-row group ${mine ? 'neo-bubble-row--mine' : ''}`}>
      {!mine &&
        (grouped ? (
          <span className="neo-bubble-spacer" />
        ) : (
          <span className="neo-aula-msg-av overflow-hidden" style={{ background: color }}>
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="h-full w-full rounded-full object-cover" />
            ) : (
              name.charAt(0).toUpperCase()
            )}
          </span>
        ))}
      <div className="neo-bubble-col">
        {!grouped && (
          <p className="neo-bubble-meta">
            {!mine && <span className="font-semibold" style={{ color }}>{name}</span>}
            {!mine && m.role === 'teacher' && <span className="neo-aula-badge">Catedrático</span>}
            <span className="text-neutral-600">{fmtTime(m.ts)}</span>
          </p>
        )}
        <div className="neo-bubble-wrap">
          <div className={`neo-bubble ${mine ? 'neo-bubble--mine' : ''}`}>
            {m.text}
            {m.edited && <span className="neo-bubble-edited">(editado)</span>}
          </div>
          {mine && (
            <div className="neo-bubble-actions">
              <button onClick={onDelete} title="Eliminar" className="hover:text-red-400"><TrashIcon size={15} /></button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}
