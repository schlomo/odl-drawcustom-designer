import type { AssetUploadResult, DrawElement } from '../../core'
import { PROPERTY_PANEL_WIDTH_STORAGE_KEY } from '../preferences/keys'
import { useResizablePanelWidth } from '../hooks/useResizablePanelWidth'
import { ElementPropertyForm } from './ElementPropertyForm'
import { shell } from '../styles/shell'

const MIN_PROPERTY_WIDTH = 240
const MAX_PROPERTY_WIDTH = 560
const DEFAULT_PROPERTY_WIDTH = 288

interface PropertyPanelProps {
  element: DrawElement | null
  index: number | null
  elementCount: number
  fontKeys: string[]
  onPropertyChange: (key: string, value: unknown) => void
  onUploadFont: (file: File) => Promise<AssetUploadResult>
  onUploadImageForUrl: (urlKey: string, file: File) => Promise<AssetUploadResult>
  onDelete: () => void
  onBringToFront: () => void
  onSendToBack: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

export function PropertyPanel({
  element,
  index,
  elementCount,
  fontKeys,
  onPropertyChange,
  onUploadFont,
  onUploadImageForUrl,
  onDelete,
  onBringToFront,
  onSendToBack,
  onMoveUp,
  onMoveDown,
}: PropertyPanelProps) {
  const { width, startResize } = useResizablePanelWidth({
    storageKey: PROPERTY_PANEL_WIDTH_STORAGE_KEY,
    defaultWidth: DEFAULT_PROPERTY_WIDTH,
    minWidth: MIN_PROPERTY_WIDTH,
    maxWidth: MAX_PROPERTY_WIDTH,
  })

  if (!element || index == null) {
    return (
      <aside
        style={{ width }}
        className={`relative flex shrink-0 flex-col border-l ${shell.panelBorder} ${shell.panel} p-4`}
      >
        <div
          role="separator"
          aria-label="Resize properties panel"
          aria-orientation="vertical"
          className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize hover:bg-[var(--shell-hover)]"
          onMouseDown={startResize}
        />
        <h2 className={shell.heading}>Properties</h2>
        <p className={`mt-4 text-sm ${shell.muted}`}>Select an element from the list or canvas.</p>
      </aside>
    )
  }

  const canMoveUp = index < elementCount - 1
  const canMoveDown = index > 0

  return (
    <aside
      style={{ width }}
      className={`relative flex shrink-0 flex-col border-l ${shell.panelBorder} ${shell.panel}`}
    >
      <div
        role="separator"
        aria-label="Resize properties panel"
        aria-orientation="vertical"
        className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize hover:bg-[var(--shell-hover)]"
        onMouseDown={startResize}
      />
      <div className={`border-b ${shell.panelBorder} px-4 py-3 pl-5`}>
        <h2 className={shell.heading}>Properties</h2>
        <p className="mt-1 text-sm text-[var(--shell-text)]">
          #{index + 1} · <span className="font-mono text-[var(--shell-accent)]">{element.type}</span>
        </p>
        <div className="mt-3 flex flex-wrap gap-1">
          <button type="button" className={shell.button} onClick={onBringToFront} disabled={!canMoveUp}>
            Front
          </button>
          <button type="button" className={shell.button} onClick={onSendToBack} disabled={!canMoveDown}>
            Back
          </button>
          <button type="button" className={shell.button} onClick={onMoveUp} disabled={!canMoveUp}>
            ↑
          </button>
          <button type="button" className={shell.button} onClick={onMoveDown} disabled={!canMoveDown}>
            ↓
          </button>
          <button
            type="button"
            className="rounded-md border border-red-500/40 px-2 py-1 text-xs text-red-400 hover:bg-red-500/10"
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 pl-5">
        <ElementPropertyForm
          element={element}
          fontKeys={fontKeys}
          onPropertyChange={onPropertyChange}
          onUploadFont={onUploadFont}
          onUploadImageForUrl={onUploadImageForUrl}
        />
      </div>
    </aside>
  )
}
