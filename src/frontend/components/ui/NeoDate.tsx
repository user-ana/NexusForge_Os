'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const WEEK_ES = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate()
}
function firstWeekdayMon(y: number, m: number) {
  // 0 = lunes
  return (new Date(y, m, 1).getDay() + 6) % 7
}
function pad(n: number) {
  return String(n).padStart(2, '0')
}

export default function NeoDate({
  value,
  onChange,
  placeholder = 'dd/mm/aaaa',
}: {
  value: string // 'YYYY-MM-DD'
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [view, setView] = useState(() => (value ? { y: +value.slice(0, 4), m: +value.slice(5, 7) - 1 } : { y: 2026, m: 5 }))
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => setMounted(true), [])

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 6, left: r.left })
    }
    setOpen((o) => !o)
  }
  function pick(day: number) {
    onChange(`${view.y}-${pad(view.m + 1)}-${pad(day)}`)
    setOpen(false)
  }
  function prev() {
    setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))
  }
  function next() {
    setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))
  }

  const display = value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : ''
  const blanks = firstWeekdayMon(view.y, view.m)
  const total = daysInMonth(view.y, view.m)
  const selected = value && +value.slice(0, 4) === view.y && +value.slice(5, 7) - 1 === view.m ? +value.slice(8, 10) : -1

  return (
    <>
      <button ref={btnRef} type="button" onClick={toggle} className="neo-input flex w-full items-center justify-between gap-2 text-left">
        <span className={display ? '' : 'text-neutral-600'}>{display || placeholder}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-500">
          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>

      {open &&
        mounted &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[95]" onClick={() => setOpen(false)} />
            <div className="neo-cal" style={{ position: 'fixed', top: pos.top, left: pos.left }}>
              <div className="mb-2 flex items-center justify-between">
                <button type="button" onClick={prev} className="neo-cal-nav">‹</button>
                <span className="text-sm font-semibold text-white">{MONTHS_ES[view.m]} {view.y}</span>
                <button type="button" onClick={next} className="neo-cal-nav">›</button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center">
                {WEEK_ES.map((w) => (
                  <span key={w} className="py-1 text-[10px] font-semibold text-neutral-600">{w}</span>
                ))}
                {Array.from({ length: blanks }).map((_, i) => (
                  <span key={`b${i}`} />
                ))}
                {Array.from({ length: total }).map((_, i) => {
                  const day = i + 1
                  return (
                    <button key={day} type="button" onClick={() => pick(day)} className={`neo-cal-day ${day === selected ? 'neo-cal-day--sel' : ''}`}>
                      {day}
                    </button>
                  )
                })}
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  )
}
