interface CardProps {
  children: React.ReactNode
  className?: string
  hover?: boolean
  rank?: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'
}

export default function Card({ children, className = '', hover = false }: CardProps) {
  return (
    <div className={`neo-panel ${hover ? 'neo-panel--hover' : ''} p-6 ${className}`}>
      {children}
    </div>
  )
}
