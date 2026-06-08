import type { ElementAlign } from '../lib/align-elements'
import type { ElementBounds } from '../lib/primitive-bounds'
import { TOOL_ICONS } from '../lib/mdi-tool-icons'
import {
  floatingToolbarShell,
  toolbarDivider,
  toolbarGroup,
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

  return (
    <div
      className={`absolute left-1/2 top-3 z-40 -translate-x-1/2 ${floatingToolbarShell}`}
      role="toolbar"
      aria-label="Multi-selection tools"
    >
      <span className={`px-2 text-xs ${shell.muted}`}>{selectionCount} selected</span>
      <span className={toolbarDivider} aria-hidden />
      <div className={toolbarGroup} role="group" aria-label="Align horizontally">
        {HORIZONTAL_ALIGNS.map(({ align, icon, title }) => (
          <IconButton
            key={align}
            compact
            iconPath={TOOL_ICONS[icon]}
            title={title}
            onClick={() => onAlign(align, boundsByIndex)}
          />
        ))}
      </div>
      <span className={toolbarDivider} aria-hidden />
      <div className={toolbarGroup} role="group" aria-label="Align vertically">
        {VERTICAL_ALIGNS.map(({ align, icon, title }) => (
          <IconButton
            key={align}
            compact
            iconPath={TOOL_ICONS[icon]}
            title={title}
            onClick={() => onAlign(align, boundsByIndex)}
          />
        ))}
      </div>
      <span className={toolbarDivider} aria-hidden />
      <div className={toolbarGroup} role="group" aria-label="Layer order">
        <IconButton
          compact
          iconPath={TOOL_ICONS.bringToFront}
          title="Bring to front"
          disabled={!canMoveUp}
          onClick={onBringToFront}
        />
        <IconButton
          compact
          iconPath={TOOL_ICONS.sendToBack}
          title="Send to back"
          disabled={!canMoveDown}
          onClick={onSendToBack}
        />
        <IconButton
          compact
          iconPath={TOOL_ICONS.layerUp}
          title="Move layer up"
          disabled={!canMoveUp}
          onClick={onMoveUp}
        />
        <IconButton
          compact
          iconPath={TOOL_ICONS.layerDown}
          title="Move layer down"
          disabled={!canMoveDown}
          onClick={onMoveDown}
        />
      </div>
    </div>
  )
}
