import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useElementSize } from './useElementSize'
import {
  measureToolbarLabelVisibility,
  measureToolbarLabelsFromProbe,
} from '../lib/toolbar-label-measure'

export interface UseToolbarLabelsOptions {
  /**
   * Override the toolbar slot width (e.g. header width minus the title).
   * Defaults to the toolbar element's `clientWidth`.
   */
  fitWidth?: number
  /**
   * Off-screen element that always renders full text labels.
   * When set, label visibility is derived from the probe width (no live toggling for measure).
   */
  measureRef?: RefObject<HTMLElement | null>
}

/** Show text labels when the measured toolbar content fits on one row; otherwise icon-only. */
export function useToolbarLabels(
  itemSelector: string,
  options?: UseToolbarLabelsOptions,
): {
  toolbarRef: RefObject<HTMLDivElement | null>
  showLabels: boolean
} {
  const toolbarRef = useRef<HTMLDivElement>(null)
  const { width: toolbarWidth } = useElementSize(toolbarRef)
  const labeledWidthRef = useRef<number | null>(null)
  const [showLabels, setShowLabels] = useState(true)

  const fitWidth = options?.fitWidth
  const measureRef = options?.measureRef

  useLayoutEffect(() => {
    const container = toolbarRef.current
    const probe = measureRef?.current ?? null

    const applyMeasure = () => {
      const availableWidth = fitWidth ?? container?.clientWidth ?? 0
      if (availableWidth <= 0) {
        return
      }

      const result =
        probe != null
          ? measureToolbarLabelsFromProbe(probe, availableWidth, showLabels)
          : container != null
            ? measureToolbarLabelVisibility(
                container,
                itemSelector,
                showLabels,
                labeledWidthRef.current,
                availableWidth,
              )
            : null

      if (result == null) {
        return
      }

      if (result.labeledContentWidth != null) {
        labeledWidthRef.current = result.labeledContentWidth
      }

      setShowLabels((current) => (current === result.showLabels ? current : result.showLabels))
    }

    const observed = [container, probe].filter((node): node is HTMLElement => node != null)
    if (observed.length === 0) {
      return
    }

    const observer = new ResizeObserver(applyMeasure)
    for (const node of observed) {
      observer.observe(node)
    }
    const frame = requestAnimationFrame(applyMeasure)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [fitWidth, itemSelector, measureRef, showLabels, toolbarWidth])

  return { toolbarRef, showLabels }
}
