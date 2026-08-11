/**
 * Iconos SVG monocromáticos (usan currentColor). Reemplazan a los emojis
 * para mantener una apariencia profesional y consistente.
 */
import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

function base({ size = 16, ...props }: P) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...props,
  }
}

export function TrashIcon(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

export function CheckIcon(p: P) {
  return (
    <svg {...base(p)} strokeWidth={2.4}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export function PencilIcon(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

export function SmileyIcon(p: P) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  )
}

export function TargetIcon(p: P) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
    </svg>
  )
}

export function TrophyIcon(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4v2a3 3 0 0 0 3 3" />
      <path d="M17 6h3v2a3 3 0 0 1-3 3" />
    </svg>
  )
}

export function FlameIcon(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M12 2c1 3 4 5 4 9a4 4 0 0 1-8 0c0-1 .5-2 1-3 .5 2 2 2 2 2s-1-3 1-8Z" />
    </svg>
  )
}

export function GlobeIcon(p: P) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
    </svg>
  )
}

export function CodeIcon(p: P) {
  return (
    <svg {...base(p)}>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  )
}

export function BuildingIcon(p: P) {
  return (
    <svg {...base(p)}>
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <line x1="9" y1="7" x2="9" y2="7.01" />
      <line x1="15" y1="7" x2="15" y2="7.01" />
      <line x1="9" y1="11" x2="9" y2="11.01" />
      <line x1="15" y1="11" x2="15" y2="11.01" />
      <path d="M10 21v-4h4v4" />
    </svg>
  )
}

export function GearIcon(p: P) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  )
}

export function ClipboardIcon(p: P) {
  return (
    <svg {...base(p)}>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 14l2 2 4-4" />
    </svg>
  )
}

export function RocketIcon(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M5 13c-1.5.5-2.5 2-3 4 2-.5 3.5-1.5 4-3" />
      <path d="M14 4c3 0 6 3 6 6 0 4-4 8-8 10l-4-4c2-4 6-8 6-12Z" />
      <circle cx="15" cy="9" r="1.5" />
      <path d="M9 15l-1-1" />
    </svg>
  )
}

export function GithubIcon(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M9 19c-4 1.5-4-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6.3 2.3 5.3 2.6 5.3 2.6a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
    </svg>
  )
}

export function LinkIcon(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
    </svg>
  )
}

export function PlayIcon(p: P) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="9" />
      <polygon points="10 8 16 12 10 16 10 8" />
    </svg>
  )
}

export function SearchIcon(p: P) {
  return (
    <svg {...base(p)}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

export function LockIcon(p: P) {
  return (
    <svg {...base(p)}>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <line x1="12" y1="14" x2="12" y2="17" />
    </svg>
  )
}

export function AlertIcon(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

export function GradCapIcon(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M22 10 12 5 2 10l10 5 10-5Z" />
      <path d="M6 12v5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5" />
      <line x1="22" y1="10" x2="22" y2="15" />
    </svg>
  )
}

export function TeacherIcon(p: P) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
      <rect x="3" y="2" width="18" height="4" rx="1" />
    </svg>
  )
}

export function ExpandIcon(p: P) {
  return (
    <svg {...base(p)}>
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  )
}

export function UsersIcon(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
      <circle cx="9" cy="7" r="3.2" />
      <path d="M22 20v-1.5a4 4 0 0 0-3-3.87" />
      <path d="M16.5 4.2a4 4 0 0 1 0 7.6" />
    </svg>
  )
}

export function CalendarIcon(p: P) {
  return (
    <svg {...base(p)}>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <line x1="3" y1="9.5" x2="21" y2="9.5" />
      <line x1="8" y1="2.5" x2="8" y2="6" />
      <line x1="16" y1="2.5" x2="16" y2="6" />
    </svg>
  )
}

export function ClockIcon(p: P) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  )
}

export function PlusCircleIcon(p: P) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8.5" x2="12" y2="15.5" />
      <line x1="8.5" y1="12" x2="15.5" y2="12" />
    </svg>
  )
}

export function UploadIcon(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M4 15.5V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3.5" />
      <polyline points="8 8 12 4 16 8" />
      <line x1="12" y1="4" x2="12" y2="15" />
    </svg>
  )
}

export function InboxIcon(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M3 13h4.5l1.5 2.5h6L16.5 13H21" />
      <path d="M5.5 5h13l2.5 8v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5l2.5-8Z" />
    </svg>
  )
}

export function ArrowRightIcon(p: P) {
  return (
    <svg {...base(p)}>
      <line x1="4" y1="12" x2="19" y2="12" />
      <polyline points="13 6 19 12 13 18" />
    </svg>
  )
}

export function LayersIcon(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M12 3 3 7.5 12 12l9-4.5L12 3Z" />
      <polyline points="3 12.5 12 17 21 12.5" />
      <polyline points="3 17 12 21.5 21 17" />
    </svg>
  )
}

export function DatabaseIcon(p: P) {
  return (
    <svg {...base(p)}>
      <ellipse cx="12" cy="5.5" rx="8" ry="3.2" />
      <path d="M4 5.5v13c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2v-13" />
      <path d="M4 12c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2" />
    </svg>
  )
}

export function MonitorIcon(p: P) {
  return (
    <svg {...base(p)}>
      <rect x="2.5" y="3.5" width="19" height="13" rx="2" />
      <line x1="8" y1="20.5" x2="16" y2="20.5" />
      <line x1="12" y1="16.5" x2="12" y2="20.5" />
    </svg>
  )
}

export function SparkIcon(p: P) {
  return (
    <svg {...base(p)} fill="currentColor" stroke="none">
      <path d="M12 2.5 13.7 9 20.5 12 13.7 15 12 21.5 10.3 15 3.5 12l6.8-3L12 2.5Z" />
    </svg>
  )
}

export function BoltIcon(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M13.5 2 4 13.5h6.5L10 22l9.5-11.5H13L13.5 2Z" />
    </svg>
  )
}

export function ChevronLeftIcon(p: P) {
  return (
    <svg {...base(p)} strokeWidth={2.2}>
      <polyline points="15 5 8 12 15 19" />
    </svg>
  )
}

export function ChevronRightIcon(p: P) {
  return (
    <svg {...base(p)} strokeWidth={2.2}>
      <polyline points="9 5 16 12 9 19" />
    </svg>
  )
}

export function QuoteIcon(p: P) {
  return (
    <svg {...base(p)} fill="currentColor" stroke="none">
      <path d="M9.4 5.5C6.3 6.9 4.4 9.6 4.4 12.8c0 3.2 1.9 5.4 4.5 5.4 2.1 0 3.7-1.5 3.7-3.5 0-1.9-1.4-3.3-3.2-3.3-.4 0-.8.1-1 .2.4-1.5 1.8-2.9 3.5-3.7l-2.5-2.4ZM18.6 5.5c-3.1 1.4-5 4.1-5 7.3 0 3.2 1.9 5.4 4.5 5.4 2.1 0 3.7-1.5 3.7-3.5 0-1.9-1.4-3.3-3.2-3.3-.4 0-.8.1-1 .2.4-1.5 1.8-2.9 3.5-3.7l-2.5-2.4Z" />
    </svg>
  )
}
