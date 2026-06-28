import { describe, expect, it } from 'vitest'
import { evaluateTemplate, type HaMockContext } from '../../../src/core/templates'

const temperatureContext: HaMockContext = {
  states: {
    'sensor.temperature': '21.5',
  },
}

const doorOpenContext: HaMockContext = {
  states: {
    'binary_sensor.door': 'on',
  },
}

const doorClosedContext: HaMockContext = {
  states: {
    'binary_sensor.door': 'off',
  },
}

const batteryLowContext: HaMockContext = {
  states: {
    'sensor.battery': '15',
  },
}

const batteryOkContext: HaMockContext = {
  states: {
    'sensor.battery': '85',
  },
}

describe('evaluateTemplate', () => {
  describe('priority HA template patterns (ADR-004)', () => {
    it("evaluates states('sensor.temperature')", () => {
      expect(evaluateTemplate("{{ states('sensor.temperature') }}", temperatureContext)).toBe('21.5')
    })

    it('evaluates temperature label with literal suffix', () => {
      expect(
        evaluateTemplate("Temperature: {{ states('sensor.temperature') }}°C", temperatureContext),
      ).toBe('Temperature: 21.5°C')
    })

    it("evaluates conditional color when door is on", () => {
      expect(
        evaluateTemplate(
          "{{ 'red' if is_state('binary_sensor.door', 'on') else 'black' }}",
          doorOpenContext,
        ),
      ).toBe('red')
    })

    it("evaluates conditional color when door is off", () => {
      expect(
        evaluateTemplate(
          "{{ 'red' if is_state('binary_sensor.door', 'on') else 'black' }}",
          doorClosedContext,
        ),
      ).toBe('black')
    })

    it('evaluates battery float comparison when low', () => {
      expect(
        evaluateTemplate("{{ states('sensor.battery')|float < 20 }}", batteryLowContext),
      ).toBe('true')
    })

    it('evaluates battery float comparison when ok', () => {
      expect(
        evaluateTemplate("{{ states('sensor.battery')|float < 20 }}", batteryOkContext),
      ).toBe('false')
    })

    it('evaluates icon color conditional from spec', () => {
      expect(
        evaluateTemplate(
          "{{ 'red' if states('sensor.battery')|float < 20 else 'black' }}",
          batteryLowContext,
        ),
      ).toBe('red')
      expect(
        evaluateTemplate(
          "{{ 'red' if states('sensor.battery')|float < 20 else 'black' }}",
          batteryOkContext,
        ),
      ).toBe('black')
    })

    it('evaluates parse_colors block with template-driven color names', () => {
      const template = `[{{ 'red' if is_state('binary_sensor.door', 'on') else 'black' }}]open[/{{ 'red' if is_state('binary_sensor.door', 'on') else 'black' }}]`
      expect(evaluateTemplate(template, doorOpenContext)).toBe('[red]open[/red]')
      expect(evaluateTemplate(template, doorClosedContext)).toBe('[black]open[/black]')
    })
  })

  describe('mock context behavior', () => {
    it('returns unknown for missing entities', () => {
      expect(evaluateTemplate("{{ states('sensor.missing') }}", { states: {} })).toBe('unknown')
    })

    it('coerces numeric mock values to strings', () => {
      expect(
        evaluateTemplate("{{ states('sensor.level') }}", { states: { 'sensor.level': 42 } }),
      ).toBe('42')
    })

    it('compares is_state case-insensitively', () => {
      expect(
        evaluateTemplate("{{ is_state('light.kitchen', 'ON') }}", {
          states: { 'light.kitchen': 'on' },
        }),
      ).toBe('true')
    })

    it('returns plain strings unchanged when no template syntax', () => {
      expect(evaluateTemplate('Hello world', temperatureContext)).toBe('Hello world')
      expect(evaluateTemplate('50%', temperatureContext)).toBe('50%')
    })
  })

  describe('HA globals used in drawcustom icon templates', () => {
    it('evaluates float() with a default for entity state', () => {
      expect(
        evaluateTemplate(
          "{{ (float(states('sensor.uv_index'), 0) * 7 + 24) | round(0) }}",
          { states: { 'sensor.uv_index': '3' } },
        ),
      ).toBe('45')
    })

    it('evaluates iif() for conditional fill colors', () => {
      expect(
        evaluateTemplate(
          "{{ iif(is_state('binary_sensor.example_window', 'on'), 'black', 'none') }}",
          { states: { 'binary_sensor.example_window': 'off' } },
        ),
      ).toBe('none')
      expect(
        evaluateTemplate(
          "{{ iif(is_state('binary_sensor.example_window', 'on'), 'black', 'none') }}",
          { states: { 'binary_sensor.example_window': 'on' } },
        ),
      ).toBe('black')
    })
  })

  describe('state_attr and entity attributes (issue #4)', () => {
    const familyEventContext: HaMockContext = {
      states: { 'sensor.sn_family_current_event': 'No event' },
      attributes: { 'sensor.sn_family_current_event': { active: true } },
    }
    const familyEventInactiveContext: HaMockContext = {
      states: { 'sensor.sn_family_current_event': 'No event' },
      attributes: { 'sensor.sn_family_current_event': { active: false } },
    }

    it('returns a mocked attribute value', () => {
      expect(
        evaluateTemplate("{{ state_attr('sensor.sn_family_current_event', 'active') }}", familyEventContext),
      ).toBe('true')
    })

    it('evaluates the issue icon template to calendar when active is true', () => {
      expect(
        evaluateTemplate(
          "{{ iif(state_attr('sensor.sn_family_current_event','active'),'calendar','calendar-blank') }}",
          familyEventContext,
        ),
      ).toBe('calendar')
    })

    it('evaluates the issue icon template to calendar-blank when active is false', () => {
      expect(
        evaluateTemplate(
          "{{ iif(state_attr('sensor.sn_family_current_event','active'),'calendar','calendar-blank') }}",
          familyEventInactiveContext,
        ),
      ).toBe('calendar-blank')
    })

    it('treats a missing attribute as falsy (None)', () => {
      expect(
        evaluateTemplate(
          "{{ iif(state_attr('sensor.sn_family_current_event','missing'),'yes','no') }}",
          familyEventContext,
        ),
      ).toBe('no')
    })

    it('returns the TYPED attribute value (boolean false, not the string "false")', () => {
      const context: HaMockContext = {
        states: { 'calendar.sn_family': 'on' },
        attributes: { 'calendar.sn_family': { all_day: false } },
      }
      // A boolean false attribute must be falsy in iif (string "false" would be truthy).
      expect(
        evaluateTemplate(
          "{{ iif(state_attr('calendar.sn_family', 'all_day'), 'green', 'red') }}",
          context,
        ),
      ).toBe('red')
      // Dotted access yields the typed value too.
      expect(
        evaluateTemplate('{{ states.calendar.sn_family.attributes.all_day }}', context),
      ).toBe('false')
    })

    describe('is_state_attr', () => {
      const allDayContext: HaMockContext = {
        states: { 'calendar.sn_family': 'on' },
        attributes: { 'calendar.sn_family': { all_day: false, count: 3, label: 'Trip' } },
      }

      it('matches a boolean attribute type-sensitively', () => {
        expect(
          evaluateTemplate(
            "{{ is_state_attr('calendar.sn_family', 'all_day', false) }}",
            allDayContext,
          ),
        ).toBe('true')
        expect(
          evaluateTemplate(
            "{{ is_state_attr('calendar.sn_family', 'all_day', true) }}",
            allDayContext,
          ),
        ).toBe('false')
      })

      it("renders the maintainer's example with correct primitives", () => {
        expect(
          evaluateTemplate(
            "{{ iif(is_state_attr('calendar.sn_family', 'all_day', false), 'green', 'red') }}",
            allDayContext,
          ),
        ).toBe('green')
      })

      it('matches numeric and string attributes', () => {
        expect(
          evaluateTemplate("{{ is_state_attr('calendar.sn_family', 'count', 3) }}", allDayContext),
        ).toBe('true')
        expect(
          evaluateTemplate("{{ is_state_attr('calendar.sn_family', 'count', 4) }}", allDayContext),
        ).toBe('false')
        expect(
          evaluateTemplate(
            "{{ is_state_attr('calendar.sn_family', 'label', 'Trip') }}",
            allDayContext,
          ),
        ).toBe('true')
      })

      it('treats a missing attribute as None', () => {
        expect(
          evaluateTemplate(
            "{{ is_state_attr('calendar.sn_family', 'missing', None) }}",
            allDayContext,
          ),
        ).toBe('true')
        expect(
          evaluateTemplate(
            "{{ is_state_attr('calendar.sn_family', 'missing', false) }}",
            allDayContext,
          ),
        ).toBe('false')
      })
    })

    it('preserves the existing states() string while exposing dotted attribute access', () => {
      const weatherContext: HaMockContext = {
        states: { 'weather.home': 'sunny' },
        attributes: { 'weather.home': { temperature: 21.5 } },
      }
      expect(evaluateTemplate("{{ states('weather.home') }}", weatherContext)).toBe('sunny')
      expect(evaluateTemplate('{{ states.weather.home.attributes.temperature }}', weatherContext)).toBe('21.5')
      expect(evaluateTemplate('{{ states.weather.home.state }}', weatherContext)).toBe('sunny')
    })
  })

  describe('prototype pollution hardening (Copilot review)', () => {
    it('does not pollute Object.prototype and keeps dotted access working with malicious entity ids', () => {
      const maliciousContext: HaMockContext = {
        states: {
          'sensor.__proto__': 'evil',
          '__proto__.x': 'evil',
          'sensor.constructor': 'evil',
          'weather.home': 'sunny',
        },
        attributes: { 'weather.home': { temperature: 21.5 } },
      }

      // Legitimate dotted access still resolves after the malicious ids are skipped.
      expect(
        evaluateTemplate('{{ states.weather.home.attributes.temperature }}', maliciousContext),
      ).toBe('21.5')
      expect(evaluateTemplate("{{ states('weather.home') }}", maliciousContext)).toBe('sunny')

      // The malicious `sensor.__proto__` id must not leak a real `sensor` bucket
      // whose prototype carries the injected state object's fields.
      expect(evaluateTemplate('{{ states.sensor.entity_id }}', maliciousContext)).toBe('')

      // Global prototype chain is untouched by evaluation.
      expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'x')).toBe(false)
      expect((({}) as Record<string, unknown>).entity_id).toBeUndefined()
    })
  })

  describe('datetime helpers', () => {
    const clockContext: HaMockContext = {
      states: {},
      now: new Date(2026, 5, 6, 23, 44, 0),
    }

    it('evaluates now().strftime for clock labels', () => {
      expect(
        evaluateTemplate("{{ now().strftime('%d.%m.%Y %H:%M') }}", clockContext),
      ).toBe('06.06.2026 23:44')
    })
  })
})
