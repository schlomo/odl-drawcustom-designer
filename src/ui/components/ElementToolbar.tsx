import { DRAW_ELEMENT_TYPES, type DrawElement } from '../../core'
import {
  canAddElementType,
  DEBUG_GRID_ONCE_MESSAGE,
  type AddElementResult,
} from '../lib/add-element-guards'
import { ELEMENT_TYPE_ICONS } from '../lib/element-type-icons'
import { useElementToolbarLabels } from '../hooks/useElementToolbarLabels'
import { MdiIcon } from './MdiIcon'
import { shell } from '../styles/shell'

interface ElementToolbarProps {
  elements: readonly DrawElement[]
  onAddElement: (type: DrawElement['type']) => AddElementResult
}

function formatTypeTitle(type: DrawElement['type']): string {
  return type.replace(/_/g, ' ')
}

export function ElementToolbar({ elements, onAddElement }: ElementToolbarProps) {
  const { toolbarRef, showLabels } = useElementToolbarLabels()

  return (
    <div
      ref={toolbarRef}
      className={`flex w-full min-w-0 shrink-0 flex-wrap gap-1 border-b ${shell.panelBorder} bg-[var(--shell-surface)] px-2 py-1.5`}
      aria-label="Add element"
    >
      {DRAW_ELEMENT_TYPES.map((type) => {
        const { path, shortLabel } = ELEMENT_TYPE_ICONS[type]
        const allowed = canAddElementType(elements, type)
        const title = allowed
          ? `Add ${formatTypeTitle(type)}`
          : DEBUG_GRID_ONCE_MESSAGE

        return (
          <button
            key={type}
            type="button"
            data-element-toolbar
            title={title}
            disabled={!allowed}
            className={`inline-flex shrink-0 items-center gap-1 rounded-md border py-1 text-[11px] ${showLabels ? 'px-1.5' : 'px-1'} ${shell.button} hover:border-[var(--shell-accent)] hover:text-[var(--shell-accent)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--shell-border)] disabled:hover:bg-[var(--shell-surface-2)] disabled:hover:text-[var(--shell-text)]`}
            onClick={() => onAddElement(type)}
          >
            <MdiIcon path={path} size={16} className="shrink-0" />
            {showLabels ? <span>{shortLabel}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
