import type { AssetUploadResult, DrawElement } from '../../core'
import { PROPERTY_PANEL_WIDTH_STORAGE_KEY } from '../preferences/keys'
import { useResizablePanelWidth } from '../hooks/useResizablePanelWidth'
import { ElementPropertyForm } from './ElementPropertyForm'
import { LayerActionBar } from './LayerActionBar'
import { SharedPropertyForm } from './SharedPropertyForm'
import { shell } from '../styles/shell'

const MIN_PROPERTY_WIDTH = 240
const MAX_PROPERTY_WIDTH = 560
const DEFAULT_PROPERTY_WIDTH = 288

interface PropertyPanelProps {
  elements: DrawElement[]
  indices: number[]
  elementCount: number
  fontKeys: string[]
  onPropertyChange: (key: string, value: unknown) => void
  onUploadFont: (file: File) => Promise<AssetUploadResult>
  onUploadImageForUrl: (urlKey: string, file: File) => Promise<AssetUploadResult>
  onBeginPropertyEdit?: () => void
  onEndPropertyEdit?: () => void
  onDelete: () => void
  onBringToFront: () => void
  onSendToBack: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  /** True while the live YAML doc fails to parse/validate (issue #35) — disable all property controls. */
  blocked?: boolean
  /** True once {@link blocked} has held past the visual grace period — show the blocked overlay. */
  blockedVisible?: boolean
}

const BLOCKED_MESSAGE = 'YAML has errors — fix to continue editing visually'

function PropertyPanelBlockedOverlay() {
  return (
    <div
      data-testid="property-panel-blocked-overlay"
      role="status"
      aria-live="polite"
      className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[var(--shell-bg)]/80 p-4 text-center`}
    >
      <p className={`text-sm ${shell.muted}`}>{BLOCKED_MESSAGE}</p>
    </div>
  )
}

export function PropertyPanel({
  elements,
  indices,
  elementCount,
  fontKeys,
  onPropertyChange,
  onUploadFont,
  onUploadImageForUrl,
  onBeginPropertyEdit,
  onEndPropertyEdit,
  onDelete,
  onBringToFront,
  onSendToBack,
  onMoveUp,
  onMoveDown,
  blocked = false,
  blockedVisible = false,
}: PropertyPanelProps) {
  const { width, startResize } = useResizablePanelWidth({
    storageKey: PROPERTY_PANEL_WIDTH_STORAGE_KEY,
    defaultWidth: DEFAULT_PROPERTY_WIDTH,
    minWidth: MIN_PROPERTY_WIDTH,
    maxWidth: MAX_PROPERTY_WIDTH,
  })

  const resizeHandle = (
    <div
      role="separator"
      aria-label="Resize properties panel"
      aria-orientation="vertical"
      className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize hover:bg-[var(--shell-hover)]"
      onMouseDown={startResize}
    />
  )

  if (elements.length === 0 || indices.length === 0) {
    return (
      <aside
        style={{ width }}
        className={`relative flex shrink-0 flex-col border-l ${shell.panelBorder} ${shell.panel} p-4`}
      >
        {resizeHandle}
        <h2 className={shell.heading}>Properties</h2>
        <p className={`mt-4 text-sm ${shell.muted}`}>Select an element from the list or canvas.</p>
      </aside>
    )
  }

  const primaryIndex = indices[indices.length - 1]!
  const primaryElement = elements[elements.length - 1]!
  const isMulti = elements.length > 1
  const canMoveUp = indices.some((index) => index < elementCount - 1)
  const canMoveDown = indices.some((index) => index > 0)

  return (
    <aside
      style={{ width }}
      className={`relative flex shrink-0 flex-col border-l ${shell.panelBorder} ${shell.panel}`}
    >
      {resizeHandle}
      <fieldset disabled={blocked} className="contents border-0 p-0 m-0">
        <div className={`border-b ${shell.panelBorder} px-4 py-3 pl-5`}>
          <h2 className={shell.heading}>Properties</h2>
          {isMulti ? (
            <p data-testid="property-panel-selection" className="mt-1 text-sm text-[var(--shell-text)]">
              {elements.length} elements selected
            </p>
          ) : (
            <p data-testid="property-panel-selection" className="mt-1 text-sm text-[var(--shell-text)]">
              #{primaryIndex + 1} ·{' '}
              <span className="font-mono text-[var(--shell-accent)]">{primaryElement.type}</span>
            </p>
          )}
          <LayerActionBar
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            onBringToFront={onBringToFront}
            onSendToBack={onSendToBack}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onDelete={onDelete}
          />
        </div>
        <div className="flex-1 overflow-y-auto p-4 pl-5">
          {isMulti ? (
            <SharedPropertyForm
              elements={elements}
              fontKeys={fontKeys}
              onPropertyChange={onPropertyChange}
              onUploadFont={onUploadFont}
              onUploadImageForUrl={onUploadImageForUrl}
              onBeginEdit={onBeginPropertyEdit}
              onEndEdit={onEndPropertyEdit}
            />
          ) : (
            <ElementPropertyForm
              element={primaryElement}
              fontKeys={fontKeys}
              onPropertyChange={onPropertyChange}
              onUploadFont={onUploadFont}
              onUploadImageForUrl={onUploadImageForUrl}
              onBeginEdit={onBeginPropertyEdit}
              onEndEdit={onEndPropertyEdit}
            />
          )}
        </div>
      </fieldset>
      {blockedVisible ? <PropertyPanelBlockedOverlay /> : null}
    </aside>
  )
}
