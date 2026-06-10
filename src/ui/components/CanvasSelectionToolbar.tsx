import type { ElementAlign } from '../lib/align-elements'
import type { ElementBounds } from '../lib/primitive-bounds'
import { TOOL_ICONS } from '../lib/mdi-tool-icons'
import {
  floatingToolbarShell,
  toolbarDivider,
  toolbarGroupRow,
} from '../lib/export-action-feedback'
import { IconButton } from './IconButton'
import { shell } from '../styles/shell'

const HORIZONTAL_ALIGNS: { align: ElementAlign; icon: keyof typeof TOOL_ICONS; title: string }[] =
  [
    { align: 'left', icon: 'alignLeft', title: 'Align left' },
    { align: 'center', icon: 'alignCenter', title: 'Align center' },
    { align: 'right', icon: 'alignRight', title: 'Align right' },
  ]

const VERTICAL_ALIGNS: { align: ElementAlign; icon: keyof typeof TOOL_ICONS; title: string }[] = [
  { align: 'top', icon: 'alignTop', title: 'Align top' },
  { align: 'middle', icon: 'alignMiddle', title: 'Align middle' },
  { align: 'bottom', icon: 'alignBottom', title: 'Align bottom' },
]

interface CanvasSelectionToolbarProps {
  selectionCount: number
  canAlign: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onAlign: (align: ElementAlign, boundsByIndex: Map<number, ElementBounds>) => void
  boundsByIndex: Map<number, ElementBounds>
  onBringToFront: () => void
  onSendToBack: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

export function CanvasSelectionToolbar({
  selectionCount,
  canAlign,
  canMoveUp,
  canMoveDown,
  onAlign,
  boundsByIndex,
  onBringToFront,
  onSendToBack,
  onMoveUp,
  onMoveDown,
}: CanvasSelectionToolbarProps) {
  if (selectionCount < 2) {
    return null
  }

  const alignTooltip = (title: string) =>
    canAlign ? title : `${title} (disabled — selection includes templated geometry)`

  return (
    <div
      className={`absolute left-1/2 top-3 z-40 -translate-x-1/2 ${floatingToolbarShell}`}
      role="toolbar"
      aria-label="Multi-selection tools"
    >
      <span className={`shrink-0 px-2 text-xs whitespace-nowrap ${shell.muted}`}>
        {selectionCount} selected
      </span>
      <span className={toolbarDivider} aria-hidden />
      <div className={toolbarGroupRow} role="group" aria-label="Align horizontally">
        {HORIZONTAL_ALIGNS.map(({ align, icon, title }) => (
          <IconButton
            key={align}
            compact
            iconPath={TOOL_ICONS[icon]}
            tooltip={alignTooltip(title)}
            disabled={!canAlign}
            onClick={() => onAlign(align, boundsByIndex)}
          />
        ))}
      </div>
      <span className={toolbarDivider} aria-hidden />
      <div className={toolbarGroupRow} role="group" aria-label="Align vertically">
        {VERTICAL_ALIGNS.map(({ align, icon, title }) => (
          <IconButton
            key={align}
            compact
            iconPath={TOOL_ICONS[icon]}
            tooltip={alignTooltip(title)}
            disabled={!canAlign}
            onClick={() => onAlign(align, boundsByIndex)}
          />
        ))}
      </div>
      <span className={toolbarDivider} aria-hidden />
      <div className={toolbarGroupRow} role="group" aria-label="Layer order">
        <IconButton
          compact
          iconPath={TOOL_ICONS.bringToFront}
          tooltip="Bring to front"
          disabled={!canMoveUp}
          onClick={onBringToFront}
        />
        <IconButton
          compact
          iconPath={TOOL_ICONS.sendToBack}
          tooltip="Send to back"
          disabled={!canMoveDown}
          onClick={onSendToBack}
        />
        <IconButton
          compact
          iconPath={TOOL_ICONS.layerUp}
          tooltip="Move layer up"
          disabled={!canMoveUp}
          onClick={onMoveUp}
        />
        <IconButton
          compact
          iconPath={TOOL_ICONS.layerDown}
          tooltip="Move layer down"
          disabled={!canMoveDown}
          onClick={onMoveDown}
        />
      </div>
    </div>
  )
}
