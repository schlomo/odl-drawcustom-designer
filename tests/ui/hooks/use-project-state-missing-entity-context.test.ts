/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DrawElement } from '../../../src/core'
import { evaluateTemplate, TemplateEvaluationError } from '../../../src/core'
import { buildAppBootstrap } from '../../../src/ui/bootstrap/appBootstrap'
import { useProjectState } from '../../../src/ui/hooks/useProjectState'
import { createStandaloneHost } from '../../../src/embed/standaloneHost'

/**
 * PR #189 follow-up (Copilot finding, confirmed real): the evaluator's HA
 * missing-entity parity never fired in the running app, because the effective
 * mock context seeded EVERY scanned template entity id with an `'unknown'`
 * state — an unmocked `weather.forecast_home` was materialized with empty
 * attributes, so the original incident template still previewed as an empty
 * string end-to-end. The EVALUATOR context must contain only real mocks; the
 * Simulator panel's listing of scanned-but-unmocked entities is display-only
 * synthesis (see StateSimulator).
 */

const STANDALONE_HOST = createStandaloneHost()

const INCIDENT_TEMPLATE = '{{ states.weather.forecast_home.attributes.humidity }}'

const TEMPLATED_TEXT: DrawElement = {
  type: 'text',
  value: INCIDENT_TEMPLATE,
  x: 10,
  y: 10,
}

function bootstrap() {
  return buildAppBootstrap(
    {
      id: 'current',
      name: 'Test',
      canvas: { width: 400, height: 300, rotation: 0, colorMode: 'bwr', previewDitherMode: 0 },
      elements: [TEMPLATED_TEXT],
      updatedAt: 1,
    },
    { states: {}, attributes: {} },
    'session',
  )
}

describe('useProjectState evaluation context for unmocked entities (PR #189)', () => {
  it('surfaces the HA missing-entity error instead of a seeded empty preview', () => {
    const { result } = renderHook(() => useProjectState(bootstrap(), STANDALONE_HOST))

    // The context handed to the evaluator (canvas render AND editor inline
    // preview both consume it) must NOT materialize the scanned-but-unmocked
    // entity: evaluating the incident template against it raises exactly what
    // HA's server-side Jinja raises.
    expect(() => evaluateTemplate(INCIDENT_TEMPLATE, result.current.previewMockContext)).toThrowError(
      TemplateEvaluationError,
    )
    expect(() => evaluateTemplate(INCIDENT_TEMPLATE, result.current.previewMockContext)).toThrowError(
      /'None' has no attribute 'attributes'/,
    )

    // The canvas preview path catches the evaluation error and falls back to
    // the RAW template text — the element must not silently render ''.
    expect(result.current.previewElements[0]).toMatchObject({ value: INCIDENT_TEMPLATE })
  })

  it('previews the real value once the entity is mocked', () => {
    const { result } = renderHook(() => useProjectState(bootstrap(), STANDALONE_HOST))

    act(() => {
      result.current.setMockState('weather.forecast_home', 'sunny')
      result.current.setMockAttribute('weather.forecast_home', 'humidity', 61)
    })

    expect(result.current.previewElements[0]).toMatchObject({ value: '61' })
    expect(evaluateTemplate(INCIDENT_TEMPLATE, result.current.previewMockContext)).toBe('61')
  })
})
