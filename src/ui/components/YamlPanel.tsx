import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { serializeYamlPayload, type DrawElement } from '../../core'
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
import type { ResolvedTheme } from '../preferences/theme'
import type { StatusMessage } from '../lib/status-messages'
import { shell } from '../styles/shell'
import { YamlCouplingToggle } from './YamlCouplingToggle'
import { YamlFontSizeControls } from './YamlFontSizeControls'

const MIN_YAML_PANEL_HEIGHT = 120

interface YamlPanelProps {
  elements: DrawElement[]
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
}

export function YamlPanel({
  elements,
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
}: YamlPanelProps) {
  const serialized = useMemo(() => serializeYamlPayload(elements), [elements])
  const [yamlText, setYamlText] = useState(serialized)
  const skipExternalSyncRef = useRef(false)
  const yamlSelectionRef = useRef({ anchor: 0, head: 0 })
  const yamlScrollRef = useRef(0)
  const pendingSerializedRef = useRef<string | null>(null)
  const { fontSize, increase, decrease } = useYamlFontSize()
  const { couplingEnabled, toggleCoupling } = useYamlSelectionCoupling()
  const { height: panelHeight, startResize } = useResizablePanelHeight({
    storageKey: 'oepl-yaml-panel-height',
    defaultHeight: 220,
    minHeight: MIN_YAML_PANEL_HEIGHT,
    minSiblingHeight: MIN_CANVAS_PREVIEW_HEIGHT,
    containerRef,
  })

  useEffect(() => {
    if (!couplingEnabled && canvasDragging) {
      pendingSerializedRef.current = serialized
      return
    }

    const nextSerialized = pendingSerializedRef.current ?? serialized
    pendingSerializedRef.current = null

    if (shouldApplyExternalYamlSync(skipExternalSyncRef.current)) {
      setYamlText(nextSerialized)
    }
    skipExternalSyncRef.current = false
  }, [canvasDragging, couplingEnabled, serialized])

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

  const handleYamlChange = useCallback(
    (text: string) => {
      setYamlText(text)

      const parsed = tryParseYamlElements(text)
      if (parsed === null || elementsSequenceEqual(elementsRef.current, parsed)) {
        return
      }

      skipExternalSyncRef.current = true
      onElementsChange(parsed)
    },
    [onElementsChange],
  )

  const handleCursorPosition = useCallback(
    (position: number) => {
      if (!couplingEnabled) {
        return
      }

      const index = locateElementIndexAtPosition(yamlText, position)
      if (index == null || index === selectedIndex) {
        return
      }

      onSelectElement(index, 'yaml')
    },
    [couplingEnabled, onSelectElement, selectedIndex, yamlText],
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
        className={`flex shrink-0 items-center justify-between gap-3 border-b ${shell.panelBorder} px-4 py-2`}
      >
        <h2 className={shell.heading}>YAML</h2>
        <div className="flex items-center gap-2">
          <YamlCouplingToggle enabled={couplingEnabled} onToggle={toggleCoupling} />
          <YamlFontSizeControls fontSize={fontSize} onDecrease={decrease} onIncrease={increase} />
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <YamlEditor
          className="h-full min-h-0 [&_.cm-editor]:h-full [&_.cm-scroller]:min-h-0"
          colorScheme={colorScheme}
          extraEntityIds={extraEntityIds}
          fontSizePx={fontSize}
          height="100%"
          scrollCommand={scrollCommand}
          preserveLinkedElementIndex={couplingEnabled ? selectedIndex : null}
          scrollLinkedElementOnSync={couplingEnabled && selectionSource !== 'yaml'}
          yamlSelectionRef={yamlSelectionRef}
          yamlScrollRef={yamlScrollRef}
          onCursorPositionChange={handleCursorPosition}
          value={yamlText}
          onChange={handleYamlChange}
        />
      </div>
    </section>
  )
}
