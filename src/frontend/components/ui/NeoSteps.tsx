'use client'

/**
 * Indicador de pasos para los formularios que van por etapas.
 * Deja claro que después de la etapa actual todavía viene otra, para que nadie
 * cierre el modal creyendo que ya terminó.
 *
 * `current` es el índice del paso en curso (base 0). Los anteriores se marcan
 * como cumplidos con un check y el riel se va llenando hasta ahí.
 *
 * Usa el prefijo neo-flow (no neo-step, que ya existe para las tarjetas del
 * manual y dibuja algo distinto).
 */
import { CheckIcon } from '@/frontend/components/ui/Icons'

export type Step = { label: string; hint?: string }

export default function NeoSteps({ steps, current }: { steps: Step[]; current: number }) {
  // El riel va del centro del primer punto al del último, así que el relleno se
  // mide en tramos entre puntos, no en pasos.
  const tramos = Math.max(1, steps.length - 1)
  const avance = Math.min(Math.max(current, 0), tramos) / tramos

  return (
    <div className="neo-flow" style={{ ['--n' as string]: steps.length }}>
      <div className="neo-flow-track">
        <span className="neo-flow-fill" style={{ width: `${avance * 100}%` }} />
      </div>

      <div className="neo-flow-row">
        {steps.map((s, i) => {
          const done = i < current
          const active = i === current
          const estado = done ? 'Completado' : active ? 'En curso' : 'Pendiente'
          return (
            <div
              key={s.label}
              className={`neo-flow-item ${done ? 'neo-flow-item--done' : ''} ${active ? 'neo-flow-item--active' : ''}`}
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <span className="neo-flow-dot">
                {done ? (
                  <span className="neo-flow-check">
                    <CheckIcon size={16} />
                  </span>
                ) : (
                  i + 1
                )}
              </span>
              <span className="neo-flow-label">{s.label}</span>
              <span className="neo-flow-hint">{s.hint ?? estado}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
