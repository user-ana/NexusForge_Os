'use client'

import { useState } from 'react'
import Icon3D from './Icon3D'
import { useT } from '@/frontend/hooks/useT'

export type Reward = {
  label: string
  sub: string
  kind: 'coins' | 'xp' | 'gem'
  amount: number
}

const SEGMENTS: Reward[] = [
  { label: '50', sub: 'Coins', kind: 'coins', amount: 50 },
  { label: '120', sub: 'Coins', kind: 'coins', amount: 120 },
  { label: '+200', sub: 'XP', kind: 'xp', amount: 200 },
  { label: '300', sub: 'Coins', kind: 'coins', amount: 300 },
  { label: 'Gem', sub: 'Rank', kind: 'gem', amount: 1 },
  { label: '80', sub: 'Coins', kind: 'coins', amount: 80 },
  { label: '+500', sub: 'XP', kind: 'xp', amount: 500 },
  { label: '1000', sub: 'Coins', kind: 'coins', amount: 1000 },
]

const N = SEGMENTS.length
const SEG = 360 / N

function iconFor(r: Reward) {
  if (r.kind === 'coins') return { src: '/icons/coin.png', emoji: '◆' }
  if (r.kind === 'xp') return { src: '/icons/loot-xp.png', emoji: '◆' }
  return { src: '/icons/rank-gold.png', emoji: '◆' }
}

export default function RewardWheel({
  onResult,
  canSpin = true,
  onSpin,
  cooldownLabel,
}: {
  onResult?: (reward: Reward) => void
  canSpin?: boolean
  onSpin?: () => void
  cooldownLabel?: string
}) {
  const { t } = useT()
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<Reward | null>(null)

  function spin() {
    if (spinning || !canSpin) return
    onSpin?.() // registra el giro (para el límite diario) al empezar
    setSpinning(true)
    setResult(null)

    const idx = Math.floor(Math.random() * N)
    // Ángulo para que el CENTRO del segmento idx quede bajo el puntero (arriba)
    const targetMod = (360 - (idx * SEG + SEG / 2) + 360) % 360
    const current = ((rotation % 360) + 360) % 360
    const delta = (targetMod - current + 360) % 360
    const next = rotation + 360 * 5 + delta // 5 vueltas + ajuste exacto

    setRotation(next)
    setTimeout(() => {
      setSpinning(false)
      setResult(SEGMENTS[idx])
      onResult?.(SEGMENTS[idx])
    }, 4200)
  }

  const ic = result ? iconFor(result) : null

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="neo-wheel-wrap">
        <div className="neo-wheel-pointer" />

        <div className="neo-wheel" style={{ transform: `rotate(${rotation}deg)` }}>
          {SEGMENTS.map((s, i) => (
            <div
              key={i}
              className="neo-wheel-label"
              style={{ transform: `rotate(${i * SEG + SEG / 2}deg) translateY(-118px)` }}
            >
              <div style={{ transform: `rotate(${-(i * SEG + SEG / 2)}deg)` }} className="text-center">
                <p className="text-sm font-bold text-neutral-100 leading-none">{s.label}</p>
                <p className="text-[10px] text-neutral-500">{s.sub}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="neo-wheel-hub">
          <Icon3D src="/icons/chest.png" alt="Chest" size={52} fallback="◆" />
        </div>
      </div>

      <button onClick={spin} disabled={spinning || !canSpin} className={`neo-btn px-10 ${!canSpin && !spinning ? 'opacity-60' : ''}`}>
        {spinning ? t('rw.spinning') : !canSpin ? (cooldownLabel ?? t('rw.spin')) : t('rw.spin')}
      </button>

      {/* Mensaje de premio */}
      <div className="h-12 flex items-center">
        {result && ic && (
          <div className="neo-win" key={result.label + result.sub + rotation}>
            <Icon3D src={ic.src} alt="" size={26} fallback={ic.emoji} />
            <span>
              {t('rw.you_won')}{' '}
              <b className="text-white">
                {result.label} {result.sub}
              </b>
              !
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
