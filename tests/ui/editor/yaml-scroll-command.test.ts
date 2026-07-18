import { describe, expect, it } from 'vitest'
import {
  createEntityScrollCommand,
  createYamlScrollCommand,
  mergeYamlScrollCommands,
  shouldApplyYamlScrollCommand,
} from '../../../src/ui/editor/yamlScrollCommand'

describe('createYamlScrollCommand', () => {
  it('returns null when coupling is off', () => {
    expect(createYamlScrollCommand(false, 1, 'ui')).toBeNull()
  })

  it('returns null when selection came from yaml', () => {
    expect(createYamlScrollCommand(true, 1, 'yaml')).toBeNull()
  })

  it('returns a stable token for a ui navigation', () => {
    expect(createYamlScrollCommand(true, 2, 'ui')).toEqual({
      kind: 'element',
      elementIndex: 2,
      token: 'ui:2',
    })
  })

  // Maintainer expectation (follow-up to #37): a canvas click on the
  // already-selected element must re-scroll the YAML pane even though neither
  // selection nor document changes. The request's per-click token is what
  // makes the otherwise-stable `ui:<index>` navigation re-fire.
  describe('with a canvas element scroll request', () => {
    it('uses the request token so a re-click re-fires the scroll', () => {
      expect(
        createYamlScrollCommand(true, 2, 'ui', { elementIndex: 2, token: 'canvas:2:1000' }),
      ).toEqual({ kind: 'element', elementIndex: 2, token: 'canvas:2:1000' })
    })

    it('overrides the yaml selection-source suppression — a canvas click is an explicit navigation', () => {
      expect(
        createYamlScrollCommand(true, 2, 'yaml', { elementIndex: 2, token: 'canvas:2:1000' }),
      ).toEqual({ kind: 'element', elementIndex: 2, token: 'canvas:2:1000' })
    })

    it('ignores a stale request that targets a different element than the selection', () => {
      expect(
        createYamlScrollCommand(true, 3, 'ui', { elementIndex: 2, token: 'canvas:2:1000' }),
      ).toEqual({ kind: 'element', elementIndex: 3, token: 'ui:3' })
    })

    it('does not let a stale request lift the yaml suppression for another element', () => {
      expect(
        createYamlScrollCommand(true, 3, 'yaml', { elementIndex: 2, token: 'canvas:2:1000' }),
      ).toBeNull()
    })

    it('still returns null when coupling is off', () => {
      expect(
        createYamlScrollCommand(false, 2, 'ui', { elementIndex: 2, token: 'canvas:2:1000' }),
      ).toBeNull()
    })
  })
})

describe('createEntityScrollCommand', () => {
  it('returns null when coupling is off', () => {
    expect(createEntityScrollCommand(false, { entityId: 'sensor.temp', token: 'sim:1' })).toBeNull()
  })

  it('returns an entity scroll command when coupling is on', () => {
    expect(
      createEntityScrollCommand(true, { entityId: 'sensor.temp', token: 'sim:sensor.temp:1' }),
    ).toEqual({
      kind: 'entity',
      entityId: 'sensor.temp',
      token: 'sim:sensor.temp:1',
    })
  })
})

describe('mergeYamlScrollCommands', () => {
  it('prefers element navigation over entity navigation', () => {
    expect(
      mergeYamlScrollCommands(
        { kind: 'element', elementIndex: 1, token: 'ui:1' },
        { kind: 'entity', entityId: 'sensor.temp', token: 'sim:1' },
      ),
    ).toEqual({ kind: 'element', elementIndex: 1, token: 'ui:1' })
  })

  it('falls back to entity navigation when no element is selected', () => {
    expect(
      mergeYamlScrollCommands(null, {
        kind: 'entity',
        entityId: 'sensor.temp',
        token: 'sim:1',
      }),
    ).toEqual({ kind: 'entity', entityId: 'sensor.temp', token: 'sim:1' })
  })
})

describe('shouldApplyYamlScrollCommand', () => {
  const command = { kind: 'element' as const, elementIndex: 2, token: 'ui:2' }

  it('skips while the pointer is active in the editor', () => {
    expect(shouldApplyYamlScrollCommand(command, null, true)).toBe(false)
  })

  it('applies once per token', () => {
    expect(shouldApplyYamlScrollCommand(command, null, false)).toBe(true)
    expect(shouldApplyYamlScrollCommand(command, 'ui:2', false)).toBe(false)
  })

  it('applies again when the canvas selection changes', () => {
    const next = { kind: 'element' as const, elementIndex: 3, token: 'ui:3' }
    expect(shouldApplyYamlScrollCommand(next, 'ui:2', false)).toBe(true)
  })
})
