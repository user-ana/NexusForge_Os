'use client'

/**
 * MÓDULOS DE APRENDIZAJE dentro de la clase.
 *
 * Catedrático: arma el módulo de la semana en privado (nace oculto), le adjunta
 * PDF, presentaciones o enlaces, y lo publica cuando toca. Al publicar, cada
 * alumno recibe la notificación.
 * Estudiante: ve únicamente el material publicado (lo filtra RLS, no el cliente).
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  loadModules,
  createModule,
  deleteModule,
  publishModule,
  addModuleFile,
  addModuleLink,
  deleteModuleFile,
  subscribeModules,
  MODULES_EVENT,
  type ClassModule,
  type ModuleFile,
} from '@/backend/services/classModules'
import { PARCIAL_OPTIONS, parcialLabel } from '@/shared/parciales'
import NeoSelect from '@/frontend/components/ui/NeoSelect'
import NeoSteps from '@/frontend/components/ui/NeoSteps'
import ConfirmDialog from '@/frontend/components/ui/ConfirmDialog'
import { ClipboardIcon, LinkIcon, LockIcon, TrashIcon } from '@/frontend/components/ui/Icons'

export default function ClassModulesSection({ classId, isTeacher }: { classId: string; isTeacher: boolean }) {
  const [modules, setModules] = useState<ClassModule[]>([])
  const [creating, setCreating] = useState(false)
  const [delModule, setDelModule] = useState<ClassModule | null>(null)

  useEffect(() => {
    const refresh = () => loadModules(classId).then(setModules)
    refresh()
    window.addEventListener(MODULES_EVENT, refresh)
    const off = subscribeModules()
    return () => {
      window.removeEventListener(MODULES_EVENT, refresh)
      off()
    }
  }, [classId])

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">Módulos de aprendizaje</h3>
        {isTeacher && (
          <button onClick={() => setCreating(true)} className="neo-btn text-sm">
            Nuevo módulo
          </button>
        )}
      </div>

      {isTeacher && (
        <NewModuleModal classId={classId} open={creating} onClose={() => setCreating(false)} />
      )}

      {modules.length === 0 ? (
        <div className="neo-panel p-8 text-center text-sm text-neutral-500">
          {isTeacher
            ? 'Aún no has creado módulos. Arma el material de la semana y publícalo cuando quieras que lo vean.'
            : 'El catedrático aún no ha publicado material.'}
        </div>
      ) : (
        <div className="space-y-3">
          {modules.map((m) => (
            <ModuleCard key={m.id} module={m} isTeacher={isTeacher} onDelete={() => setDelModule(m)} />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!delModule}
        title="¿Eliminar el módulo?"
        message={
          <>
            Se eliminará <span className="font-semibold text-white">{delModule?.title}</span> con todos sus archivos y
            enlaces. Esta acción no se puede deshacer.
          </>
        }
        onConfirm={() => {
          if (delModule) deleteModule(delModule.id)
          setDelModule(null)
        }}
        onCancel={() => setDelModule(null)}
      />
    </section>
  )
}

/**
 * Las tres etapas por las que pasa un módulo. La tercera no es una pantalla:
 * queda pendiente hasta que el catedrático pulsa "Publicar a la clase", y está
 * en el indicador justamente para que se vea que crear no es publicar.
 */
const MODULE_STEPS = [{ label: 'Datos' }, { label: 'Material' }, { label: 'Publicar' }]

/**
 * Modal para crear el módulo, en dos pasos.
 *   1) Datos: título, semana, parcial y descripción.
 *   2) Material: se adjunta la presentación y los enlaces SIN salir del modal,
 *      y desde ahí mismo se puede publicar.
 * El paso 2 necesita el id del módulo, por eso el guardado ocurre en medio.
 * Mismo patrón que CreateProjectModal: portal al body sobre el fondo oscuro.
 */
function NewModuleModal({ classId, open, onClose }: { classId: string; open: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  const [title, setTitle] = useState('')
  const [week, setWeek] = useState('')
  const [parcial, setParcial] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [moduleId, setModuleId] = useState<string | null>(null)
  const [added, setAdded] = useState<ModuleFile[]>([])

  useEffect(() => setMounted(true), [])

  function reset() {
    setTitle('')
    setWeek('')
    setParcial('')
    setDescription('')
    setModuleId(null)
    setAdded([])
  }

  function finish() {
    reset()
    onClose()
  }

  async function save() {
    if (!title.trim() || saving) return
    setSaving(true)
    const n = parseInt(week, 10)
    const id = await createModule({
      classId,
      title,
      description,
      parcial,
      week: Number.isFinite(n) && n > 0 ? n : null,
    })
    setSaving(false)
    if (id) setModuleId(id) // pasa al paso 2
  }

  async function publishNow() {
    if (!moduleId) return
    await publishModule(moduleId, true)
    finish()
  }

  if (!open || !mounted) return null

  return createPortal(
    <div className="neo-modal-backdrop" onClick={finish}>
      <div className="neo-modal neo-modal--form space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h4 className="text-base font-semibold text-white">
            {moduleId ? 'Material del módulo' : 'Nuevo módulo'}
          </h4>
          <button onClick={finish} className="text-neutral-500 hover:text-white">✕</button>
        </div>

        <NeoSteps steps={MODULE_STEPS} current={moduleId ? 1 : 0} />

        {/* ---------- PASO 1: datos del módulo ---------- */}
        {!moduleId && (
          <>
            <div className="space-y-2">
              <label className="neo-label">Título</label>
              <input
                className="neo-input w-full"
                placeholder="Introducción a los patrones de diseño"
                value={title}
                onChange={(e) => setTitle(e.target.value.normalize('NFC'))}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="neo-label">Semana</label>
                <input
                  className="neo-input w-full"
                  type="number"
                  min={1}
                  placeholder="1"
                  value={week}
                  onChange={(e) => setWeek(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="neo-label">Parcial</label>
                <NeoSelect value={parcial} options={PARCIAL_OPTIONS} onChange={setParcial} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="neo-label">Descripción</label>
              <textarea
                className="neo-input w-full resize-none"
                rows={3}
                placeholder="Qué se cubre en esta semana y qué debe repasar el estudiante."
                value={description}
                onChange={(e) => setDescription(e.target.value.normalize('NFC'))}
              />
            </div>

            <p className="text-xs text-neutral-500">
              Después de crearlo le adjuntas la presentación. El módulo nace oculto: nadie lo ve hasta que lo publiques.
            </p>

            <button
              onClick={save}
              disabled={!title.trim() || saving}
              className="neo-btn w-full justify-center disabled:opacity-40"
            >
              {saving ? 'Creando…' : 'Crear y adjuntar material'}
            </button>
          </>
        )}

        {/* ---------- PASO 2: adjuntar el material ---------- */}
        {moduleId && (
          <>
            <div className="rounded-xl bg-black/20 px-4 py-3 shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4)]">
              <p className="text-sm font-semibold text-white">{title}</p>
              <p className="mt-0.5 text-xs text-neutral-500">
                Módulo creado. Súbele la presentación, el PDF de la clase o los enlaces de apoyo.
              </p>
            </div>

            {added.length > 0 && (
              <div className="space-y-1.5">
                {added.map((f) => (
                  <FileRow key={f.id} file={f} isTeacher />
                ))}
              </div>
            )}

            <ResourceTools
              moduleId={moduleId}
              classId={classId}
              onAdded={(f) => setAdded((prev) => [...prev, f])}
            />

            <div className="flex flex-col gap-2 border-t border-white/5 pt-4 sm:flex-row">
              <button onClick={finish} className="neo-btn-ghost flex-1 justify-center text-sm">
                Guardar oculto
              </button>
              <button onClick={publishNow} className="neo-btn flex-1 justify-center text-sm">
                Publicar a la clase
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** Tarjeta de un módulo con sus recursos. */
function ModuleCard({
  module: m,
  isTeacher,
  onDelete,
}: {
  module: ClassModule
  isTeacher: boolean
  onDelete: () => void
}) {
  const [open, setOpen] = useState(m.published || isTeacher)

  return (
    <article className="neo-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <button onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {m.week != null && <span className="neo-chip neo-chip--progress">Semana {m.week}</span>}
            {m.parcial && <span className="neo-chip neo-chip--gold">{parcialLabel(m.parcial)}</span>}
            {isTeacher && !m.published && (
              <span className="neo-chip inline-flex items-center gap-1 text-amber-300">
                <LockIcon size={11} /> Oculto
              </span>
            )}
            <span className="text-xs text-neutral-600">
              {m.files.length} {m.files.length === 1 ? 'recurso' : 'recursos'}
            </span>
          </div>
          <h4 className="font-semibold text-white">{m.title}</h4>
          {m.description && <p className="mt-1 text-sm text-neutral-400">{m.description}</p>}
        </button>

        {isTeacher && (
          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              onClick={() => publishModule(m.id, !m.published)}
              className={`neo-btn-ghost text-xs ${m.published ? '' : 'text-accent-violet'}`}
            >
              {m.published ? 'Ocultar' : 'Publicar'}
            </button>
            <button onClick={onDelete} className="text-neutral-600 hover:text-red-400" title="Eliminar módulo">
              <TrashIcon size={15} />
            </button>
          </div>
        )}
      </div>

      {open && (
        <div className="mt-4 border-t border-white/5 pt-4">
          {m.files.length === 0 ? (
            <p className="text-xs text-neutral-600">
              {isTeacher ? 'Sin recursos todavía. Adjunta el PDF o la presentación de la semana.' : 'Sin recursos.'}
            </p>
          ) : (
            <div className="space-y-1.5">
              {m.files.map((f) => (
                <FileRow key={f.id} file={f} isTeacher={isTeacher} />
              ))}
            </div>
          )}

          {isTeacher && <ResourceTools moduleId={m.id} classId={m.classId} />}

          {isTeacher && m.files.some((f) => f.hasText) && (
            <p className="mt-3 text-xs text-neutral-600">
              El texto de los PDF quedó guardado: la IA podrá apoyarse en este material para explicarle la clase al
              estudiante.
            </p>
          )}
        </div>
      )}
    </article>
  )
}

/**
 * Botones para sumarle material al módulo (archivo o enlace). Se usa en la
 * tarjeta del módulo y en el segundo paso del modal de creación, para que
 * adjuntar sea lo mismo se llegue por donde se llegue.
 */
function ResourceTools({
  moduleId,
  classId,
  onAdded,
}: {
  moduleId: string
  classId: string
  onAdded?: (f: ModuleFile) => void
}) {
  const [busy, setBusy] = useState('')
  const [linking, setLinking] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  /** Sube los archivos elegidos uno por uno (del PDF se extrae el texto). */
  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // permite volver a elegir el mismo archivo
    for (const f of files) {
      setBusy(`Subiendo ${f.name}…`)
      const added = await addModuleFile(moduleId, classId, f)
      if (added) onAdded?.(added)
    }
    setBusy('')
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.ppt,.pptx,.odp,.key,.doc,.docx,.odt,.txt,.md"
          onChange={onFiles}
        />
        <button onClick={() => fileRef.current?.click()} disabled={!!busy} className="neo-btn-ghost text-xs disabled:opacity-40">
          Adjuntar archivo
        </button>
        <button onClick={() => setLinking((v) => !v)} className="neo-btn-ghost text-xs">
          {linking ? 'Cancelar enlace' : 'Agregar enlace'}
        </button>
        {busy && <span className="text-xs text-accent-violet">{busy}</span>}
      </div>

      {linking && <LinkForm moduleId={moduleId} onDone={() => setLinking(false)} onAdded={onAdded} />}
    </>
  )
}

/** Una fila de recurso: abre en pestaña nueva; el catedrático puede quitarlo. */
function FileRow({ file, isTeacher }: { file: ModuleFile; isTeacher: boolean }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-black/20 px-3 py-2 shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4)]">
      <span className="text-neutral-500">
        {file.kind === 'link' ? <LinkIcon size={14} /> : <ClipboardIcon size={14} />}
      </span>
      <a
        href={file.url}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 flex-1 truncate text-sm text-neutral-200 hover:text-accent-violet"
      >
        {file.name}
      </a>
      {file.sizeBytes > 0 && <span className="flex-shrink-0 text-xs text-neutral-600">{humanSize(file.sizeBytes)}</span>}
      {isTeacher && (
        <button
          onClick={() => deleteModuleFile(file.id)}
          className="flex-shrink-0 text-neutral-600 hover:text-red-400"
          title="Quitar recurso"
        >
          <TrashIcon size={13} />
        </button>
      )}
    </div>
  )
}

/** Alta rápida de un enlace externo (video, artículo, repositorio). */
function LinkForm({
  moduleId,
  onDone,
  onAdded,
}: {
  moduleId: string
  onDone: () => void
  onAdded?: (f: ModuleFile) => void
}) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')

  async function save() {
    if (!url.trim()) return
    const added = await addModuleLink(moduleId, name, url)
    if (!added) return
    onAdded?.(added)
    onDone()
  }

  return (
    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
      <input className="neo-input" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="neo-input" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
      <button onClick={save} disabled={!url.trim()} className="neo-btn text-xs disabled:opacity-40">
        Agregar
      </button>
    </div>
  )
}

/** Tamaño legible del archivo. */
function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
