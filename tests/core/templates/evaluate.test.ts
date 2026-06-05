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
  describe('priority patterns from PLAN §2', () => {
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
})
