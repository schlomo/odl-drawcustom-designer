import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildSharePayload,
  buildShareUrl,
  clearShareHashFromLocation,
  encodeShareHash,
} from '../share'
import type { AppBootstrap } from './bootstrap/appBootstrap'
import { DesignerCanvas } from './components/DesignerCanvas'
import { ElementToolbar } from './components/ElementToolbar'
import { PropertyPanel } from './components/PropertyPanel'
import { Sidebar } from './components/Sidebar'
import { StatusBanner } from './components/StatusBanner'
import { ThemeToggle } from './components/ThemeToggle'
import { YamlPanel } from './components/YamlPanel'
import { remapSelectedIndex } from './editor/yamlElementsSync'
import { collectKnownFontKeys } from './lib/known-font-keys'
import { copyTextToClipboard } from './lib/export-download'
import { requestLoadDemoConfirm, shouldConfirmLoadDemo } from './lib/load-demo'
import { toolbarGroupRow, toolbarGroupsRow } from './lib/export-action-feedback'
import { getMissingAssetMessages } from './lib/missing-asset-messages'
import type { StatusMessage } from './lib/status-messages'
import { useExportActionFeedback } from './hooks/useExportActionFeedback'
import { useProjectState } from './hooks/useProjectState'
import { useElementSize } from './hooks/useElementSize'
import { useThemePreference } from './hooks/useThemePreference'
import { useYamlSelectionCoupling } from './hooks/useYamlSelectionCoupling'
import { ExportIconButton } from './components/ExportIconButton'
import { TextButton } from './components/TextButton'
import { shell } from './styles/shell'
import type { DrawElement } from '../core'
import type { AddElementResult } from './hooks/useProjectState'
import {
  APP_GITHUB_REPO_URL,
  APP_GIT_BRANCH,
  APP_GIT_PR_NUMBER,
  APP_GIT_REVISION,
  APP_HEADER_LEGAL_HTML,
  APP_PRIVACY_HEADLINE,
  APP_PRIVACY_NOTE,
  APP_TITLE,
  formatGitBranchLabel,
  formatGitRevisionLabel,
  formatRevisionTooltip,
  githubBranchUrl,
  githubCommitUrl,
} from '../core'
import { logoUrl } from '../assets/bundled-urls'
import { toolIconPath } from './lib/mdi-tool-icons'

interface AppProps {
  bootstrap: AppBootstrap
}

export function App({ bootstrap }: AppProps) {
  const columnRef = useRef<HTMLDivElement>(null)
  const canvasAllocationRef = useRef<HTMLDivElement>(null)
  const canvasAllocationSize = useElementSize(canvasAllocationRef)
  const { mode, resolvedTheme, cycleMode } = useThemePreference()
  const { couplingEnabled } = useYamlSelectionCoupling()
  const [entityScrollRequest, setEntityScrollRequest] = useState<{
    entityId: string
    token: string
  } | null>(null)
  const [yamlStatusMessages, setYamlStatusMessages] = useState<StatusMessage[]>([])
  const [canvasDragging, setCanvasDragging] = useState(false)
  const [propertyEditing, setPropertyEditing] = useState(false)
  const [elementAddNotice, setElementAddNotice] = useState<StatusMessage | null>(null)
  const { flashSuccess, flashError, getFeedback } = useExportActionFeedback()
  const {
    sessionName,
    service,
    elements,
    previewElements,
    selectedIndices,
    selectedIndex,
    selectionSource,
    selectedElements,
    selectElement,
    applyYamlSelection,
    canvas,
    renderContext,
    applyResolution,
    setColorMode,
    setCanvasSize,
    setRotation,
    setElements,
    mockContext,
    previewMockContext,
    setMockState,
    addMockEntity,
    removeMockEntity,
    setMockAttribute,
    renameMockAttribute,
    removeMockAttribute,
    variables,
    setVariable,
    addVariable,
    renameVariable,
    removeVariable,
    extraEntityIds,
    assetRevision,
    uploadAsset,
    clearAsset,
    updateElement,
    updateElementsBatch,
    updateElementProperty,
    updateSelectedProperty,
    deleteSelectedElements,
    addElement,
    clearElements,
    loadDemo,
    nudgeSelectedElements,
    selectAllInRect,
    bringSelectionToFront,
    sendSelectionToBack,
    moveSelectionLayer,
    alignSelection,
    reorderElement,
    reorderSelection,
    snapGrid,
    toggleSnapGrid,
    showHiddenHints,
    toggleShowHiddenHints,
    togglePreviewDither,
    undo,
    redo,
    canUndo,
    canRedo,
    beginEditCoalesce,
    endEditCoalesce,
  } = useProjectState(bootstrap)

  const elementsRef = useRef(elements)

  useEffect(() => {
    elementsRef.current = elements
  }, [elements])

  useEffect(() => {
    if (bootstrap.importSource === 'hash') {
      clearShareHashFromLocation()
    }
  }, [bootstrap.importSource])

  const fontKeys = useMemo(() => {
    void assetRevision
    return collectKnownFontKeys(elements)
  }, [assetRevision, elements])

  const hashImportMessages = useMemo(() => {
    if (bootstrap.importSource !== 'hash') {
      return []
    }
    return getMissingAssetMessages(elements)
  }, [bootstrap.importSource, elements])

  const handleAddElement = useCallback(
    (type: DrawElement['type']): AddElementResult => {
      const result = addElement(type)
      if (!result.ok) {
        setElementAddNotice({
          severity: 'info',
          title: 'Cannot add element',
          summary: result.message,
        })
      }
      return result
    },
    [addElement],
  )

  useEffect(() => {
    if (elementAddNotice == null) {
      return
    }
    const timer = window.setTimeout(() => setElementAddNotice(null), 4000)
    return () => window.clearTimeout(timer)
  }, [elementAddNotice])

  const handleLoadDemo = useCallback(() => {
    if (shouldConfirmLoadDemo(elements.length) && !requestLoadDemoConfirm()) {
      return
    }
    loadDemo()
  }, [elements.length, loadDemo])

  const handleShare = useCallback(async () => {
    const payload = buildSharePayload({
      name: sessionName,
      canvas,
      service,
      elements,
    })
    const url = buildShareUrl(encodeShareHash(payload), {
      origin: window.location.origin,
      pathname: window.location.pathname,
    })
    const copied = await copyTextToClipboard(url)
    if (copied) {
      flashSuccess('share-link')
    } else {
      flashError('share-link')
    }
  }, [canvas, elements, flashError, flashSuccess, service, sessionName])

  const handleYamlElementsChange = useCallback(
    (next: typeof elements) => {
      const previous = elementsRef.current
      const remapped = selectedIndices
        .map((index) => remapSelectedIndex(previous, next, index))
        .filter((index): index is number => index != null)
      setElements(next)
      if (remapped.length > 0) {
        const unchanged =
          remapped.length === selectedIndices.length &&
          remapped.every((index, offset) => index === selectedIndices[offset])
        if (!unchanged) {
          applyYamlSelection(remapped)
        }
        return
      }
      const nextIndex = remapSelectedIndex(previous, next, selectedIndex)
      if (nextIndex != null) {
        if (nextIndex !== selectedIndex) {
          selectElement(nextIndex, { source: 'yaml' })
        }
        return
      }
      if (
        selectedIndex != null &&
        next.length === previous.length &&
        selectedIndex < next.length &&
        next[selectedIndex]?.type === previous[selectedIndex]?.type
      ) {
        return
      }
      selectElement(null, { source: 'yaml' })
    },
    [applyYamlSelection, selectedIndex, selectedIndices, selectElement, setElements],
  )

  const handleDeleteSelected = useCallback(() => {
    deleteSelectedElements()
  }, [deleteSelectedElements])

  const handleNudgeSelected = useCallback(
    (dx: number, dy: number) => {
      if (selectedIndices.length === 0) {
        return
      }
      nudgeSelectedElements(dx, dy)
    },
    [nudgeSelectedElements, selectedIndices.length],
  )

  const handleBeginPropertyEdit = useCallback(() => {
    beginEditCoalesce()
    setPropertyEditing(true)
  }, [beginEditCoalesce])

  const handleEndPropertyEdit = useCallback(() => {
    endEditCoalesce()
    setPropertyEditing(false)
  }, [endEditCoalesce])

  const handlePropertyChange = useCallback(
    (key: string, value: unknown) => {
      if (selectedIndices.length === 1) {
        updateElementProperty(selectedIndices[0]!, key, value)
        return
      }
      if (selectedIndices.length > 1) {
        updateSelectedProperty(key, value)
      }
    },
    [selectedIndices, updateElementProperty, updateSelectedProperty],
  )

  const handleUploadFont = useCallback(
    (file: File) => uploadAsset(file.name, 'font', file),
    [uploadAsset],
  )

  const handleUploadImageForUrl = useCallback(
    (urlKey: string, file: File) => uploadAsset(urlKey, 'image', file),
    [uploadAsset],
  )

  const handleReorderElement = useCallback(
    (fromIndex: number, toIndex: number, movingIndices?: readonly number[]) => {
      const indices =
        movingIndices ??
        (selectedIndices.includes(fromIndex) && selectedIndices.length > 1
          ? selectedIndices
          : [fromIndex])
      if (indices.length > 1) {
        reorderSelection(indices, toIndex)
        return
      }
      reorderElement(fromIndex, toIndex)
    },
    [reorderElement, reorderSelection, selectedIndices],
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
      <header className={`${shell.header} flex items-center gap-4`}>
        <div className="flex shrink-0 items-center gap-2.5">
          <a
            href={APP_GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            aria-label="Open ODL/OEPL Drawcustom Designer on GitHub"
          >
            <img
              src={logoUrl}
              alt=""
              className="h-7 w-auto"
              width={792}
              height={603}
            />
          </a>
          <h1 className="truncate text-lg font-semibold tracking-tight">{APP_TITLE}</h1>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5">
          <div
            data-testid="header-meta-row"
            className={`flex w-full min-w-0 items-center justify-center gap-1 text-xs ${shell.muted}`}
          >
            <span className="truncate" title={APP_PRIVACY_NOTE}>
              {APP_PRIVACY_HEADLINE}
            </span>
            <span aria-hidden="true" className="shrink-0">
              {' · '}
            </span>
            <a
              href={APP_GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 underline-offset-2 hover:underline"
            >
              GitHub
            </a>
            <span aria-hidden="true" className="shrink-0">
              {' · '}
            </span>
            <a
              href={githubBranchUrl(APP_GIT_BRANCH)}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 font-mono underline-offset-2 hover:underline"
              title={
                APP_GIT_PR_NUMBER > 0
                  ? `PR #${APP_GIT_PR_NUMBER} · Branch: ${APP_GIT_BRANCH}`
                  : `Branch: ${APP_GIT_BRANCH}`
              }
            >
              {formatGitBranchLabel(APP_GIT_BRANCH)}
            </a>
            <span aria-hidden="true" className="shrink-0">
              {' · '}
            </span>
            <a
              href={githubCommitUrl(APP_GIT_REVISION)}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 font-mono underline-offset-2 hover:underline"
              title={formatRevisionTooltip(APP_GIT_REVISION)}
            >
              {formatGitRevisionLabel(APP_GIT_REVISION)}
            </a>
          </div>
          {APP_HEADER_LEGAL_HTML ? (
            <div
              data-testid="header-legal-subline"
              className={`w-full text-center text-xs ${shell.muted} [&_a]:underline-offset-2 [&_a]:hover:underline`}
              // Build-time HTML from VITE_HEADER_LEGAL_HTML (trusted deploy config only).
              dangerouslySetInnerHTML={{ __html: APP_HEADER_LEGAL_HTML }}
            />
          ) : null}
        </div>
        <div className={`${toolbarGroupsRow} shrink-0`}>
          <div className={toolbarGroupRow} role="group" aria-label="Session">
            <TextButton variant="destructive" onClick={clearElements}>
              Clear all
            </TextButton>
          </div>
          <div className={toolbarGroupRow} role="group" aria-label="Demo">
            <TextButton onClick={handleLoadDemo}>Load Demo</TextButton>
          </div>
          <div className={toolbarGroupRow} role="group" aria-label="Copy share link">
            <ExportIconButton
              actionId="share-link"
              feedback={getFeedback('share-link')}
              iconPath={toolIconPath('share')}
              tooltip="Copy share link"
              label="Copy share link"
              onClick={() => void handleShare()}
            />
          </div>
          <div className={toolbarGroupRow} role="group" aria-label="Appearance">
            <ThemeToggle mode={mode} resolvedTheme={resolvedTheme} onCycle={cycleMode} />
          </div>
        </div>
      </header>

      {elementAddNotice != null ? (
        <StatusBanner message={elementAddNotice} />
      ) : null}

      {hashImportMessages.map((message, index) => (
        <StatusBanner key={`hash-import-${message.title}-${index}`} message={message} />
      ))}

      <div className="flex min-h-0 flex-1">
        <Sidebar
          elements={elements}
          previewElements={previewElements}
          selectedIndices={selectedIndices}
          canvas={canvas}
          mockContext={mockContext}
          assetRevision={assetRevision}
          onSelectElement={selectElement}
          onApplyResolution={applyResolution}
          onCanvasSizeChange={setCanvasSize}
          onColorModeChange={setColorMode}
          onRotationChange={setRotation}
          onSetMockState={setMockState}
          onAddMockEntity={addMockEntity}
          onRemoveMockEntity={removeMockEntity}
          onSetMockAttribute={setMockAttribute}
          onRenameMockAttribute={renameMockAttribute}
          onRemoveMockAttribute={removeMockAttribute}
          variables={variables}
          onSetVariable={setVariable}
          onAddVariable={addVariable}
          onRenameVariable={renameVariable}
          onRemoveVariable={removeVariable}
          onUploadAsset={uploadAsset}
          onClearAsset={clearAsset}
          onReorderElement={handleReorderElement}
          onFocusSimulatorEntity={handleSimulatorEntityFocus}
        />

        <div ref={columnRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ElementToolbar elements={elements} onAddElement={handleAddElement} />
          <div
            ref={canvasAllocationRef}
            data-canvas-allocation
            className="flex min-h-0 min-w-0 flex-1 flex-col"
          >
            <DesignerCanvas
              elements={previewElements}
              editElements={elements}
              renderContext={renderContext}
              rotation={canvas.rotation}
              selectedIndices={selectedIndices}
              assetRevision={assetRevision}
              sessionName={sessionName}
              allocationSize={canvasAllocationSize}
              snapGrid={snapGrid}
              showHiddenHints={showHiddenHints}
              onToggleShowHiddenHints={toggleShowHiddenHints}
              extraStatusMessages={yamlStatusMessages}
              onSelectElement={selectElement}
              onSelectAllInRect={selectAllInRect}
              onAlignSelection={alignSelection}
              onUpdateElement={updateElement}
              onUpdateElementsBatch={updateElementsBatch}
              onBringSelectionToFront={bringSelectionToFront}
              onSendSelectionToBack={sendSelectionToBack}
              onMoveSelectionLayer={moveSelectionLayer}
              elementCount={elements.length}
              onDeleteSelected={handleDeleteSelected}
              onNudgeSelected={handleNudgeSelected}
              onToggleSnap={toggleSnapGrid}
              previewDitherMode={canvas.previewDitherMode}
              onTogglePreviewDither={togglePreviewDither}
              onDragActiveChange={setCanvasDragging}
              onBeginEditCoalesce={beginEditCoalesce}
              onEndEditCoalesce={endEditCoalesce}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={undo}
              onRedo={redo}
            />
          </div>
          <YamlPanel
            colorScheme={resolvedTheme}
            containerRef={columnRef}
            elements={elements}
            sessionName={sessionName}
            extraEntityIds={extraEntityIds}
            mockContext={previewMockContext}
            onElementsChange={handleYamlElementsChange}
            onSelectElement={selectElement}
            onStatusMessagesChange={setYamlStatusMessages}
            selectedIndex={selectedIndex}
            selectionSource={selectionSource}
            entityScrollRequest={entityScrollRequest}
            canvasDragging={canvasDragging}
            propertyEditing={propertyEditing}
          />
        </div>

        <PropertyPanel
          elements={selectedElements}
          indices={selectedIndices}
          elementCount={elements.length}
          fontKeys={fontKeys}
          onPropertyChange={handlePropertyChange}
          onUploadFont={handleUploadFont}
          onUploadImageForUrl={handleUploadImageForUrl}
          onBeginPropertyEdit={handleBeginPropertyEdit}
          onEndPropertyEdit={handleEndPropertyEdit}
          onDelete={handleDeleteSelected}
          onBringToFront={bringSelectionToFront}
          onSendToBack={sendSelectionToBack}
          onMoveUp={() => moveSelectionLayer('up')}
          onMoveDown={() => moveSelectionLayer('down')}
        />
      </div>
    </div>
  )
}
