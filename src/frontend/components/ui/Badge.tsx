interface BadgeProps {
  label: string
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  size?: 'sm' | 'md'
}

export default function Badge({
  label,
  variant = 'primary',
  size = 'sm',
}: BadgeProps) {
  const variantClasses = {
    primary: 'bg-accent-violet bg-opacity-20 text-accent-violet',
    success: 'bg-green-500 bg-opacity-20 text-green-400',
    warning: 'bg-yellow-500 bg-opacity-20 text-yellow-400',
    danger: 'bg-red-500 bg-opacity-20 text-red-400',
    info: 'bg-accent-blue bg-opacity-20 text-accent-blue',
  }

  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1.5',
  }

  return (
    <span className={`inline-flex items-center rounded font-medium ${variantClasses[variant]} ${sizeClasses[size]}`}>
      {label}
    </span>
  )
}
