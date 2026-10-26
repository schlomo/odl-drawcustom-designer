import { afterEach, describe, expect, it } from 'vitest'
import { evaluateTemplate } from '../../../src/core/templates/evaluate'
import { haFloat, haSetAttr } from '../../../src/core/templates/ha-globals'
import type { HaMockContext } from '../../../src/core/templates/types'

const emptyContext: HaMockContext = { states: {} }

const WELL_KNOWN_PROTOTYPES: ReadonlyArray<[string, object]> = [
  ['Object.prototype', Object.prototype],
  ['Array.prototype', Array.prototype],
  ['Function.prototype', Function.prototype],
  ['String.prototype', String.prototype],
  ['Number.prototype', Number.prototype],
  ['Boolean.prototype', Boolean.prototype],
]

/** Own-key snapshots so a leaked write is both detected AND cleaned up. */
function snapshotPrototypeKeys(): Map<object, Set<string | symbol>> {
  const snapshot = new Map<object, Set<string | symbol>>()
  for (const [, proto] of WELL_KNOWN_PROTOTYPES) {
    snapshot.set(proto, new Set(Reflect.ownKeys(proto)))
  }
  return snapshot
}

function removeLeakedKeys(snapshot: Map<object, Set<string | symbol>>): (string | symbol)[] {
  const leaked: (string | symbol)[] = []
  for (const [proto, keys] of snapshot) {
    for (const key of Reflect.ownKeys(proto)) {
      if (!keys.has(key)) {
        leaked.push(key)
        delete (proto as Record<string | symbol, unknown>)[key]
      }
    }
  }
  return leaked
}

describe('template evaluator prototype-pollution hardening', () => {
  // Safety net: whatever a test leaks onto a shared prototype is removed so
  // later tests (in this file or the whole run) do not inherit it.
  let baseline = snapshotPrototypeKeys()

  afterEach(() => {
    removeLeakedKeys(baseline)
    baseline = snapshotPrototypeKeys()
  })

  it('a namespace() __proto__ escape cannot pollute Object.prototype', () => {
    const template =
      "{% set n = namespace() %}{% set p = n.__proto__ %}{% set p.polluted = 1 %}"

    // Blocked writes are swallowed, not thrown (same convention as the
    // evaluator's UNSAFE_KEYS skip for dotted state access): the template
    // still evaluates, to empty output.
    expect(evaluateTemplate(template, emptyContext).trim()).toBe('')

    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false)
  })

  it('an array literal __proto__ escape cannot pollute Array.prototype', () => {
    const template =
      "{% set a = [1] %}{% set p = a.__proto__ %}{% set p.arrPolluted = 1 %}"

    expect(evaluateTemplate(template, emptyContext).trim()).toBe('')

    expect(([] as unknown as Record<string, unknown>).arrPolluted).toBeUndefined()
    expect(Object.hasOwn(Array.prototype, 'arrPolluted')).toBe(false)
  })

  it('member-set on an exposed global function is a no-op', () => {
    const template = '{% set f = float %}{% set f.fnPolluted = 1 %}{{ float(2) }}'

    expect(evaluateTemplate(template, emptyContext).trim()).toBe('2')

    expect((haFloat as unknown as Record<string, unknown>).fnPolluted).toBeUndefined()
  })

  it('haSetAttr refuses dangerous keys and well-known prototype targets', () => {
    const before = snapshotPrototypeKeys()

    const victim: Record<string, unknown> = {}
    expect(haSetAttr(victim, '__proto__', { polluted: true })).toBe('')
    expect(haSetAttr(victim, 'constructor', 'x')).toBe('')
    expect(haSetAttr(victim, 'prototype', 'x')).toBe('')
    expect(Object.keys(victim)).toEqual([])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()

    for (const [, proto] of WELL_KNOWN_PROTOTYPES) {
      expect(haSetAttr(proto, 'protoPolluted', 1)).toBe('')
    }
    const fn = (): void => undefined
    expect(haSetAttr(fn, 'fnKey', 1)).toBe('')
    expect(Object.hasOwn(fn, 'fnKey')).toBe(false)

    expect(removeLeakedKeys(before)).toEqual([])
  })

  it('legitimate namespace() accumulation keeps working', () => {
    const template =
      '{% set ns = namespace(sum=0) %}' +
      '{% for v in [1, 2, 3] %}{% set ns.sum = ns.sum + v %}{% endfor %}' +
      '{{ ns.sum }}'

    expect(evaluateTemplate(template, emptyContext).trim()).toBe('6')
  })

  it('legitimate namespace() seeded members read back', () => {
    const template = "{% set ns = namespace(text='hi', uv=false) %}{{ ns.text }}/{{ ns.uv }}"

    expect(evaluateTemplate(template, emptyContext).trim()).toBe('hi/false')
  })
})
