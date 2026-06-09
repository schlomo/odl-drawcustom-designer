import { countToolbarRows } from './toolbar-responsive-layout'

/** Tolerance for sub-pixel layout and border variance when comparing live overflow. */
export const TOOLBAR_OVERFLOW_SLACK_PX = 2

/** Extra room required before re-expanding labels after a collapse (prevents flicker). */
export const TOOLBAR_LABEL_EXPAND_BUFFER_PX = 16

export interface ToolbarLabelMeasureInput {
  availableWidth: number
  labeledContentWidth: number | null
  rowCount: number
  labelsCurrentlyVisible: boolean
}

export interface ToolbarLabelMeasureResult {
  showLabels: boolean
  labeledContentWidth: number | null
}

export interface ToolbarProbeMeasureInput {
  availableWidth: number
  probeWidth: number
  labelsCurrentlyVisible: boolean
}

/**
 * Decide label visibility from a stable off-screen probe that always renders full labels.
 * Hysteresis: collapse when the probe exceeds the slot; expand only after the slot grows
 * past the probe width plus {@link TOOLBAR_LABEL_EXPAND_BUFFER_PX}.
 */
export function resolveToolbarLabelsFromProbe(
  input: ToolbarProbeMeasureInput,
): ToolbarLabelMeasureResult {
  const { availableWidth, probeWidth, labelsCurrentlyVisible } = input

  if (availableWidth <= 0 || probeWidth <= 0) {
    return { showLabels: false, labeledContentWidth: probeWidth > 0 ? probeWidth : null }
  }

  if (labelsCurrentlyVisible) {
    const overflows = probeWidth > availableWidth
    return {
      showLabels: !overflows,
      labeledContentWidth: probeWidth,
    }
  }

  const canExpand = availableWidth >= probeWidth + TOOLBAR_LABEL_EXPAND_BUFFER_PX
  return {
    showLabels: canExpand,
    labeledContentWidth: probeWidth,
  }
}

/**
 * Fallback for toolbars without a probe — compares live DOM width with expand hysteresis.
 */
export function resolveToolbarShowLabels(input: ToolbarLabelMeasureInput): ToolbarLabelMeasureResult {
  const { availableWidth, labeledContentWidth, rowCount, labelsCurrentlyVisible } = input

  if (availableWidth <= 0) {
    return { showLabels: false, labeledContentWidth }
  }

  if (labelsCurrentlyVisible) {
    const width = labeledContentWidth ?? availableWidth
    const overflows = width > availableWidth + TOOLBAR_OVERFLOW_SLACK_PX
    const multiRow = rowCount > 1
    return {
      showLabels: !overflows && !multiRow,
      labeledContentWidth: width,
    }
  }

  const needed = labeledContentWidth
  if (needed == null) {
    return { showLabels: true, labeledContentWidth: null }
  }

  const canExpand = availableWidth >= needed + TOOLBAR_LABEL_EXPAND_BUFFER_PX
  return { showLabels: canExpand, labeledContentWidth: needed }
}

export function measureToolbarLabelVisibility(
  container: HTMLElement,
  itemSelector: string,
  labelsCurrentlyVisible: boolean,
  labeledContentWidth: number | null,
  availableWidth?: number,
): ToolbarLabelMeasureResult {
  const slotWidth = availableWidth ?? container.clientWidth
  const contentWidth = labelsCurrentlyVisible ? container.scrollWidth : labeledContentWidth
  const rowCount = countToolbarRows(container, itemSelector)

  return resolveToolbarShowLabels({
    availableWidth: slotWidth,
    labeledContentWidth: contentWidth,
    rowCount,
    labelsCurrentlyVisible,
  })
}

export function measureToolbarLabelsFromProbe(
  probe: HTMLElement,
  availableWidth: number,
  labelsCurrentlyVisible: boolean,
): ToolbarLabelMeasureResult {
  return resolveToolbarLabelsFromProbe({
    availableWidth,
    probeWidth: probe.scrollWidth,
    labelsCurrentlyVisible,
  })
}
