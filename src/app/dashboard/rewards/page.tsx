'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/frontend/components/layout/Header'
import Icon3D from '@/frontend/components/ui/Icon3D'
import RewardWheel, { type Reward } from '@/frontend/components/ui/RewardWheel'
import { getSession, DEFAULT_XP, normalizeStudentStats, canSpinToday } from '@/frontend/session/session'
import { syncStudentStats, earnReward, recordSpin } from '@/frontend/session/gamificationSync'
import { RANKS, levelFromXp, rankFromXp, xpToNextRank } from '@/shared/gamification'
import { useT } from '@/frontend/hooks/useT'

const ACHIEVEMENTS = [
  { name: 'First Commit', icon: '/icons/ach-commit.png', emoji: '◆', unlocked: true },
  { name: 'Code Master', icon: '/icons/ach-code.png', emoji: '◆', unlocked: true },
  { name: 'Champion', icon: '/icons/ach-trophy.png', emoji: '◆', unlocked: false },
  { name: 'Team Player', icon: '/icons/ach-team.png', emoji: '◆', unlocked: true, count: 3 },
  { name: 'Bug Slayer', icon: '/icons/ach-slots.png', emoji: '◆', unlocked: true, count: 1 },
  { name: 'Top Earner', icon: '/icons/ach-gold.png', emoji: '◆', unlocked: false },
]

const LOOT = [
  { name: 'XP Booster', rarity: '#c08a5a', rarityName: 'Common', coins: '250', drop: '40%', icon: '/icons/loot-xp.png', emoji: '◆' },
  { name: 'Coin Pouch', rarity: '#b8bcc4', rarityName: 'Rare', coins: '600', drop: '25%', icon: '/icons/loot-coins.png', emoji: '◆' },
  { name: 'Forge Crest', rarity: '#cdab63', rarityName: 'Epic', coins: '1500', drop: '12%', icon: '/icons/loot-crest.png', emoji: '◆' },
  { name: 'Nexus Core', rarity: '#8fd3df', rarityName: 'Legendary', coins: '5000', drop: '3%', icon: '/icons/loot-core.png', emoji: '◆' },
]

type Toast = { id: number; msg: string }

export default function RewardsPage() {
  const { t } = useT()
  const router = useRouter()
  const [xp, setXp] = useState(DEFAULT_XP)
  const [lastSpin, setLastSpin] = useState<number | undefined>(undefined)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [blocked, setBlocked] = useState(false) // catedrático: no accede a la capa de juego
  const tid = useRef(0)

  useEffect(() => {
    const s = getSession()
    // Recompensas es exclusivo del estudiante. Al catedrático lo devolvemos al dashboard.
    if (s?.role === 'teacher') {
      setBlocked(true)
      router.replace('/dashboard')
      return
    }
    normalizeStudentStats() // borra el XP/monedas inflados de la versión vieja
    ;(async () => {
      await syncStudentStats() // carga stats reales de la tabla (si existe)
      const s2 = getSession()
      if (s2) {
        setXp(s2.xp ?? DEFAULT_XP)
        setLastSpin(s2.lastSpin)
      }
    })()
  }, [router])

  function onSpinStart() {
    recordSpin() // registra el giro (tabla + sesión) para el límite diario
    setLastSpin(Date.now())
  }

  const rk = rankFromXp(xp)
  const lv = levelFromXp(xp)
  const nx = xpToNextRank(xp)

  function notify(msg: string) {
    const id = ++tid.current
    setToasts((t) => [...t, { id, msg }].slice(-4))
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600)
  }

  function onWin(r: Reward) {
    let dCoins = 0
    let dXp = 0
    let msg = ''
    if (r.kind === 'coins') {
      dCoins = r.amount
      msg = `+${r.amount} monedas`
    } else if (r.kind === 'xp') {
      dXp = r.amount
      msg = `+${r.amount} XP`
    } else {
      dCoins = 500
      msg = '¡Gema de rango! +500 monedas'
    }
    setXp((x) => x + dXp) // optimista (el nivel/rango sube al instante)
    void earnReward(dCoins, dXp) // persiste monedas + XP en la tabla (o local)
    notify(msg)
  }

  // Catedrático: no renderizamos la capa de juego mientras se redirige.
  if (blocked) return null

  return (
    <>
      {/* Toasts */}
      <div className="neo-toast-wrap">
        {toasts.map((toast) => (
          <div key={toast.id} className="neo-toast neo-toast--success">
            <span className="neo-toast-icon">
              <Icon3D src="/icons/coin.png" alt="coin" size={22} fallback="◆" />
            </span>
            <span className="neo-toast-msg">{toast.msg}</span>
          </div>
        ))}
      </div>

      <Header title={t('head.rewards.title')} subtitle={t('head.rewards.sub')} />

      <main className="flex-1 overflow-auto p-8 space-y-10">
        {/* Rango */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500 mb-4">
            {t('rw.your_rank')}
          </h2>
          <div className="neo-panel p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <Icon3D src={`/icons/rank-${rk.key}.png`} alt={rk.label} size={44} fallback="◆" />
                <div>
                  <p className="text-2xl font-bold text-white">{rk.label}</p>
                  <p className="text-sm text-neutral-500">
                    {xp.toLocaleString()} XP{nx.nextLabel ? ` · faltan ${nx.remaining.toLocaleString()} para ${nx.nextLabel}` : ' · rango máximo'}
                  </p>
                </div>
              </div>
              <span className="neo-chip neo-chip--gold">{t('prof.level')} {lv.level}</span>
            </div>

            <div className="neo-rank-track">
              {RANKS.map((r, i) => (
                <div key={r.key} className="flex flex-1 flex-col items-center gap-2">
                  <div className={`neo-gem ${i <= rk.index ? 'neo-gem--active' : 'neo-gem--locked'}`}>
                    <Icon3D src={`/icons/rank-${r.key}.png`} alt={r.label} size={38} fallback="◆" />
                  </div>
                  <span className={`text-[11px] ${i === rk.index ? 'text-white font-semibold' : 'text-neutral-500'}`}>
                    {r.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-black/40 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.5)]">
              <div className="h-full rounded-full bg-gradient-to-r from-[#b89bff] to-[#8b5cf6] transition-all" style={{ width: `${lv.pct}%` }} />
            </div>
          </div>
        </section>

        {/* Ruleta + Logros */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500 mb-4">
              {t('rw.wheel')}
            </h2>
            <div className="neo-panel flex flex-col items-center gap-3 p-8">
              <RewardWheel onResult={onWin} canSpin={canSpinToday(lastSpin)} onSpin={onSpinStart} cooldownLabel={t('rw.come_back')} />
              {!canSpinToday(lastSpin) && (
                <p className="text-xs text-neutral-500">{t('rw.spin_used')}</p>
              )}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500 mb-4">
              {t('prof.achievements')}
            </h2>
            <div className="neo-panel p-6">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-5">
                {ACHIEVEMENTS.map((a) => (
                  <div key={a.name} className={`neo-ach ${a.unlocked ? '' : 'neo-ach--locked'}`}>
                    <div className="neo-ach-circle">
                      {a.count && <span className="neo-ach-count">{a.count}</span>}
                      <Icon3D src={a.icon} alt={a.name} size={48} fallback={a.emoji} />
                    </div>
                    <span className="neo-ach-label">{a.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Loot */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500 mb-4">
            {t('rw.loot')}
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {LOOT.map((l) => (
              <div key={l.name} className="neo-loot" style={{ ['--rarity' as string]: l.rarity }}>
                <div className="flex justify-center py-2">
                  <Icon3D src={l.icon} alt={l.name} size={72} fallback={l.emoji} />
                </div>
                <p className="mt-2 text-center font-semibold text-white">{l.name}</p>
                <p className="text-center text-[11px] font-medium" style={{ color: l.rarity }}>
                  {l.rarityName}
                </p>
                <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3 text-xs text-neutral-500">
                  <span className="flex items-center gap-1">
                    <Icon3D src="/icons/coin.png" alt="coin" size={14} fallback="●" /> {l.coins}
                  </span>
                  <span>Drop {l.drop}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  )
}
