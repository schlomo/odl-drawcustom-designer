import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { locateFirstEntityOccurrenceInYaml } from '../../../src/ui/editor/locateEntityInYaml'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/spec')
const templatedDashboard = readFileSync(join(fixtureDir, 'templated-dashboard.yaml'), 'utf8')

describe('locateFirstEntityOccurrenceInYaml', () => {
  it('finds the first quoted occurrence of an entity id', () => {
    const pos = locateFirstEntityOccurrenceInYaml(
      templatedDashboard,
      'sensor.outdoor_temperature',
    )
    expect(pos).not.toBeNull()
    expect(templatedDashboard.slice(pos!, pos! + 'sensor.outdoor_temperature'.length)).toBe(
      'sensor.outdoor_temperature',
    )
    expect(templatedDashboard.indexOf('sensor.apparent_temperature')).toBeGreaterThan(pos!)
  })

  it('returns null when the entity is not referenced', () => {
    expect(locateFirstEntityOccurrenceInYaml(templatedDashboard, 'sensor.missing')).toBeNull()
  })

  it('does not match a shorter entity id prefix inside a longer id', () => {
    const doc = `value: "{{ states('sensor.room_temperature') }}"`
    expect(locateFirstEntityOccurrenceInYaml(doc, 'sensor.room')).toBeNull()
  })
})
