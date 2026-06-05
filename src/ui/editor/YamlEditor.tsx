import { EditorView } from '@codemirror/view'
import { useEffect, useMemo, useRef } from 'react'
import { parseYamlPayload, scanPayloadForTemplates, validatePayload } from '../../core'
import type { ResolvedTheme } from '../preferences/theme'
import { locateElementFocusInYaml } from './locateElementInYaml'
import {
  createYamlEditorState,
  yamlThemeCompartment,
} from './yamlEditorExtensions'
import { yamlEntityIdsCompartment, yamlEntityIdsFacet } from './yamlEntityIds'
import { createYamlEditorTheme } from './yamlTheme'
import {
  shouldMoveCursorOnLinkedScroll,
  shouldReportYamlCursorPosition,
} from './yamlEditorSelection'
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
  onCursorPositionChange?: (position: number) => void
  className?: string
  extraEntityIds?: readonly string[]
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
  onCursorPositionChange,
  className,
  extraEntityIds = [],
}: YamlEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const pointerActiveRef = useRef(false)
  const lastScrollTokenRef = useRef<string | null>(null)
  const onChangeRef = useRef(onChange)
  const onCursorPositionChangeRef = useRef(onCursorPositionChange)
  const lastEmittedValueRef = useRef(value)
  const scannedEntityIds = useMemo(() => resolveEntityIds(value), [value])
  const entityIds = useMemo(
    () => mergeEntityIds(scannedEntityIds, extraEntityIds),
    [scannedEntityIds, extraEntityIds],
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
      ),
      parent: container,
    })

    viewRef.current = view
    lastEmittedValueRef.current = value
    onCursorPositionChangeRef.current?.(view.state.selection.main.head)

    return () => {
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

    if (value === lastEmittedValueRef.current) {
      return
    }

    const current = view.state.doc.toString()
    if (value === current) {
      lastEmittedValueRef.current = value
      return
    }

    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    })
    lastEmittedValueRef.current = value
  }, [value])

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

    const position = locateElementFocusInYaml(
      view.state.doc.toString(),
      scrollCommand.elementIndex,
    )
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
