import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { serializeYamlPayload, type DrawElement, type HaMockContext } from '../../core'
import { locateElementIndexAtPosition } from '../editor/locateElementInYaml'
import {
  elementsSequenceEqual,
  shouldApplyExternalYamlSync,
  tryParseYamlElements,
} from '../editor/yamlElementsSync'
import { getYamlStatusMessages } from '../lib/yaml-status-messages'
import { YamlEditor } from '../editor/YamlEditor'
import { createYamlScrollCommand, createEntityScrollCommand, mergeYamlScrollCommands } from '../editor/yamlScrollCommand'
import {
  MIN_CANVAS_PREVIEW_HEIGHT,
  useResizablePanelHeight,
} from '../hooks/useResizablePanelHeight'
import type { SelectionSource } from '../hooks/useProjectState'
import { useYamlFontSize } from '../hooks/useYamlFontSize'
import { useYamlSelectionCoupling } from '../hooks/useYamlSelectionCoupling'
import { useYamlTemplatePreview } from '../hooks/useYamlTemplatePreview'
import type { ResolvedTheme } from '../preferences/theme'
import type { StatusMessage } from '../lib/status-messages'
import { shell } from '../styles/shell'
import { YamlHeaderToolbar } from './YamlHeaderToolbar'
import {
  buildYamlDownloadFilename,
  copyTextToClipboard,
  createYamlDownloadBlob,
  triggerBlobDownload,
} from '../lib/export-download'
import { YAML_TOOLBAR_ITEM_SELECTOR } from '../lib/yaml-toolbar-layout'
import { toolbarHeaderSlotWidth } from '../lib/toolbar-header-slot'
import { useExportActionFeedback } from '../hooks/useExportActionFeedback'
import { useElementSize } from '../hooks/useElementSize'
import { useToolbarLabels } from '../hooks/useToolbarLabels'

const MIN_YAML_PANEL_HEIGHT = 120

interface YamlPanelProps {
  elements: DrawElement[]
  sessionName: string
  selectedIndex: number | null
  selectionSource: SelectionSource
  onSelectElement: (index: number | null, source?: SelectionSource) => void
  onElementsChange: (elements: DrawElement[]) => void
  colorScheme: ResolvedTheme
  containerRef: RefObject<HTMLDivElement | null>
  extraEntityIds?: readonly string[]
  entityScrollRequest?: { entityId: string; token: string } | null
  onStatusMessagesChange?: (messages: StatusMessage[]) => void
  /** True while the canvas is in an active pointer drag (move/resize). */
  canvasDragging?: boolean
  /** True while a property panel field has focus (typing). */
  propertyEditing?: boolean
  mockContext?: HaMockContext
}

export function YamlPanel({
  elements,
  sessionName,
  selectedIndex,
  selectionSource,
  onSelectElement,
  onElementsChange,
  colorScheme,
  containerRef,
  extraEntityIds = [],
  entityScrollRequest = null,
  onStatusMessagesChange,
  canvasDragging = false,
  propertyEditing = false,
  mockContext,
}: YamlPanelProps) {
  const serialized = useMemo(() => serializeYamlPayload(elements), [elements])
  const [yamlText, setYamlText] = useState(serialized)
  const skipExternalSyncRef = useRef(false)
  const yamlSelectionRef = useRef({ anchor: 0, head: 0 })
  const yamlScrollRef = useRef(0)
  const pendingSerializedRef = useRef<string | null>(null)
  const { fontSize, increase, decrease } = useYamlFontSize()
  const { couplingEnabled, toggleCoupling } = useYamlSelectionCoupling()
  const { templatePreviewEnabled, toggleTemplatePreview } = useYamlTemplatePreview()
  const { flashSuccess, flashError, getFeedback } = useExportActionFeedback()
  const headerRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const headerSize = useElementSize(headerRef)
  const titleSize = useElementSize(titleRef)
  const toolbarSlotWidth = toolbarHeaderSlotWidth(headerSize.width, titleSize.width)
  const { toolbarRef: yamlToolbarRef, showLabels: showYamlLabels } = useToolbarLabels(
    YAML_TOOLBAR_ITEM_SELECTOR,
    {
      fitWidth: toolbarSlotWidth,
      measureRef,
    },
  )
  const { height: panelHeight, startResize } = useResizablePanelHeight({
    storageKey: 'oepl-yaml-panel-height',
    defaultHeight: 220,
    minHeight: MIN_YAML_PANEL_HEIGHT,
    minSiblingHeight: MIN_CANVAS_PREVIEW_HEIGHT,
    containerRef,
  })

  useEffect(() => {
    if (propertyEditing || (!couplingEnabled && canvasDragging)) {
      pendingSerializedRef.current = serialized
      return
    }

    const nextSerialized = pendingSerializedRef.current ?? serialized
    pendingSerializedRef.current = null

    if (shouldApplyExternalYamlSync(skipExternalSyncRef.current)) {
      setYamlText(nextSerialized)
    }
    skipExternalSyncRef.current = false
  }, [canvasDragging, couplingEnabled, propertyEditing, serialized])

  const elementsRef = useRef(elements)

  useEffect(() => {
    elementsRef.current = elements
  }, [elements])

  const scrollCommand = useMemo(
    () =>
      mergeYamlScrollCommands(
        createYamlScrollCommand(couplingEnabled, selectedIndex, selectionSource),
        createEntityScrollCommand(couplingEnabled, entityScrollRequest),
      ),
    [couplingEnabled, entityScrollRequest, selectedIndex, selectionSource],
  )

  const yamlStatusMessages = useMemo(() => getYamlStatusMessages(yamlText), [yamlText])

  useEffect(() => {
    onStatusMessagesChange?.(yamlStatusMessages)
  }, [onStatusMessagesChange, yamlStatusMessages])

  const handleCopyYaml = useCallback(async () => {
    const copied = await copyTextToClipboard(yamlText)
    if (copied) {
      flashSuccess('copy-yaml')
    } else {
      flashError('copy-yaml')
    }
  }, [flashError, flashSuccess, yamlText])

  const handleDownloadYaml = useCallback(() => {
    triggerBlobDownload(createYamlDownloadBlob(yamlText), buildYamlDownloadFilename(sessionName))
    flashSuccess('download-yaml')
  }, [flashSuccess, sessionName, yamlText])

  const toolbarProps = {
    showLabels: showYamlLabels,
    getFeedback,
    onCopyYaml: () => void handleCopyYaml(),
    onDownloadYaml: handleDownloadYaml,
    templatePreviewEnabled,
    onToggleTemplatePreview: toggleTemplatePreview,
    couplingEnabled,
    onToggleCoupling: toggleCoupling,
    fontSize,
    onDecreaseFontSize: decrease,
    onIncreaseFontSize: increase,
  }

  const pendingParsedRef = useRef<DrawElement[] | null>(null)
  const syncTimerRef = useRef<number | null>(null)

  const flushYamlElementsSync = useCallback(() => {
    if (syncTimerRef.current != null) {
      window.clearTimeout(syncTimerRef.current)
      syncTimerRef.current = null
    }
    const pending = pendingParsedRef.current
    pendingParsedRef.current = null
    if (pending == null || elementsSequenceEqual(elementsRef.current, pending)) {
      return
    }
    skipExternalSyncRef.current = true
    onElementsChange(pending)
  }, [onElementsChange])

  useEffect(
    () => () => {
      if (syncTimerRef.current != null) {
        window.clearTimeout(syncTimerRef.current)
      }
    },
    [],
  )

  const handleYamlChange = useCallback(
    (text: string) => {
      setYamlText(text)

      const parsed = tryParseYamlElements(text)
      if (parsed === null) {
        pendingParsedRef.current = null
        if (syncTimerRef.current != null) {
          window.clearTimeout(syncTimerRef.current)
          syncTimerRef.current = null
        }
        return
      }

      if (elementsSequenceEqual(elementsRef.current, parsed)) {
        pendingParsedRef.current = null
        if (syncTimerRef.current != null) {
          window.clearTimeout(syncTimerRef.current)
          syncTimerRef.current = null
        }
        return
      }

      pendingParsedRef.current = parsed
      if (syncTimerRef.current != null) {
        window.clearTimeout(syncTimerRef.current)
      }
      syncTimerRef.current = window.setTimeout(() => {
        syncTimerRef.current = null
        flushYamlElementsSync()
      }, 80)
    },
    [flushYamlElementsSync],
  )

  const handleCursorPosition = useCallback(
    (position: number, doc: string) => {
      if (!couplingEnabled) {
        return
      }

      const index = locateElementIndexAtPosition(doc, position)
      if (index == null || index === selectedIndex) {
        return
      }

      onSelectElement(index, 'yaml')
    },
    [couplingEnabled, onSelectElement, selectedIndex],
  )

  return (
    <section
      className={`flex shrink-0 flex-col border-t ${shell.panelBorder} ${shell.panel}`}
      style={{ height: panelHeight }}
    >
      <div
        role="separator"
        aria-label="Resize YAML panel"
        aria-orientation="horizontal"
        className="group flex h-1.5 shrink-0 cursor-ns-resize items-center justify-center bg-[var(--shell-border)] hover:bg-[var(--shell-hover)]"
        onMouseDown={startResize}
      >
        <div className="h-0.5 w-12 rounded-full bg-[var(--shell-muted)] group-hover:bg-[var(--shell-text)]" />
      </div>
      <div
        ref={headerRef}
        className={`relative flex shrink-0 items-center justify-between gap-2 border-b ${shell.panelBorder} px-4 py-2`}
      >
        <h2 ref={titleRef} className={`${shell.heading} shrink-0`}>
          YAML
        </h2>
        <div ref={yamlToolbarRef} className="shrink-0">
          <YamlHeaderToolbar {...toolbarProps} />
        </div>
        <div
          aria-hidden
          className="pointer-events-none invisible fixed top-0 -left-[10000px] h-0 overflow-hidden"
        >
          <div ref={measureRef} className="w-max whitespace-nowrap">
            <YamlHeaderToolbar {...toolbarProps} measureOnly />
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <YamlEditor
          className="h-full min-h-0 [&_.cm-editor]:h-full [&_.cm-scroller]:min-h-0"
          colorScheme={colorScheme}
          extraEntityIds={extraEntityIds}
          fontSizePx={fontSize}
          height="100%"
          mockContext={mockContext}
          templatePreviewEnabled={templatePreviewEnabled}
          scrollCommand={scrollCommand}
          preserveLinkedElementIndex={couplingEnabled ? selectedIndex : null}
          scrollLinkedElementOnSync={couplingEnabled && selectionSource !== 'yaml'}
          yamlSelectionRef={yamlSelectionRef}
          yamlScrollRef={yamlScrollRef}
          onCursorPositionChange={handleCursorPosition}
          onEditorBlur={flushYamlElementsSync}
          value={yamlText}
          onChange={handleYamlChange}
        />
      </div>
    </section>
  )
}
