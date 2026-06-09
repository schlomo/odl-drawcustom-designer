import { TOOL_ICONS } from '../lib/mdi-tool-icons'
import { toolbarGroupRow } from '../lib/export-action-feedback'
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
    <div className={`${toolbarGroupRow} mt-3`} role="group" aria-label="Layer and delete">
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
      <IconButton
        compact
        variant="destructive"
        iconPath={TOOL_ICONS.delete}
        tooltip="Delete selected"
        onClick={onDelete}
      />
    </div>
  )
}
