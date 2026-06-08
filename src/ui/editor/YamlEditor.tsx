import { EditorView } from '@codemirror/view'
import { useEffect, useMemo, useRef } from 'react'
import { parseYamlPayload, scanPayloadForTemplates, validatePayload, type HaMockContext } from '../../core'
import type { ResolvedTheme } from '../preferences/theme'
import { locateElementFocusInYaml } from './locateElementInYaml'
import { locateFirstEntityOccurrenceInYaml } from './locateEntityInYaml'
import {
  createYamlEditorState,
  yamlThemeCompartment,
} from './yamlEditorExtensions'
import { yamlEntityIdsCompartment, yamlEntityIdsFacet } from './yamlEntityIds'
import { reconfigureTemplatePreview } from './yamlTemplatePreview'
import { createYamlEditorTheme } from './yamlTheme'
import {
  shouldMoveCursorOnLinkedScroll,
  shouldReportYamlCursorPosition,
} from './yamlEditorSelection'
import type { StoredEditorSelection } from './yamlEditorScroll'
import {
  bindYamlScrollStore,
  dispatchPreservingEditorViewState,
  scrollLinkedElementIntoView,
} from './yamlEditorScroll'
import {
  reconfigureLinkedElementIndex,
} from './yamlLinkedElement'
import {
  shouldApplyYamlScrollCommand,
  type YamlScrollCommand,
} from './yamlScrollCommand'

export type { YamlScrollCommand } from './yamlScrollCommand'

export interface YamlEditorProps {
  value: string
  onChange: (value: string) => void
  height: string
  colorScheme: ResolvedTheme
  fontSizePx: number
  scrollCommand?: YamlScrollCommand | null
  /** When set, external doc sync restores the cursor to this element (property/canvas edits). */
  preserveLinkedElementIndex?: number | null
  /** Scroll linked element into view on canvas/property-driven YAML sync. */
  scrollLinkedElementOnSync?: boolean
  onCursorPositionChange?: (position: number) => void
  /** Last known YAML selection — survives canvas-driven doc sync while unlinked. */
  yamlSelectionRef?: { current: StoredEditorSelection }
  /** Last known YAML scrollTop — survives canvas-driven doc sync while unlinked. */
  yamlScrollRef?: { current: number }
  className?: string
  extraEntityIds?: readonly string[]
  mockContext?: HaMockContext
  templatePreviewEnabled?: boolean
}

function mergeEntityIds(scanned: readonly string[], extra: readonly string[]): string[] {
  return [...new Set([...scanned, ...extra])].sort()
}

function resolveEntityIds(yamlSource: string): string[] {
  try {
    const parsed = parseYamlPayload(yamlSource)
    const validation = validatePayload(parsed)
    if (!validation.success) {
      return []
    }
    return scanPayloadForTemplates(validation.data).entityIds
  } catch {
    return []
  }
}

export function YamlEditor({
  value,
  onChange,
  height,
  colorScheme,
  fontSizePx,
  scrollCommand = null,
  preserveLinkedElementIndex = null,
  scrollLinkedElementOnSync = false,
  onCursorPositionChange,
  yamlSelectionRef,
  yamlScrollRef,
  className,
  extraEntityIds = [],
  mockContext,
  templatePreviewEnabled = true,
}: YamlEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const pointerActiveRef = useRef(false)
  const lastScrollTokenRef = useRef<string | null>(null)
  const onChangeRef = useRef(onChange)
  const onCursorPositionChangeRef = useRef(onCursorPositionChange)
  const lastEmittedValueRef = useRef(value)
  const suppressCursorReportRef = useRef(false)
  const scannedEntityIds = useMemo(() => resolveEntityIds(value), [value])
  const entityIds = useMemo(
    () => mergeEntityIds(scannedEntityIds, extraEntityIds),
    [scannedEntityIds, extraEntityIds],
  )
  const templatePreview = useMemo(
    () => ({
      enabled: templatePreviewEnabled,
      context: mockContext ?? { states: {} },
    }),
    [mockContext, templatePreviewEnabled],
  )

  useEffect(() => {
    onChangeRef.current = onChange
    onCursorPositionChangeRef.current = onCursorPositionChange
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container || viewRef.current) {
      return
    }

    const view = new EditorView({
      state: createYamlEditorState(
        value,
        colorScheme,
        fontSizePx,
        entityIds,
        (nextValue) => {
          lastEmittedValueRef.current = nextValue
          onChangeRef.current(nextValue)
        },
        pointerActiveRef,
        onCursorPositionChangeRef,
        shouldReportYamlCursorPosition,
        suppressCursorReportRef,
        yamlSelectionRef,
        templatePreview,
      ),
      parent: container,
    })

    viewRef.current = view
    lastEmittedValueRef.current = value
    onCursorPositionChangeRef.current?.(view.state.selection.main.head)

    const unbindScroll = yamlScrollRef ? bindYamlScrollStore(view, yamlScrollRef) : undefined

    return () => {
      unbindScroll?.()
      view.destroy()
      viewRef.current = null
    }
    // Mount once; theme, entity ids, and value sync use dedicated effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) {
      return
    }

    view.dispatch({
      effects: yamlThemeCompartment.reconfigure(createYamlEditorTheme(colorScheme, fontSizePx)),
    })
  }, [colorScheme, fontSizePx])

  useEffect(() => {
    const view = viewRef.current
    if (!view) {
      return
    }

    view.dispatch({
      effects: yamlEntityIdsCompartment.reconfigure(yamlEntityIdsFacet.of(entityIds)),
    })
  }, [entityIds])

  useEffect(() => {
    const view = viewRef.current
    if (!view) {
      return
    }

    view.dispatch({
      effects: reconfigureTemplatePreview(templatePreview),
    })
  }, [templatePreview])

  useEffect(() => {
    const view = viewRef.current
    if (!view) {
      return
    }

    view.dispatch({
      effects: reconfigureLinkedElementIndex(preserveLinkedElementIndex),
    })
  }, [preserveLinkedElementIndex])

  useEffect(() => {
    const view = viewRef.current
    if (!view) {
      return
    }

    if (value === lastEmittedValueRef.current) {
      return
    }

    const current = view.state.doc.toString()
    if (value === current) {
      lastEmittedValueRef.current = value
      return
    }

    suppressCursorReportRef.current = true
    const linkedPosition =
      preserveLinkedElementIndex != null
        ? locateElementFocusInYaml(value, preserveLinkedElementIndex)
        : null
    const scrollEffect =
      scrollLinkedElementOnSync && linkedPosition != null
        ? scrollLinkedElementIntoView(linkedPosition)
        : undefined
    const editorHasFocus = view.hasFocus
    const syncSpec = {
      changes: { from: 0, to: current.length, insert: value },
      ...(linkedPosition != null && editorHasFocus
        ? { selection: { anchor: linkedPosition, head: linkedPosition } }
        : {}),
      ...(scrollEffect ? { effects: scrollEffect } : {}),
    }

    if (scrollEffect) {
      if (editorHasFocus && linkedPosition != null) {
        view.dispatch(syncSpec)
        if (yamlSelectionRef) {
          yamlSelectionRef.current = { anchor: linkedPosition, head: linkedPosition }
        }
      } else {
        dispatchPreservingEditorViewState(
          view,
          { changes: syncSpec.changes, effects: scrollEffect },
          yamlSelectionRef,
          yamlScrollRef,
        )
      }
    } else {
      dispatchPreservingEditorViewState(view, { changes: syncSpec.changes }, yamlSelectionRef, yamlScrollRef)
    }
    lastEmittedValueRef.current = value
    queueMicrotask(() => {
      suppressCursorReportRef.current = false
    })
  }, [preserveLinkedElementIndex, scrollLinkedElementOnSync, value, yamlScrollRef, yamlSelectionRef])

  useEffect(() => {
    if (!scrollCommand) {
      lastScrollTokenRef.current = null
      return
    }

    if (
      !shouldApplyYamlScrollCommand(
        scrollCommand,
        lastScrollTokenRef.current,
        pointerActiveRef.current,
      )
    ) {
      return
    }

    const view = viewRef.current
    if (!view) {
      return
    }

    const doc = view.state.doc.toString()
    const position =
      scrollCommand.kind === 'element'
        ? locateElementFocusInYaml(doc, scrollCommand.elementIndex)
        : locateFirstEntityOccurrenceInYaml(doc, scrollCommand.entityId)
    if (position == null) {
      return
    }

    lastScrollTokenRef.current = scrollCommand.token
    const scrollEffect = EditorView.scrollIntoView(position, { y: 'center', yMargin: 24 })
    const selection = view.state.selection.main

    if (shouldMoveCursorOnLinkedScroll(selection)) {
      view.dispatch({
        selection: { anchor: position, head: position },
        effects: scrollEffect,
      })
      return
    }

    view.dispatch({ effects: scrollEffect })
  }, [scrollCommand])

  return <div ref={containerRef} className={className} style={{ height }} />
}
