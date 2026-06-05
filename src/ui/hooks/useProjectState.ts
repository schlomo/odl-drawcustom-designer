import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DrawElement, HaMockContext } from '../../core'
import type { AccentMode, AssetKind, AssetUploadResult, RenderContext } from '../../core'
import {
  applyTemplateContextToPayload,
  deleteAsset,
  scanPayloadForTemplates,
  setAsset,
} from '../../core'
import { DEFAULT_PRESET_ID, DISPLAY_PRESETS } from '../data/display-presets'
import { SAMPLE_ELEMENTS } from '../data/sample-elements'
import { verifyAndValidateAssetUpload } from '../lib/verify-asset-upload'
import { readMockStates, writeMockStates } from '../preferences/mockStates'

export type CanvasRotation = 0 | 90 | 180 | 270
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

const defaultPreset = DISPLAY_PRESETS.find((preset) => preset.id === DEFAULT_PRESET_ID)!

const initialState: ProjectState = {
  elements: SAMPLE_ELEMENTS,
  selectedIndex: null,
  canvas: {
    width: defaultPreset.width,
    height: defaultPreset.height,
    rotation: 0,
    accentMode: 'red',
  },
  mockContext: { states: readMockStates() },
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
  const [elements, setElements] = useState<DrawElement[]>(initialState.elements)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(initialState.selectedIndex)
  const [selectionSource, setSelectionSource] = useState<SelectionSource>('ui')
  const [canvas, setCanvas] = useState<CanvasConfig>(initialState.canvas)
  const [mockStates, setMockStates] = useState<HaMockContext['states']>(() => readMockStates())
  const [assetRevision, setAssetRevision] = useState(0)

  useEffect(() => {
    writeMockStates(mockStates)
  }, [mockStates])

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
      width: preset.width,
      height: preset.height,
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

      setAsset(key, {
        blob: file,
        mime: result.mime,
      })
      setAssetRevision((revision) => revision + 1)
      return result
    },
    [],
  )

  const clearAsset = useCallback((key: string) => {
    deleteAsset(key)
    setAssetRevision((revision) => revision + 1)
  }, [])

  const selectedElement = selectedIndex != null ? (elements[selectedIndex] ?? null) : null

  return {
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
  }
}
