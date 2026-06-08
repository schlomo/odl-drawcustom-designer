import type { ReactNode } from 'react'
import { shell } from '../styles/shell'

interface FeatureToggleProps {
  enabled: boolean
  onToggle: () => void
  title: string
  children: ReactNode
}

export function FeatureToggle({ enabled, onToggle, title, children }: FeatureToggleProps) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
        enabled
          ? 'border-[var(--shell-accent)] bg-[var(--shell-accent)] text-white shadow-inner ring-1 ring-inset ring-black/15'
          : `${shell.button} opacity-80`
      }`}
      onClick={onToggle}
      aria-pressed={enabled}
      title={title}
    >
      {children}
    </button>
  )
}
