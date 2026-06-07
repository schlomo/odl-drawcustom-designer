import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { serializeYamlPayload, type DrawElement } from '../../core'
import { locateElementIndexAtPosition } from '../editor/locateElementInYaml'
import {
  elementsSequenceEqual,
  getYamlElementsParseIssues,
  shouldApplyExternalYamlSync,
  summarizeYamlElementsParseIssues,
  tryParseYamlElements,
} from '../editor/yamlElementsSync'
import { YamlEditor } from '../editor/YamlEditor'
import { createYamlScrollCommand } from '../editor/yamlScrollCommand'
import {
  MIN_CANVAS_PREVIEW_HEIGHT,
  useResizablePanelHeight,
} from '../hooks/useResizablePanelHeight'
import type { SelectionSource } from '../hooks/useProjectState'
import { useYamlFontSize } from '../hooks/useYamlFontSize'
import { useYamlSelectionCoupling } from '../hooks/useYamlSelectionCoupling'
import type { ResolvedTheme } from '../preferences/theme'
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
}: YamlPanelProps) {
  const serialized = useMemo(() => serializeYamlPayload(elements), [elements])
  const [yamlText, setYamlText] = useState(serialized)
  const skipExternalSyncRef = useRef(false)
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
    if (shouldApplyExternalYamlSync(skipExternalSyncRef.current)) {
      setYamlText(serialized)
    }
    skipExternalSyncRef.current = false
  }, [serialized])

  const elementsRef = useRef(elements)

  useEffect(() => {
    elementsRef.current = elements
  }, [elements])

  const scrollCommand = useMemo(
    () => createYamlScrollCommand(couplingEnabled, selectedIndex, selectionSource),
    [couplingEnabled, selectedIndex, selectionSource],
  )

  const yamlParseIssueSummary = useMemo(() => {
    return summarizeYamlElementsParseIssues(getYamlElementsParseIssues(yamlText))
  }, [yamlText])

  const yamlBlocksCanvasSync = yamlParseIssueSummary != null

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
      {yamlBlocksCanvasSync ? (
        <div
          className="shrink-0 border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-200"
          role="status"
        >
          <p className="font-medium">YAML not applied to canvas</p>
          <p className="mt-1 text-red-100/90">{yamlParseIssueSummary}</p>
          <p className={`mt-1 ${shell.muted}`}>
            Fix the highlighted issue in the editor below (red underline). The canvas keeps the last
            valid design until validation passes.
          </p>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <YamlEditor
          className="h-full min-h-0 [&_.cm-editor]:h-full [&_.cm-scroller]:min-h-0"
          colorScheme={colorScheme}
          extraEntityIds={extraEntityIds}
          fontSizePx={fontSize}
          height="100%"
          scrollCommand={scrollCommand}
          preserveLinkedElementIndex={couplingEnabled ? selectedIndex : null}
          onCursorPositionChange={handleCursorPosition}
          value={yamlText}
          onChange={handleYamlChange}
        />
      </div>
    </section>
  )
}
