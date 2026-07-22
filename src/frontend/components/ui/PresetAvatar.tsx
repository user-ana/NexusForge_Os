'use client'

import { useEffect, useState } from 'react'

// 8 carreras de ingeniería (1-8 = M, 9-16 = F → misma categoría por módulo)
const CATEGORIES = [
  { glyph: 'SW', tint: '#1580c4' }, // Software / Informática
  { glyph: 'CV', tint: '#3d8fb0' }, // Civil
  { glyph: 'MC', tint: '#9a7b3f' }, // Mecánica
  { glyph: 'EL', tint: '#b0903d' }, // Eléctrica / Electrónica
  { glyph: 'IN', tint: '#4f9a6a' }, // Industrial
  { glyph: 'QM', tint: '#3f9a93' }, // Química
  { glyph: 'MT', tint: '#5b6bd0' }, // Mecatrónica / Robótica
  { glyph: 'AM', tint: '#5a9a4f' }, // Ambiental / Telecom
]

export function presetIndex(path?: string): number | null {
  const m = path?.match(/avatar-(\d+)\.png/)
  return m ? parseInt(m[1], 10) : null
}

interface PresetAvatarProps {
  src?: string
  index: number
  size?: number
  className?: string
}

export default function PresetAvatar({ src, index, size = 60, className = '' }: PresetAvatarProps) {
  const [failed, setFailed] = useState(false)
  const px = `${size}px`

  // Resetea el estado de error cuando cambia la imagen (evita que se quede
  // mostrando la anterior o el placeholder al cambiar de avatar)
  useEffect(() => {
    setFailed(false)
  }, [src])

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className={`object-cover object-center ${className}`}
        // Los PNG ya vienen recortados a un cuadrado centrado en la cara, así que
        // basta object-cover: llena el círculo (o el cuadrado) sin trucos de zoom.
        style={{ width: px, height: px }}
      />
    )
  }

  const c = CATEGORIES[(index - 1 + 8) % 8]
  return (
    <div
      className={`neo-preset ${className}`}
      style={{ width: px, height: px, fontSize: size * 0.4, ['--tint' as string]: c.tint }}
    >
      <span>{c.glyph}</span>
    </div>
  )
}
