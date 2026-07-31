/** Iconos SVG del asistente Nexus (trazo, sin emojis). */

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const p = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (name) {
    case 'sparkles':
      return (
        <svg {...p}>
          <path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5 10.1 7.6z" />
          <path d="m19 15 .8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z" />
        </svg>
      )
    case 'plus':
      return <svg {...p}><path d="M12 5v14M5 12h14" /></svg>
    case 'globe':
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
        </svg>
      )
    case 'file':
      return <svg {...p}><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v5h5M9 12h6M9 16h6" /></svg>
    case 'image':
      return (
        <svg {...p}>
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <circle cx="9" cy="10" r="2" />
          <path d="m5 18 4-4 3 3 2-2 5 3" />
        </svg>
      )
    case 'translate':
      return (
        <svg {...p}>
          <path d="M4 5h9M8.5 3v2M6 8c1.2 3.2 3.4 5.5 6.5 7" />
          <path d="M12 8c-1.3 3.5-4 6.4-8 8M14 21l3.5-9 3.5 9M15.2 18h4.6" />
        </svg>
      )
    case 'wave':
      return <svg {...p}><path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" /></svg>
    case 'mic':
      return <svg {...p}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4M9 22h6" /></svg>
    case 'paperclip':
      return <svg {...p}><path d="m20.5 11.5-8.9 8.9a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 1 1-2.8-2.8l8.5-8.5" /></svg>
    case 'send':
      return <svg {...p}><path d="M22 2 11 13" /><path d="m22 2-7 20-4-9-9-4z" /></svg>
    case 'close':
      return <svg {...p}><path d="m6 6 12 12M18 6 6 18" /></svg>
    case 'sound':
      return <svg {...p}><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>
    case 'mute':
      return <svg {...p}><path d="M11 5 6 9H3v6h3l5 4z" /><path d="m22 9-6 6M16 9l6 6" /></svg>
    default:
      return null
  }
}
