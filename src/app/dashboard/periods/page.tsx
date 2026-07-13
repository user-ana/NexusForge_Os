'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/frontend/components/layout/Header'
import Icon3D from '@/frontend/components/ui/Icon3D'
import { useT } from '@/frontend/hooks/useT'
import { getSession, SESSION_EVENT, type Role } from '@/frontend/session/session'
import { getClasses, loadClasses, subscribeClasses, CLASSES_EVENT, type Klass } from '@/backend/services/classes'
import {
  loadProjectsForClasses,
  getProjectsForClasses,
  PROJECTS_EVENT,
  type Project,
} from '@/backend/services/projects'
import { PARCIALES } from '@/shared/parciales'

export default function PeriodsPage() {
  const { t } = useT()
  const [role, setRole] = useState<Role>('student')
  const [classes, setClasses] = useState<Klass[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const s = getSession()
    const meId = s?.id ?? ''
    setRole(s?.role ?? 'student')

    const sync = () => {
      const mine = getClasses().filter((c) => c.teacher === meId)
      setClasses(mine)
      setProjects(getProjectsForClasses(mine.map((c) => c.id)))
    }

    async function boot() {
      await loadClasses()
      const mine = getClasses().filter((c) => c.teacher === meId)
      await loadProjectsForClasses(mine.map((c) => c.id))
      sync()
      setLoading(false)
    }

    boot()
    const unsub = subscribeClasses()
    ;[SESSION_EVENT, CLASSES_EVENT, PROJECTS_EVENT].forEach((e) => window.addEventListener(e, sync))
    return () => {
      ;[SESSION_EVENT, CLASSES_EVENT, PROJECTS_EVENT].forEach((e) => window.removeEventListener(e, sync))
      unsub()
    }
  }, [])

  // Mapa clase -> nombre (para etiquetar cada proyecto con su clase)
  const classById = new Map(classes.map((c) => [c.id, c]))

  // Grupos a mostrar: los 4 parciales siempre + "Sin parcial" solo si tiene proyectos
  const sinParcial = projects.filter((p) => !p.parcial)
  const groups: { code: string; label: string; items: Project[] }[] = [
    ...PARCIALES.map((pc) => ({
      code: pc.code,
      label: pc.label,
      items: projects.filter((p) => p.parcial === pc.code),
    })),
    ...(sinParcial.length ? [{ code: '', label: t('per.no_parcial'), items: sinParcial }] : []),
  ]

  if (role !== 'teacher') {
    return (
      <>
        <Header title={t('per.title')} subtitle={t('per.sub')} />
        <main className="flex-1 p-8">
          <div className="neo-panel p-10 text-center text-sm text-neutral-400">{t('per.teacher_only')}</div>
        </main>
      </>
    )
  }

  return (
    <>
      <Header title={t('per.title')} subtitle={t('per.sub')} />

      <main className="flex-1 overflow-auto p-8 space-y-8">
        {/* Resumen */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label={t('per.stat_classes')} value={classes.length} />
          <Stat label={t('per.stat_projects')} value={projects.length} />
          <Stat label={t('per.stat_parciales')} value={groups.filter((g) => g.items.length).length} />
        </div>

        {loading ? (
          <div className="neo-panel flex items-center justify-center p-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-violet border-t-transparent" />
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.code || 'none'}>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-accent-violet">{g.label}</h2>
                <span className="text-xs text-neutral-500">
                  {g.items.length} {g.items.length === 1 ? t('per.project_one') : t('per.project_many')}
                </span>
                <span className="h-px flex-1 bg-white/5" />
              </div>

              {g.items.length === 0 ? (
                <div className="neo-panel p-6 text-center text-xs text-neutral-600">{t('per.empty_parcial')}</div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {g.items.map((p) => {
                    const cls = classById.get(p.classId)
                    return (
                      <Link key={p.id} href={`/dashboard/classes/${p.classId}/projects/${p.id}`}>
                        <div className="neo-panel neo-panel--hover h-full p-5">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold leading-snug text-white">{p.title}</h3>
                            <span className="neo-chip neo-chip--progress flex-shrink-0">{p.teamSize}</span>
                          </div>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-400">
                            {cls?.emblem && <Icon3D src={cls.emblem} alt="" size={16} fallback="◆" />}
                            {cls ? cls.name : t('per.unknown_class')}
                            {cls?.section && <span className="text-neutral-600">({cls.section})</span>}
                          </p>
                          <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3 text-xs text-neutral-500">
                            <span>{t('per.due')}: {p.dueDate || '—'}</span>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </section>
          ))
        )}

        {!loading && classes.length === 0 && (
          <div className="neo-panel flex flex-col items-center gap-4 p-12 text-center">
            <Icon3D src="/icons/emblem-1.png" alt="" size={56} fallback="◆" />
            <p className="max-w-sm text-sm text-neutral-400">{t('per.no_classes')}</p>
            <Link href="/dashboard/classes?create=1" className="neo-btn">{t('cls.create')}</Link>
          </div>
        )}
      </main>
    </>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="neo-panel p-5">
      <p className="text-xs uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-neutral-100">{value}</p>
    </div>
  )
}
