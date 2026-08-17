/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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

function sidebar(
  hostStateCatalog: HostStateCatalog | null,
  overrides: Partial<React.ComponentProps<typeof Sidebar>> = {},
) {
  return (
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
      {...overrides}
    />
  )
}

function renderSidebar(
  hostStateCatalog: HostStateCatalog | null,
  overrides: Partial<React.ComponentProps<typeof Sidebar>> = {},
) {
  return render(sidebar(hostStateCatalog, overrides))
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
    // Variables stay where they always were for the designer's own states.
    expect(screen.getByLabelText('Add variable')).toBeInTheDocument()
  })

  /**
   * The policy can flip mid-session: a host's *first* `setStates()` push can
   * land while the user is looking at the Simulator. The tab they are on must
   * become the States panel rather than snapping them back to Elements — the
   * reviewer's sabotage of this fallback broke nothing, i.e. it had no coverage.
   */
  it('carries a user sitting on the Simulator over to States on the first push', () => {
    const { rerender } = renderSidebar(null)

    fireEvent.click(screen.getByRole('button', { name: 'Simulator' }))
    expect(screen.getByLabelText('New entity id')).toBeInTheDocument()

    rerender(sidebar(CATALOG))

    // Same slot, new policy: the States panel is showing without another click…
    expect(screen.getByTestId('referenced-states-panel')).toBeInTheDocument()
    expect(screen.getByText('Living-room temperature')).toBeInTheDocument()
    // …and the user was not dumped back on Elements.
    expect(screen.queryByTestId('element-list-scroll')).toBeNull()
    expect(screen.queryByLabelText('New entity id')).toBeNull()
  })

  it('flips back to the Simulator if a host ever stops feeding states', () => {
    const { rerender } = renderSidebar(CATALOG)

    fireEvent.click(screen.getByRole('button', { name: 'States' }))
    expect(screen.getByTestId('referenced-states-panel')).toBeInTheDocument()

    rerender(sidebar(null))

    expect(screen.getByLabelText('New entity id')).toBeInTheDocument()
    expect(screen.queryByTestId('referenced-states-panel')).toBeNull()
  })
})

/**
 * Variables under host-fed states (maintainer ruling 2026-08-17): variables are
 * designer-preview substitutions, not host state — the Simulator-off ruling
 * covers states only — so the variables editor is rendered as its own compact
 * section alongside the read-only States panel.
 */
describe('Variables editor under host-fed states', () => {
  const VARIABLE_ELEMENTS: DrawElement[] = [
    { type: 'text', value: '{{ accent_color }}', x: 0, y: 0 },
  ]

  it('is editable next to the States panel', () => {
    const setVariable = vi.fn()
    renderSidebar(CATALOG, {
      elements: VARIABLE_ELEMENTS,
      previewElements: VARIABLE_ELEMENTS,
      variables: { accent_color: 'red' },
      onSetVariable: setVariable,
    })

    fireEvent.click(screen.getByRole('button', { name: 'States' }))

    expect(screen.getByTestId('referenced-states-panel')).toBeInTheDocument()
    const input = screen.getByLabelText('Value for variable accent_color')
    fireEvent.change(input, { target: { value: 'yellow' } })

    expect(setVariable).toHaveBeenCalledWith('accent_color', 'yellow')
  })

  it('offers adding a variable, and still shows one the payload does not reference', () => {
    renderSidebar(CATALOG, { variables: { unused_var: 'x' } })

    fireEvent.click(screen.getByRole('button', { name: 'States' }))

    expect(screen.getByLabelText('Add variable')).toBeInTheDocument()
    // A variable the user just added is not referenced by the payload yet — it
    // must not vanish from under them.
    expect(screen.getByLabelText('Value for variable unused_var')).toBeInTheDocument()
  })

  it('renders no state-editing UI with it', () => {
    renderSidebar(CATALOG, { variables: { accent_color: 'red' } })

    fireEvent.click(screen.getByRole('button', { name: 'States' }))

    expect(screen.queryByLabelText('New entity id')).toBeNull()
    expect(screen.queryByLabelText('Mock state for sensor.temperature')).toBeNull()
  })
})
