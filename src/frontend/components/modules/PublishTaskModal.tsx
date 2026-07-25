'use client'

/**
 * PUBLICAR LO QUE GENERÓ EL ASISTENTE COMO TAREA REAL.
 *
 * El catedrático le pide al asistente "redacta una tarea con este material" y,
 * en vez de copiar y pegar, publica esa respuesta a la clase con un botón.
 * Reutiliza createClassTask() —el mismo camino del Estudio de actividades—, así
 * que la tarea nace igual que cualquier otra: notifica a los alumnos y aparece
 * en "Mis tareas".
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { createClassTask } from '@/backend/services/classTasks'
import { PARCIAL_OPTIONS } from '@/shared/parciales'
import NeoSelect from '@/frontend/components/ui/NeoSelect'
import NeoDate from '@/frontend/components/ui/NeoDate'

/** Saca un título corto de la primera línea de lo que generó el asistente. */
function deriveTitle(text: string, fallback: string): string {
  const first = text.replace(/\s+/g, ' ').trim().split(/[.\n:]/)[0] ?? ''
  const clean = first.replace(/^(tarea|actividad|t[ií]tulo|tema)\s*[:\-]?\s*/i, '').trim()
  const words = clean.split(' ')
  const short = (words.length > 9 ? words.slice(0, 9).join(' ') : clean).trim()
  return short ? short.charAt(0).toUpperCase() + short.slice(1) : fallback
}

export default function PublishTaskModal({
  classId,
  defaultParcial,
  source,
  moduleTitle,
  onClose,
  onPublished,
}: {
  classId: string
  defaultParcial: string
  source: string // el texto que generó el asistente
  moduleTitle: string
  onClose: () => void
  onPublished: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [title, setTitle] = useState(() => deriveTitle(source, moduleTitle))
  const [description, setDescription] = useState(source)
  const [parcial, setParcial] = useState(defaultParcial || '')
  const [dueDate, setDueDate] = useState('') // 'YYYY-MM-DD'
  const [points, setPoints] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => setMounted(true), [])

  async function publish() {
    if (!title.trim() || saving) return
    setSaving(true)
    setError('')
    const dueEpoch = dueDate ? new Date(`${dueDate}T23:59`).getTime() : null
    const n = parseInt(points, 10)
    const ok = await createClassTask({
      classId,
      title,
      description,
      parcial,
      dueDate: dueEpoch,
      points: Number.isFinite(n) && n > 0 ? n : 0,
      showOnPublish: true,
    })
    setSaving(false)
    if (ok) onPublished()
    else setError('No se pudo publicar la tarea. Intenta de nuevo.')
  }

  if (!mounted) return null

  return createPortal(
    <div className="neo-modal-backdrop" onClick={onClose}>
      <div className="neo-modal neo-modal--form space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h4 className="text-base font-semibold text-white">Publicar como tarea</h4>
          <button onClick={onClose} className="text-neutral-500 hover:text-white">✕</button>
        </div>

        <p className="text-xs text-neutral-500">
          Revisa y ajusta antes de publicar. Al confirmar, la tarea se envía a la clase y cada alumno recibe la
          notificación.
        </p>

        <div className="space-y-2">
          <label className="neo-label">Título</label>
          <input
            className="neo-input w-full"
            value={title}
            onChange={(e) => setTitle(e.target.value.normalize('NFC'))}
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <label className="neo-label">Enunciado</label>
          <textarea
            className="neo-input w-full resize-y"
            rows={8}
            value={description}
            onChange={(e) => setDescription(e.target.value.normalize('NFC'))}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <label className="neo-label">Parcial</label>
            <NeoSelect value={parcial} options={PARCIAL_OPTIONS} onChange={setParcial} />
          </div>
          <div className="space-y-2">
            <label className="neo-label">Fecha límite</label>
            <NeoDate value={dueDate} onChange={setDueDate} />
          </div>
          <div className="space-y-2">
            <label className="neo-label">Puntos</label>
            <input
              className="neo-input w-full"
              type="number"
              min={0}
              placeholder="0"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-xs text-amber-400">{error}</p>}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button onClick={onClose} className="neo-btn-ghost flex-1 justify-center text-sm">
            Cancelar
          </button>
          <button
            onClick={publish}
            disabled={!title.trim() || saving}
            className="neo-btn flex-1 justify-center text-sm disabled:opacity-40"
          >
            {saving ? 'Publicando…' : 'Publicar a la clase'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
