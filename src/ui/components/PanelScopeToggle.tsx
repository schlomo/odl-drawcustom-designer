import { shell } from '../styles/shell'

export type PanelListScope = 'current' | 'all'

interface PanelScopeToggleProps {
  scope: PanelListScope
  onScopeChange: (scope: PanelListScope) => void
}

export function PanelScopeToggle({ scope, onScopeChange }: PanelScopeToggleProps) {
  return (
    <div
      className={`flex shrink-0 overflow-hidden rounded-md border ${shell.panelBorder}`}
      role="group"
      aria-label="Show current payload or all stored entries"
    >
      {(['current', 'all'] as const).map((option) => (
        <button
          key={option}
          type="button"
          className={`px-1.5 py-0.5 text-[10px] font-medium capitalize ${
            scope === option
              ? 'bg-[var(--shell-accent)] text-white'
              : 'text-[var(--shell-muted)] hover:bg-[var(--shell-hover)] hover:text-[var(--shell-text)]'
          }`}
          aria-pressed={scope === option}
          onClick={() => onScopeChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  )
}
