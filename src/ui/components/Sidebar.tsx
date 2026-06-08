import { useState } from 'react'
import type { AssetKind, AssetUploadResult, DrawElement } from '../../core'
import type { HaMockContext } from '../../core'
import { EXAMPLE_DESIGNS } from '../data/example-designs'
import type { CanvasConfig, CanvasRotation } from '../hooks/useProjectState'
import { useResizablePanelWidth } from '../hooks/useResizablePanelWidth'
import { SIDEBAR_WIDTH_STORAGE_KEY } from '../preferences/keys'
import { shell } from '../styles/shell'
import { ContentManager } from './ContentManager'
import { ElementList } from './ElementList'
import type { PanelListScope } from './PanelScopeToggle'
import { StateSimulator } from './StateSimulator'
import { DISPLAY_PRESETS, findPresetForCanvas } from '../data/display-presets'

type SidebarTab = 'elements' | 'simulator' | 'content'

interface SidebarProps {
  elements: DrawElement[]
  previewElements: DrawElement[]
  selectedIndex: number | null
  canvas: CanvasConfig
  mockContext: HaMockContext
  assetRevision: number
  onSelectElement: (index: number) => void
  onApplyPreset: (presetId: string) => void
  onCanvasSizeChange: (width: number, height: number) => void
  onRotationChange: (rotation: CanvasRotation) => void
  onSetMockState: (entityId: string, value: string) => void
  onAddMockEntity: (entityId: string, value: string) => void
  onRemoveMockEntity: (entityId: string) => void
  onUploadAsset: (key: string, kind: AssetKind, file: File) => Promise<AssetUploadResult>
  onClearAsset: (key: string) => void
  onLoadExample: (exampleId: string) => void
  onReorderElement: (fromIndex: number, toIndex: number) => void
  onFocusSimulatorEntity?: (entityId: string) => void
}

const ROTATION_OPTIONS: CanvasRotation[] = [0, 90, 180, 270]

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
  selectedIndex,
  canvas,
  mockContext,
  assetRevision,
  onSelectElement,
  onApplyPreset,
  onCanvasSizeChange,
  onRotationChange,
  onSetMockState,
  onAddMockEntity,
  onRemoveMockEntity,
  onUploadAsset,
  onClearAsset,
  onLoadExample,
  onReorderElement,
  onFocusSimulatorEntity,
}: SidebarProps) {
  const [tab, setTab] = useState<SidebarTab>('elements')
  const [panelScope, setPanelScope] = useState<PanelListScope>('current')
  const { width, startResize } = useResizablePanelWidth({
    storageKey: SIDEBAR_WIDTH_STORAGE_KEY,
    defaultWidth: DEFAULT_SIDEBAR_WIDTH,
    minWidth: MIN_SIDEBAR_WIDTH,
    maxWidth: MAX_SIDEBAR_WIDTH,
    edge: 'left',
  })
  const matchingPreset = findPresetForCanvas(canvas.width, canvas.height, canvas.accentMode)
  const presetValue = matchingPreset.id

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
        <h2 className={shell.heading}>Load example</h2>
        <select
          className={`mt-2 w-full ${shell.input}`}
          defaultValue=""
          onChange={(event) => {
            const value = event.target.value
            if (value) {
              onLoadExample(value)
              event.target.value = ''
            }
          }}
        >
          <option value="" disabled>
            Choose a design…
          </option>
          {EXAMPLE_DESIGNS.map((example) => (
            <option key={example.id} value={example.id}>
              {example.label}
            </option>
          ))}
        </select>
      </section>

      <section className={`shrink-0 border-b ${shell.panelBorder} p-3 pr-5`}>
        <h2 className={shell.heading}>Display config</h2>
        <label className={`mt-2 block text-xs ${shell.muted}`}>
          Tag preset
          <select
            className={`mt-1 w-full ${shell.input}`}
            value={presetValue}
            onChange={(event) => onApplyPreset(event.target.value)}
          >
            {DISPLAY_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className={`text-xs ${shell.muted}`}>
            W
            <input
              type="number"
              min={1}
              className={`mt-1 w-full ${shell.input}`}
              value={canvas.width}
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
              className={`mt-1 w-full ${shell.input}`}
              value={canvas.height}
              onChange={(event) =>
                onCanvasSizeChange(canvas.width, Number(event.target.value))
              }
            />
          </label>
        </div>
        <div className="mt-2 flex gap-1">
          {ROTATION_OPTIONS.map((value) => (
            <button
              key={value}
              type="button"
              className={`flex-1 rounded-md border px-1 py-1 text-[10px] ${
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
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ElementList
                previewElements={previewElements}
                selectedIndex={selectedIndex}
                onSelectElement={onSelectElement}
                onReorderElement={onReorderElement}
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
