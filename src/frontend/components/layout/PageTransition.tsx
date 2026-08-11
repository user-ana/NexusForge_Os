'use client'

import { usePathname } from 'next/navigation'

/** Anima el contenido al navegar entre páginas del dashboard (fundido + leve subida). */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    // min-w-0 no es decorativo: un elemento flexible trae min-width:auto, asi que
    // se niega a encogerse por debajo del ancho minimo de su contenido y empuja
    // toda la aplicacion mas alla de la ventana. Sin esto, la pagina del
    // asistente (robot de 420px + compositor de 900px) saca una barra de
    // desplazamiento horizontal en TODO el panel.
    <div key={pathname} className="neo-page flex min-w-0 flex-1 flex-col overflow-hidden">
      {children}
    </div>
  )
}
