import { describe, expect, it } from 'vitest'
import {
  createYamlScrollCommand,
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
      elementIndex: 2,
      token: 'ui:2',
    })
  })
})

describe('shouldApplyYamlScrollCommand', () => {
  const command = { elementIndex: 2, token: 'ui:2' }

  it('skips while the pointer is active in the editor', () => {
    expect(shouldApplyYamlScrollCommand(command, null, true)).toBe(false)
  })

  it('applies once per token', () => {
    expect(shouldApplyYamlScrollCommand(command, null, false)).toBe(true)
    expect(shouldApplyYamlScrollCommand(command, 'ui:2', false)).toBe(false)
  })

  it('applies again when the canvas selection changes', () => {
    const next = { elementIndex: 3, token: 'ui:3' }
    expect(shouldApplyYamlScrollCommand(next, 'ui:2', false)).toBe(true)
  })
})
