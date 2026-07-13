'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type NeoOption = { value: string; label: string }

export default function NeoSelect({
  value,
  options,
  onChange,
}: {
  value: string
  options: NeoOption[]
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [pos, setPos] = useState<{ left: number; width: number; top: number | null; bottom: number | null }>({
    left: 0,
    width: 0,
    top: 0,
    bottom: null,
  })
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => setMounted(true), [])

  const current = options.find((o) => o.value === value)

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - r.bottom
      const MENU_MAX = 260
      // Si no cabe abajo y hay más espacio arriba, se abre hacia arriba.
      if (spaceBelow < MENU_MAX && r.top > spaceBelow) {
        setPos({ left: r.left, width: r.width, top: null, bottom: window.innerHeight - r.top + 6 })
      } else {
        setPos({ left: r.left, width: r.width, top: r.bottom + 6, bottom: null })
      }
    }
    setOpen((o) => !o)
  }

  return (
    <>
      <button ref={btnRef} type="button" onClick={toggle} className="neo-input flex w-full items-center justify-between gap-2 text-left">
        <span className="truncate">{current?.label ?? ''}</span>
        <svg className={`neo-sel-chev ${open ? 'neo-sel-chev--up' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open &&
        mounted &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[95]" onClick={() => setOpen(false)} />
            <div
              className="neo-sel-menu"
              style={{
                position: 'fixed',
                left: pos.left,
                minWidth: pos.width,
                maxHeight: 260,
                overflowY: 'auto',
                ...(pos.top !== null ? { top: pos.top } : { bottom: pos.bottom ?? 0 }),
              }}
            >
              {options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false) }}
                  className={`neo-sel-opt ${o.value === value ? 'neo-sel-opt--active' : ''}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </>
  )
}
