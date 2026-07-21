'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  getNotifications,
  loadNotifications,
  subscribeNotifications,
  markRead,
  markAllRead,
  unreadCount,
  NOTIF_EVENT,
  type Notif,
} from '@/backend/services/notifications'

export default function NotificationBell() {
  const router = useRouter()
  const [items, setItems] = useState<Notif[]>([])
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setMounted(true)
    const sync = () => setItems([...getNotifications()])
    window.addEventListener(NOTIF_EVENT, sync)
    loadNotifications()
    const off = subscribeNotifications()
    return () => {
      window.removeEventListener(NOTIF_EVENT, sync)
      off()
    }
  }, [])

  const unread = unreadCount()

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 10, right: window.innerWidth - r.right })
    }
    setOpen((o) => !o)
  }

  function openItem(n: Notif) {
    markRead(n.id)
    setOpen(false)
    if (n.link) router.push(n.link)
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className={`neo-bell ${open ? 'neo-bell--open' : ''}`}
        title="Notificaciones"
        aria-label={`Notificaciones${unread ? `, ${unread} sin leer` : ''}`}
      >
        <BellIcon ringing={unread > 0} />
        {unread > 0 && <span className="neo-bell-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open &&
        mounted &&
        createPortal(
          <>
            <div className="neo-menu-backdrop" onClick={() => setOpen(false)} />
            <div className="neo-notif-panel" style={{ position: 'fixed', top: pos.top, right: pos.right }}>
              <div className="neo-notif-head">
                <span>Notificaciones</span>
                {unread > 0 && (
                  <button onClick={() => markAllRead()} className="neo-notif-readall">
                    Marcar todas leídas
                  </button>
                )}
              </div>

              <div className="neo-notif-list">
                {items.length === 0 ? (
                  <div className="neo-notif-empty">
                    <BellIcon ringing={false} />
                    <p>No tienes notificaciones</p>
                  </div>
                ) : (
                  items.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => openItem(n)}
                      className={`neo-notif-item ${n.read ? '' : 'neo-notif-item--unread'}`}
                    >
                      <span className={`neo-notif-dot neo-notif-dot--${n.type}`} />
                      <span className="neo-notif-body">
                        <span className="neo-notif-title">{n.title}</span>
                        {n.body && <span className="neo-notif-text">{n.body}</span>}
                        <span className="neo-notif-time">{timeAgo(n.ts)}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  )
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'hace un momento'
  const m = Math.floor(s / 60)
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d < 7) return `hace ${d} d`
  return new Date(ts).toLocaleDateString()
}

function BellIcon({ ringing }: { ringing: boolean }) {
  return (
    <svg
      className={ringing ? 'neo-bell-ring' : ''}
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}
