import { useCallback, useMemo, useState } from 'react'
import type { DrawElement } from '../../core'
import type { AccentMode, RenderContext } from '../../core'
import { DEFAULT_PRESET_ID, DISPLAY_PRESETS } from '../data/display-presets'
import { SAMPLE_ELEMENTS } from '../data/sample-elements'

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
}

export function useProjectState() {
  const [elements, setElements] = useState<DrawElement[]>(initialState.elements)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(initialState.selectedIndex)
  const [selectionSource, setSelectionSource] = useState<SelectionSource>('ui')
  const [canvas, setCanvas] = useState<CanvasConfig>(initialState.canvas)

  const renderContext: RenderContext = useMemo(
    () => ({
      width: canvas.width,
      height: canvas.height,
      accentMode: canvas.accentMode,
    }),
    [canvas.width, canvas.height, canvas.accentMode],
  )

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

  const selectedElement = selectedIndex != null ? (elements[selectedIndex] ?? null) : null

  return {
    elements,
    setElements,
    selectedIndex,
    selectionSource,
    selectedElement,
    selectElement,
    canvas,
    renderContext,
    applyPreset,
    setCanvasSize,
    setRotation,
  }
}
