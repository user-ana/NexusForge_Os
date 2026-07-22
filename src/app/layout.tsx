import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'NexusForge OS',
  description: 'Collaborative platform for academic software engineering projects',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        {/* Aplica el tema guardado ANTES de pintar, para que no haya un parpadeo
            de oscuro→claro al cargar. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('nf_theme');if(t)document.documentElement.dataset.theme=t;}catch(e){}`,
          }}
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  )
}
