'use client'

import { usePathname } from 'next/navigation'

/** Anima el contenido al navegar entre páginas del dashboard (fundido + leve subida). */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div key={pathname} className="neo-page flex flex-1 flex-col overflow-hidden">
      {children}
    </div>
  )
}
