import { shell } from '../styles/shell'
import { LinkCouplingIcon } from './LinkCouplingIcon'

interface YamlCouplingToggleProps {
  enabled: boolean
  onToggle: () => void
}

export function YamlCouplingToggle({ enabled, onToggle }: YamlCouplingToggleProps) {
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
      title={
        enabled
          ? 'YAML, canvas, and element list stay in sync. Click to unlink.'
          : 'Editors are independent. Click to link YAML, canvas, and list.'
      }
    >
      <LinkCouplingIcon />
      <span>Linked</span>
    </button>
  )
}
