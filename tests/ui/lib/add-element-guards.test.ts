import { describe, expect, it } from 'vitest'
import {
  canAddElementType,
  DEBUG_GRID_ONCE_MESSAGE,
  elementsWithAddedElement,
  hasDebugGrid,
} from '../../../src/ui/lib/add-element-guards'

describe('add element guards', () => {
  it('detects an existing debug grid', () => {
    const elements = [{ type: 'debug_grid' as const }, { type: 'text' as const, value: 'Hi', x: 0 }]
    expect(hasDebugGrid(elements)).toBe(true)
    expect(canAddElementType(elements, 'debug_grid')).toBe(false)
    expect(canAddElementType(elements, 'text')).toBe(true)
  })

  it('allows the first debug grid', () => {
    expect(canAddElementType([], 'debug_grid')).toBe(true)
  })

  it('documents the refusal message', () => {
    expect(DEBUG_GRID_ONCE_MESSAGE).toMatch(/debug grid/i)
  })

  it('inserts debug grid at the back and other types on top', () => {
    const text = { type: 'text' as const, value: 'Hi', x: 0, y: 0 }
    const grid = { type: 'debug_grid' as const }

    const back = elementsWithAddedElement([text], grid)
    expect(back.index).toBe(0)
    expect(back.nextElements.map((element) => element.type)).toEqual(['debug_grid', 'text'])

    const front = elementsWithAddedElement([text], { type: 'rectangle', x: 0, y: 0, width: 10, height: 10 })
    expect(front.index).toBe(1)
    expect(front.nextElements.map((element) => element.type)).toEqual(['text', 'rectangle'])
  })
})
