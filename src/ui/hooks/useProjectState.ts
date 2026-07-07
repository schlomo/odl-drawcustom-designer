import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  applyPlotPropertyUpdate,
  BUNDLED_SHOWCASE_IMAGE_KEY,
  resolveAsset,
  type DrawElement,
  type HaMockContext,
  type ServiceOptions,
} from '../../core'
import type { AssetKind, AssetUploadResult, RenderContext, TagColorMode } from '../../core'
import { applyTemplateContextToPayload, resolvePreviewClockInterval, scanPayloadForTemplates } from '../../core'
import {
  persistAsset,
  removePersistedAsset,
  writeSessionToDb,
} from '../../storage'
import type { AppBootstrap } from '../bootstrap/appBootstrap'
import type { PersistedEditHistory, SessionEditSnapshot } from '../../storage'
import { SHOWCASE_CANVAS, cloneShowcaseElements, cloneShowcaseSimulator } from '../data/showcase'
import { alignElementsInUnion, canAlignSelection, type ElementAlign } from '../lib/align-elements'
import { applyElementUpdates, nudgeElementsAtIndices } from '../lib/batch-element-updates'
import {
  canAddElementType,
  DEBUG_GRID_ONCE_MESSAGE,
  elementsWithAddedElement,
  type AddElementResult,
} from '../lib/add-element-guards'
import { storedPropertyValueUnchanged } from '../lib/property-field-meta'
import { createElementFromTemplate } from '../lib/create-element-from-template'
import { moveElementInArray } from '../lib/element-geometry'
import {
  clearDemoMockAttributes,
  clearDemoMockStates,
  clearDemoVariables,
} from '../lib/clear-demo-data'
import { reorderSelectionBlock } from '../lib/reorder-selection'
import { isElementCanvasSelectable, resolveElementHitBounds } from '../lib/hidden-element-hints'
import { boundsFullyEnclosedInRect } from '../lib/marquee-selection'
import type { ElementBounds } from '../lib/primitive-bounds'
import {
  cloneEditSnapshot,
  EditHistory,
  snapshotsEqual,
  type EditSnapshot,
} from '../lib/edit-history'
import {
  clampSelectedIndices,
  indicesAfterBringToFront,
  indicesAfterSendToBack,
  remapIndicesAfterMove,
} from '../lib/selection-remap'
import { verifyAndValidateAssetUpload } from '../lib/verify-asset-upload'
import {
  type CanvasRotation,
  type PreviewDitherMode,
} from '../preferences/displayConfig'
import { writeMockStates } from '../preferences/mockStates'
import { isValidVariableName, writeVariables } from '../preferences/variables'
import type { StoredVariables } from '../../storage'
import { allowShowcaseBundledForDemo, suppressShowcaseBundled } from '../preferences/showcaseAsset'
import { readSnapGridPrefs, writeSnapGridPrefs, type SnapGridPrefs } from '../preferences/snapGrid'
import {
  readShowHiddenHintsPrefs,
  writeShowHiddenHintsPrefs,
} from '../preferences/hiddenHints'
import { useTemplatePreviewClock } from './useTemplatePreviewClock'

export type { AddElementResult } from '../lib/add-element-guards'
export type { CanvasRotation } from '../preferences/displayConfig'
export type SelectionSource = 'ui' | 'yaml'

export interface SelectElementOptions {
  additive?: boolean
  source?: SelectionSource
}

function normalizeSelectOptions(
  options?: SelectElementOptions | SelectionSource,
): SelectElementOptions {
  if (options === 'ui' || options === 'yaml') {
    return { source: options }
  }
  return options ?? {}
}

function sortIndices(indices: number[]): number[] {
  return [...indices].sort((left, right) => left - right)
}

function sessionSnapshotToEdit(snapshot: SessionEditSnapshot): EditSnapshot {
  return {
    elements: snapshot.elements,
    canvas: { ...snapshot.canvas },
    service: snapshot.service,
    selectedIndices: [...snapshot.selectedIndices],
  }
}

function editSnapshotToSession(snapshot: EditSnapshot): SessionEditSnapshot {
  return {
    elements: snapshot.elements,
    canvas: { ...snapshot.canvas },
    service: snapshot.service,
    selectedIndices: [...snapshot.selectedIndices],
  }
}

function createEditHistory(editHistory?: PersistedEditHistory): EditHistory {
  const history = new EditHistory()
  if (editHistory) {
    history.loadStacks({
      undoStack: editHistory.undoStack.map(sessionSnapshotToEdit),
      redoStack: editHistory.redoStack.map(sessionSnapshotToEdit),
    })
  }
  return history
}

function snapshotEditHistory(history: EditHistory): PersistedEditHistory {
  const stacks = history.exportStacks()
  return {
    undoStack: stacks.undoStack.map(editSnapshotToSession),
    redoStack: stacks.redoStack.map(editSnapshotToSession),
  }
}

export interface CanvasConfig {
  width: number
  height: number
  rotation: CanvasRotation
  colorMode: TagColorMode
  previewDitherMode: PreviewDitherMode
}

type MockEntityAttributes = NonNullable<HaMockContext['attributes']>

function buildEffectiveMockContext(
  elements: DrawElement[],
  mockStates: HaMockContext['states'],
  mockAttributes: MockEntityAttributes,
  variables: StoredVariables,
): HaMockContext {
  const states = { ...mockStates }

  for (const entityId of scanPayloadForTemplates(elements).entityIds) {
    if (!(entityId in states)) {
      states[entityId] = 'unknown'
    }
  }

  return { states, attributes: mockAttributes, variables }
}

export function useProjectState(bootstrap: AppBootstrap) {
  const [sessionName, setSessionName] = useState(bootstrap.sessionName)
  const [elements, setElements] = useState<DrawElement[]>(bootstrap.elements)
  const [selectedIndices, setSelectedIndices] = useState<number[]>([])
  const [selectionSource, setSelectionSource] = useState<SelectionSource>('ui')
  const [canvas, setCanvas] = useState<CanvasConfig>(bootstrap.canvas)
  const [service, setService] = useState<ServiceOptions | undefined>(bootstrap.service)
  const [mockStates, setMockStates] = useState<HaMockContext['states']>(bootstrap.mockStates)
  const [mockAttributes, setMockAttributes] = useState<MockEntityAttributes>(
    bootstrap.mockAttributes,
  )
  const [variables, setVariables] = useState<StoredVariables>(bootstrap.variables)
  const [assetRevision, setAssetRevision] = useState(0)
  const [snapGrid, setSnapGrid] = useState<SnapGridPrefs>(() => readSnapGridPrefs())
  const [showHiddenHints, setShowHiddenHints] = useState(() => readShowHiddenHintsPrefs().enabled)
  const mockStatesRef = useRef(mockStates)
  const mockAttributesRef = useRef(mockAttributes)
  const elementsRef = useRef(elements)
  const canvasRef = useRef(canvas)
  const serviceRef = useRef(service)
  const selectedIndicesRef = useRef(selectedIndices)
  const [editHistory] = useState(() => createEditHistory(bootstrap.editHistory))
  const historyRef = useRef(editHistory)
  const [historyUi, setHistoryUi] = useState(() => ({
    canUndo: editHistory.canUndo,
    canRedo: editHistory.canRedo,
    undoDepth: editHistory.undoDepth,
  }))

  useEffect(() => {
    mockStatesRef.current = mockStates
  }, [mockStates])

  useEffect(() => {
    mockAttributesRef.current = mockAttributes
  }, [mockAttributes])

  const commitElements = useCallback((value: DrawElement[] | ((current: DrawElement[]) => DrawElement[])) => {
    const next = typeof value === 'function' ? value(elementsRef.current) : value
    elementsRef.current = next
    setElements(next)
  }, [])

  const commitCanvas = useCallback((value: CanvasConfig | ((current: CanvasConfig) => CanvasConfig)) => {
    const next = typeof value === 'function' ? value(canvasRef.current) : value
    canvasRef.current = next
    setCanvas(next)
  }, [])

  const commitService = useCallback(
    (value: ServiceOptions | undefined | ((current: ServiceOptions | undefined) => ServiceOptions | undefined)) => {
      const next = typeof value === 'function' ? value(serviceRef.current) : value
      serviceRef.current = next
      setService(next)
    },
    [],
  )

  const commitSelectedIndices = useCallback((value: number[] | ((current: number[]) => number[])) => {
    const next = typeof value === 'function' ? value(selectedIndicesRef.current) : value
    selectedIndicesRef.current = next
    setSelectedIndices(next)
  }, [])

  const syncHistoryUi = useCallback(() => {
    const history = historyRef.current!
    setHistoryUi({
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      undoDepth: history.undoDepth,
    })
  }, [])

  const resetEditHistory = useCallback(() => {
    historyRef.current!.clear()
    syncHistoryUi()
  }, [syncHistoryUi])

  const captureSnapshot = useCallback((): EditSnapshot => {
    return cloneEditSnapshot({
      elements: elementsRef.current,
      canvas: canvasRef.current,
      service: serviceRef.current,
      selectedIndices: selectedIndicesRef.current,
    })
  }, [])

  const restoreSnapshot = useCallback(
    (snapshot: EditSnapshot) => {
      const nextElements = structuredClone(snapshot.elements)
      elementsRef.current = nextElements
      setElements(nextElements)
      const nextSelection = clampSelectedIndices(snapshot.selectedIndices, snapshot.elements.length)
      selectedIndicesRef.current = nextSelection
      setSelectedIndices(nextSelection)
      setSelectionSource('ui')
    },
    [],
  )

  const dispatchHistory = useCallback(
    (mutate: () => void) => {
      const before = captureSnapshot()
      mutate()
      const after = captureSnapshot()
      if (snapshotsEqual(before, after)) {
        return
      }
      historyRef.current!.recordBefore(before)
      syncHistoryUi()
    },
    [captureSnapshot, syncHistoryUi],
  )

  const beginEditCoalesce = useCallback(() => {
    historyRef.current!.beginCoalesce(captureSnapshot())
  }, [captureSnapshot])

  const endEditCoalesce = useCallback(() => {
    historyRef.current!.endCoalesce(captureSnapshot())
    syncHistoryUi()
  }, [captureSnapshot, syncHistoryUi])

  const undo = useCallback(() => {
    const restored = historyRef.current!.undo(captureSnapshot())
    if (restored) {
      restoreSnapshot(restored)
      syncHistoryUi()
    }
  }, [captureSnapshot, restoreSnapshot, syncHistoryUi])

  const redo = useCallback(() => {
    const restored = historyRef.current!.redo(captureSnapshot())
    if (restored) {
      restoreSnapshot(restored)
      syncHistoryUi()
    }
  }, [captureSnapshot, restoreSnapshot, syncHistoryUi])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void writeMockStates({ states: mockStates, attributes: mockAttributes })
    }, 250)
    return () => {
      window.clearTimeout(timer)
    }
  }, [mockStates, mockAttributes])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void writeVariables(variables)
    }, 250)
    return () => {
      window.clearTimeout(timer)
    }
  }, [variables])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void writeSessionToDb({
        name: sessionName,
        canvas,
        service,
        elements,
        editHistory: snapshotEditHistory(historyRef.current!),
      })
    }, 250)
    return () => {
      window.clearTimeout(timer)
    }
  }, [canvas, elements, historyUi, service, sessionName])

  useEffect(() => {
    writeSnapGridPrefs(snapGrid)
  }, [snapGrid])

  useEffect(() => {
    writeShowHiddenHintsPrefs({ enabled: showHiddenHints })
  }, [showHiddenHints])

  const previewClockInterval = useMemo(
    () => resolvePreviewClockInterval(elements),
    [elements],
  )

  const previewNow = useTemplatePreviewClock(previewClockInterval)

  const mockContext = useMemo(
    () => buildEffectiveMockContext(elements, mockStates, mockAttributes, variables),
    [elements, mockStates, mockAttributes, variables],
  )

  const previewMockContext = useMemo(
    (): HaMockContext => ({ ...mockContext, now: previewNow }),
    [mockContext, previewNow],
  )

  const renderContext: RenderContext = useMemo(
    () => ({
      width: canvas.width,
      height: canvas.height,
      colorMode: canvas.colorMode,
      ditherMode: canvas.previewDitherMode,
      showHiddenHints,
    }),
    [canvas.width, canvas.height, canvas.colorMode, canvas.previewDitherMode, showHiddenHints],
  )

  const previewElements = useMemo(
    () => applyTemplateContextToPayload(elements, previewMockContext),
    [elements, previewMockContext],
  )

  const extraEntityIds = useMemo(() => Object.keys(mockContext.states).sort(), [mockContext.states])

  const selectedIndex = selectedIndices.length > 0 ? selectedIndices[selectedIndices.length - 1]! : null

  const selectElement = useCallback((index: number | null, options?: SelectElementOptions | SelectionSource) => {
    const { additive = false, source = 'ui' } = normalizeSelectOptions(options)
    setSelectionSource(source)
    if (index == null) {
      commitSelectedIndices([])
      return
    }
    if (additive) {
      commitSelectedIndices((current) => {
        if (current.includes(index)) {
          const next = current.filter((entry) => entry !== index)
          return next.length > 0 ? next : []
        }
        return sortIndices([...current, index])
      })
      return
    }
    commitSelectedIndices([index])
  }, [commitSelectedIndices])

  const clearSelection = useCallback(() => {
    setSelectionSource('ui')
    commitSelectedIndices([])
  }, [commitSelectedIndices])

  const selectAllInRect = useCallback(
    (bounds: ElementBounds, additive = false) => {
      const enclosed = previewElements.flatMap((element, index) => {
        if (!isElementCanvasSelectable(element, renderContext)) {
          return []
        }
        const hitBounds = resolveElementHitBounds(element, renderContext)
        return hitBounds && boundsFullyEnclosedInRect(hitBounds, bounds) ? [index] : []
      })
      setSelectionSource('ui')
      if (additive) {
        commitSelectedIndices((current) => sortIndices([...new Set([...current, ...enclosed])]))
        return
      }
      commitSelectedIndices(sortIndices(enclosed))
    },
    [commitSelectedIndices, previewElements, renderContext],
  )

  const applyResolution = useCallback(
    (width: number, height: number) => {
      commitCanvas((current) => ({ ...current, width, height }))
    },
    [commitCanvas],
  )

  const setColorMode = useCallback(
    (colorMode: TagColorMode) => {
      commitCanvas((current) => ({ ...current, colorMode }))
    },
    [commitCanvas],
  )

  const setCanvasSize = useCallback(
    (width: number, height: number) => {
      commitCanvas((current) => ({ ...current, width, height }))
    },
    [commitCanvas],
  )

  const setRotation = useCallback(
    (rotation: CanvasRotation) => {
      commitCanvas((current) => ({ ...current, rotation }))
    },
    [commitCanvas],
  )

  const setMockState = useCallback((entityId: string, value: string) => {
    setMockStates((current) => ({
      ...current,
      [entityId]: value,
    }))
  }, [])

  const addMockEntity = useCallback((entityId: string, value: string) => {
    setMockStates((current) => ({
      ...current,
      [entityId]: value,
    }))
  }, [])

  const removeMockEntity = useCallback((entityId: string) => {
    setMockStates((current) => {
      if (!(entityId in current)) {
        return current
      }
      const next = { ...current }
      delete next[entityId]
      return next
    })
    setMockAttributes((current) => {
      if (!(entityId in current)) {
        return current
      }
      const next = { ...current }
      delete next[entityId]
      return next
    })
  }, [])

  const setMockAttribute = useCallback(
    (entityId: string, attribute: string, value: unknown) => {
      setMockAttributes((current) => ({
        ...current,
        [entityId]: { ...(current[entityId] ?? {}), [attribute]: value },
      }))
    },
    [],
  )

  const renameMockAttribute = useCallback(
    (entityId: string, previousName: string, nextName: string) => {
      const trimmed = nextName.trim()
      if (trimmed === previousName) {
        return
      }
      setMockAttributes((current) => {
        const entity = current[entityId]
        if (!entity || !(previousName in entity)) {
          return current
        }
        const nextEntity: Record<string, unknown> = {}
        for (const [key, attrValue] of Object.entries(entity)) {
          if (key === previousName) {
            if (trimmed) {
              nextEntity[trimmed] = attrValue
            }
          } else {
            nextEntity[key] = attrValue
          }
        }
        return { ...current, [entityId]: nextEntity }
      })
    },
    [],
  )

  const removeMockAttribute = useCallback((entityId: string, attribute: string) => {
    setMockAttributes((current) => {
      const entity = current[entityId]
      if (!entity || !(attribute in entity)) {
        return current
      }
      const nextEntity = { ...entity }
      delete nextEntity[attribute]
      const next = { ...current }
      if (Object.keys(nextEntity).length > 0) {
        next[entityId] = nextEntity
      } else {
        delete next[entityId]
      }
      return next
    })
  }, [])

  const setVariable = useCallback((name: string, value: string) => {
    if (!isValidVariableName(name)) {
      return
    }
    setVariables((current) => ({ ...current, [name]: value }))
  }, [])

  const addVariable = useCallback((name: string, value: string) => {
    if (!isValidVariableName(name)) {
      return
    }
    setVariables((current) => ({ ...current, [name]: value }))
  }, [])

  const renameVariable = useCallback((previousName: string, nextName: string) => {
    if (!isValidVariableName(nextName)) {
      return
    }
    setVariables((current) => {
      if (!(previousName in current) || previousName === nextName) {
        return current
      }
      const next: StoredVariables = {}
      for (const [name, value] of Object.entries(current)) {
        next[name === previousName ? nextName : name] = value
      }
      return next
    })
  }, [])

  const removeVariable = useCallback((name: string) => {
    setVariables((current) => {
      if (!(name in current)) {
        return current
      }
      const next = { ...current }
      delete next[name]
      return next
    })
  }, [])

  const uploadAsset = useCallback(
    async (key: string, kind: AssetKind, file: File): Promise<AssetUploadResult> => {
      const result = await verifyAndValidateAssetUpload(kind, file, key)
      if (!result.ok) {
        return result
      }

      try {
        await persistAsset(key, {
          blob: file,
          mime: result.mime,
        })
        setAssetRevision((revision) => revision + 1)
        return result
      } catch {
        return {
          ok: false,
          message: 'Could not save the file locally. Try reloading the page.',
        }
      }
    },
    [],
  )

  const clearAsset = useCallback(async (key: string) => {
    if (key === BUNDLED_SHOWCASE_IMAGE_KEY) {
      if (resolveAsset(key).status === 'resolved') {
        await removePersistedAsset(key)
      }
      suppressShowcaseBundled()
      setAssetRevision((revision) => revision + 1)
      return
    }

    await removePersistedAsset(key)
    setAssetRevision((revision) => revision + 1)
  }, [])

  const updateElementsBatch = useCallback(
    (updates: ReadonlyMap<number, DrawElement>) => {
      if (!historyRef.current!.isCoalescing()) {
        dispatchHistory(() => {
          commitElements((current) => applyElementUpdates(current, updates))
        })
        return
      }
      commitElements((current) => applyElementUpdates(current, updates))
    },
    [commitElements, dispatchHistory],
  )

  const updateElement = useCallback(
    (index: number, nextElement: DrawElement) => {
      if (!historyRef.current!.isCoalescing()) {
        dispatchHistory(() => {
          commitElements((current) => {
            if (index < 0 || index >= current.length) {
              return current
            }
            const next = [...current]
            next[index] = nextElement
            return next
          })
        })
        return
      }
      commitElements((current) => {
        if (index < 0 || index >= current.length) {
          return current
        }
        const next = [...current]
        next[index] = nextElement
        return next
      })
    },
    [commitElements, dispatchHistory],
  )

  const updateElementProperty = useCallback(
    (index: number, key: string, value: unknown) => {
      const mutate = () => {
        commitElements((current) => {
          if (index < 0 || index >= current.length) {
            return current
          }
          const element = current[index]
          if (element.type !== 'plot' && storedPropertyValueUnchanged(element, key, value)) {
            return current
          }
          const next = [...current]
          if (element.type === 'plot') {
            next[index] = applyPlotPropertyUpdate(element, key, value)
            return next
          }
          if (value === undefined) {
            const nextElement = { ...element } as Record<string, unknown>
            delete nextElement[key]
            next[index] = nextElement as DrawElement
          } else {
            next[index] = { ...element, [key]: value } as DrawElement
          }
          return next
        })
      }

      if (historyRef.current!.isCoalescing()) {
        mutate()
        return
      }
      dispatchHistory(mutate)
    },
    [commitElements, dispatchHistory],
  )

  const updateSelectedProperty = useCallback(
    (key: string, value: unknown) => {
      const mutate = () => {
        commitElements((current) => {
          let next = current
          for (const index of selectedIndicesRef.current) {
            if (index < 0 || index >= next.length) {
              continue
            }
            const element = next[index]!
            if (element.type !== 'plot' && storedPropertyValueUnchanged(element, key, value)) {
              continue
            }
            const updated = [...next]
            if (element.type === 'plot') {
              updated[index] = applyPlotPropertyUpdate(element, key, value)
            } else if (value === undefined) {
              const nextElement = { ...element } as Record<string, unknown>
              delete nextElement[key]
              updated[index] = nextElement as DrawElement
            } else {
              updated[index] = { ...element, [key]: value } as DrawElement
            }
            next = updated
          }
          return next
        })
      }

      if (historyRef.current!.isCoalescing()) {
        mutate()
        return
      }
      dispatchHistory(mutate)
    },
    [commitElements, dispatchHistory],
  )

  const deleteElement = useCallback(
    (index: number) => {
      dispatchHistory(() => {
        commitElements((current) => {
          if (index < 0 || index >= current.length) {
            return current
          }
          return current.filter((_, i) => i !== index)
        })
        commitSelectedIndices((current) =>
          current
            .filter((entry) => entry !== index)
            .map((entry) => (entry > index ? entry - 1 : entry)),
        )
      })
    },
    [commitElements, commitSelectedIndices, dispatchHistory],
  )

  const deleteSelectedElements = useCallback(() => {
    dispatchHistory(() => {
      commitElements((current) => {
        const toDelete = new Set(selectedIndicesRef.current)
        return current.filter((_, index) => !toDelete.has(index))
      })
      commitSelectedIndices([])
    })
  }, [commitElements, commitSelectedIndices, dispatchHistory])

  const addElement = useCallback(
    (type: DrawElement['type']): AddElementResult => {
      if (!canAddElementType(elements, type)) {
        return { ok: false, message: DEBUG_GRID_ONCE_MESSAGE }
      }
      const element = createElementFromTemplate(type)
      const { nextElements, index } = elementsWithAddedElement(elements, element)
      dispatchHistory(() => {
        commitSelectedIndices([index])
        setSelectionSource('ui')
        commitElements(nextElements)
      })
      return { ok: true, index }
    },
    [commitElements, commitSelectedIndices, dispatchHistory, elements],
  )

  const clearElements = useCallback(() => {
    resetEditHistory()
    commitElements([])
    commitSelectedIndices([])
    // Strip only the unmodified demo-seeded simulator entries; mocks, attributes
    // and variables the user added or changed are preserved (persisted via the
    // debounced writes). This gives a clean slate without deleting user data.
    setMockStates((current) => clearDemoMockStates(current))
    setMockAttributes((current) => clearDemoMockAttributes(current))
    setVariables((current) => clearDemoVariables(current))
  }, [commitElements, commitSelectedIndices, resetEditHistory])

  const loadDemo = useCallback(() => {
    allowShowcaseBundledForDemo()
    resetEditHistory()
    commitCanvas({ ...SHOWCASE_CANVAS })
    commitElements(cloneShowcaseElements())
    commitSelectedIndices([])
    // Seed the mock context the showcase templates rely on, so the demo renders
    // its state/attribute/variable examples without manual Simulator setup.
    const simulator = cloneShowcaseSimulator()
    setMockStates(simulator.states)
    setMockAttributes(simulator.attributes)
    setVariables(simulator.variables)
  }, [commitCanvas, commitElements, commitSelectedIndices, resetEditHistory])

  const nudgeElement = useCallback(
    (index: number, dx: number, dy: number) => {
      dispatchHistory(() => {
        commitElements((current) =>
          nudgeElementsAtIndices(current, [index], dx, dy, {
            canvas: {
              width: canvasRef.current.width,
              height: canvasRef.current.height,
            },
            snapGrid,
            resolveBounds: (element) => resolveElementHitBounds(element, renderContext),
          }),
        )
      })
    },
    [commitElements, dispatchHistory, renderContext, snapGrid],
  )

  const nudgeSelectedElements = useCallback(
    (dx: number, dy: number) => {
      dispatchHistory(() => {
        commitElements((current) =>
          nudgeElementsAtIndices(current, selectedIndicesRef.current, dx, dy, {
            canvas: {
              width: canvasRef.current.width,
              height: canvasRef.current.height,
            },
            snapGrid,
            resolveBounds: (element) => resolveElementHitBounds(element, renderContext),
          }),
        )
      })
    },
    [commitElements, dispatchHistory, renderContext, snapGrid],
  )

  const applyLayerMove = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= elements.length) {
        return
      }
      if (toIndex < 0 || toIndex >= elements.length) {
        return
      }
      dispatchHistory(() => {
        commitSelectedIndices((selected) => remapIndicesAfterMove(selected, fromIndex, toIndex))
        setSelectionSource('ui')
        commitElements((current) => moveElementInArray(current, fromIndex, toIndex))
      })
    },
    [commitElements, commitSelectedIndices, dispatchHistory, elements.length],
  )

  const moveSelectionLayer = useCallback(
    (direction: 'up' | 'down') => {
      if (selectedIndices.length === 0) {
        return
      }
      const sorted =
        direction === 'up'
          ? [...selectedIndices].sort((left, right) => right - left)
          : [...selectedIndices].sort((left, right) => left - right)

      dispatchHistory(() => {
        let nextElements = elementsRef.current
        let nextIndices = [...selectedIndicesRef.current]
        for (const index of sorted) {
          const partner = direction === 'up' ? index + 1 : index - 1
          if (partner < 0 || partner >= nextElements.length) {
            continue
          }
          nextElements = moveElementInArray(nextElements, index, partner)
          nextIndices = remapIndicesAfterMove(nextIndices, index, partner)
        }
        commitElements(nextElements)
        commitSelectedIndices(nextIndices)
        setSelectionSource('ui')
      })
    },
    [commitElements, commitSelectedIndices, dispatchHistory, selectedIndices],
  )

  const bringSelectionToFront = useCallback(() => {
    if (selectedIndices.length === 0) {
      return
    }
    const selected = new Set(selectedIndices)
    dispatchHistory(() => {
      commitElements((current) => {
        const kept = current.filter((_, index) => !selected.has(index))
        const picked = sortIndices(selectedIndicesRef.current).map((index) => current[index]!)
        return [...kept, ...picked]
      })
      commitSelectedIndices(indicesAfterBringToFront(selectedIndicesRef.current, elementsRef.current.length))
      setSelectionSource('ui')
    })
  }, [commitElements, commitSelectedIndices, dispatchHistory, selectedIndices])

  const sendSelectionToBack = useCallback(() => {
    if (selectedIndices.length === 0) {
      return
    }
    const selected = new Set(selectedIndices)
    dispatchHistory(() => {
      commitElements((current) => {
        const kept = current.filter((_, index) => !selected.has(index))
        const picked = sortIndices(selectedIndicesRef.current).map((index) => current[index]!)
        return [...picked, ...kept]
      })
      commitSelectedIndices(indicesAfterSendToBack(selectedIndicesRef.current))
      setSelectionSource('ui')
    })
  }, [commitElements, commitSelectedIndices, dispatchHistory, selectedIndices])

  const reorderSelection = useCallback(
    (indices: readonly number[], dropIndex: number) => {
      if (indices.length === 0) {
        return
      }
      dispatchHistory(() => {
        const { elements: next, indices: nextIndices } = reorderSelectionBlock(
          elementsRef.current,
          [...indices],
          dropIndex,
        )
        commitElements(next)
        commitSelectedIndices(nextIndices)
        setSelectionSource('ui')
      })
    },
    [commitElements, commitSelectedIndices, dispatchHistory],
  )

  const moveElementLayer = useCallback(
    (fromIndex: number, toIndex: number) => {
      applyLayerMove(fromIndex, toIndex)
    },
    [applyLayerMove],
  )

  const bringToFront = useCallback(
    (index: number) => {
      if (index < 0 || index >= elements.length - 1) {
        return
      }
      applyLayerMove(index, elements.length - 1)
    },
    [applyLayerMove, elements.length],
  )

  const sendToBack = useCallback(
    (index: number) => {
      if (index <= 0 || index >= elements.length) {
        return
      }
      applyLayerMove(index, 0)
    },
    [applyLayerMove, elements.length],
  )

  const moveLayerUp = useCallback(
    (index: number) => {
      if (index >= elements.length - 1) {
        return
      }
      applyLayerMove(index, index + 1)
    },
    [applyLayerMove, elements.length],
  )

  const moveLayerDown = useCallback(
    (index: number) => {
      if (index <= 0) {
        return
      }
      applyLayerMove(index, index - 1)
    },
    [applyLayerMove],
  )

  const reorderElement = moveElementLayer

  const alignSelection = useCallback(
    (align: ElementAlign, boundsByIndex: Map<number, ElementBounds>) => {
      if (selectedIndices.length < 2) {
        return
      }
      dispatchHistory(() => {
        commitElements((current) => {
          if (!canAlignSelection(current, selectedIndicesRef.current)) {
            return current
          }
          return alignElementsInUnion(current, selectedIndicesRef.current, boundsByIndex, align, {
            width: canvasRef.current.width,
            height: canvasRef.current.height,
          })
        })
      })
    },
    [commitElements, dispatchHistory, selectedIndices],
  )

  const togglePreviewDither = useCallback(() => {
    commitCanvas((current) => ({
      ...current,
      previewDitherMode: current.previewDitherMode === 2 ? 0 : 2,
    }))
  }, [commitCanvas])

  const toggleSnapGrid = useCallback(() => {
    setSnapGrid((current) => ({ ...current, enabled: !current.enabled }))
  }, [])

  const toggleShowHiddenHints = useCallback(() => {
    setShowHiddenHints((current) => !current)
  }, [])

  const setSnapGridSize = useCallback((size: number) => {
    setSnapGrid((current) => ({ ...current, size: Math.max(1, size) }))
  }, [])

  const applyYamlSelection = useCallback(
    (indices: number[]) => {
      setSelectionSource('yaml')
      commitSelectedIndices(sortIndices(indices))
    },
    [commitSelectedIndices],
  )

  const selectedElements = useMemo(
    () =>
      selectedIndices
        .map((index) => elements[index])
        .filter((element): element is DrawElement => element != null),
    [elements, selectedIndices],
  )

  const selectedElement = selectedIndex != null ? (elements[selectedIndex] ?? null) : null

  const setElementsWithHistory = useCallback(
    (next: DrawElement[] | ((current: DrawElement[]) => DrawElement[])) => {
      dispatchHistory(() => {
        commitElements(next)
      })
    },
    [commitElements, dispatchHistory],
  )

  return {
    sessionName,
    setSessionName,
    service,
    setService: commitService,
    elements,
    setElements: setElementsWithHistory,
    previewElements,
    selectedIndices,
    selectedIndex,
    selectionSource,
    selectedElement,
    selectedElements,
    selectElement,
    clearSelection,
    selectAllInRect,
    applyYamlSelection,
    canvas,
    renderContext,
    applyResolution,
    setColorMode,
    setCanvasSize,
    setRotation,
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
    deleteElement,
    deleteSelectedElements,
    addElement,
    clearElements,
    loadDemo,
    nudgeElement,
    nudgeSelectedElements,
    bringToFront,
    sendToBack,
    moveLayerUp,
    moveLayerDown,
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
    setSnapGridSize,
    togglePreviewDither,
    undo,
    redo,
    canUndo: historyUi.canUndo,
    canRedo: historyUi.canRedo,
    historyUndoDepth: historyUi.undoDepth,
    beginEditCoalesce,
    endEditCoalesce,
  }
}
