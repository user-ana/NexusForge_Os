'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useT } from '@/frontend/hooks/useT'
import { getSession, SESSION_EVENT, type Role } from '@/frontend/session/session'

const BASE = [
  { href: '/dashboard', key: 'nav.dashboard' },
  { href: '/dashboard/chat', key: 'nav.chat' },
]
const NAV_BY_ROLE: Record<Role, { href: string; key: string }[]> = {
  student: [
    { href: '/dashboard/rewards', key: 'nav.rewards' },
    { href: '/dashboard/classes', key: 'nav.classes' },
  ],
  teacher: [
    { href: '/dashboard/classes', key: 'nav.classes' },
    { href: '/dashboard/periods', key: 'nav.periods' },
  ],
  visitor: [
    { href: '/dashboard/classes', key: 'nav.classes' },
  ],
}

export default function Sidebar() {
  const pathname = usePathname()
  const { t } = useT()
  const [role, setRole] = useState<Role>('student')

  useEffect(() => {
    const sync = () => setRole(getSession()?.role ?? 'student')
    sync()
    window.addEventListener(SESSION_EVENT, sync)
    return () => window.removeEventListener(SESSION_EVENT, sync)
  }, [])

  const NAV = [...BASE, ...NAV_BY_ROLE[role]]

  return (
    <aside className="neo-sidebar w-64 h-screen flex flex-col">
      <div className="p-6">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="neo-brand-badge">N</div>
          <div>
            <h2 className="font-semibold text-white tracking-wide">
              Nexus<span className="text-neutral-500">Forge</span>
            </h2>
            <p className="text-[10px] tracking-[0.3em] text-neutral-500">OS</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        {NAV.map((item) => {
          const active =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`neo-navlink ${active ? 'neo-navlink--active' : ''}`}
            >
              {t(item.key)}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
