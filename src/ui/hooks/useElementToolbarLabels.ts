import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useElementSize } from '../hooks/useElementSize'
import {
  countElementToolbarRows,
  elementToolbarLabelsFit,
} from '../lib/element-toolbar-layout'

function measureToolbarWrap(container: HTMLDivElement): boolean {
  const width = container.getBoundingClientRect().width
  if (!elementToolbarLabelsFit(width)) {
    return false
  }
  return countElementToolbarRows(container) > 1
}

/** Hide labels when the toolbar is too narrow for a single labeled row. */
export function useElementToolbarLabels(): {
  toolbarRef: RefObject<HTMLDivElement | null>
  showLabels: boolean
} {
  const toolbarRef = useRef<HTMLDivElement>(null)
  const { width } = useElementSize(toolbarRef)
  const estimateFits = elementToolbarLabelsFit(width)
  const [wrapOverride, setWrapOverride] = useState(false)

  useLayoutEffect(() => {
    const container = toolbarRef.current
    if (!container) {
      return
    }

    const applyMeasure = () => {
      setWrapOverride(measureToolbarWrap(container))
    }

    const observer = new ResizeObserver(applyMeasure)
    observer.observe(container)
    const frame = requestAnimationFrame(applyMeasure)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [width])

  const showLabels = estimateFits && !wrapOverride

  return { toolbarRef, showLabels }
}
