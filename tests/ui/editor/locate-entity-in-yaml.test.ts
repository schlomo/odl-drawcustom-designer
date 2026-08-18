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

  // PR #142 maintainer finding: the referenced-states panel and the Simulator
  // read entity ids the payload reaches via dotted access on the `states`
  // global (`states.<domain>.<object>`, ADR-004) — the showcase demo's own
  // payload uses exactly this form (`states.weather.home.attributes.humidity`).
  // That id has no surrounding quotes to anchor on, and it always sits right
  // after a literal `states.`, i.e. immediately preceded by a dot — which the
  // bare-identifier fallback below deliberately excludes (to avoid matching a
  // fragment of a longer dotted chain). Without a dedicated branch for this
  // form, clicking such a row's label silently finds nothing to scroll to.
  it('finds a state reached through bare dotted access on the states global', () => {
    const doc = `value: "{{ states.sensor.outdoor_temperature.state }}"`
    const pos = locateFirstEntityOccurrenceInYaml(doc, 'sensor.outdoor_temperature')
    expect(pos).not.toBeNull()
    expect(doc.slice(pos!, pos! + 'sensor.outdoor_temperature'.length)).toBe(
      'sensor.outdoor_temperature',
    )
  })

  it('finds a state reached only through a dotted attribute read', () => {
    const doc = `value: "{{ states.weather.home.attributes.humidity }}%"`
    const pos = locateFirstEntityOccurrenceInYaml(doc, 'weather.home')
    expect(pos).not.toBeNull()
    expect(doc.slice(pos!, pos! + 'weather.home'.length)).toBe('weather.home')
  })

  it('does not match dotted access on a namespaced states-like member', () => {
    // Mirrors the extraction guard in core/templates/patterns.ts
    // (STATES_DOTTED_PATTERN): a member named `states` on something else is
    // not the HA global, so it names no entity to jump to.
    const doc = `value: "{{ ns.states.sensor.outdoor_temperature.state }}"`
    expect(locateFirstEntityOccurrenceInYaml(doc, 'sensor.outdoor_temperature')).toBeNull()
  })
})
