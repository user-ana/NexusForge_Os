'use client'

import { useRef, useState, type CSSProperties } from 'react'

interface Tilt3DCardProps {
  children: React.ReactNode
  className?: string
  /** Intensidad del giro en grados (default 8) */
  max?: number
}

export default function Tilt3DCard({ children, className = '', max = 8 }: Tilt3DCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<CSSProperties>({})

  function handleMove(e: React.MouseEvent) {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width // 0..1
    const py = (e.clientY - r.top) / r.height
    const rx = (0.5 - py) * max
    const ry = (px - 0.5) * max
    setStyle({
      transform: `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(1.03)`,
    })
  }

  function handleLeave() {
    setStyle({ transform: 'perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)' })
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={style}
      className={`neo-tilt ${className}`}
    >
      <div className="neo-tilt-inner">{children}</div>
    </div>
  )
}
