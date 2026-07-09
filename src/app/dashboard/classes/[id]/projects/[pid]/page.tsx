'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/frontend/components/layout/Header'
import { getProject, loadProjects, PROJECTS_EVENT, type Project } from '@/backend/services/projects'
import { useT } from '@/frontend/hooks/useT'

const GM: Record<string, string> = { open: 'cls.gm_open', assign: 'cls.gm_assign', hybrid: 'cls.gm_hybrid' }
const LM: Record<string, string> = { teacher: 'cls.lm_teacher', group: 'cls.lm_group', first: 'cls.lm_first' }

export default function ProjectDetailPage({ params }: { params: { id: string; pid: string } }) {
  const { t } = useT()
  const [project, setProject] = useState<Project | undefined>(undefined)

  useEffect(() => {
    const sync = () => setProject(getProject(params.pid))
    sync()
    loadProjects(params.id)
    window.addEventListener(PROJECTS_EVENT, sync)
    return () => window.removeEventListener(PROJECTS_EVENT, sync)
  }, [params.id, params.pid])

  if (!project) {
    return (
      <>
        <Header title="—" subtitle="" />
        <main className="flex-1 p-8">
          <Link href={`/dashboard/classes/${params.id}`} className="text-sm text-accent-violet">← {t('proj.back')}</Link>
        </main>
      </>
    )
  }

  const totalPts = project.rubric.reduce((a, r) => a + (r.points || 0), 0)

  return (
    <>
      <Header title={project.title} subtitle={t('proj.section')} />

      <main className="flex-1 overflow-auto p-8 space-y-6">
        <Link href={`/dashboard/classes/${params.id}`} className="inline-flex w-fit items-center gap-1 text-sm text-neutral-500 hover:text-accent-violet">
          ← {t('proj.back')}
        </Link>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* Enunciado */}
            <div className="neo-panel p-6">
              <p className="neo-label mb-3">{t('proj.desc')}</p>
              <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-300">{project.description || '—'}</p>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="neo-panel p-6">
                <p className="neo-label mb-3">{t('proj.objectives')}</p>
                <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-300">{project.objectives || '—'}</p>
              </div>
              <div className="neo-panel p-6">
                <p className="neo-label mb-3">{t('proj.deliverables')}</p>
                <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-300">{project.deliverables || '—'}</p>
              </div>
            </div>

            {/* Rúbrica */}
            <div className="neo-panel p-6">
              <div className="mb-3 flex items-center justify-between">
                <p className="neo-label">{t('proj.rubric')}</p>
                <span className="neo-chip neo-chip--gold">{t('proj.total_pts')}: {totalPts}</span>
              </div>
              <div className="space-y-2">
                {project.rubric.length === 0 ? (
                  <p className="text-sm text-neutral-500">—</p>
                ) : (
                  project.rubric.map((r, i) => (
                    <div key={i} className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-2 text-sm">
                      <span className="text-neutral-200">{r.criterion}</span>
                      <span className="font-semibold text-neutral-100">{r.points} {t('proj.points')}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Ficha */}
          <div className="neo-panel h-fit space-y-4 p-6">
            <Meta label={t('proj.due')} value={project.dueDate || '—'} />
            <Meta label={t('proj.team_size')} value={`${project.teamSize}`} />
            <Meta label={t('proj.group_mode')} value={t(GM[project.groupMode])} />
            <Meta label={t('proj.leader_mode')} value={t(LM[project.leaderMode])} />
          </div>
        </div>

        {/* Próxima fase: grupos */}
        <div className="neo-panel p-6 text-center text-sm text-neutral-600">
          Formación de grupos para este proyecto — próxima fase
        </div>
      </main>
    </>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-white/5 pb-3 last:border-0 last:pb-0">
      <p className="text-[11px] uppercase tracking-wider text-neutral-600">{label}</p>
      <p className="mt-1 text-sm font-semibold text-neutral-100">{value}</p>
    </div>
  )
}
