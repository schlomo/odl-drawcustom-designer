import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  applyPlotPropertyUpdate,
  BUNDLED_SHOWCASE_IMAGE_KEY,
  resolveAsset,
  type DrawElement,
  type HaMockContext,
  type ServiceOptions,
} from '../../core'
import type { AccentMode, AssetKind, AssetUploadResult, RenderContext } from '../../core'
import { applyTemplateContextToPayload, scanPayloadForTemplates } from '../../core'
import {
  persistAsset,
  removePersistedAsset,
  writeSessionToDb,
} from '../../storage'
import type { AppBootstrap } from '../bootstrap/appBootstrap'
import { EXAMPLE_DESIGNS } from '../data/example-designs'
import { DISPLAY_PRESETS, isCustomDisplayPreset } from '../data/display-presets'
import { alignElementsInUnion, type ElementAlign } from '../lib/align-elements'
import { applyElementUpdates, nudgeElementsAtIndices } from '../lib/batch-element-updates'
import {
  canAddElementType,
  DEBUG_GRID_ONCE_MESSAGE,
  elementsWithAddedElement,
  type AddElementResult,
} from '../lib/add-element-guards'
import { createElementFromTemplate } from '../lib/create-element-from-template'
import { isElementDraggable, moveElementInArray, translateElement } from '../lib/element-geometry'
import { reorderSelectionBlock } from '../lib/reorder-selection'
import { isElementCanvasSelectable, resolveElementHitBounds } from '../lib/hidden-element-hints'
import { boundsFullyEnclosedInRect } from '../lib/marquee-selection'
import type { ElementBounds } from '../lib/primitive-bounds'
import {
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
import { suppressShowcaseBundled } from '../preferences/showcaseAsset'
import { readSnapGridPrefs, writeSnapGridPrefs, type SnapGridPrefs } from '../preferences/snapGrid'
import {
  readShowHiddenHintsPrefs,
  writeShowHiddenHintsPrefs,
} from '../preferences/hiddenHints'

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

export interface CanvasConfig {
  width: number
  height: number
  rotation: CanvasRotation
  accentMode: AccentMode
  previewDitherMode: PreviewDitherMode
}

function buildEffectiveMockContext(
  elements: DrawElement[],
  mockStates: HaMockContext['states'],
): HaMockContext {
  const states = { ...mockStates }

  for (const entityId of scanPayloadForTemplates(elements).entityIds) {
    if (!(entityId in states)) {
      states[entityId] = 'unknown'
    }
  }

  return { states }
}

export function useProjectState(bootstrap: AppBootstrap) {
  const [sessionName, setSessionName] = useState(bootstrap.sessionName)
  const [elements, setElements] = useState<DrawElement[]>(bootstrap.elements)
  const [selectedIndices, setSelectedIndices] = useState<number[]>([])
  const [selectionSource, setSelectionSource] = useState<SelectionSource>('ui')
  const [canvas, setCanvas] = useState<CanvasConfig>(bootstrap.canvas)
  const [service, setService] = useState<ServiceOptions | undefined>(bootstrap.service)
  const [mockStates, setMockStates] = useState<HaMockContext['states']>(bootstrap.mockStates)
  const [assetRevision, setAssetRevision] = useState(0)
  const [snapGrid, setSnapGrid] = useState<SnapGridPrefs>(() => readSnapGridPrefs())
  const [showHiddenHints, setShowHiddenHints] = useState(() => readShowHiddenHintsPrefs().enabled)
  const mockStatesRef = useRef(mockStates)

  useEffect(() => {
    mockStatesRef.current = mockStates
  }, [mockStates])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void writeMockStates(mockStates)
    }, 250)
    return () => {
      window.clearTimeout(timer)
    }
  }, [mockStates])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void writeSessionToDb({
        name: sessionName,
        canvas,
        service,
        elements,
      })
    }, 250)
    return () => {
      window.clearTimeout(timer)
    }
  }, [canvas, elements, service, sessionName])

  useEffect(() => {
    writeSnapGridPrefs(snapGrid)
  }, [snapGrid])

  useEffect(() => {
    writeShowHiddenHintsPrefs({ enabled: showHiddenHints })
  }, [showHiddenHints])

  const mockContext = useMemo(
    () => buildEffectiveMockContext(elements, mockStates),
    [elements, mockStates],
  )

  const renderContext: RenderContext = useMemo(
    () => ({
      width: canvas.width,
      height: canvas.height,
      accentMode: canvas.accentMode,
      ditherMode: canvas.previewDitherMode,
      showHiddenHints,
    }),
    [canvas.width, canvas.height, canvas.accentMode, canvas.previewDitherMode, showHiddenHints],
  )

  const previewElements = useMemo(
    () => applyTemplateContextToPayload(elements, mockContext),
    [elements, mockContext],
  )

  const extraEntityIds = useMemo(() => Object.keys(mockContext.states).sort(), [mockContext.states])

  const selectedIndex = selectedIndices.length > 0 ? selectedIndices[selectedIndices.length - 1]! : null

  const selectElement = useCallback((index: number | null, options?: SelectElementOptions | SelectionSource) => {
    const { additive = false, source = 'ui' } = normalizeSelectOptions(options)
    setSelectionSource(source)
    if (index == null) {
      setSelectedIndices([])
      return
    }
    if (additive) {
      setSelectedIndices((current) => {
        if (current.includes(index)) {
          const next = current.filter((entry) => entry !== index)
          return next.length > 0 ? next : []
        }
        return sortIndices([...current, index])
      })
      return
    }
    setSelectedIndices([index])
  }, [])

  const clearSelection = useCallback(() => {
    setSelectionSource('ui')
    setSelectedIndices([])
  }, [])

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
        setSelectedIndices((current) => sortIndices([...new Set([...current, ...enclosed])]))
        return
      }
      setSelectedIndices(sortIndices(enclosed))
    },
    [previewElements, renderContext],
  )

  const applyPreset = useCallback((presetId: string) => {
    const preset = DISPLAY_PRESETS.find((entry) => entry.id === presetId)
    if (!preset) {
      return
    }
    setCanvas((current) => ({
      ...current,
      ...(isCustomDisplayPreset(preset) || preset.width == null || preset.height == null
        ? {}
        : { width: preset.width, height: preset.height }),
      ...(preset.accentMode != null ? { accentMode: preset.accentMode } : {}),
    }))
  }, [])

  const setCanvasSize = useCallback((width: number, height: number) => {
    setCanvas((current) => ({ ...current, width, height }))
  }, [])

  const setRotation = useCallback((rotation: CanvasRotation) => {
    setCanvas((current) => ({ ...current, rotation }))
  }, [])

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

  const updateElementsBatch = useCallback((updates: ReadonlyMap<number, DrawElement>) => {
    setElements((current) => applyElementUpdates(current, updates))
  }, [])

  const updateElement = useCallback((index: number, nextElement: DrawElement) => {
    setElements((current) => {
      if (index < 0 || index >= current.length) {
        return current
      }
      const next = [...current]
      next[index] = nextElement
      return next
    })
  }, [])

  const updateElementProperty = useCallback(
    (index: number, key: string, value: unknown) => {
      setElements((current) => {
        if (index < 0 || index >= current.length) {
          return current
        }
        const element = current[index]
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
    },
    [],
  )

  const updateSelectedProperty = useCallback(
    (key: string, value: unknown) => {
      setElements((current) => {
        let next = current
        for (const index of selectedIndices) {
          if (index < 0 || index >= next.length) {
            continue
          }
          const element = next[index]!
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
    },
    [selectedIndices],
  )

  const deleteElement = useCallback((index: number) => {
    setElements((current) => {
      if (index < 0 || index >= current.length) {
        return current
      }
      return current.filter((_, i) => i !== index)
    })
    setSelectedIndices((current) =>
      current
        .filter((entry) => entry !== index)
        .map((entry) => (entry > index ? entry - 1 : entry)),
    )
  }, [])

  const deleteSelectedElements = useCallback(() => {
    setElements((current) => {
      const toDelete = new Set(selectedIndices)
      return current.filter((_, index) => !toDelete.has(index))
    })
    setSelectedIndices([])
  }, [selectedIndices])

  const addElement = useCallback(
    (type: DrawElement['type']): AddElementResult => {
      if (!canAddElementType(elements, type)) {
        return { ok: false, message: DEBUG_GRID_ONCE_MESSAGE }
      }
      const element = createElementFromTemplate(type)
      const { nextElements, index } = elementsWithAddedElement(elements, element)
      setSelectedIndices([index])
      setSelectionSource('ui')
      setElements(nextElements)
      return { ok: true, index }
    },
    [elements],
  )

  const clearElements = useCallback(() => {
    setElements([])
    setSelectedIndices([])
  }, [])

  const loadExample = useCallback((exampleId: string) => {
    const example = EXAMPLE_DESIGNS.find((entry) => entry.id === exampleId)
    if (!example) {
      return
    }
    setElements(example.elements.map((element) => ({ ...element })))
    setSelectedIndices([])
  }, [])

  const nudgeElement = useCallback(
    (index: number, dx: number, dy: number) => {
      setElements((current) => {
        if (index < 0 || index >= current.length) {
          return current
        }
        const element = current[index]
        if (!isElementDraggable(element)) {
          return current
        }
        const next = [...current]
        next[index] = translateElement(element, dx, dy, {
          width: canvas.width,
          height: canvas.height,
        })
        return next
      })
    },
    [canvas.height, canvas.width],
  )

  const nudgeSelectedElements = useCallback(
    (dx: number, dy: number) => {
      setElements((current) =>
        nudgeElementsAtIndices(current, selectedIndices, dx, dy, {
          width: canvas.width,
          height: canvas.height,
        }),
      )
    },
    [canvas.height, canvas.width, selectedIndices],
  )

  const applyLayerMove = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= elements.length) {
        return
      }
      if (toIndex < 0 || toIndex >= elements.length) {
        return
      }
      setSelectedIndices((selected) => remapIndicesAfterMove(selected, fromIndex, toIndex))
      setSelectionSource('ui')
      setElements((current) => moveElementInArray(current, fromIndex, toIndex))
    },
    [elements.length],
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

      let nextElements = elements
      let nextIndices = [...selectedIndices]
      for (const index of sorted) {
        const partner = direction === 'up' ? index + 1 : index - 1
        if (partner < 0 || partner >= nextElements.length) {
          continue
        }
        nextElements = moveElementInArray(nextElements, index, partner)
        nextIndices = remapIndicesAfterMove(nextIndices, index, partner)
      }
      setElements(nextElements)
      setSelectedIndices(nextIndices)
      setSelectionSource('ui')
    },
    [elements, selectedIndices],
  )

  const bringSelectionToFront = useCallback(() => {
    if (selectedIndices.length === 0) {
      return
    }
    const selected = new Set(selectedIndices)
    setElements((current) => {
      const kept = current.filter((_, index) => !selected.has(index))
      const picked = sortIndices(selectedIndices).map((index) => current[index]!)
      return [...kept, ...picked]
    })
    setSelectedIndices(indicesAfterBringToFront(selectedIndices, elements.length))
    setSelectionSource('ui')
  }, [elements.length, selectedIndices])

  const sendSelectionToBack = useCallback(() => {
    if (selectedIndices.length === 0) {
      return
    }
    const selected = new Set(selectedIndices)
    setElements((current) => {
      const kept = current.filter((_, index) => !selected.has(index))
      const picked = sortIndices(selectedIndices).map((index) => current[index]!)
      return [...picked, ...kept]
    })
    setSelectedIndices(indicesAfterSendToBack(selectedIndices))
    setSelectionSource('ui')
  }, [selectedIndices])

  const reorderSelection = useCallback(
    (indices: readonly number[], dropIndex: number) => {
      if (indices.length === 0) {
        return
      }
      const { elements: next, indices: nextIndices } = reorderSelectionBlock(
        elements,
        [...indices],
        dropIndex,
      )
      setElements(next)
      setSelectedIndices(nextIndices)
      setSelectionSource('ui')
    },
    [elements],
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
      setElements((current) =>
        alignElementsInUnion(current, selectedIndices, boundsByIndex, align, {
          width: canvas.width,
          height: canvas.height,
        }),
      )
    },
    [canvas.height, canvas.width, selectedIndices],
  )

  const togglePreviewDither = useCallback(() => {
    setCanvas((current) => ({
      ...current,
      previewDitherMode: current.previewDitherMode === 2 ? 0 : 2,
    }))
  }, [])

  const toggleSnapGrid = useCallback(() => {
    setSnapGrid((current) => ({ ...current, enabled: !current.enabled }))
  }, [])

  const toggleShowHiddenHints = useCallback(() => {
    setShowHiddenHints((current) => !current)
  }, [])

  const setSnapGridSize = useCallback((size: number) => {
    setSnapGrid((current) => ({ ...current, size: Math.max(1, size) }))
  }, [])

  const applyYamlSelection = useCallback((indices: number[]) => {
    setSelectionSource('yaml')
    setSelectedIndices(sortIndices(indices))
  }, [])

  const selectedElements = useMemo(
    () =>
      selectedIndices
        .map((index) => elements[index])
        .filter((element): element is DrawElement => element != null),
    [elements, selectedIndices],
  )

  const selectedElement = selectedIndex != null ? (elements[selectedIndex] ?? null) : null

  return {
    sessionName,
    setSessionName,
    service,
    setService,
    elements,
    setElements,
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
    applyPreset,
    setCanvasSize,
    setRotation,
    mockContext,
    setMockState,
    addMockEntity,
    removeMockEntity,
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
    loadExample,
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
  }
}
