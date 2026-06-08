import { TOOL_ICONS } from '../lib/mdi-tool-icons'
import { toolbarGroup } from '../lib/export-action-feedback'
import { IconButton } from './IconButton'

interface LayerActionBarProps {
  canMoveUp: boolean
  canMoveDown: boolean
  onBringToFront: () => void
  onSendToBack: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
}

export function LayerActionBar({
  canMoveUp,
  canMoveDown,
  onBringToFront,
  onSendToBack,
  onMoveUp,
  onMoveDown,
  onDelete,
}: LayerActionBarProps) {
  return (
    <div className={`${toolbarGroup} mt-3`} role="group" aria-label="Layer and delete">
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
      <IconButton
        compact
        iconPath={TOOL_ICONS.delete}
        title="Delete selected"
        className="border-[var(--shell-danger-border)] text-[var(--shell-danger-fg)] hover:bg-[var(--shell-danger-border)] hover:text-white"
        onClick={onDelete}
      />
    </div>
  )
}
