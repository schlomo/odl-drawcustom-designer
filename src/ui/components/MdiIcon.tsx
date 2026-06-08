interface MdiIconProps {
  path: string
  size?: number
  className?: string
}

export function MdiIcon({ path, size = 16, className }: MdiIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden
      role="presentation"
    >
      <path d={path} fill="currentColor" />
    </svg>
  )
}
