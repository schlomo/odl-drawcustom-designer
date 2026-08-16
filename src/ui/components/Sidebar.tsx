import { mdiLock, mdiLockOpen } from '@mdi/js'
import { useMemo, useState } from 'react'
import type { AssetKind, AssetUploadResult, DrawElement, TagColorMode } from '../../core'
import type { HaMockContext } from '../../core'
import type { HostTarget } from '../../embed/types'
import {
  applyResolutionSelectValue,
  CUSTOM_RESOLUTION_VALUE,
  resolutionDropdownValue,
  resolutionSelectValue,
  shouldShowCustomResolutionInputs,
} from '../data/resolution-picks'
import type { CanvasConfig, CanvasRotation, SelectElementOptions } from '../hooks/useProjectState'
import { useResizablePanelWidth } from '../hooks/useResizablePanelWidth'
import { getColorClampStatusMessage } from '../lib/color-clamp-status-messages'
import { SIDEBAR_WIDTH_STORAGE_KEY } from '../preferences/keys'
import { shell } from '../styles/shell'
import { ContentManager } from './ContentManager'
import { DisplayTargetSelect } from './DisplayTargetSelect'
import { ElementList } from './ElementList'
import { IconButton } from './IconButton'
import type { PanelListScope } from './PanelScopeToggle'
import { ResolutionSelect } from './ResolutionSelect'
import { StateSimulator } from './StateSimulator'
import { StatusHint } from './StatusHint'

type SidebarTab = 'elements' | 'simulator' | 'content'

interface SidebarProps {
  elements: DrawElement[]
  previewElements: DrawElement[]
  selectedIndices: number[]
  canvas: CanvasConfig
  mockContext: HaMockContext
  assetRevision: number
  onSelectElement: (index: number, options?: SelectElementOptions) => void
  onApplyResolution: (width: number, height: number) => void
  onCanvasSizeChange: (width: number, height: number) => void
  onColorModeChange: (colorMode: TagColorMode) => void
  onRotationChange: (rotation: CanvasRotation) => void
  /**
   * Host-defined display (issue #70): 'locked' disables the display config
   * controls, 'unlocked' is the virtual-display escape hatch. null/undefined
   * (standalone) renders no lock at all.
   */
  displayLock?: 'locked' | 'unlocked' | null
  onToggleDisplayLock?: () => void
  /**
   * Host-pushed display targets (issue #106, ADR-018). Absent or empty
   * (standalone, or an embed that pushes none) renders no picker at all —
   * unless a selection is remembered, which the picker is how you leave.
   */
  targets?: readonly HostTarget[]
  /** The remembered picker selection; kept while unlocked and while stale. */
  selectedTargetId?: string | null
  /** The selection's last-known label, for a target the host has removed. */
  selectedTargetLabel?: string | null
  /** Picker choice: a target id, or null for the virtual display. */
  onSelectDisplayTarget?: (targetId: string | null) => void
  onSetMockState: (entityId: string, value: string) => void
  onAddMockEntity: (entityId: string, value: string) => void
  onRemoveMockEntity: (entityId: string) => void
  onSetMockAttribute?: (entityId: string, attribute: string, value: unknown) => void
  onRenameMockAttribute?: (entityId: string, previousName: string, nextName: string) => void
  onRemoveMockAttribute?: (entityId: string, attribute: string) => void
  variables: Record<string, string>
  onSetVariable: (name: string, value: string) => void
  onAddVariable: (name: string, value: string) => void
  onRenameVariable?: (previousName: string, nextName: string) => void
  onRemoveVariable: (name: string) => void
  onUploadAsset: (key: string, kind: AssetKind, file: File) => Promise<AssetUploadResult>
  onClearAsset: (key: string) => void
  onReorderElement: (
    fromIndex: number,
    toIndex: number,
    movingIndices?: readonly number[],
  ) => void
  onFocusSimulatorEntity?: (entityId: string) => void
  /** Issue #35: no element mutation while the YAML doc is blocked — disables element drag-reorder. */
  yamlBlocked?: boolean
}

const ROTATION_OPTIONS: CanvasRotation[] = [0, 90, 180, 270]

const COLOR_MODE_OPTIONS: Array<{ value: TagColorMode; label: string }> = [
  { value: 'bw', label: 'BW' },
  { value: 'bwr', label: 'BWR (red accent)' },
  { value: 'bwy', label: 'BWY (yellow accent)' },
  { value: 'four', label: '4-color (BWRY)' },
  { value: 'six', label: '6-color' },
  { value: 'rgb', label: 'RGB (preview)' },
]

const TAB_LABEL: Record<SidebarTab, string> = {
  elements: 'Elements',
  simulator: 'Simulator',
  content: 'Content',
}

const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 560
const DEFAULT_SIDEBAR_WIDTH = 256

export function Sidebar({
  elements,
  previewElements,
  selectedIndices,
  canvas,
  mockContext,
  assetRevision,
  onSelectElement,
  onApplyResolution,
  onCanvasSizeChange,
  onColorModeChange,
  onRotationChange,
  displayLock = null,
  onToggleDisplayLock,
  targets,
  selectedTargetId = null,
  selectedTargetLabel = null,
  onSelectDisplayTarget,
  onSetMockState,
  onAddMockEntity,
  onRemoveMockEntity,
  onSetMockAttribute,
  onRenameMockAttribute,
  onRemoveMockAttribute,
  variables,
  onSetVariable,
  onAddVariable,
  onRenameVariable,
  onRemoveVariable,
  onUploadAsset,
  onClearAsset,
  onReorderElement,
  onFocusSimulatorEntity,
  yamlBlocked = false,
}: SidebarProps) {
  const [tab, setTab] = useState<SidebarTab>('elements')
  const [panelScope, setPanelScope] = useState<PanelListScope>('current')
  const [resolutionEditingCustom, setResolutionEditingCustom] = useState(
    () => resolutionSelectValue(canvas.width, canvas.height) === CUSTOM_RESOLUTION_VALUE,
  )
  const { width, startResize } = useResizablePanelWidth({
    storageKey: SIDEBAR_WIDTH_STORAGE_KEY,
    defaultWidth: DEFAULT_SIDEBAR_WIDTH,
    minWidth: MIN_SIDEBAR_WIDTH,
    maxWidth: MAX_SIDEBAR_WIDTH,
    edge: 'left',
  })
  const displayLocked = displayLock === 'locked'
  const resolutionValue = resolutionDropdownValue(
    canvas.width,
    canvas.height,
    resolutionEditingCustom,
  )
  const showCustomResolutionInputs = shouldShowCustomResolutionInputs(
    canvas.width,
    canvas.height,
    resolutionEditingCustom,
  )
  const colorClampMessage = useMemo(
    () =>
      getColorClampStatusMessage(
        previewElements,
        canvas.colorMode,
        canvas.previewDitherMode,
      ),
    [previewElements, canvas.colorMode, canvas.previewDitherMode],
  )

  return (
    <aside
      style={{ width }}
      className={`relative flex shrink-0 flex-col overflow-hidden border-r ${shell.panelBorder} ${shell.panel}`}
    >
      <div
        role="separator"
        aria-label="Resize sidebar"
        aria-orientation="vertical"
        className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize hover:bg-[var(--shell-hover)]"
        onMouseDown={startResize}
      />
      <section className={`shrink-0 border-b ${shell.panelBorder} p-3 pr-5`}>
        {displayLock ? (
          <div className="flex items-center justify-between gap-2">
            <h2 className={shell.heading}>Display config</h2>
            <IconButton
              compact
              iconPath={displayLock === 'locked' ? mdiLock : mdiLockOpen}
              iconSize={14}
              tooltip={
                displayLock === 'locked' ? 'Unlock display config' : 'Lock display config'
              }
              tooltipAlign="end"
              // Flush with the top of this `overflow-hidden` sidebar (issue
              // #70 review): an upward bubble has no room and gets clipped by
              // the sidebar's own top edge, reading as hidden behind the app
              // header above it.
              tooltipPlacement="below"
              onClick={onToggleDisplayLock}
            />
          </div>
        ) : (
          <h2 className={shell.heading}>Display config</h2>
        )}
        {/* Display picker (issue #106): conditional chrome — a designer with no
            host targets renders exactly what it did before. A remembered
            selection keeps the picker alive even once the host's list is empty,
            locked or not: it is the control the user switches away with, and a
            control must not vanish from under the person using it. */}
        {(targets != null && targets.length > 0) || selectedTargetId != null ? (
          <DisplayTargetSelect
            targets={targets}
            selectedTargetId={selectedTargetId}
            selectedTargetLabel={selectedTargetLabel}
            locked={displayLocked}
            onSelect={(targetId) => onSelectDisplayTarget?.(targetId)}
          />
        ) : null}
        <label className={`mt-2 block text-xs ${shell.muted}`}>
          Resolution
          <ResolutionSelect
            value={resolutionValue}
            canvasWidth={canvas.width}
            canvasHeight={canvas.height}
            disabled={displayLocked}
            onSelectValue={(nextValue) => {
              applyResolutionSelectValue(nextValue, {
                setEditingCustom: setResolutionEditingCustom,
                onApplyResolution,
              })
            }}
          />
        </label>
        {showCustomResolutionInputs ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className={`text-xs ${shell.muted}`}>
              W
              <input
                type="number"
                min={1}
                className={`mt-1 w-full disabled:cursor-not-allowed disabled:opacity-40 ${shell.input}`}
                value={canvas.width}
                disabled={displayLocked}
                onChange={(event) =>
                  onCanvasSizeChange(Number(event.target.value), canvas.height)
                }
              />
            </label>
            <label className={`text-xs ${shell.muted}`}>
              H
              <input
                type="number"
                min={1}
                className={`mt-1 w-full disabled:cursor-not-allowed disabled:opacity-40 ${shell.input}`}
                value={canvas.height}
                disabled={displayLocked}
                onChange={(event) =>
                  onCanvasSizeChange(canvas.width, Number(event.target.value))
                }
              />
            </label>
          </div>
        ) : null}
        <label className={`mt-2 block text-xs ${shell.muted}`}>
          Color mode
          <select
            className={`mt-1 w-full disabled:cursor-not-allowed disabled:opacity-40 ${shell.input}`}
            value={canvas.colorMode}
            disabled={displayLocked}
            onChange={(event) => onColorModeChange(event.target.value as TagColorMode)}
          >
            {COLOR_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {colorClampMessage ? <StatusHint message={colorClampMessage} /> : null}
        {canvas.colorMode === 'six' ? (
          <p className={`mt-1 text-[10px] ${shell.muted}`}>Preview limited — 6-color palette is scaffold only.</p>
        ) : null}
        {canvas.colorMode === 'rgb' ? (
          <p className={`mt-1 text-[10px] ${shell.muted}`}>Preview only — tag export uses palette colors, not full RGB.</p>
        ) : null}
        {/* Lock scope is dimensions + color mode/palette only (maintainer
            ruling 2026-08-16): rotation is a user choice — portrait mounting
            of the same physical display — so it stays editable while locked,
            unlike every other control in this section. */}
        <div className="mt-2 flex gap-1">
          {ROTATION_OPTIONS.map((value) => (
            <button
              key={value}
              type="button"
              className={`flex-1 rounded-md border px-1 py-1 text-[10px] disabled:cursor-not-allowed disabled:opacity-40 ${
                canvas.rotation === value
                  ? 'border-[var(--shell-accent)] bg-[var(--shell-accent)] text-white'
                  : `${shell.button} hover:bg-[var(--shell-hover)]`
              }`}
              onClick={() => onRotationChange(value)}
            >
              {value}°
            </button>
          ))}
        </div>
      </section>

      <div className={`flex shrink-0 border-b ${shell.panelBorder}`}>
        {(['elements', 'simulator', 'content'] as const).map((id) => (
          <button
            key={id}
            type="button"
            className={`flex-1 border-b-2 px-2 py-2 text-[11px] font-medium ${
              tab === id
                ? 'border-[var(--shell-accent)] text-[var(--shell-accent)]'
                : 'border-transparent text-[var(--shell-muted)] hover:text-[var(--shell-text)]'
            }`}
            onClick={() => setTab(id)}
          >
            {TAB_LABEL[id]}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 pr-5">
        {tab === 'elements' ? (
          <>
            <p className={`mb-2 text-[10px] ${shell.muted}`}>
              Top = front (drawn last in YAML)
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto" data-testid="element-list-scroll">
              <ElementList
                previewElements={previewElements}
                selectedIndices={selectedIndices}
                colorMode={canvas.colorMode}
                previewDitherMode={canvas.previewDitherMode}
                paletteOverrides={canvas.paletteOverrides}
                onSelectElement={onSelectElement}
                onReorderElement={onReorderElement}
                blocked={yamlBlocked}
              />
            </div>
          </>
        ) : null}
        {tab === 'simulator' ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <StateSimulator
              elements={elements}
              mockContext={mockContext}
              scope={panelScope}
              onScopeChange={setPanelScope}
              onSetMockState={onSetMockState}
              onAddEntity={onAddMockEntity}
              onRemoveEntity={onRemoveMockEntity}
              onSetMockAttribute={onSetMockAttribute}
              onRenameMockAttribute={onRenameMockAttribute}
              onRemoveMockAttribute={onRemoveMockAttribute}
              variables={variables}
              onSetVariable={onSetVariable}
              onAddVariable={onAddVariable}
              onRenameVariable={onRenameVariable}
              onRemoveVariable={onRemoveVariable}
              onFocusEntity={onFocusSimulatorEntity}
              embedded
            />
          </div>
        ) : null}
        {tab === 'content' ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ContentManager
              elements={elements}
              assetRevision={assetRevision}
              scope={panelScope}
              onScopeChange={setPanelScope}
              onUpload={onUploadAsset}
              onClear={onClearAsset}
              embedded
            />
          </div>
        ) : null}
      </div>
    </aside>
  )
}
