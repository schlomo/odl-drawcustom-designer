import { describe, expect, it } from 'vitest'
import { filterMdiIconNames, listMdiIconNamesForCompletion } from '../../../src/ui/lib/mdi-icon-names'

describe('filterMdiIconNames', () => {
  it('returns matching icon names for a query', () => {
    const results = filterMdiIconNames('home', 5)
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((name) => name.includes('home'))).toBe(true)
    expect(results[0]).toBe('home')
  })

  it('ranks prefix matches before other substring matches', () => {
    const results = filterMdiIconNames('home', 50)
    expect(results).toContain('home-group')
    expect(results[0]).toBe('home')
    expect(results.every((name) => name.startsWith('home'))).toBe(true)
  })

  it('strips mdi: prefix before searching', () => {
    expect(filterMdiIconNames('mdi:home', 5)).toEqual(filterMdiIconNames('home', 5))
  })

  it('matches multiple query words as substrings in any order', () => {
    expect(filterMdiIconNames('home group', 50)).toContain('home-group')
    expect(filterMdiIconNames('group home', 50)).toContain('home-group')
    expect(filterMdiIconNames('home group', 50)[0]).toBe('home-group')
  })

  it('matches spaced words against hyphenated icon names', () => {
    const results = filterMdiIconNames('cowboy hat', 50)
    expect(results).toContain('account-cowboy-hat')
    expect(filterMdiIconNames('hat cowboy', 50)).toContain('account-cowboy-hat')
  })

  it('returns empty results for blank query', () => {
    expect(filterMdiIconNames('   ')).toEqual([])
  })

  it('returns no suggestions when prefix is empty', () => {
    expect(listMdiIconNamesForCompletion(undefined, 5)).toEqual([])
    expect(listMdiIconNamesForCompletion('', 5)).toEqual([])
  })
})
