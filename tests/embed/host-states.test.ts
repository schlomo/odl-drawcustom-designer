import { describe, expect, it } from 'vitest'
import { evaluateTemplate } from '../../src/core'
import {
  assertHostStates,
  hostStateNamesEqual,
  hostStatesEqual,
  hostStatesToMockData,
  hostStatesToNames,
  mergeMockAttributes,
  mockStatesEqual,
} from '../../src/embed/hostContract'

/**
 * Host `states` contract (issue #20): the host pushes an entity-id -> state
 * (or {state, attributes}) map; template preview must evaluate against the
 * pushed values — the observable outcome an embedded host cares about.
 */

describe('hostStatesToMockData', () => {
  it('feeds pushed plain state values into template preview', () => {
    const mock = hostStatesToMockData({
      'sensor.temperature': '21.5',
      'sensor.humidity': 48,
      'binary_sensor.door': 'off',
    })

    expect(
      evaluateTemplate("{{ states('sensor.temperature') }}", {
        states: mock.states,
        attributes: mock.attributes,
      }),
    ).toBe('21.5')
    expect(
      evaluateTemplate("{{ states('sensor.humidity') }}", {
        states: mock.states,
        attributes: mock.attributes,
      }),
    ).toBe('48')
  })

  it('feeds pushed {state, attributes} objects into states() and state_attr()', () => {
    const mock = hostStatesToMockData({
      'light.desk': { state: 'on', attributes: { brightness: 128, friendly_name: 'Desk' } },
    })
    const context = { states: mock.states, attributes: mock.attributes }

    expect(evaluateTemplate("{{ states('light.desk') }}", context)).toBe('on')
    expect(evaluateTemplate("{{ state_attr('light.desk', 'brightness') }}", context)).toBe('128')
    expect(evaluateTemplate("{{ state_attr('light.desk', 'friendly_name') }}", context)).toBe(
      'Desk',
    )
  })

  it('a later push fully replaces the previous state map', () => {
    const first = hostStatesToMockData({ 'sensor.temperature': '21.5' })
    const second = hostStatesToMockData({ 'sensor.temperature': '3.2' })

    expect(
      evaluateTemplate("{{ states('sensor.temperature') }}", {
        states: second.states,
        attributes: second.attributes,
      }),
    ).toBe('3.2')
    // Conversion is pure — the first snapshot is untouched.
    expect(first.states['sensor.temperature']).toBe('21.5')
  })
})

/**
 * Diff/merge helpers (issue #110): the upstream OpenDisplay HA integration
 * pushes the full entity registry — every attribute, on every entity — up
 * to 4x/s, including ticks where nothing actually changed. These are the
 * pure building blocks `useProjectState.applyStates` uses to make an
 * unchanged push cost a cheap structural scan instead of a re-render.
 */
describe('hostStatesEqual', () => {
  it('is true for two separately-built but identical payloads', () => {
    const a = { 'sensor.temperature': '21.5', 'binary_sensor.door': 'off' }
    const b = { 'binary_sensor.door': 'off', 'sensor.temperature': '21.5' }
    expect(hostStatesEqual(a, b)).toBe(true)
  })

  it('is true for the same object reference', () => {
    const a = { 'sensor.temperature': '21.5' }
    expect(hostStatesEqual(a, a)).toBe(true)
  })

  it('is false when a value changes', () => {
    expect(
      hostStatesEqual({ 'sensor.temperature': '21.5' }, { 'sensor.temperature': '21.6' }),
    ).toBe(false)
  })

  it('is false when an entity is added or removed', () => {
    const base = { 'sensor.temperature': '21.5' }
    expect(hostStatesEqual(base, { ...base, 'sensor.humidity': '48' })).toBe(false)
    expect(hostStatesEqual({ ...base, 'sensor.humidity': '48' }, base)).toBe(false)
  })

  it('compares {state, attributes} entries structurally, not by reference', () => {
    const a = { 'light.desk': { state: 'on', attributes: { brightness: 128 } } }
    const b = { 'light.desk': { state: 'on', attributes: { brightness: 128 } } }
    expect(hostStatesEqual(a, b)).toBe(true)
  })

  it('is false when only a nested attribute value changes', () => {
    const a = { 'light.desk': { state: 'on', attributes: { brightness: 128 } } }
    const b = { 'light.desk': { state: 'on', attributes: { brightness: 200 } } }
    expect(hostStatesEqual(a, b)).toBe(false)
  })

  it('is false when comparing a plain value to a {state, attributes} object', () => {
    expect(
      hostStatesEqual({ 'sensor.temperature': '21.5' }, { 'sensor.temperature': { state: '21.5' } }),
    ).toBe(false)
  })

  it('treats an absent attributes map as equal to an empty one', () => {
    const a = { 'light.desk': { state: 'on' } }
    const b = { 'light.desk': { state: 'on', attributes: {} } }
    expect(hostStatesEqual(a, b)).toBe(true)
  })

  // Issue #107: `name` is part of what a push declares, so the issue-#110 diff
  // has to see it — otherwise a host renaming a state (only) gets a false
  // "unchanged" and the referenced-states panel keeps showing the old name.
  it('is false when only a friendly name changes', () => {
    expect(
      hostStatesEqual(
        { 'sensor.temperature': { state: '21.5', name: 'Living room' } },
        { 'sensor.temperature': { state: '21.5', name: 'Balcony' } },
      ),
    ).toBe(false)
  })

  it('is false when a friendly name is added or dropped', () => {
    const named = { 'sensor.temperature': { state: '21.5', name: 'Living room' } }
    const unnamed = { 'sensor.temperature': { state: '21.5' } }
    expect(hostStatesEqual(named, unnamed)).toBe(false)
    expect(hostStatesEqual(unnamed, named)).toBe(false)
  })

  // The name a push *means* is the trimmed one (that is what the panel shows),
  // so the diff has to compare what it means — otherwise a host re-serializing
  // its registry with different padding costs a full re-render per tick.
  it('is true when only a name’s surrounding whitespace differs', () => {
    expect(
      hostStatesEqual(
        { 'sensor.temperature': { state: '21.5', name: 'Living room' } },
        { 'sensor.temperature': { state: '21.5', name: '  Living room  ' } },
      ),
    ).toBe(true)
  })

  it('is true when a blank name meets no name at all — both mean unnamed', () => {
    expect(
      hostStatesEqual(
        { 'sensor.temperature': { state: '21.5', name: '   ' } },
        { 'sensor.temperature': { state: '21.5' } },
      ),
    ).toBe(true)
  })

  it('compares array-valued attributes (e.g. rgb_color) by content', () => {
    const a = { 'light.desk': { state: 'on', attributes: { rgb_color: [255, 0, 0] } } }
    const b = { 'light.desk': { state: 'on', attributes: { rgb_color: [255, 0, 0] } } }
    const c = { 'light.desk': { state: 'on', attributes: { rgb_color: [0, 255, 0] } } }
    expect(hostStatesEqual(a, b)).toBe(true)
    expect(hostStatesEqual(a, c)).toBe(false)
  })
})

/**
 * Friendly names (issue #107, ADR-018 state catalog): a pushed state may carry
 * an optional `name`, which is what the referenced-states panel shows instead
 * of the raw key. Names are presentation only — they never reach the template
 * context, so a payload templating a key is unaffected by whether the host
 * named it.
 */
describe('hostStatesToNames', () => {
  it('extracts the names a push supplied, keyed by state key', () => {
    expect(
      hostStatesToNames({
        'sensor.temperature': { state: '21.5', name: 'Living-room temperature' },
        'light.desk': { state: 'on', name: 'Desk lamp' },
      }),
    ).toEqual({
      'sensor.temperature': 'Living-room temperature',
      'light.desk': 'Desk lamp',
    })
  })

  it('omits keys with no usable name — plain values, missing and blank names alike', () => {
    expect(
      hostStatesToNames({
        'sensor.plain': '21.5',
        'sensor.unnamed': { state: 'on' },
        'sensor.blank': { state: 'on', name: '   ' },
      }),
    ).toEqual({})
  })

  it('trims surrounding whitespace, like every other host-supplied label', () => {
    expect(hostStatesToNames({ 'light.desk': { state: 'on', name: '  Desk lamp  ' } })).toEqual({
      'light.desk': 'Desk lamp',
    })
  })

  it('keeps names out of the template context', () => {
    const mock = hostStatesToMockData({
      'sensor.temperature': { state: '21.5', name: 'Living-room temperature' },
    })
    const context = { states: mock.states, attributes: mock.attributes }

    expect(evaluateTemplate("{{ states('sensor.temperature') }}", context)).toBe('21.5')
    // Nothing to read: a name is chrome, never an attribute a payload can see.
    expect(evaluateTemplate("{{ state_attr('sensor.temperature', 'name') }}", context)).toBe('')
  })
})

/**
 * Push-boundary validation (maintainer ruling 2026-08-17), the same contract
 * `normalizeHostActions` / `normalizeHostTargets` already hold: a malformed
 * push is a host programming error, so it **throws** — loudly, naming the
 * offending key — instead of half-applying and wedging the diff.
 */
describe('assertHostStates', () => {
  it('accepts every documented shape', () => {
    expect(() =>
      assertHostStates({
        'sensor.plain': '21.5',
        'sensor.number': 48,
        'binary_sensor.bool': true,
        'sensor.full': {
          state: '21.5',
          name: 'Living-room temperature',
          attributes: { unit_of_measurement: '°C', rgb_color: [255, 0, 0] },
        },
        'sensor.bare': { state: 'on' },
      }),
    ).not.toThrow()
  })

  it('accepts an empty map — presence of the channel is the policy', () => {
    expect(() => assertHostStates({})).not.toThrow()
  })

  it('rejects a non-string name, naming the key', () => {
    expect(() =>
      assertHostStates({ 'sensor.temperature': { state: '21.5', name: 42 } } as never),
    ).toThrow(/Invalid host states:.*sensor\.temperature.*name/)
  })

  it('rejects a missing or non-primitive state value, naming the key', () => {
    expect(() => assertHostStates({ 'sensor.temperature': {} } as never)).toThrow(
      /Invalid host states:.*sensor\.temperature/,
    )
    expect(() =>
      assertHostStates({ 'sensor.temperature': { state: { nested: 1 } } } as never),
    ).toThrow(/Invalid host states:.*sensor\.temperature/)
    expect(() => assertHostStates({ 'sensor.temperature': null } as never)).toThrow(
      /Invalid host states:.*sensor\.temperature/,
    )
    expect(() => assertHostStates({ 'sensor.temperature': undefined } as never)).toThrow(
      /Invalid host states:.*sensor\.temperature/,
    )
  })

  it('rejects an attributes value that is not a plain object, naming the key', () => {
    expect(() =>
      assertHostStates({ 'sensor.temperature': { state: '1', attributes: [1, 2] } } as never),
    ).toThrow(/Invalid host states:.*sensor\.temperature.*attributes/)
  })

  it('rejects a states payload that is not an object at all', () => {
    expect(() => assertHostStates([] as never)).toThrow(/Invalid host states:/)
    expect(() => assertHostStates(null as never)).toThrow(/Invalid host states:/)
    expect(() => assertHostStates('sensor.x=1' as never)).toThrow(/Invalid host states:/)
  })
})

describe('hostStateNamesEqual', () => {
  it('ignores key order', () => {
    expect(hostStateNamesEqual({ a: 'A', b: 'B' }, { b: 'B', a: 'A' })).toBe(true)
  })

  it('is false when a name changes, is added, or is removed', () => {
    expect(hostStateNamesEqual({ a: 'A' }, { a: 'Alpha' })).toBe(false)
    expect(hostStateNamesEqual({ a: 'A' }, { a: 'A', b: 'B' })).toBe(false)
    expect(hostStateNamesEqual({ a: 'A', b: 'B' }, { a: 'A' })).toBe(false)
  })
})

describe('mockStatesEqual', () => {
  it('ignores key order', () => {
    expect(
      mockStatesEqual({ a: '1', b: '2' }, { b: '2', a: '1' }),
    ).toBe(true)
  })

  it('is false on a value or key-set difference', () => {
    expect(mockStatesEqual({ a: '1' }, { a: '2' })).toBe(false)
    expect(mockStatesEqual({ a: '1' }, { a: '1', b: '2' })).toBe(false)
  })
})

describe('mergeMockAttributes', () => {
  it('reuses the previous per-entity object when its content is unchanged', () => {
    const previous = { 'light.desk': { brightness: 128 }, 'light.lamp': { brightness: 50 } }
    const next = { 'light.desk': { brightness: 128 }, 'light.lamp': { brightness: 50 } }

    const merged = mergeMockAttributes(previous, next)

    expect(merged['light.desk']).toBe(previous['light.desk'])
    expect(merged['light.lamp']).toBe(previous['light.lamp'])
    expect(merged).toEqual(next)
  })

  // Identity is the currency here (issue #107 review): the merged map feeds
  // `mockContext` -> `previewElements`, so handing back a fresh top-level object
  // for an attribute-identical push re-evaluates every template and repaints the
  // canvas — which is exactly what a rename-only push used to cost.
  it('returns the previous map itself when nothing about the attributes moved', () => {
    const previous = { 'light.desk': { brightness: 128 } }
    const next = { 'light.desk': { brightness: 128 } }

    expect(mergeMockAttributes(previous, next)).toBe(previous)
  })

  it('returns the previous map itself when both sides are empty', () => {
    const previous = {}

    expect(mergeMockAttributes(previous, {})).toBe(previous)
  })

  it('returns a new map when a key was added or removed, even if the rest is reused', () => {
    const previous = { 'light.desk': { brightness: 128 } }

    expect(mergeMockAttributes(previous, {})).not.toBe(previous)
    expect(
      mergeMockAttributes(previous, {
        'light.desk': { brightness: 128 },
        'light.lamp': { brightness: 1 },
      }),
    ).not.toBe(previous)
  })

  it('uses the new object only for entities whose attributes actually changed', () => {
    const previous = { 'light.desk': { brightness: 128 }, 'light.lamp': { brightness: 50 } }
    const next = { 'light.desk': { brightness: 200 }, 'light.lamp': { brightness: 50 } }

    const merged = mergeMockAttributes(previous, next)

    expect(merged['light.desk']).toBe(next['light.desk'])
    expect(merged['light.desk']).not.toBe(previous['light.desk'])
    expect(merged['light.lamp']).toBe(previous['light.lamp'])
  })

  it('drops entities absent from the next push and adds new ones fresh', () => {
    const previous = { 'light.desk': { brightness: 128 }, 'light.old': { brightness: 1 } }
    const next = { 'light.desk': { brightness: 128 }, 'light.new': { brightness: 9 } }

    const merged = mergeMockAttributes(previous, next)

    expect(merged).toEqual(next)
    expect(merged['light.desk']).toBe(previous['light.desk'])
    expect('light.old' in merged).toBe(false)
  })
})
