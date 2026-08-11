'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/frontend/components/layout/Header'
import TeacherPanel from '@/frontend/components/dashboard/TeacherPanel'
import StudentPanel from '@/frontend/components/dashboard/StudentPanel'
import Tilt3DCard from '@/frontend/components/ui/Tilt3DCard'
import Icon3D from '@/frontend/components/ui/Icon3D'
import { useT } from '@/frontend/hooks/useT'
import { getSession, SESSION_EVENT, type Role } from '@/frontend/session/session'

export default function DashboardPage() {
  const { t } = useT()
  // null = todavía no se sabe el rol. Sin esto se pinta un frame la vista de
  // estudiante antes de saber que quien entra es catedrático (parpadeo feo).
  const [role, setRole] = useState<Role | null>(null)

  useEffect(() => {
    const sync = () => setRole(getSession()?.role ?? 'student')
    sync()
    window.addEventListener(SESSION_EVENT, sync)
    return () => window.removeEventListener(SESSION_EVENT, sync)
  }, [])

  if (role === null) return <main className="flex-1" />

  // Cada rol tiene su propio panel completo. Comparten el armazón visual
  // (neo-tp-*) para que se vean parte del mismo producto, pero el contenido
  // responde a trabajos distintos: gestionar un aula no se parece a cursarla.
  if (role === 'teacher') return <TeacherPanel />
  if (role === 'student') return <StudentPanel />

  return (
    <>
      <Header
        title={t('head.dashboard.title')}
        subtitle={t('head.dashboard.sub')}
        action={
          <Link href="/auth/signup" className="neo-btn">
            {t('dash.register')}
          </Link>
        }
      />

      <main className="flex-1 overflow-auto p-8 space-y-10">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-neutral-500">
          <span className="h-px w-6 bg-white/10" />
          {t('dash.view_as')} <span className="font-semibold text-accent-violet">{t('prof.role_visitor')}</span>
        </div>

        <VisitorView t={t} />
      </main>
    </>
  )
}

type T = (k: string) => string

/* ---------------- Visitante ---------------- */
function VisitorView({ t }: { t: T }) {
  const PUBLIC = [
    { name: 'E-Learning Platform', rank: 'gold' as const, stars: '4.8' },
    { name: 'Analytics Dashboard', rank: 'platinum' as const, stars: '4.9' },
    { name: 'IoT Greenhouse', rank: 'silver' as const, stars: '4.6' },
  ]
  return (
    <>
      <Tilt3DCard className="p-10" max={5}>
        <div className="flex flex-col items-center text-center gap-3">
          <Icon3D src="/icons/chest.png" alt="" size={72} fallback="◆" />
          <h2 className="text-2xl font-bold text-white">{t('dash.visitor_title')}</h2>
          <p className="max-w-md text-sm text-neutral-400">{t('dash.visitor_sub')}</p>
          <Link href="/auth/signup" className="neo-btn mt-2">
            {t('dash.register')}
          </Link>
        </div>
      </Tilt3DCard>

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">
          {t('dash.public_projects')}
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {PUBLIC.map((p) => (
            <Tilt3DCard key={p.name} className="p-6" max={8}>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">{p.name}</h3>
                  <span className={`neo-chip neo-chip--${p.rank}`}>{p.rank}</span>
                </div>
                <p className="border-t border-white/5 pt-3 text-xs text-neutral-500">
                  {p.stars} {t('dash.stars')}
                </p>
              </div>
            </Tilt3DCard>
          ))}
        </div>
      </section>
    </>
  )
}
