'use client'

import { useEffect, useState } from 'react'
import { getSession } from '@/frontend/session/session'

export default function SessionValue({
  field,
  fallback,
}: {
  field: 'coins' | 'xp'
  fallback: number
}) {
  const [value, setValue] = useState(fallback)

  useEffect(() => {
    const s = getSession()
    const v = s?.[field]
    if (typeof v === 'number') setValue(v)
  }, [field])

  return <>{value.toLocaleString()}</>
}
