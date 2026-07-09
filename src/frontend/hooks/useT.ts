'use client'

import { useEffect, useState } from 'react'
import { DICTS, LANG_EVENT, getStoredLang, setStoredLang, type Lang } from '@/frontend/i18n/i18n'

/** Hook de traducción reactivo: t('clave') + idioma actual + cambiar idioma. */
export function useT() {
  const [lang, setLangState] = useState<Lang>('es')

  useEffect(() => {
    const sync = () => setLangState(getStoredLang())
    sync()
    window.addEventListener(LANG_EVENT, sync)
    return () => window.removeEventListener(LANG_EVENT, sync)
  }, [])

  const t = (key: string) => DICTS[lang][key] ?? key
  const setLang = (l: Lang) => setStoredLang(l)

  return { t, lang, setLang }
}
