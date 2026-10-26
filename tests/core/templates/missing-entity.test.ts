import { describe, expect, it } from 'vitest'
import {
  evaluateTemplate,
  TemplateEvaluationError,
  type HaMockContext,
} from '../../../src/core/templates'

// HA parity for dotted `states.<domain>.<object>` access on entities that are
// NOT in the mock context (real incident: `{{ states.weather.home.attributes.humidity }}`
// previewed as an empty string while HA's server-side Jinja raised
// `UndefinedError: 'None' has no attribute 'attributes'` at send time — a
// WYSIWYG violation). The designer must surface the same failure the server
// will.

const emptyContext: HaMockContext = { states: {} }

const populatedWeatherContext: HaMockContext = {
  states: { 'weather.other': 'cloudy' },
  attributes: { 'weather.other': { humidity: 60 } },
}

describe('missing-entity dotted access (HA parity)', () => {
  describe('direct render prints None (what HA prints)', () => {
    it('renders None for a missing entity in an unknown domain', () => {
      expect(evaluateTemplate('{{ states.weather.home }}', emptyContext)).toBe('None')
    })

    it('renders None for a missing entity in a populated domain', () => {
      expect(evaluateTemplate('{{ states.weather.home }}', populatedWeatherContext)).toBe('None')
    })
  })

  describe('attribute access on a missing entity raises like HA', () => {
    it("raises 'None' has no attribute 'attributes'", () => {
      expect(() =>
        evaluateTemplate('{{ states.weather.home.attributes.humidity }}', emptyContext),
      ).toThrowError(TemplateEvaluationError)
      expect(() =>
        evaluateTemplate('{{ states.weather.home.attributes.humidity }}', emptyContext),
      ).toThrowError(/'None' has no attribute 'attributes'/)
    })

    it('names the first accessed attribute in the message (.state, .entity_id)', () => {
      expect(() => evaluateTemplate('{{ states.weather.home.state }}', emptyContext)).toThrowError(
        /'None' has no attribute 'state'/,
      )
      expect(() =>
        evaluateTemplate('{{ states.weather.home.entity_id }}', emptyContext),
      ).toThrowError(/'None' has no attribute 'entity_id'/)
    })

    it('raises even when the domain has other entities', () => {
      expect(() =>
        evaluateTemplate('{{ states.weather.home.attributes.humidity }}', populatedWeatherContext),
      ).toThrowError(/'None' has no attribute 'attributes'/)
    })
  })

  describe('unknown domains are namespaces, never errors (HA: states.<domain> always exists)', () => {
    it('does not raise on unknown domain access itself', () => {
      expect(() => evaluateTemplate('{{ states.nosuchdomain }}ok', emptyContext)).not.toThrow()
    })

    it('renders None for an entity in an unknown domain and raises on its attributes', () => {
      expect(evaluateTemplate('{{ states.nosuchdomain.foo }}', emptyContext)).toBe('None')
      expect(() =>
        evaluateTemplate('{{ states.nosuchdomain.foo.attributes }}', emptyContext),
      ).toThrowError(/'None' has no attribute 'attributes'/)
    })
  })

  describe('HA treats the missing entity as defined (None is defined)', () => {
    it('is defined evaluates true', () => {
      expect(evaluateTemplate('{{ states.weather.home is defined }}', emptyContext)).toBe('true')
    })
  })

  describe('existing missing-entity behavior stays (pins)', () => {
    it("states('weather.home') missing stays 'unknown'", () => {
      expect(evaluateTemplate("{{ states('weather.home') }}", emptyContext)).toBe('unknown')
    })

    it('state_attr on a missing entity stays None-ish falsy', () => {
      expect(
        evaluateTemplate("{{ iif(state_attr('weather.home', 'humidity'), 'yes', 'no') }}", emptyContext),
      ).toBe('no')
    })

    it('is_state_attr on a missing entity stays false', () => {
      expect(
        evaluateTemplate("{{ is_state_attr('weather.home', 'humidity', 50) }}", emptyContext),
      ).toBe('false')
    })

    it('existing entities keep working through dotted access', () => {
      expect(
        evaluateTemplate('{{ states.weather.other.attributes.humidity }}', populatedWeatherContext),
      ).toBe('60')
      expect(evaluateTemplate('{{ states.weather.other.state }}', populatedWeatherContext)).toBe(
        'cloudy',
      )
    })
  })

  describe('prototype-pollution guards stay closed', () => {
    it('keeps states.__proto__ / states.constructor inert', () => {
      expect(evaluateTemplate('{{ states.__proto__ }}', emptyContext)).toBe('')
      expect(evaluateTemplate('{{ states.constructor }}', emptyContext)).toBe('')
      expect(evaluateTemplate('{{ states.constructor.constructor }}', emptyContext)).toBe('')
      expect(evaluateTemplate('{{ states.prototype }}', emptyContext)).toBe('')
    })

    it('never exposes a constructor through the None placeholder', () => {
      // The placeholder must raise like HA's None, not hand back Function.
      expect(() =>
        evaluateTemplate('{{ states.weather.home.constructor }}', emptyContext),
      ).toThrowError(/'None' has no attribute 'constructor'/)
    })

    it('keeps unsafe object ids inert on unknown domains', () => {
      expect(evaluateTemplate('{{ states.nosuchdomain.__proto__ }}', emptyContext)).toBe('None')
      expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false)
    })

    it('ignores member assignment onto the states global', () => {
      expect(
        evaluateTemplate("{% set states.__proto__ = {'polluted': 1} %}ok", emptyContext),
      ).toBe('ok')
      expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    })
  })
})
