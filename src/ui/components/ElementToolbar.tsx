import { DRAW_ELEMENT_TYPES, type DrawElement } from '../../core'
import { shell } from '../styles/shell'

interface ElementToolbarProps {
  onAddElement: (type: DrawElement['type']) => void
}

function formatTypeShort(type: DrawElement['type']): string {
  return type.replace(/_/g, ' ').replace(/^(\w)/, (m) => m.toUpperCase())
}

export function ElementToolbar({ onAddElement }: ElementToolbarProps) {
  return (
    <div
      className={`flex shrink-0 flex-wrap gap-1 border-b ${shell.panelBorder} bg-[var(--shell-surface)] px-2 py-1.5`}
      aria-label="Add element"
    >
      {DRAW_ELEMENT_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          title={`Add ${type}`}
          className={`shrink-0 rounded-md border px-2 py-1 text-[11px] ${shell.button} hover:border-[var(--shell-accent)] hover:text-[var(--shell-accent)]`}
          onClick={() => onAddElement(type)}
        >
          {formatTypeShort(type)}
        </button>
      ))}
    </div>
  )
}
