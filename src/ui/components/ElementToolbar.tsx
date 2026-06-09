import { DRAW_ELEMENT_TYPES, type DrawElement } from '../../core'
import {
  canAddElementType,
  DEBUG_GRID_ONCE_MESSAGE,
  type AddElementResult,
} from '../lib/add-element-guards'
import { ELEMENT_TYPE_ICONS } from '../lib/element-type-icons'
import { collapsedToolbarTooltip } from '../lib/toolbar-tooltip'
import { useElementToolbarLabels } from '../hooks/useElementToolbarLabels'
import { IconButton } from './IconButton'
import { shell } from '../styles/shell'

interface ElementToolbarProps {
  elements: readonly DrawElement[]
  onAddElement: (type: DrawElement['type']) => AddElementResult
}

function formatTypeTitle(type: DrawElement['type']): string {
  return type.replace(/_/g, ' ')
}

const elementButtonClassName =
  'text-[11px] hover:border-[var(--shell-accent)] hover:text-[var(--shell-accent)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--shell-border)] disabled:hover:bg-[var(--shell-surface-2)] disabled:hover:text-[var(--shell-text)]'

export function ElementToolbar({ elements, onAddElement }: ElementToolbarProps) {
  const { toolbarRef, showLabels } = useElementToolbarLabels()

  return (
    <div
      ref={toolbarRef}
      className={`flex w-full min-w-0 shrink-0 flex-nowrap gap-1 overflow-visible border-b ${shell.panelBorder} bg-[var(--shell-surface)] px-2 py-1.5`}
      aria-label="Add element"
    >
      {DRAW_ELEMENT_TYPES.map((type) => {
        const { path, shortLabel } = ELEMENT_TYPE_ICONS[type]
        const allowed = canAddElementType(elements, type)
        const addTitle = allowed
          ? `Add ${formatTypeTitle(type)}`
          : DEBUG_GRID_ONCE_MESSAGE
        const tooltip = collapsedToolbarTooltip(shortLabel, showLabels, addTitle)

        return (
          <IconButton
            key={type}
            iconPath={path}
            iconSize={16}
            label={showLabels ? shortLabel : undefined}
            compact={!showLabels}
            tooltip={shortLabel}
            title={tooltip}
            aria-label={addTitle}
            disabled={!allowed}
            className={`${elementButtonClassName} ${showLabels ? '' : 'px-1'}`}
            onClick={() => onAddElement(type)}
            data-element-toolbar
          />
        )
      })}
    </div>
  )
}
