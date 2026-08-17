/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DrawElement } from '../../../src/core'
import type { HostStateCatalog } from '../../../src/embed/hostContract'
import { Sidebar } from '../../../src/ui/components/Sidebar'

/**
 * Simulator policy under host-fed states (issue #107, ADR-018): when a host
 * feeds states, the Simulator tab is *replaced* by the read-only States panel —
 * disable-and-replace, not hide-with-no-substitute (resolves issue #24). With
 * no host states the sidebar is byte-for-byte what it always was.
 */

const CANVAS = {
  width: 384,
  height: 184,
  rotation: 0 as const,
  colorMode: 'bwr' as const,
  previewDitherMode: 0 as const,
}

const ELEMENTS: DrawElement[] = [
  { type: 'text', value: "{{ states('sensor.temperature') }}", x: 0, y: 0 },
]

const CATALOG: HostStateCatalog = {
  values: { 'sensor.temperature': '21.5' },
  attributes: {},
  names: { 'sensor.temperature': 'Living-room temperature' },
}

function renderSidebar(hostStateCatalog: HostStateCatalog | null) {
  render(
    <Sidebar
      elements={ELEMENTS}
      previewElements={ELEMENTS}
      selectedIndices={[]}
      canvas={CANVAS}
      mockContext={{ states: { 'sensor.temperature': '21.5' } }}
      hostStateCatalog={hostStateCatalog}
      assetRevision={0}
      onSelectElement={() => {}}
      onCanvasSizeChange={() => {}}
      onColorModeChange={() => {}}
      onRotationChange={() => {}}
      onSetMockState={() => {}}
      onAddMockEntity={() => {}}
      onRemoveMockEntity={() => {}}
      variables={{}}
      onSetVariable={() => {}}
      onAddVariable={() => {}}
      onRemoveVariable={() => {}}
      onUploadAsset={async () => ({ ok: true, mime: 'image/png' })}
      onClearAsset={() => {}}
      onReorderElement={() => {}}
    />,
  )
}

describe('Sidebar tabs under host-fed states', () => {
  it('replaces the Simulator tab with States and shows the referenced-states panel', () => {
    renderSidebar(CATALOG)

    expect(screen.queryByRole('button', { name: 'Simulator' })).toBeNull()
    const statesTab = screen.getByRole('button', { name: 'States' })

    fireEvent.click(statesTab)

    expect(screen.getByTestId('referenced-states-panel')).toBeInTheDocument()
    expect(screen.getByText('Living-room temperature')).toBeInTheDocument()
    // No Simulator editing UI anywhere: no add-entity row, no value inputs.
    expect(screen.queryByLabelText('New entity id')).toBeNull()
    expect(screen.queryByLabelText('Mock state for sensor.temperature')).toBeNull()
  })

  it('keeps the Simulator tab exactly as before when no host feeds states', () => {
    renderSidebar(null)

    expect(screen.queryByRole('button', { name: 'States' })).toBeNull()
    const simulatorTab = screen.getByRole('button', { name: 'Simulator' })

    fireEvent.click(simulatorTab)

    expect(screen.getByLabelText('New entity id')).toBeInTheDocument()
    expect(screen.getByLabelText('Mock state for sensor.temperature')).toBeInTheDocument()
    expect(screen.queryByTestId('referenced-states-panel')).toBeNull()
  })
})
