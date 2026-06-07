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
