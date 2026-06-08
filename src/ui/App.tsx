import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DesignerCanvas } from './components/DesignerCanvas'
import { ElementToolbar } from './components/ElementToolbar'
import { PropertyPanel } from './components/PropertyPanel'
import { Sidebar } from './components/Sidebar'
import { ThemeToggle } from './components/ThemeToggle'
import { YamlPanel } from './components/YamlPanel'
import { remapSelectedIndex } from './editor/yamlElementsSync'
import { collectKnownFontKeys } from './lib/known-font-keys'
import { nudgeWhenSelected } from './lib/canvas-keyboard'
import type { StatusMessage } from './lib/status-messages'
import { MIN_CANVAS_PREVIEW_HEIGHT } from './hooks/useResizablePanelHeight'
import { useProjectState } from './hooks/useProjectState'
import { useThemePreference } from './hooks/useThemePreference'
import { useYamlSelectionCoupling } from './hooks/useYamlSelectionCoupling'
import { shell } from './styles/shell'

export function App() {
  const columnRef = useRef<HTMLDivElement>(null)
  const { mode, resolvedTheme, cycleMode } = useThemePreference()
  const { couplingEnabled } = useYamlSelectionCoupling()
  const [entityScrollRequest, setEntityScrollRequest] = useState<{
    entityId: string
    token: string
  } | null>(null)
  const [yamlStatusMessages, setYamlStatusMessages] = useState<StatusMessage[]>([])
  const [canvasDragging, setCanvasDragging] = useState(false)
  const {
    elements,
    previewElements,
    selectedIndex,
    selectionSource,
    selectedElement,
    selectElement,
    canvas,
    renderContext,
    applyPreset,
    setCanvasSize,
    setRotation,
    setElements,
    mockContext,
    setMockState,
    addMockEntity,
    removeMockEntity,
    extraEntityIds,
    assetRevision,
    uploadAsset,
    clearAsset,
    updateElement,
    updateElementProperty,
    deleteElement,
    addElement,
    clearElements,
    loadExample,
    nudgeElement,
    bringToFront,
    sendToBack,
    moveLayerUp,
    moveLayerDown,
    reorderElement,
    snapGrid,
    toggleSnapGrid,
    togglePreviewDither,
  } = useProjectState()

  const elementsRef = useRef(elements)

  useEffect(() => {
    elementsRef.current = elements
  }, [elements])

  const fontKeys = useMemo(() => {
    void assetRevision
    return collectKnownFontKeys(elements)
  }, [assetRevision, elements])

  const handleYamlElementsChange = useCallback(
    (next: typeof elements) => {
      const previous = elementsRef.current
      const nextIndex = remapSelectedIndex(previous, next, selectedIndex)
      setElements(next)
      if (nextIndex != null) {
        if (nextIndex !== selectedIndex) {
          selectElement(nextIndex, 'yaml')
        }
        return
      }
      // Property-only edit at the same index (yaml round-trip normalization).
      if (
        selectedIndex != null &&
        next.length === previous.length &&
        selectedIndex < next.length &&
        next[selectedIndex]?.type === previous[selectedIndex]?.type
      ) {
        return
      }
      selectElement(null, 'yaml')
    },
    [selectedIndex, selectElement, setElements],
  )

  const handleDeleteSelected = useCallback(() => {
    if (selectedIndex != null) {
      deleteElement(selectedIndex)
    }
  }, [deleteElement, selectedIndex])

  const handleNudgeSelected = useCallback(
    (dx: number, dy: number) => {
      nudgeWhenSelected(selectedIndex, nudgeElement, dx, dy)
    },
    [nudgeElement, selectedIndex],
  )

  const handlePropertyChange = useCallback(
    (key: string, value: unknown) => {
      if (selectedIndex != null) {
        updateElementProperty(selectedIndex, key, value)
      }
    },
    [selectedIndex, updateElementProperty],
  )

  const handleUploadFont = useCallback(
    (file: File) => uploadAsset(file.name, 'font', file),
    [uploadAsset],
  )

  const handleUploadImageForUrl = useCallback(
    (urlKey: string, file: File) => uploadAsset(urlKey, 'image', file),
    [uploadAsset],
  )

  const handleSimulatorEntityFocus = useCallback(
    (entityId: string) => {
      if (!couplingEnabled) {
        return
      }
      setEntityScrollRequest({ entityId, token: `sim:${entityId}:${Date.now()}` })
    },
    [couplingEnabled],
  )

  return (
    <div className={shell.app}>
      <header className={`${shell.header} flex items-center justify-between gap-4`}>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">OpenEPaperLink HA YAML Designer</h1>
          <p className={`text-xs ${shell.muted}`}>Phase 2e — canvas interaction and property forms</p>
        </div>
        <ThemeToggle mode={mode} resolvedTheme={resolvedTheme} onCycle={cycleMode} />
      </header>

      <div className="flex min-h-0 flex-1">
        <Sidebar
          elements={elements}
          previewElements={previewElements}
          selectedIndex={selectedIndex}
          canvas={canvas}
          mockContext={mockContext}
          assetRevision={assetRevision}
          onSelectElement={selectElement}
          onApplyPreset={applyPreset}
          onCanvasSizeChange={setCanvasSize}
          onRotationChange={setRotation}
          onSetMockState={setMockState}
          onAddMockEntity={addMockEntity}
          onRemoveMockEntity={removeMockEntity}
          onUploadAsset={uploadAsset}
          onClearAsset={clearAsset}
          onLoadExample={loadExample}
          onReorderElement={reorderElement}
          onFocusSimulatorEntity={handleSimulatorEntityFocus}
        />

        <div ref={columnRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ElementToolbar onAddElement={addElement} />
          <div
            className="min-h-0 flex-1 overflow-hidden p-2"
            style={{ minHeight: MIN_CANVAS_PREVIEW_HEIGHT }}
          >
            <DesignerCanvas
              elements={previewElements}
              editElements={elements}
              renderContext={renderContext}
              rotation={canvas.rotation}
              selectedIndex={selectedIndex}
              assetRevision={assetRevision}
              snapGrid={snapGrid}
              extraStatusMessages={yamlStatusMessages}
              onSelectElement={selectElement}
              onUpdateElement={updateElement}
              onDeleteSelected={handleDeleteSelected}
              onNudgeSelected={handleNudgeSelected}
              onClearAll={clearElements}
              onToggleSnap={toggleSnapGrid}
              previewDitherMode={canvas.previewDitherMode}
              onTogglePreviewDither={togglePreviewDither}
              onDragActiveChange={setCanvasDragging}
            />
          </div>
          <YamlPanel
            colorScheme={resolvedTheme}
            containerRef={columnRef}
            elements={elements}
            extraEntityIds={extraEntityIds}
            onElementsChange={handleYamlElementsChange}
            onSelectElement={selectElement}
            onStatusMessagesChange={setYamlStatusMessages}
            selectedIndex={selectedIndex}
            selectionSource={selectionSource}
            entityScrollRequest={entityScrollRequest}
            canvasDragging={canvasDragging}
          />
        </div>

        <PropertyPanel
          element={selectedElement}
          index={selectedIndex}
          elementCount={elements.length}
          fontKeys={fontKeys}
          onPropertyChange={handlePropertyChange}
          onUploadFont={handleUploadFont}
          onUploadImageForUrl={handleUploadImageForUrl}
          onDelete={handleDeleteSelected}
          onBringToFront={() => {
            if (selectedIndex != null) {
              bringToFront(selectedIndex)
            }
          }}
          onSendToBack={() => {
            if (selectedIndex != null) {
              sendToBack(selectedIndex)
            }
          }}
          onMoveUp={() => {
            if (selectedIndex != null) {
              moveLayerUp(selectedIndex)
            }
          }}
          onMoveDown={() => {
            if (selectedIndex != null) {
              moveLayerDown(selectedIndex)
            }
          }}
        />
      </div>
    </div>
  )
}
