/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import {
  measureToolbarLabelVisibility,
  measureToolbarLabelsFromProbe,
  resolveToolbarLabelsFromProbe,
  resolveToolbarShowLabels,
  TOOLBAR_LABEL_EXPAND_BUFFER_PX,
  TOOLBAR_OVERFLOW_SLACK_PX,
} from '../../../src/ui/lib/toolbar-label-measure'
import { toolbarHeaderSlotWidth } from '../../../src/ui/lib/toolbar-header-slot'

describe('toolbar label measure', () => {
  it('keeps labels when measured content fits the slot', () => {
    expect(
      resolveToolbarShowLabels({
        availableWidth: 600,
        labeledContentWidth: 580,
        rowCount: 1,
        labelsCurrentlyVisible: true,
      }),
    ).toEqual({ showLabels: true, labeledContentWidth: 580 })
  })

  it('hides labels when labeled content overflows the slot', () => {
    expect(
      resolveToolbarShowLabels({
        availableWidth: 500,
        labeledContentWidth: 520,
        rowCount: 1,
        labelsCurrentlyVisible: true,
      }),
    ).toEqual({ showLabels: false, labeledContentWidth: 520 })
  })

  it('hides labels when controls wrap to multiple rows', () => {
    expect(
      resolveToolbarShowLabels({
        availableWidth: 900,
        labeledContentWidth: 800,
        rowCount: 2,
        labelsCurrentlyVisible: true,
      }),
    ).toEqual({ showLabels: false, labeledContentWidth: 800 })
  })

  it('requires expand buffer before re-showing labels after collapse', () => {
    expect(
      resolveToolbarShowLabels({
        availableWidth: 700,
        labeledContentWidth: 650,
        rowCount: 1,
        labelsCurrentlyVisible: false,
      }),
    ).toEqual({ showLabels: true, labeledContentWidth: 650 })

    expect(
      resolveToolbarShowLabels({
        availableWidth: 660,
        labeledContentWidth: 650,
        rowCount: 1,
        labelsCurrentlyVisible: false,
      }),
    ).toEqual({ showLabels: false, labeledContentWidth: 650 })
  })

  it('avoids expand/collapse oscillation at the slot boundary via probe hysteresis', () => {
    const probeWidth = 700

    expect(
      resolveToolbarLabelsFromProbe({
        availableWidth: 700,
        probeWidth,
        labelsCurrentlyVisible: true,
      }).showLabels,
    ).toBe(true)

    expect(
      resolveToolbarLabelsFromProbe({
        availableWidth: 699,
        probeWidth,
        labelsCurrentlyVisible: true,
      }).showLabels,
    ).toBe(false)

    expect(
      resolveToolbarLabelsFromProbe({
        availableWidth: 700,
        probeWidth,
        labelsCurrentlyVisible: false,
      }).showLabels,
    ).toBe(false)

    expect(
      resolveToolbarLabelsFromProbe({
        availableWidth: 700 + TOOLBAR_LABEL_EXPAND_BUFFER_PX,
        probeWidth,
        labelsCurrentlyVisible: false,
      }).showLabels,
    ).toBe(true)
  })

  it('reads scroll width from the live DOM when labels are visible', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 500, configurable: true })
    Object.defineProperty(container, 'scrollWidth', { value: 480, configurable: true })
    document.body.appendChild(container)

    const button = document.createElement('button')
    button.setAttribute('data-test-toolbar', '')
    button.textContent = 'Copy PNG'
    container.appendChild(button)

    const result = measureToolbarLabelVisibility(
      container,
      '[data-test-toolbar]',
      true,
      null,
      500,
    )

    expect(result.showLabels).toBe(true)
    expect(result.labeledContentWidth).toBe(480)
    expect(TOOLBAR_OVERFLOW_SLACK_PX).toBe(2)

    container.remove()
  })

  it('measures labeled width from a stable probe element', () => {
    const probe = document.createElement('div')
    Object.defineProperty(probe, 'scrollWidth', { value: 640, configurable: true })
    document.body.appendChild(probe)

    expect(
      measureToolbarLabelsFromProbe(probe, 700, false),
    ).toEqual({ showLabels: true, labeledContentWidth: 640 })

    expect(
      measureToolbarLabelsFromProbe(probe, 650, false),
    ).toEqual({ showLabels: false, labeledContentWidth: 640 })

    probe.remove()
  })
})

describe('toolbar header slot width', () => {
  it('subtracts the title and gap from the header row width', () => {
    expect(toolbarHeaderSlotWidth(900, 80)).toBe(812)
    expect(toolbarHeaderSlotWidth(0, 80)).toBe(0)
  })
})
