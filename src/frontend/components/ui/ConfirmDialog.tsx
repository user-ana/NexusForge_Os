'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { TrashIcon } from '@/frontend/components/ui/Icons'

/** Modal de confirmación reutilizable (mate). Para acciones destructivas. */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Sí, eliminar',
  icon = <TrashIcon size={22} />,
  danger = true,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  icon?: ReactNode
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!open || !mounted) return null

  return createPortal(
    <div className="neo-modal-backdrop" onClick={onCancel}>
      <div className="neo-modal space-y-4 text-center" onClick={(e) => e.stopPropagation()}>
        <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${danger ? 'bg-red-500/15 text-red-300' : 'bg-accent-violet/15 text-accent-violet'}`}>
          {icon}
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <p className="mt-1 text-sm text-neutral-400">{message}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="neo-btn-ghost flex-1 justify-center">Cancelar</button>
          <button
            onClick={onConfirm}
            className={`neo-btn flex-1 justify-center ${danger ? '!bg-red-500/90 hover:!bg-red-500' : ''}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
