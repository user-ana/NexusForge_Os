'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession, displayName, addReward, SESSION_EVENT, type Session } from '@/frontend/session/session'
import {
  getMessages,
  loadMessages,
  sendMessage,
  subscribeMessages,
  COMMCHAT_EVENT,
  type CommMsg,
} from '@/backend/services/communityChat'
import { joinPresence, type PresenceUser } from '@/backend/realtime/presence'
import { getProfile, loadProfiles, subscribeProfiles, PROFILES_EVENT } from '@/backend/services/profiles'
import { getClasses, loadClasses, CLASSES_EVENT, type Klass } from '@/backend/services/classes'
import { loadGroups, groupOf, CGROUPS_EVENT, type ClassGroup } from '@/backend/services/classGroups'
import Icon3D from '@/frontend/components/ui/Icon3D'
import EmojiButton from '@/frontend/components/ui/EmojiButton'
import { TrophyIcon } from '@/frontend/components/ui/Icons'
import { useT } from '@/frontend/hooks/useT'

type Channel = 'general' | 'group' | 'class' | 'retos'

const CHALLENGES = [
  { q: '¿Qué estructura de datos sigue el principio LIFO?', opts: ['Cola', 'Pila', 'Árbol'], a: 1 },
  { q: '¿Qué patrón crea objetos sin exponer la clase exacta?', opts: ['Singleton', 'Factory', 'Observer'], a: 1 },
  { q: 'Complejidad de la búsqueda binaria:', opts: ['O(n)', 'O(log n)', 'O(n²)'], a: 1 },
  { q: '¿Qué ley relaciona voltaje, corriente y resistencia?', opts: ['Ley de Ohm', 'Ley de Hooke', 'Ley de Boyle'], a: 0 },
  { q: 'En SQL, ¿qué comando elimina una tabla completa?', opts: ['DELETE', 'DROP', 'TRUNCATE'], a: 1 },
]

const RANK_COLOR: Record<string, string> = { teacher: '#b89bff', student: '#8fd3df', visitor: '#9398a1' }

export default function LiveChat() {
  const { t } = useT()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [channel, setChannel] = useState<Channel>('general')
  const [msgs, setMsgs] = useState<CommMsg[]>([])
  const [text, setText] = useState('')
  const [session, setSession] = useState<Session | null>(null)
  const [online, setOnline] = useState<PresenceUser[]>([])
  const [, setProfTick] = useState(0)
  const [classes, setClasses] = useState<Klass[]>([])
  const [groups, setGroups] = useState<{ group: ClassGroup; classId: string }[]>([])
  const [reto, setReto] = useState(0)
  const [feedback, setFeedback] = useState<'ok' | 'no' | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
    const sync = () => setSession(getSession())
    sync()
    window.addEventListener(SESSION_EVENT, sync)
    return () => window.removeEventListener(SESSION_EVENT, sync)
  }, [])

  // Chat de comunidad real (canal 'community') + realtime
  useEffect(() => {
    const sync = () => setMsgs(getMessages('community'))
    sync()
    loadMessages('community')
    const unsub = subscribeMessages('community')
    window.addEventListener(COMMCHAT_EVENT, sync)
    return () => {
      window.removeEventListener(COMMCHAT_EVENT, sync)
      unsub()
    }
  }, [])

  // Presencia (en línea) — activa siempre que el widget esté montado
  useEffect(() => {
    const s = getSession()
    if (!s?.id) return
    return joinPresence('community-online', { id: s.id, name: displayName(s), role: s.role ?? 'student' }, setOnline)
  }, [session?.id])

  // Perfiles en vivo
  useEffect(() => {
    const sync = () => setProfTick((x) => x + 1)
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

  // Mis clases + grupos (para las pestañas Clase / Grupo)
  useEffect(() => {
    const sync = () => {
      const uid = getSession()?.id ?? ''
      const cls = getClasses()
      setClasses(cls)
      const grps: { group: ClassGroup; classId: string }[] = []
      cls.forEach((c) => {
        const g = groupOf(c.id, uid)
        if (g) grps.push({ group: g, classId: c.id })
      })
      setGroups(grps)
    }
    sync()
    loadClasses().then(() => getClasses().forEach((c) => loadGroups(c.id)))
    const ev = [CLASSES_EVENT, CGROUPS_EVENT, SESSION_EVENT]
    ev.forEach((e) => window.addEventListener(e, sync))
    return () => ev.forEach((e) => window.removeEventListener(e, sync))
  }, [])

  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [msgs, channel, open])

  const me = displayName(session)

  function send() {
    const v = text.trim()
    if (!v || !session?.id) return
    sendMessage({ channel: 'community', author: session.id, name: me, role: session.role, avatar: session.avatar, text: v })
    setText('')
  }

  function answer(i: number) {
    if (feedback === 'ok') return
    if (i === CHALLENGES[reto].a) {
      setFeedback('ok')
      // El catedrático no participa de la capa de juego: acierta pero no gana XP.
      if (getSession()?.role !== 'teacher') addReward(0, 50)
    } else setFeedback('no')
  }
  function nextReto() {
    setReto((r) => (r + 1) % CHALLENGES.length)
    setFeedback(null)
  }

  function goAula(classId: string, ch?: string) {
    setOpen(false)
    router.push(ch ? `/aula/${classId}?ch=${ch}` : `/aula/${classId}`)
  }

  if (!mounted) return null

  const CHANNELS: { key: Channel; label: string }[] = [
    { key: 'general', label: t('chat.ch_general') },
    { key: 'group', label: t('chat.ch_group') },
    { key: 'class', label: t('chat.ch_class') },
    { key: 'retos', label: t('chat.ch_retos') },
  ]

  return (
    <>
      <button onClick={() => setOpen((o) => !o)} className={`neo-chat-fab ${open ? 'neo-chat-fab--open' : ''}`} aria-label={t('chat.title')}>
        {open ? <CloseIcon /> : <ChatIcon />}
        {!open && <span className="neo-chat-fab-dot" />}
      </button>

      {open && (
        <div className="neo-chat">
          <div className="neo-chat-head">
            <div>
              <p className="text-sm font-semibold text-white">{t('chat.title')}</p>
              <p className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                <span className="neo-dot-status" style={{ background: '#34d399' }} />
                {online.length} {t('chat.online')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setOpen(false); router.push('/dashboard/chat') }}
                className="text-neutral-500 hover:text-accent-violet"
                title={t('chat.expand')}
                aria-label={t('chat.expand')}
              >
                <ExpandIcon />
              </button>
              <button onClick={() => setOpen(false)} className="text-neutral-500 hover:text-white">
                <CloseIcon />
              </button>
            </div>
          </div>

          {/* Canales */}
          <div className="neo-chat-tabs">
            {CHANNELS.map((c) => (
              <button
                key={c.key}
                onClick={() => setChannel(c.key)}
                className={`neo-chat-tab ${channel === c.key ? 'neo-chat-tab--active' : ''} ${c.key === 'retos' ? 'neo-chat-tab--reto' : ''}`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {channel === 'retos' ? (
            <RetoView reto={CHALLENGES[reto]} feedback={feedback} onAnswer={answer} onNext={nextReto} t={t} />
          ) : channel === 'group' ? (
            <LinkList
              empty="No estás en ningún grupo aún. Tu catedrático te asignará a uno."
              items={groups.map(({ group, classId }) => ({
                id: group.id,
                name: group.name,
                icon: group.icon,
                onClick: () => goAula(classId, group.id),
              }))}
            />
          ) : channel === 'class' ? (
            <LinkList
              empty="No estás inscrito en ninguna clase. Únete con un código en Mis Clases."
              items={classes.map((c) => ({
                id: c.id,
                name: c.name,
                icon: c.emblem,
                onClick: () => goAula(c.id),
              }))}
            />
          ) : (
            <div ref={listRef} className="neo-chat-list">
              {msgs.length === 0 ? (
                <p className="m-auto text-sm text-neutral-600">Sé el primero en saludar.</p>
              ) : (
                msgs.map((m) => {
                  const prof = getProfile(m.author)
                  const name = prof?.name ?? m.name
                  const avatar = prof?.avatar ?? m.avatar
                  const color = RANK_COLOR[m.role ?? 'student'] ?? '#a78bfa'
                  const mine = m.author === session?.id
                  return (
                    <div key={m.id} className={`neo-chat-msg ${mine ? 'neo-chat-msg--mine' : ''}`}>
                      <span className="neo-chat-avatar overflow-hidden" style={{ background: color }}>
                        {avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={avatar} alt="" className="h-full w-full rounded-full object-cover" />
                        ) : (
                          name.charAt(0).toUpperCase()
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-xs">
                          <span className="font-semibold" style={{ color }}>{name}</span>
                          {m.role === 'teacher' && <span className="neo-chat-rank">Catedrático</span>}
                        </p>
                        <p className="text-sm text-neutral-200 break-words">{m.text}</p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {channel === 'general' && (
            <div className="neo-chat-input">
              <EmojiButton onPick={(e) => setText((x) => x + e)} className="neo-chat-tool" />
              <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder={t('chat.placeholder')} className="neo-input flex-1" />
              <button onClick={send} className="neo-chat-send" aria-label="Enviar"><SendIcon /></button>
            </div>
          )}
        </div>
      )}
    </>
  )
}

function LinkList({ items, empty }: { items: { id: string; name: string; icon?: string; onClick: () => void }[]; empty: string }) {
  if (items.length === 0) {
    return <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-neutral-500">{empty}</div>
  }
  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
      {items.map((it) => (
        <button key={it.id} onClick={it.onClick} className="neo-chan">
          {it.icon ? <Icon3D src={it.icon} alt="" size={20} fallback="◆" /> : <span className="neo-aula-hash">#</span>}
          <span className="truncate">{it.name}</span>
          <span className="ml-auto text-accent-violet">→</span>
        </button>
      ))}
    </div>
  )
}

function RetoView({
  reto,
  feedback,
  onAnswer,
  onNext,
  t,
}: {
  reto: { q: string; opts: string[]; a: number }
  feedback: 'ok' | 'no' | null
  onAnswer: (i: number) => void
  onNext: () => void
  t: (k: string) => string
}) {
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      <span className="neo-chip neo-chip--progress self-start inline-flex items-center gap-1"><TrophyIcon size={13} /> {t('chat.reto_label')}</span>
      <p className="text-sm font-medium text-white">{reto.q}</p>
      <div className="space-y-2">
        {reto.opts.map((o, i) => {
          const correct = feedback && i === reto.a
          const wrong = feedback === 'no' && i !== reto.a
          return (
            <button
              key={o}
              onClick={() => onAnswer(i)}
              className={`neo-reto-opt ${correct ? 'neo-reto-opt--ok' : ''} ${wrong ? 'neo-reto-opt--off' : ''}`}
            >
              {o}
            </button>
          )
        })}
      </div>
      {feedback === 'ok' && (
        <div className="flex items-center justify-between rounded-xl bg-[rgba(52,211,153,0.1)] px-3 py-2 text-sm text-[#6ee7b7]">
          {t('chat.correct')}
          <button onClick={onNext} className="neo-btn-ghost text-xs">{t('chat.next_reto')}</button>
        </div>
      )}
      {feedback === 'no' && <p className="text-sm text-[#f0a3a3]">{t('chat.wrong')}</p>}
    </div>
  )
}

function ChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}
function ExpandIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  )
}
function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}
