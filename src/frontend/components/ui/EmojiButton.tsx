'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { EmojiClickData, Theme, EmojiStyle } from 'emoji-picker-react'
import { SmileyIcon } from '@/frontend/components/ui/Icons'

// Carga el selector solo en el cliente (accede a APIs del navegador)
const Picker = dynamic(() => import('emoji-picker-react'), { ssr: false })

/** Botón que abre un selector de emojis (buscador + categorías) para el mensaje. */
export default function EmojiButton({
  onPick,
  className = '',
}: {
  onPick: (emoji: string) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className={className} title="Emojis" aria-label="Emojis">
        <SmileyIcon size={18} />
      </button>
      {open && (
        <div className="absolute bottom-[calc(100%+10px)] left-0 z-50 overflow-hidden rounded-2xl shadow-2xl">
          <Picker
            onEmojiClick={(d: EmojiClickData) => {
              onPick(d.emoji)
              setOpen(false)
            }}
            theme={'dark' as unknown as Theme}
            emojiStyle={'native' as unknown as EmojiStyle}
            lazyLoadEmojis
            searchPlaceholder="Buscar emoji…"
            width={320}
            height={380}
          />
        </div>
      )}
    </div>
  )
}
