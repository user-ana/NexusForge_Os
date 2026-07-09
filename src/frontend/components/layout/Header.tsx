import ProfileBar from '@/frontend/components/layout/ProfileBar'

interface HeaderProps {
  title: string
  subtitle?: string
  action?: React.ReactNode
}

export default function Header({ title, subtitle, action }: HeaderProps) {
  return (
    <header className="neo-topbar px-8 py-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">{title}</h1>
          {subtitle && <p className="text-neutral-500 text-sm mt-1">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-4">
          {action}
          <ProfileBar />
        </div>
      </div>
    </header>
  )
}
