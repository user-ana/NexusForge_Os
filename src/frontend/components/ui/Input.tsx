interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
  helperText?: string
}

export default function Input({
  label,
  error,
  icon,
  helperText,
  className = '',
  id,
  ...props
}: InputProps) {
  return (
    <div className="w-full space-y-2">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-text-secondary">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && <div className="absolute left-3 top-2.5 text-text-tertiary">{icon}</div>}
        <input
          id={id}
          className={`neo-input ${icon ? 'pl-10' : ''} ${error ? 'border-red-500 focus:border-red-500' : ''} ${className}`}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {helperText && !error && <p className="text-xs text-text-tertiary">{helperText}</p>}
    </div>
  )
}
