'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import PresetAvatar from '@/frontend/components/ui/PresetAvatar'
import { setAvatar } from '@/frontend/session/session'
import { useT } from '@/frontend/hooks/useT'

// Solo los avatares que existen en public/avatars/ (evita 404 en consola).
// Para agregar más, sube el PNG y añade su número aquí.
const AVATAR_IDS = [1, 2, 3, 4, 5, 9]
const PRESETS = AVATAR_IDS.map((n) => ({ id: n, src: `/avatars/avatar-${n}.png` }))

export default function AvatarPicker({
  current,
  onClose,
}: {
  current?: string
  onClose: () => void
}) {
  const { t } = useT()
  const [mounted, setMounted] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => setMounted(true), [])

  function choose(src: string) {
    setAvatar(src)
    onClose()
  }

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new window.Image()
      img.onload = () => {
        // Redimensiona a 256x256 (cover) para que quepa en localStorage
        const SIZE = 256
        const canvas = document.createElement('canvas')
        canvas.width = SIZE
        canvas.height = SIZE
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          choose(reader.result as string)
          return
        }
        const scale = Math.max(SIZE / img.width, SIZE / img.height)
        const w = img.width * scale
        const h = img.height * scale
        ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h)
        choose(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.onerror = () => choose(reader.result as string)
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  if (!mounted) return null

  return createPortal(
    <div className="neo-modal-backdrop" onClick={onClose}>
      <div className="neo-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">{t('prof.choose_avatar')}</h3>
          <button onClick={onClose} className="text-neutral-500 hover:text-white">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {PRESETS.map(({ id, src }) => (
            <button
              key={src}
              onClick={() => choose(src)}
              className={`neo-avatar-option ${current === src ? 'neo-avatar-option--active' : ''}`}
            >
              <PresetAvatar src={src} index={id} size={68} className="h-full w-full !rounded-xl" />
            </button>
          ))}
        </div>

        <button onClick={() => fileRef.current?.click()} className="neo-btn-ghost mt-4 w-full justify-center">
          {t('prof.upload')}
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={onUpload} className="hidden" />
      </div>
    </div>,
    document.body,
  )
}
