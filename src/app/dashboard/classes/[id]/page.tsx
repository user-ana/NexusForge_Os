'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Header from '@/frontend/components/layout/Header'
import { getSession, SESSION_EVENT, type Role } from '@/frontend/session/session'
import { getClass, loadClasses, subscribeClasses, deleteClass, CLASSES_EVENT, type Klass } from '@/backend/services/classes'
import { getProjects, loadProjects, subscribeProjects, deleteProject, PROJECTS_EVENT, type Project } from '@/backend/services/projects'
import ConfirmDialog from '@/frontend/components/ui/ConfirmDialog'
import Icon3D from '@/frontend/components/ui/Icon3D'
import { TrashIcon } from '@/frontend/components/ui/Icons'
import CreateProjectModal from '@/frontend/components/projects/CreateProjectModal'
import ClassTasksSection from '@/frontend/components/tasks/ClassTasksSection'
import ClassModulesSection from '@/frontend/components/modules/ClassModulesSection'
import { useT } from '@/frontend/hooks/useT'
import { parcialLabel } from '@/shared/parciales'

export default function ClassDetailPage({ params }: { params: { id: string } }) {
  const { t } = useT()
  const router = useRouter()
  const [klass, setKlass] = useState<Klass | undefined>(undefined)
  const [projects, setProjects] = useState<Project[]>([])
  const [role, setRole] = useState<Role>('student')
  const [copied, setCopied] = useState(false)
  const [creating, setCreating] = useState(false)
  const [delProject, setDelProject] = useState<Project | null>(null)
  const [delClass, setDelClass] = useState(false)

  useEffect(() => {
    const sync = () => {
      setKlass(getClass(params.id))
      setProjects(getProjects(params.id))
      setRole(getSession()?.role ?? 'student')
    }
    sync()
    loadClasses()
    loadProjects(params.id)
    const unsubC = subscribeClasses()
    const unsubP = subscribeProjects(params.id)
    ;[SESSION_EVENT, CLASSES_EVENT, PROJECTS_EVENT].forEach((e) => window.addEventListener(e, sync))
    return () => {
      ;[SESSION_EVENT, CLASSES_EVENT, PROJECTS_EVENT].forEach((e) => window.removeEventListener(e, sync))
      unsubC()
      unsubP()
    }
  }, [params.id])

  const isTeacher = role === 'teacher'

  function copyCode() {
    if (!klass) return
    navigator.clipboard?.writeText(klass.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (!klass) {
    return (
      <>
        <Header title={t('head.classes.title')} subtitle="" />
        <main className="flex-1 p-8">
          <Link href="/dashboard/classes" className="text-sm text-accent-violet">← {t('cls.back')}</Link>
        </main>
      </>
    )
  }

  return (
    <>
      <Header
        title={klass.section ? `${klass.name} (${klass.section})` : klass.name}
        subtitle={`${t('cls.period')}: ${klass.period}`}
        action={klass.emblem ? <Icon3D src={klass.emblem} alt="" size={46} fallback="◆" /> : undefined}
      />

      <main className="flex-1 overflow-auto p-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Link href="/dashboard/classes" className="inline-flex w-fit items-center gap-1 text-sm text-neutral-500 hover:text-accent-violet">
            ← {t('cls.back')}
          </Link>
          <div className="flex items-center gap-2">
            {isTeacher && (
              <button onClick={() => setDelClass(true)} className="neo-btn-ghost inline-flex items-center gap-1.5 text-sm text-red-400 hover:!text-red-300" title="Eliminar clase">
                <TrashIcon size={15} /> Eliminar clase
              </button>
            )}
            <Link href={`/aula/${params.id}`} className="neo-btn text-sm">
              {t('cls.enter')} →
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="neo-panel p-6">
            <p className="neo-label mb-2">{t('cls.code')}</p>
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-black/30 px-4 py-2 font-mono text-xl font-bold tracking-widest text-accent-violet shadow-[inset_2px_2px_5px_rgba(0,0,0,0.5)]">
                {klass.code}
              </span>
              <button onClick={copyCode} className="neo-btn-ghost text-sm">{copied ? t('cls.copied') : t('cls.copy_code')}</button>
            </div>
            <div className="mt-4 border-t border-white/5 pt-4">
              <p className="text-xs text-neutral-600">{t('cls.enrolled')}</p>
              <p className="text-2xl font-bold text-neutral-100">{klass.students.length}</p>
            </div>
          </div>

          <div className="neo-panel p-6 lg:col-span-2">
            <p className="neo-label mb-3">{t('cls.course')}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Info label={t('cls.section')} value={klass.section} />
              <Info label={t('cls.period')} value={klass.period} />
              <Info label={t('cls.instructor')} value={klass.teacherName ?? klass.teacher} />
            </div>
          </div>
        </div>

        {/* Proyectos */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">{t('proj.section')}</h3>
            {isTeacher && (
              <button onClick={() => setCreating((v) => !v)} className="neo-btn text-sm">{t('proj.create')}</button>
            )}
          </div>

          {/* Formulario crear proyecto (modal reutilizable) */}
          {isTeacher && (
            <CreateProjectModal classId={params.id} open={creating} onClose={() => setCreating(false)} />
          )}

          {/* Lista de proyectos */}
          {projects.length === 0 ? (
            <div className="neo-panel p-8 text-center text-sm text-neutral-500">
              {isTeacher ? t('proj.none_t') : t('proj.none_s')}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {projects.map((p) => (
                <Link key={p.id} href={`/dashboard/classes/${params.id}/projects/${p.id}`}>
                  <div className="neo-panel neo-panel--hover h-full p-6">
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="font-semibold text-white">{p.title}</h4>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        {p.parcial && <span className="neo-chip neo-chip--gold">{parcialLabel(p.parcial)}</span>}
                        <span className="neo-chip neo-chip--progress">{p.teamSize} integrantes</span>
                        {isTeacher && (
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDelProject(p) }}
                            className="text-neutral-600 hover:text-red-400"
                            title="Eliminar proyecto"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-neutral-400">{p.description}</p>
                    <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3 text-xs text-neutral-500">
                      <span>{p.dueDate || '—'}</span>
                      <span className="text-accent-violet">{t('proj.view')} →</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Material de la semana (el catedrático lo prepara oculto y lo publica) */}
        <ClassModulesSection classId={params.id} isTeacher={isTeacher} />

        {/* Tareas de la clase (publicar + matriz de entregas) */}
        <ClassTasksSection classId={params.id} isTeacher={isTeacher} roster={klass.roster} />

        {/* Inscritos */}
        <div className="neo-panel p-6">
          <div className="mb-5 flex items-center gap-3">
            <p className="neo-label">{t('cls.enrolled')}</p>
            <span className="neo-roster-count">{klass.roster.length}</span>
          </div>
          {klass.roster.length === 0 ? (
            <p className="text-sm text-neutral-500">{t('cls.no_students')}</p>
          ) : (
            <div className="neo-roster">
              {klass.roster.map((st, i) => (
                <div key={st.id} className="neo-roster-card" style={{ animationDelay: `${i * 45}ms` }}>
                  <span className={`neo-roster-av neo-roster-av--${avatarTone(st.name)}`}>
                    {initials(st.name)}
                  </span>
                  <span className="neo-roster-info">
                    <span className="neo-roster-name">{st.name}</span>
                    <span className="neo-roster-role">Estudiante</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Confirmar eliminar proyecto */}
      <ConfirmDialog
        open={!!delProject}
        title="¿Eliminar el proyecto?"
        message={
          <>
            Se eliminará <span className="font-semibold text-white">{delProject?.title}</span> y su enunciado, rúbrica y
            entregas. Esta acción no se puede deshacer.
          </>
        }
        onConfirm={() => {
          if (delProject) deleteProject(delProject.id)
          setDelProject(null)
        }}
        onCancel={() => setDelProject(null)}
      />

      {/* Confirmar eliminar clase */}
      <ConfirmDialog
        open={delClass}
        title="¿Eliminar la clase?"
        message={
          <>
            Se eliminará <span className="font-semibold text-white">{klass.name}</span> con TODO su contenido: inscritos,
            grupos, proyectos, chat y tableros. Es irreversible.
          </>
        }
        confirmLabel="Sí, eliminar clase"
        onConfirm={async () => {
          await deleteClass(params.id)
          setDelClass(false)
          router.replace('/dashboard/classes')
        }}
        onCancel={() => setDelClass(false)}
      />
    </>
  )
}

/** Iniciales del nombre (primera + última palabra), para el avatar. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

/** Tono del avatar (0..5) derivado del nombre — colores mate, sin neón. */
function avatarTone(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return h % 6
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black/20 p-3 shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4)]">
      <p className="text-[11px] uppercase tracking-wider text-neutral-600">{label}</p>
      <p className="mt-1 text-sm font-semibold text-neutral-100">{value}</p>
    </div>
  )
}
