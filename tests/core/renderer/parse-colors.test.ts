import { describe, expect, it } from 'vitest'
import {
  parseColorMarkup,
  stripColorMarkup,
} from '../../../src/core/renderer/parse-colors'

describe('parseColorMarkup', () => {
  it('returns a single default segment when markup is disabled implicitly', () => {
    expect(parseColorMarkup('plain text', 'black')).toEqual([{ text: 'plain text', color: 'black' }])
  })

  it('parses simple color blocks', () => {
    expect(parseColorMarkup('[red]25°C[/red]', 'black')).toEqual([{ text: '25°C', color: 'red' }])
  })

  it('parses multiple segments with literal gaps', () => {
    expect(parseColorMarkup('[black]Current[/black] temp: [accent]25°C[/accent]', 'black')).toEqual([
      { text: 'Current temp: ', color: 'black' },
      { text: '25°C', color: 'accent' },
    ])
  })

  it('merges adjacent segments with the same color', () => {
    expect(parseColorMarkup('[black]A[/black][black]B[/black]', 'white')).toEqual([
      { text: 'AB', color: 'black' },
    ])
  })

  it('preserves newlines inside and between segments', () => {
    expect(parseColorMarkup('Line 1\n[red]Red Line 2[/red]', 'black')).toEqual([
      { text: 'Line 1\n', color: 'black' },
      { text: 'Red Line 2', color: 'red' },
    ])
  })

  it('treats unmatched markup as literal text', () => {
    expect(parseColorMarkup('[red]open', 'black')).toEqual([{ text: '[red]open', color: 'black' }])
    expect(parseColorMarkup('[red]ok[/blue]', 'black')).toEqual([
      { text: '[red]ok[/blue]', color: 'black' },
    ])
  })

  it('supports template-resolved color names from fixtures', () => {
    expect(parseColorMarkup('[red]open[/red]', 'black')).toEqual([{ text: 'open', color: 'red' }])
    expect(parseColorMarkup('[black]closed[/black]', 'black')).toEqual([
      { text: 'closed', color: 'black' },
    ])
  })
})

describe('stripColorMarkup', () => {
  it('removes tags while keeping inner text', () => {
    expect(stripColorMarkup('[black]Current[/black] temp: [accent]25°C[/accent]')).toBe(
      'Current temp: 25°C',
    )
  })

  it('leaves literal unmatched brackets', () => {
    expect(stripColorMarkup('[red]open')).toBe('[red]open')
  })
})
