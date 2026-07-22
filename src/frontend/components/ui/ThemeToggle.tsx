'use client'

import { useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'

/**
 * Interruptor de tema (claro/oscuro). Guarda la preferencia y la aplica al
 * documento (data-theme). El CSS reacciona a ese atributo.
 *
 * Nota: por ahora el modo claro solo está estilizado en el login (piloto);
 * el resto de la app se ve igual hasta que se convierta pantalla por pantalla.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const saved = (localStorage.getItem('nf_theme') as Theme) || 'dark'
    setTheme(saved)
    document.documentElement.dataset.theme = saved
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('nf_theme', next) } catch { /* ignore */ }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`neo-theme ${theme === 'light' ? 'neo-theme--light' : ''}`}
      title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      aria-label="Cambiar tema"
    >
      <span className="neo-theme-knob">{theme === 'dark' ? <Moon /> : <Sun />}</span>
    </button>
  )
}

function Sun() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}
function Moon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}
