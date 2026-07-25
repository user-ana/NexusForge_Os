'use client'

/**
 * PUBLICAR LO QUE GENERÓ EL ASISTENTE COMO TAREA REAL — con edición completa.
 *
 * El catedrático le pide al asistente "redacta una tarea con este material" y,
 * en vez de copiar y pegar, la revisa y la publica aquí mismo: puede reescribir
 * el enunciado, ponerle fecha y hora límite, puntaje, decidir QUÉ deben entregar
 * los alumnos y si la entrega es grupal.
 *
 * Reutiliza createClassTask() —el mismo camino del Estudio de actividades—, así
 * que la tarea nace igual que cualquier otra: notifica a los alumnos y aparece
 * en "Mis tareas".
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { createClassTask, type Deliverable, type DeliverableKind } from '@/backend/services/classTasks'
import { PARCIAL_OPTIONS } from '@/shared/parciales'
import NeoSelect from '@/frontend/components/ui/NeoSelect'
import NeoDate from '@/frontend/components/ui/NeoDate'

/** Qué evidencia puede pedir el catedrático (define el progreso real del alumno). */
const DELIVERABLES: { kind: DeliverableKind; label: string; hint: string }[] = [
  { kind: 'files', label: 'Archivos', hint: 'Documentos, código o entregables' },
  { kind: 'screenshot', label: 'Capturas o video', hint: 'Evidencia visual del resultado' },
  { kind: 'github', label: 'Enlace de GitHub', hint: 'Repositorio del trabajo' },
  { kind: 'commits', label: 'Commits mínimos', hint: 'Cantidad mínima de aportes' },
  { kind: 'per_requirement', label: 'Evidencia por requisito', hint: 'Prueba de cada punto' },
  { kind: 'text', label: 'Texto o reflexión', hint: 'Explicación escrita' },
]

/** Horas seleccionables (cada 30 min) + 11:59 p. m. */
const TIME_OPTIONS: { value: string; label: string }[] = (() => {
  const out: { value: string; label: string }[] = []
  const fmt = (h: number, m: number) => {
    const ap = h < 12 ? 'a. m.' : 'p. m.'
    const h12 = h % 12 === 0 ? 12 : h % 12
    return `${h12}:${String(m).padStart(2, '0')} ${ap}`
  }
  for (let h = 0; h < 24; h++) for (const m of [0, 30]) out.push({ value: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, label: fmt(h, m) })
  out.push({ value: '23:59', label: '11:59 p. m.' })
  return out
})()

/**
 * Quita el markdown que suele venir en la respuesta de la IA (**negritas**,
 * ### títulos, `código`), porque la tarea se muestra como texto plano y el
 * alumno no debe ver los asteriscos ni las almohadillas.
 */
function cleanMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1') // **negrita**
    .replace(/__(.+?)__/g, '$1') // __negrita__
    .replace(/(^|\s)\*(?!\s)(.+?)\*/g, '$1$2') // *cursiva*
    .replace(/`([^`]+)`/g, '$1') // `código`
    .replace(/^#{1,6}\s*/gm, '') // ### títulos
    .replace(/^\s*[-*]\s+/gm, '• ') // viñetas -/* -> •
    .trim()
}

/** Saca un título corto de la primera línea de lo que generó el asistente. */
function deriveTitle(text: string, fallback: string): string {
  const first = cleanMarkdown(text).split(/[.\n:]/)[0]?.replace(/\s+/g, ' ').trim() ?? ''
  const clean = first.replace(/^(tarea|actividad|t[ií]tulo|tema)\s*\d*\s*[:\-]?\s*/i, '').trim()
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
  const [description, setDescription] = useState(() => cleanMarkdown(source))
  const [parcial, setParcial] = useState(defaultParcial || '')
  const [dueDate, setDueDate] = useState('') // 'YYYY-MM-DD'
  const [dueTime, setDueTime] = useState('23:59')
  const [points, setPoints] = useState('')
  const [group, setGroup] = useState(false)
  // Entregables elegidos (por defecto: archivos, lo más común)
  const [delivs, setDelivs] = useState<Set<DeliverableKind>>(new Set(['files']))
  const [commitsMin, setCommitsMin] = useState('3')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => setMounted(true), [])

  function toggleDeliv(k: DeliverableKind) {
    setDelivs((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  async function publish() {
    if (!title.trim() || saving) return
    setSaving(true)
    setError('')

    const dueEpoch = dueDate ? new Date(`${dueDate}T${dueTime || '23:59'}`).getTime() : null
    const n = parseInt(points, 10)
    const cm = parseInt(commitsMin, 10)
    const deliverables: Deliverable[] = DELIVERABLES.filter((d) => delivs.has(d.kind)).map((d) =>
      d.kind === 'commits' ? { kind: d.kind, min: Number.isFinite(cm) && cm > 0 ? cm : 1 } : { kind: d.kind },
    )

    const ok = await createClassTask({
      classId,
      title,
      description,
      parcial,
      dueDate: dueEpoch,
      points: Number.isFinite(n) && n > 0 ? n : 0,
      deliverables,
      group,
      showOnPublish: true,
    })
    setSaving(false)
    if (ok) onPublished()
    else setError('No se pudo publicar la tarea. Intenta de nuevo.')
  }

  if (!mounted) return null

  return createPortal(
    // z-index por encima del lector (90): sin esto el modal salía detrás del PDF
    <div className="neo-modal-backdrop" style={{ zIndex: 120 }} onClick={onClose}>
      <div className="neo-modal neo-modal--form neo-modal--scroll space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-base font-semibold text-white">Revisar y publicar tarea</h4>
            <p className="mt-0.5 text-xs text-neutral-500">Ajusta lo que quieras antes de enviarla a la clase.</p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white">✕</button>
        </div>

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
          <p className="text-[11px] text-neutral-600">
            Puedes reescribirlo, agregar puntos o quitar lo que no aplique. Es lo que verán tus estudiantes.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="space-y-2">
            <label className="neo-label">Parcial</label>
            <NeoSelect value={parcial} options={PARCIAL_OPTIONS} onChange={setParcial} />
          </div>
          <div className="space-y-2">
            <label className="neo-label">Fecha</label>
            <NeoDate value={dueDate} onChange={setDueDate} />
          </div>
          <div className="space-y-2">
            <label className="neo-label">Hora</label>
            <NeoSelect value={dueTime} options={TIME_OPTIONS} onChange={setDueTime} />
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

        {/* Qué debe entregar el alumno (define el avance real, no un sí/no) */}
        <div className="space-y-2">
          <label className="neo-label">Qué deben entregar</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {DELIVERABLES.map((d) => {
              const on = delivs.has(d.kind)
              return (
                <button
                  key={d.kind}
                  type="button"
                  onClick={() => toggleDeliv(d.kind)}
                  className={`neo-deliv ${on ? 'neo-deliv--on' : ''}`}
                >
                  <span className="neo-deliv-check">{on ? '✓' : ''}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{d.label}</span>
                    <span className="block text-[11px] text-neutral-500">{d.hint}</span>
                  </span>
                </button>
              )
            })}
          </div>
          {delivs.has('commits') && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-neutral-500">Commits mínimos:</span>
              <input
                className="neo-input w-20"
                type="number"
                min={1}
                value={commitsMin}
                onChange={(e) => setCommitsMin(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Entrega grupal */}
        <button type="button" onClick={() => setGroup((v) => !v)} className="flex items-center gap-3">
          <span className={`neo-switch ${group ? 'neo-switch--on' : ''}`}>
            <span className="neo-switch-knob" />
          </span>
          <span className="text-left">
            <span className="block text-sm font-medium text-neutral-200">Entrega grupal</span>
            <span className="block text-[11px] text-neutral-500">Una entrega por grupo, no por alumno</span>
          </span>
        </button>

        {error && <p className="text-xs text-amber-400">{error}</p>}

        <div className="flex flex-col gap-2 border-t border-white/5 pt-4 sm:flex-row">
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
