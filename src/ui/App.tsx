import { useCallback, useEffect, useRef } from 'react'
import type { DrawElement } from '../core'
import { DesignerCanvas } from './components/DesignerCanvas'
import { PropertyPanel } from './components/PropertyPanel'
import { Sidebar } from './components/Sidebar'
import { ThemeToggle } from './components/ThemeToggle'
import { YamlPanel } from './components/YamlPanel'
import { remapSelectedIndex } from './editor/yamlElementsSync'
import { MIN_CANVAS_PREVIEW_HEIGHT } from './hooks/useResizablePanelHeight'
import { useProjectState } from './hooks/useProjectState'
import { useThemePreference } from './hooks/useThemePreference'
import { shell } from './styles/shell'

export function App() {
  const columnRef = useRef<HTMLDivElement>(null)
  const { mode, resolvedTheme, cycleMode } = useThemePreference()
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
  } = useProjectState()

  const elementsRef = useRef(elements)

  useEffect(() => {
    elementsRef.current = elements
  }, [elements])

  const handleYamlElementsChange = useCallback(
    (next: DrawElement[]) => {
      const nextIndex = remapSelectedIndex(elementsRef.current, next, selectedIndex)
      setElements(next)
      if (nextIndex !== selectedIndex) {
        selectElement(nextIndex, 'yaml')
      }
    },
    [selectedIndex, selectElement, setElements],
  )

  return (
    <div className={shell.app}>
      <header className={`${shell.header} flex items-center justify-between gap-4`}>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">OpenEPaperLink HA YAML Designer</h1>
          <p className={`text-xs ${shell.muted}`}>Phase 2d — content manager and state simulator</p>
        </div>
        <ThemeToggle mode={mode} resolvedTheme={resolvedTheme} onCycle={cycleMode} />
      </header>

      <div className="flex min-h-0 flex-1">
        <Sidebar
          elements={elements}
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
        />

        <div ref={columnRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            className="min-h-0 flex-1 overflow-hidden p-2"
            style={{ minHeight: MIN_CANVAS_PREVIEW_HEIGHT }}
          >
            <DesignerCanvas
              elements={previewElements}
              renderContext={renderContext}
              rotation={canvas.rotation}
              selectedIndex={selectedIndex}
              assetRevision={assetRevision}
              onSelectElement={selectElement}
            />
          </div>
          <YamlPanel
            colorScheme={resolvedTheme}
            containerRef={columnRef}
            elements={elements}
            extraEntityIds={extraEntityIds}
            onElementsChange={handleYamlElementsChange}
            onSelectElement={selectElement}
            selectedIndex={selectedIndex}
            selectionSource={selectionSource}
          />
        </div>

        <PropertyPanel element={selectedElement} index={selectedIndex} />
      </div>
    </div>
  )
}
