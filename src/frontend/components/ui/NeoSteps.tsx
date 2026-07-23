'use client'

/**
 * Indicador de pasos para los formularios que van por etapas.
 * Deja claro que después de la etapa actual todavía viene otra, para que nadie
 * cierre el modal creyendo que ya terminó.
 *
 * `current` es el índice del paso en curso (base 0). Los anteriores se marcan
 * como cumplidos con un check.
 */
import { CheckIcon } from '@/frontend/components/ui/Icons'

export type Step = { label: string; hint?: string }

export default function NeoSteps({ steps, current }: { steps: Step[]; current: number }) {
  return (
    <div className="neo-steps">
      {steps.map((s, i) => {
        const done = i < current
        const active = i === current
        const estado = done ? 'Completado' : active ? 'En curso' : 'Pendiente'
        return (
          <div
            key={s.label}
            className={`neo-step ${done ? 'neo-step--done' : ''} ${active ? 'neo-step--active' : ''}`}
          >
            <span className="neo-step-dot">{done ? <CheckIcon size={16} /> : i + 1}</span>
            <span className="neo-step-label">{s.label}</span>
            <span className="neo-step-hint">{s.hint ?? estado}</span>
          </div>
        )
      })}
    </div>
  )
}
