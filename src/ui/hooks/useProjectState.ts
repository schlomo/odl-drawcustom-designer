import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { applyPlotPropertyUpdate, type DrawElement, type HaMockContext } from '../../core'
import type { AccentMode, AssetKind, AssetUploadResult, RenderContext } from '../../core'
import { applyTemplateContextToPayload, scanPayloadForTemplates } from '../../core'
import {
  getOrCreateActiveProjectId,
  hydrateContentMapFromStorage,
  persistAsset,
  removePersistedAsset,
  setActiveProjectId,
} from '../../storage'
import { EXAMPLE_DESIGNS } from '../data/example-designs'
import { DISPLAY_PRESETS, isCustomDisplayPreset } from '../data/display-presets'
import { SAMPLE_ELEMENTS } from '../data/sample-elements'
import { createElementFromTemplate } from '../lib/create-element-from-template'
import { isElementDraggable, moveElementInArray, translateElement } from '../lib/element-geometry'
import { remapIndexAfterMove } from '../lib/selection-remap'
import { verifyAndValidateAssetUpload } from '../lib/verify-asset-upload'
import {
  readDisplayConfig,
  writeDisplayConfig,
  type CanvasRotation,
} from '../preferences/displayConfig'
import {
  DEFAULT_MOCK_STATES,
  readMockStates,
  writeMockStates,
} from '../preferences/mockStates'
import { readSnapGridPrefs, writeSnapGridPrefs, type SnapGridPrefs } from '../preferences/snapGrid'

export type { CanvasRotation } from '../preferences/displayConfig'
export type SelectionSource = 'ui' | 'yaml'

export interface CanvasConfig {
  width: number
  height: number
  rotation: CanvasRotation
  accentMode: AccentMode
}

export interface ProjectState {
  elements: DrawElement[]
  selectedIndex: number | null
  canvas: CanvasConfig
  mockContext: HaMockContext
}

const initialState: ProjectState = {
  elements: SAMPLE_ELEMENTS,
  selectedIndex: null,
  canvas: readDisplayConfig(),
  mockContext: { states: { ...DEFAULT_MOCK_STATES } },
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

export function useProjectState() {
  const [projectId, setProjectId] = useState(() => getOrCreateActiveProjectId())
  const [elements, setElements] = useState<DrawElement[]>(initialState.elements)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(initialState.selectedIndex)
  const [selectionSource, setSelectionSource] = useState<SelectionSource>('ui')
  const [canvas, setCanvas] = useState<CanvasConfig>(() => readDisplayConfig())
  const [mockStates, setMockStates] = useState<HaMockContext['states']>(() => ({
    ...DEFAULT_MOCK_STATES,
  }))
  const [assetRevision, setAssetRevision] = useState(0)
  const [snapGrid, setSnapGrid] = useState<SnapGridPrefs>(() => readSnapGridPrefs())
  const [storageHydrated, setStorageHydrated] = useState(false)
  const mockStatesRef = useRef(mockStates)

  useEffect(() => {
    mockStatesRef.current = mockStates
  }, [mockStates])

  const hydrateProjectStorage = useCallback(async (activeProjectId: string) => {
    await hydrateContentMapFromStorage()
    const mocks = await readMockStates(activeProjectId)
    setMockStates(mocks)
    setAssetRevision((revision) => revision + 1)
    setStorageHydrated(true)
  }, [])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setStorageHydrated(false)
      await hydrateProjectStorage(projectId)
      if (cancelled) {
        return
      }
    })()

    return () => {
      cancelled = true
    }
  }, [hydrateProjectStorage, projectId])

  useEffect(() => {
    if (!storageHydrated) {
      return
    }
    const timer = window.setTimeout(() => {
      void writeMockStates(projectId, mockStates)
    }, 250)
    return () => {
      window.clearTimeout(timer)
    }
  }, [mockStates, projectId, storageHydrated])

  useEffect(() => {
    writeSnapGridPrefs(snapGrid)
  }, [snapGrid])

  useEffect(() => {
    writeDisplayConfig(canvas)
  }, [canvas])

  const switchProject = useCallback(
    async (nextProjectId: string) => {
      if (nextProjectId === projectId) {
        return
      }

      if (storageHydrated) {
        await writeMockStates(projectId, mockStatesRef.current)
      }

      setActiveProjectId(nextProjectId)
      setProjectId(nextProjectId)
    },
    [projectId, storageHydrated],
  )

  const mockContext = useMemo(
    () => buildEffectiveMockContext(elements, mockStates),
    [elements, mockStates],
  )

  const renderContext: RenderContext = useMemo(
    () => ({
      width: canvas.width,
      height: canvas.height,
      accentMode: canvas.accentMode,
    }),
    [canvas.width, canvas.height, canvas.accentMode],
  )

  const previewElements = useMemo(
    () => applyTemplateContextToPayload(elements, mockContext),
    [elements, mockContext],
  )

  const extraEntityIds = useMemo(() => Object.keys(mockContext.states).sort(), [mockContext.states])

  const selectElement = useCallback((index: number | null, source: SelectionSource = 'ui') => {
    setSelectionSource(source)
    setSelectedIndex(index)
  }, [])

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

      await persistAsset(key, {
        blob: file,
        mime: result.mime,
      })
      setAssetRevision((revision) => revision + 1)
      return result
    },
    [],
  )

  const clearAsset = useCallback(async (key: string) => {
    await removePersistedAsset(key)
    setAssetRevision((revision) => revision + 1)
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

  const deleteElement = useCallback((index: number) => {
    setElements((current) => {
      if (index < 0 || index >= current.length) {
        return current
      }
      return current.filter((_, i) => i !== index)
    })
    setSelectedIndex((current) => {
      if (current == null) {
        return null
      }
      if (current === index) {
        return null
      }
      if (current > index) {
        return current - 1
      }
      return current
    })
  }, [])

  const addElement = useCallback(
    (type: DrawElement['type']) => {
      const element = createElementFromTemplate(type)
      const nextIndex = elements.length
      setSelectedIndex(nextIndex)
      setSelectionSource('ui')
      setElements([...elements, element])
    },
    [elements],
  )

  const clearElements = useCallback(() => {
    setElements([])
    setSelectedIndex(null)
  }, [])

  const loadExample = useCallback((exampleId: string) => {
    const example = EXAMPLE_DESIGNS.find((entry) => entry.id === exampleId)
    if (!example) {
      return
    }
    setElements(example.elements.map((element) => ({ ...element })))
    setSelectedIndex(null)
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

  const applyLayerMove = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= elements.length) {
        return
      }
      if (toIndex < 0 || toIndex >= elements.length) {
        return
      }
      setSelectedIndex((selected) => remapIndexAfterMove(selected, fromIndex, toIndex))
      setSelectionSource('ui')
      setElements((current) => moveElementInArray(current, fromIndex, toIndex))
    },
    [elements.length],
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

  const toggleSnapGrid = useCallback(() => {
    setSnapGrid((current) => ({ ...current, enabled: !current.enabled }))
  }, [])

  const setSnapGridSize = useCallback((size: number) => {
    setSnapGrid((current) => ({ ...current, size: Math.max(1, size) }))
  }, [])

  const selectedElement = selectedIndex != null ? (elements[selectedIndex] ?? null) : null

  return {
    projectId,
    switchProject,
    storageHydrated,
    elements,
    setElements,
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
    setSnapGridSize,
  }
}
