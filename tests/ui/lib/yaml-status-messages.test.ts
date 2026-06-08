import { describe, expect, it } from 'vitest'
import { getYamlStatusMessages } from '../../../src/ui/lib/yaml-status-messages'

describe('yaml status messages', () => {
  it('maps parse issues to error status messages', () => {
    const messages = getYamlStatusMessages('- type: text\n  value: broken')
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      severity: 'error',
      title: 'YAML not applied to canvas',
    })
    expect(messages[0]?.summary).toContain('x')
  })

  it('returns no messages for valid yaml', () => {
    const messages = getYamlStatusMessages('- type: text\n  value: Hi\n  x: 0\n  y: 0')
    expect(messages).toEqual([])
  })
})
