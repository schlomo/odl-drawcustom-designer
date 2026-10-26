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
// will — but ONLY where HA fails. Jinja's real model: a missing entity is
// None; attribute access on None returns an Undefined CARRYING the message,
// which raises only when rendered or dereferenced further; `| default(...)`
// consumes it, `is defined` on it is false, and guards on the entity itself
// (`{% if %}`, `== none`, `is none`) never raise.

const emptyContext: HaMockContext = { states: {} }

const populatedWeatherContext: HaMockContext = {
  states: { 'weather.other': 'cloudy' },
  attributes: { 'weather.other': { humidity: 60 } },
}

describe('missing-entity dotted access (HA parity)', () => {
  describe('attribute access on a missing entity raises like HA when rendered', () => {
    it("raises 'None' has no attribute 'state'", () => {
      expect(() => evaluateTemplate('{{ states.weather.home.state }}', emptyContext)).toThrowError(
        TemplateEvaluationError,
      )
      expect(() => evaluateTemplate('{{ states.weather.home.state }}', emptyContext)).toThrowError(
        /'None' has no attribute 'state'/,
      )
    })

    it('names the FIRST missing hop; chained hops keep its message', () => {
      // `.attributes` is the first access on None — `.humidity` must not
      // rename the error (Jinja: Undefined.__getattr__ re-raises the carried
      // message).
      expect(() =>
        evaluateTemplate('{{ states.weather.home.attributes.humidity }}', emptyContext),
      ).toThrowError(/'None' has no attribute 'attributes'/)
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

  describe('guards on the missing entity behave like HA (None, not an error)', () => {
    it('{% if %} on the entity skips the branch without raising', () => {
      expect(evaluateTemplate('{% if states.weather.home %}x{% endif %}', emptyContext)).toBe('')
    })

    it('== none takes the guarded branch; the other branch stays unevaluated', () => {
      expect(
        evaluateTemplate(
          "{{ 'n/a' if states.weather.home == none else states.weather.home.state }}",
          emptyContext,
        ),
      ).toBe('n/a')
    })

    it('is none matches the missing entity', () => {
      expect(
        evaluateTemplate("{{ 'n/a' if states.weather.home is none else '' }}", emptyContext),
      ).toBe('n/a')
    })

    it('the entity is defined (HA: None is defined) …', () => {
      expect(evaluateTemplate('{{ states.weather.home is defined }}', emptyContext)).toBe('true')
    })

    it('… but an attribute of it is NOT defined', () => {
      expect(evaluateTemplate('{{ states.weather.home.state is defined }}', emptyContext)).toBe(
        'false',
      )
      expect(evaluateTemplate('{{ states.weather.home.state is undefined }}', emptyContext)).toBe(
        'true',
      )
    })

    it('| default() consumes the deferred undefined and feeds later filters', () => {
      expect(
        evaluateTemplate("{{ states.weather.home.state | default('unknown') }}", emptyContext),
      ).toBe('unknown')
      expect(
        evaluateTemplate("{{ states.weather.home.state | default('u') | upper }}", emptyContext),
      ).toBe('U')
      expect(evaluateTemplate("{{ states.weather.home.state | d('dd') }}", emptyContext)).toBe(
        'dd',
      )
    })

    it('| default() keeps stock behavior for present values', () => {
      expect(
        evaluateTemplate(
          "{{ states.weather.other.state | default('fallback') }}",
          populatedWeatherContext,
        ),
      ).toBe('cloudy')
      expect(evaluateTemplate("{{ nosuchvar | default('fallback') }}", emptyContext)).toBe(
        'fallback',
      )
      expect(evaluateTemplate("{{ '' | default('fallback', true) }}", emptyContext)).toBe(
        'fallback',
      )
    })
  })

  describe('direct render of the missing entity', () => {
    // The missing entity resolves to null (jinja-compat None), which nunjucks
    // renders as an empty string. HA prints `None` here — accepted divergence
    // (maintainer ruling): '' falls out of the None mechanism that buys every
    // guard above, and a stray literal `None` on the canvas helps nobody.
    it("renders '' (HA prints None — documented divergence)", () => {
      expect(evaluateTemplate('{{ states.weather.home }}', emptyContext)).toBe('')
      expect(evaluateTemplate('{{ states.weather.home }}', populatedWeatherContext)).toBe('')
    })
  })

  describe('unknown domains are namespaces, never errors (HA: states.<domain> always exists)', () => {
    it('does not raise on unknown domain access itself', () => {
      expect(() => evaluateTemplate('{{ states.nosuchdomain }}ok', emptyContext)).not.toThrow()
    })

    it('treats an entity in an unknown domain exactly like a missing entity', () => {
      expect(evaluateTemplate('{{ states.nosuchdomain.foo }}', emptyContext)).toBe('')
      expect(() =>
        evaluateTemplate('{{ states.nosuchdomain.foo.state }}', emptyContext),
      ).toThrowError(/'None' has no attribute 'state'/)
      expect(
        evaluateTemplate('{% if states.nosuchdomain.foo %}x{% endif %}', emptyContext),
      ).toBe('')
      expect(
        evaluateTemplate("{{ 'n/a' if states.nosuchdomain.foo == none else '' }}", emptyContext),
      ).toBe('n/a')
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
      expect(
        evaluateTemplate('{{ states.weather.other.state is defined }}', populatedWeatherContext),
      ).toBe('true')
      expect(
        evaluateTemplate('{% if states.weather.other %}x{% endif %}', populatedWeatherContext),
      ).toBe('x')
    })
  })

  describe('prototype-pollution guards stay closed', () => {
    it('keeps states.__proto__ / states.constructor inert', () => {
      expect(evaluateTemplate('{{ states.__proto__ }}', emptyContext)).toBe('')
      expect(evaluateTemplate('{{ states.constructor }}', emptyContext)).toBe('')
      expect(evaluateTemplate('{{ states.constructor.constructor }}', emptyContext)).toBe('')
      expect(evaluateTemplate('{{ states.prototype }}', emptyContext)).toBe('')
    })

    it('never exposes a constructor through the deferred undefined', () => {
      // `constructor` on the missing entity (None) is just another missing
      // attribute: rendering it raises the HA message, never Function.
      expect(() =>
        evaluateTemplate('{{ states.weather.home.constructor }}', emptyContext),
      ).toThrowError(/'None' has no attribute 'constructor'/)
      // Dereferencing THROUGH the deferred undefined raises instead of
      // walking to Function/Object.prototype.
      expect(() =>
        evaluateTemplate('{{ states.weather.home.state.constructor }}', emptyContext),
      ).toThrowError(/'None' has no attribute 'state'/)
      expect(() =>
        evaluateTemplate("{{ states.weather.home.state['__proto__'] }}", emptyContext),
      ).toThrowError(/'None' has no attribute 'state'/)
    })

    it('keeps unsafe object ids inert on domain buckets', () => {
      expect(evaluateTemplate('{{ states.nosuchdomain.__proto__ }}', emptyContext)).toBe('')
      expect(evaluateTemplate("{{ states.weather['__proto__'] }}", populatedWeatherContext)).toBe(
        '',
      )
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
