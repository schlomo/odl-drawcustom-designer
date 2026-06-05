import type { DrawElement } from '../../core'
import { shell } from '../styles/shell'

interface PropertyPanelProps {
  element: DrawElement | null
  index: number | null
}

function formatValue(value: unknown): string {
  if (value == null) {
    return '—'
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

export function PropertyPanel({ element, index }: PropertyPanelProps) {
  if (!element || index == null) {
    return (
      <aside className={`flex w-72 shrink-0 flex-col border-l ${shell.panelBorder} ${shell.panel} p-4`}>
        <h2 className={shell.heading}>Properties</h2>
        <p className={`mt-4 text-sm ${shell.muted}`}>Select an element from the list or canvas.</p>
      </aside>
    )
  }

  const entries = Object.entries(element).filter(([key]) => key !== 'type')

  return (
    <aside className={`flex w-72 shrink-0 flex-col border-l ${shell.panelBorder} ${shell.panel}`}>
      <div className={`border-b ${shell.panelBorder} px-4 py-3`}>
        <h2 className={shell.heading}>Properties</h2>
        <p className="mt-1 text-sm text-[var(--shell-text)]">
          #{index + 1} · <span className="font-mono text-[var(--shell-accent)]">{element.type}</span>
        </p>
      </div>
      <dl className="flex-1 space-y-2 overflow-y-auto p-4">
        {entries.map(([key, value]) => (
          <div key={key} className="grid grid-cols-[7rem_1fr] gap-2 text-xs">
            <dt className={`truncate ${shell.muted}`}>{key}</dt>
            <dd className="break-all font-mono text-[var(--shell-text)]">{formatValue(value)}</dd>
          </div>
        ))}
      </dl>
    </aside>
  )
}
