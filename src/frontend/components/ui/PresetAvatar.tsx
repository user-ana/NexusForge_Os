'use client'

import { useEffect, useState } from 'react'

// 8 carreras de ingeniería (1-8 = M, 9-16 = F → misma categoría por módulo)
const CATEGORIES = [
  { glyph: 'SW', tint: '#6d5bd0' }, // Software / Informática
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
        className={`object-cover ${className}`}
        // Los PNG son retratos con un marco circular + margen ya dibujado.
        // Encuadramos en la cara y hacemos zoom para que el personaje llene el
        // círculo y el margen sobrante quede recortado (sin el "aro" alrededor).
        style={{ width: px, height: px, objectPosition: '50% 24%', transform: 'scale(1.42)', transformOrigin: '50% 24%' }}
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
