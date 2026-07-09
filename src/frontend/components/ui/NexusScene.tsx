/**
 * NexusScene — Panel de marca para autenticación.
 * Muestra el logo oficial de NexusForge OS con un glow violeta que respira
 * y una flotación sutil. Acepta contenido superpuesto (botones sociales).
 */

import Image from 'next/image'

export default function NexusScene({ children }: { children?: React.ReactNode }) {
  return (
    <div className="neo-space relative min-h-[420px] md:min-h-0 overflow-hidden">
      <div className="relative z-10 flex h-full min-h-[420px] flex-col p-8 md:min-h-0">
        {/* Logo + nombre que se escribe */}
        <div className="flex flex-1 flex-col items-center justify-center gap-0 mb-10">
          <Image
            src="/logonexus.png"
            alt="NexusForge OS"
            width={560}
            height={560}
            priority
            className="neo-logo h-auto w-full max-w-[74%] object-contain -mb-10"
          />

          <div className="flex flex-col items-center gap-2.5">
            <span className="neo-typewrap">
              {/* Fantasma: define el ancho real del texto */}
              <span className="neo-ghost" aria-hidden="true">
                NEXUSFORGE<span className="neo-wordmark-os">OS</span>
              </span>
              {/* Línea que se escribe con el cursor avanzando */}
              <span className="neo-typeline">
                NEXUSFORGE<span className="neo-wordmark-os">OS</span>
              </span>
            </span>
            <div className="neo-tagline">Gamified Development Platform</div>
          </div>
        </div>

        {/* Sociales superpuestos */}
        {children}
      </div>
    </div>
  )
}
