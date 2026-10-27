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
// will — but ONLY where HA fails: preview errors only where a send would
// error; where HA renders blank, preview renders blank. Jinja's real model
// (measured against HA 2026.8.3 / jinja2 3.1.6, default TemplateEnvironment =
// printable LoggingUndefined; `{{ none.state … }}` is the exact equivalent of
// missing-entity member access): a missing entity is None; attribute access
// on None returns an Undefined CARRYING the message `'None' has no attribute
// '<name>'`. That Undefined STRINGIFIES to '' (HA renders blank and logs a
// warning — the send succeeds), and raises only on FURTHER dereference;
// `| default(...)` consumes it, `is defined` on it is false, and guards on
// the entity itself (`{% if %}`, `== none`, `is none`) never raise.
// Every expectation below carries the HA output measured by the oracle
// script (scratchpad ha_measure.py) next to it.

const emptyContext: HaMockContext = { states: {} }

const populatedWeatherContext: HaMockContext = {
  states: { 'weather.other': 'cloudy' },
  attributes: { 'weather.other': { humidity: 60 } },
}

describe('missing-entity dotted access (HA parity)', () => {
  describe('rendering a missing attribute is blank like HA (send succeeds, logs a warning)', () => {
    it("single hop renders '' (HA: '')", () => {
      // Oracle: {{ none.state }} → OK ''
      expect(evaluateTemplate('{{ states.weather.home.state }}', emptyContext)).toBe('')
      // Oracle equivalent for any first-hop name — blank, never an error.
      expect(evaluateTemplate('{{ states.weather.home.entity_id }}', emptyContext)).toBe('')
    })

    it("concat swallows it (HA: 'a')", () => {
      // Oracle: {{ 'a' ~ none.state }} → OK 'a'
      expect(evaluateTemplate("{{ 'a' ~ states.weather.home.state }}", emptyContext)).toBe('a')
    })

    it("string filters see the empty string (HA: '')", () => {
      // Oracle: {{ none.state | upper }} → OK ''
      expect(evaluateTemplate('{{ states.weather.home.state | upper }}', emptyContext)).toBe('')
    })

    it("| length is 0 (HA: '0')", () => {
      // Oracle: {{ none.state | length }} → OK '0'
      expect(evaluateTemplate('{{ states.weather.home.state | length }}', emptyContext)).toBe('0')
    })

    it('| list is an empty sequence (HA: \'[]\' — Python prints the empty list, nunjucks joins it to \'\')', () => {
      // Oracle: {{ none.state | list }} → OK '[]'. Same empty list on both
      // sides; only the sequence PRINTING differs (nunjucks-wide, not
      // specific to the sentinel: {{ [] }} is '' here too).
      expect(evaluateTemplate('{{ states.weather.home.state | list }}', emptyContext)).toBe('')
      expect(
        evaluateTemplate('{{ states.weather.home.state | list | length }}', emptyContext),
      ).toBe('0')
    })
  })

  describe('comparisons coerce to the empty string like HA', () => {
    it("== against a string is false (HA: 'False'; guard takes the else branch)", () => {
      // Oracle: {{ none.state == 'on' }} → OK 'False'
      // (boolean print CASE differs repo-wide: nunjucks 'false' vs Python 'False')
      expect(evaluateTemplate("{{ states.weather.home.state == 'on' }}", emptyContext)).toBe(
        'false',
      )
      // Oracle: {% if none.state == 'on' %}x{% else %}y{% endif %} → OK 'y'
      expect(
        evaluateTemplate(
          "{% if states.weather.home.state == 'on' %}x{% else %}y{% endif %}",
          emptyContext,
        ),
      ).toBe('y')
    })

    it("!= against a string is true (HA: 'True')", () => {
      // Oracle: {{ none.state != 'x' }} → OK 'True'
      expect(evaluateTemplate("{{ states.weather.home.state != 'x' }}", emptyContext)).toBe('true')
    })
  })

  describe('FURTHER dereference still raises exactly like HA (the real incident)', () => {
    it("two hops raise 'None' has no attribute 'attributes' (HA: UndefinedError, message verbatim)", () => {
      // Oracle: {{ none.attributes.humidity }} → ERR UndefinedError: 'None' has no attribute 'attributes'
      expect(() =>
        evaluateTemplate('{{ states.weather.home.attributes.humidity }}', emptyContext),
      ).toThrowError(TemplateEvaluationError)
      expect(() =>
        evaluateTemplate('{{ states.weather.home.attributes.humidity }}', emptyContext),
      ).toThrowError(/'None' has no attribute 'attributes'/)
    })

    it('a stored sentinel keeps its FIRST-hop message through later dereference', () => {
      // Oracle: {% set e = none.state %}{{ e.foo }} → ERR UndefinedError: 'None' has no attribute 'state'
      expect(() =>
        evaluateTemplate('{% set e = states.weather.home.state %}{{ e.foo }}', emptyContext),
      ).toThrowError(/'None' has no attribute 'state'/)
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
      // Oracle: {{ none.state is defined }} → OK 'False'
      expect(evaluateTemplate('{{ states.weather.home.state is defined }}', emptyContext)).toBe(
        'false',
      )
      // Oracle: {{ none.state is undefined }} → OK 'True'
      expect(evaluateTemplate('{{ states.weather.home.state is undefined }}', emptyContext)).toBe(
        'true',
      )
    })

    it('… and the attribute is NOT none (HA: Undefined is not None)', () => {
      // Oracle: {{ none.state is none }} → OK 'False'
      expect(evaluateTemplate('{{ states.weather.home.state is none }}', emptyContext)).toBe(
        'false',
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

  describe('documented divergences from HA (pins — see evaluate.ts comment + PR body)', () => {
    it('bare truthiness guard on a missing ATTRIBUTE takes the truthy branch (HA: falsy)', () => {
      // Oracle: {{ 'x' if none.state else 'y' }} → OK 'y'. The sentinel is a
      // JS object, truthy here — silent wrong branch, known and accepted.
      // Guarding the ENTITY ({% if states.weather.home %}) matches HA.
      expect(
        evaluateTemplate("{{ 'x' if states.weather.home.state else 'y' }}", emptyContext),
      ).toBe('x')
    })

    it('iterating the missing ENTITY renders blank (HA: TypeError NoneType not iterable)', () => {
      // Oracle: {% for f in none %}…{% endfor %} → ERR TypeError: 'NoneType'
      // object is not iterable. nunjucks iterates null as empty instead.
      expect(
        evaluateTemplate('{% for f in states.weather.home %}{{ f }}{% endfor %}', emptyContext),
      ).toBe('')
    })

    it('numeric contexts coerce instead of raising (HA: UndefinedError)', () => {
      // Oracle: {{ none.state > 5 }} → ERR UndefinedError: 'None' has no
      // attribute 'state'; {{ none.state | int(0) }} → same ERR. JS relational
      // and parseInt coercion see '' here — more lenient than HA, never a
      // false error.
      expect(evaluateTemplate('{{ states.weather.home.state > 5 }}', emptyContext)).toBe('false')
      expect(evaluateTemplate('{{ states.weather.home.state | int(0) }}', emptyContext)).toBe('0')
    })
  })

  describe('unknown domains are namespaces, never errors (HA: states.<domain> always exists)', () => {
    it('does not raise on unknown domain access itself', () => {
      expect(() => evaluateTemplate('{{ states.nosuchdomain }}ok', emptyContext)).not.toThrow()
    })

    it('treats an entity in an unknown domain exactly like a missing entity', () => {
      expect(evaluateTemplate('{{ states.nosuchdomain.foo }}', emptyContext)).toBe('')
      expect(evaluateTemplate('{{ states.nosuchdomain.foo.state }}', emptyContext)).toBe('')
      expect(() =>
        evaluateTemplate('{{ states.nosuchdomain.foo.attributes.x }}', emptyContext),
      ).toThrowError(/'None' has no attribute 'attributes'/)
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
      // attribute: it renders blank like any sentinel, never Function.
      expect(evaluateTemplate('{{ states.weather.home.constructor }}', emptyContext)).toBe('')
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
