import { describe, expect, it } from 'vitest'
import { createElementFromTemplate } from '../../../src/ui/lib/create-element-from-template'
import {
  applyBoundsResize,
  isElementDraggable,
  moveElementInArray,
  translateElement,
} from '../../../src/ui/lib/element-geometry'
import { findTopmostElementHit } from '../../../src/ui/lib/canvas-hit-test'
import { snapMoveDelta, snapToGrid } from '../../../src/ui/lib/snap-to-grid'
import {
  getBooleanPropertyValue,
  getEnumPropertyDisplayValue,
  getPropertyEnumValues,
  getPropertyFieldKind,
  isCodeLikeStringValue,
  shouldUseEnumDropdown,
} from '../../../src/ui/lib/property-field-meta'

describe('createElementFromTemplate', () => {
  it('creates a valid rectangle element', () => {
    const element = createElementFromTemplate('rectangle')
    expect(element.type).toBe('rectangle')
    expect(element.x_start).toBe(20)
  })

  it('creates text with x and y so vertical drag works immediately', () => {
    const element = createElementFromTemplate('text')
    expect(element.type).toBe('text')
    if (element.type === 'text') {
      expect(element.x).toBe(0)
      expect(element.y).toBe(0)
    }
  })
})

describe('element geometry', () => {
  it('translates rectangle coordinates', () => {
    const element = createElementFromTemplate('rectangle')
    const moved = translateElement(element, 5, 10)
    expect(moved.type).toBe('rectangle')
    if (moved.type === 'rectangle') {
      expect(moved.x_start).toBe(25)
      expect(moved.y_end).toBe(40)
    }
  })

  it('resizes dlimg bounds', () => {
    const element = createElementFromTemplate('dlimg')
    const resized = applyBoundsResize(element, { x: 0, y: 0, width: 100, height: 50 })
    expect(resized.type).toBe('dlimg')
    if (resized.type === 'dlimg') {
      expect(resized.xsize).toBe(100)
      expect(resized.ysize).toBe(50)
    }
  })

  it('marks template text as not draggable on x', () => {
    const element = {
      ...createElementFromTemplate('text'),
      x: "{{ states('sensor.temp') }}",
    }
    expect(isElementDraggable(element)).toBe(false)
  })

  it('marks templated rectangle coordinates as not draggable', () => {
    const element = {
      ...createElementFromTemplate('rectangle'),
      x_start: "{{ 10 }}",
    }
    expect(isElementDraggable(element)).toBe(false)
  })

  it('materializes omitted text y on vertical translate (spec default 0)', () => {
    const element = { type: 'text' as const, value: 'Hi', x: 10 }
    const moved = translateElement(element, 0, 12)
    expect(moved.type).toBe('text')
    if (moved.type === 'text') {
      expect(moved.x).toBe(10)
      expect(moved.y).toBe(12)
    }
  })

  it('leaves omitted text y unset when only moving horizontally', () => {
    const element = { type: 'text' as const, value: 'Hi', x: 10 }
    const moved = translateElement(element, 5, 0)
    expect(moved.type).toBe('text')
    if (moved.type === 'text') {
      expect(moved.x).toBe(15)
      expect(moved.y).toBeUndefined()
    }
  })

  it('materializes omitted line y coords on vertical translate', () => {
    const element = { type: 'line' as const, x_start: 0, x_end: 100 }
    const moved = translateElement(element, 0, 20)
    expect(moved.type).toBe('line')
    if (moved.type === 'line') {
      expect(moved.y_start).toBe(20)
      expect(moved.y_end).toBe(20)
    }
  })

  it('materializes plot bounds using canvas defaults when omitted', () => {
    const element = {
      type: 'plot' as const,
      data: [{ entity: 'sensor.temperature' }],
    }
    const moved = translateElement(element, 10, 5, { width: 296, height: 128 })
    expect(moved.type).toBe('plot')
    if (moved.type === 'plot') {
      expect(moved.x_start).toBe(10)
      expect(moved.y_start).toBe(5)
      expect(moved.x_end).toBe(306)
      expect(moved.y_end).toBe(133)
    }
  })

  it('does not corrupt templated coordinates when translate is skipped', () => {
    const element = {
      ...createElementFromTemplate('rectangle'),
      x_start: "{{ 10 }}",
      x_end: 100,
      y_start: 20,
      y_end: 80,
    }
    const moved = translateElement(element, 5, 0)
    expect(moved.type).toBe('rectangle')
    if (moved.type === 'rectangle') {
      expect(moved.x_start).toBe('{{ 10 }}')
      expect(Number.isNaN(moved.x_end as number)).toBe(false)
    }
  })

  it('reorders elements in an array', () => {
    const items = ['a', 'b', 'c']
    expect(moveElementInArray(items, 0, 2)).toEqual(['b', 'c', 'a'])
  })
})

describe('snapToGrid', () => {
  it('snaps to the nearest grid line when enabled', () => {
    expect(snapToGrid(14, 10, true)).toBe(10)
    expect(snapToGrid(16, 10, true)).toBe(20)
  })

  it('rounds without snapping when disabled', () => {
    expect(snapToGrid(14.6, 10, false)).toBe(15)
  })
})

describe('findTopmostElementHit', () => {
  it('prefers the front-most element at a point', () => {
    const targets = [
      { index: 0, bounds: { x: 0, y: 0, width: 400, height: 300 } },
      { index: 1, bounds: { x: 100, y: 200, width: 80, height: 24 } },
    ]

    expect(findTopmostElementHit(targets, { x: 120, y: 210 })?.index).toBe(1)
    expect(findTopmostElementHit(targets, { x: 20, y: 20 })?.index).toBe(0)
  })
})

describe('snapMoveDelta', () => {
  it('snaps the selection bounds origin so (0,0) is reachable', () => {
    expect(snapMoveDelta({ x: 23, y: 17 }, -18, -12, 10, true)).toEqual({ dx: -13, dy: -7 })
    expect(snapMoveDelta({ x: 23, y: 17 }, -23, -17, 10, true)).toEqual({ dx: -23, dy: -17 })
  })

  it('rounds to whole pixels when snap is disabled', () => {
    expect(snapMoveDelta({ x: 23, y: 17 }, -18.4, -12.6, 10, false)).toEqual({ dx: -18, dy: -13 })
    expect(snapMoveDelta({ x: 10, y: 6 }, 3.3, 2.4, 10, false)).toEqual({ dx: 3, dy: 2 })
  })
})

describe('property field meta', () => {
  it('classifies known property kinds', () => {
    expect(getPropertyFieldKind('color', 'red')).toBe('enum')
    expect(getPropertyFieldKind('anchor', 'mm')).toBe('enum')
    expect(getPropertyFieldKind('size', 32)).toBe('number')
    expect(getPropertyFieldKind('visible', true)).toBe('boolean')
    expect(getPropertyFieldKind('points', [[0, 0]])).toBe('json')
  })

  it('treats missing visible as true per spec default', () => {
    const text = { type: 'text' as const, value: 'Hi', x: 0 }
    expect(getBooleanPropertyValue(text, 'visible', undefined)).toBe(true)
    expect(getBooleanPropertyValue(text, 'parse_colors', undefined)).toBe(false)
    expect(getBooleanPropertyValue(text, 'truncate', undefined)).toBe(false)
    expect(getBooleanPropertyValue({ type: 'line', x_start: 0, x_end: 1 }, 'dashed', undefined)).toBe(
      false,
    )
  })

  it('shows enum defaults when property is omitted', () => {
    const dlimg = {
      type: 'dlimg' as const,
      url: '/local/x.png',
      x: 0,
      y: 0,
      xsize: 10,
      ysize: 10,
    }
    expect(getEnumPropertyDisplayValue(dlimg, 'resize_method', undefined)).toBe('stretch')
  })

  it('switches enum fields between dropdown and code textarea', () => {
    expect(shouldUseEnumDropdown('resize_method', 'contain', ['stretch', 'contain'])).toBe(true)
    expect(shouldUseEnumDropdown('anchor', 'mm', getPropertyEnumValues('anchor') ?? [])).toBe(true)
    expect(shouldUseEnumDropdown('color', "{{ 'red' if is_state('x','on') else 'black' }}", ['red', 'black'])).toBe(false)
    expect(shouldUseEnumDropdown('fill', '#ff0000', ['red', 'black'])).toBe(false)
    expect(isCodeLikeStringValue('{{ states("x") }}')).toBe(true)
  })

  it('lists pillow anchor presets', () => {
    const anchors = getPropertyEnumValues('anchor')
    expect(anchors).toContain('lt')
    expect(anchors).toContain('mm')
    expect(anchors).toContain('rm')
    expect(anchors?.length).toBe(15)
  })
})
