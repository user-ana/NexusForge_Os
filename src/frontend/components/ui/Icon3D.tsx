'use client'

import { useState } from 'react'

interface Icon3DProps {
  src?: string
  alt?: string
  size?: number
  /** Texto corto a mostrar si la imagen no existe aún */
  fallback?: string
  className?: string
}

/**
 * Muestra un icono 3D (PNG/WebP). Si el archivo aún no existe, cae a un
 * placeholder neumórfico para no romper el layout mientras subes el arte.
 */
export default function Icon3D({ src, alt = '', size = 56, fallback = '?', className = '' }: Icon3DProps) {
  const [failed, setFailed] = useState(false)
  const px = `${size}px`

  if (!src || failed) {
    return (
      <div className={`neo-icon-fallback ${className}`} style={{ width: px, height: px }}>
        {fallback}
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={`neo-icon-3d ${className}`}
      style={{ width: px, height: px }}
    />
  )
}
