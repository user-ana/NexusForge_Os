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
      <body>
        {children}
      </body>
    </html>
  )
}
