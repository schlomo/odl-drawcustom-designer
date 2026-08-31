import { useLayoutEffect, useState, type RefObject } from 'react'
import {
  HEADER_META_SEGMENTS,
  resolveVisibleHeaderMetaSegments,
  type HeaderMetaSegment,
} from '../lib/header-meta-collapse'

/** Attribute the meta row tags each segment with, so the probe can be measured. */
export const HEADER_META_SEGMENT_ATTR = 'data-header-meta'

/** Attribute the meta row tags its ` · ` separators with. */
export const HEADER_META_SEPARATOR_ATTR = 'data-header-meta-separator'

function readSegmentWidths(probe: HTMLElement): {
  segmentWidths: Partial<Record<HeaderMetaSegment, number>>
  separatorWidth: number
} {
  const segmentWidths: Partial<Record<HeaderMetaSegment, number>> = {}
  for (const node of probe.querySelectorAll<HTMLElement>(`[${HEADER_META_SEGMENT_ATTR}]`)) {
    const id = node.getAttribute(HEADER_META_SEGMENT_ATTR) as HeaderMetaSegment | null
    if (id != null && (HEADER_META_SEGMENTS as readonly string[]).includes(id)) {
      segmentWidths[id] = node.getBoundingClientRect().width
    }
  }
  const separator = probe.querySelector<HTMLElement>(`[${HEADER_META_SEPARATOR_ATTR}]`)
  return {
    segmentWidths,
    separatorWidth: separator?.getBoundingClientRect().width ?? 0,
  }
}

/**
 * Segments the header meta row should render, measured against an off-screen
 * probe that always holds every segment at its natural width (ADR-016's
 * probe model, `toolbar-label-measure.ts`).
 *
 * The result is a pure function of the measured widths and the slot, so no
 * expand hysteresis is needed here: unlike a live-DOM measurement, dropping a
 * segment does not change the widths the next decision reads.
 */
export function useHeaderMetaSegments(
  probeRef: RefObject<HTMLElement | null>,
  availableWidth: number | null,
): ReadonlySet<HeaderMetaSegment> {
  const [visible, setVisible] = useState<ReadonlySet<HeaderMetaSegment>>(
    () => new Set(HEADER_META_SEGMENTS),
  )

  useLayoutEffect(() => {
    const probe = probeRef.current
    if (probe == null) {
      return
    }

    const applyMeasure = () => {
      const { segmentWidths, separatorWidth } = readSegmentWidths(probe)
      const next = resolveVisibleHeaderMetaSegments({
        availableWidth,
        segmentWidths,
        separatorWidth,
      })
      setVisible((current) => {
        if (current.size === next.length && next.every((segment) => current.has(segment))) {
          return current
        }
        return new Set(next)
      })
    }

    const observer = new ResizeObserver(applyMeasure)
    observer.observe(probe)
    const frame = requestAnimationFrame(applyMeasure)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [availableWidth, probeRef])

  return visible
}
