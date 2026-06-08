import { describe, expect, it } from 'vitest'
import { nudgeWhenSelected } from '../../../src/ui/lib/canvas-keyboard'
import { createElementFromTemplate } from '../../../src/ui/lib/create-element-from-template'
import {
  applyAxisDelta,
  applyBoundsResize,
  applyLineEndpoint,
  applySeSizeResize,
  getCanvasResizeHandles,
  getInteractiveResizeHandles,
  isElementDraggable,
  isInteractiveCoordinate,
  moveElementInArray,
  resizeBoundsWithHandle,
  supportsSeSizeResize,
  translateElement,
} from '../../../src/ui/lib/element-geometry'
import { createQrModuleGrid, qrRenderedSize } from '../../../src/core/renderer/qr-modules'
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

  it('resizes icon size from the southeast handle bounds', () => {
    const element = {
      type: 'icon' as const,
      value: 'home',
      x: 10,
      y: 20,
      size: 24,
      anchor: 'la',
    }
    expect(supportsSeSizeResize(element)).toBe(true)
    const resized = applyBoundsResize(element, { x: 10, y: 20, width: 48, height: 48 })
    expect(resized.type).toBe('icon')
    if (resized.type === 'icon') {
      expect(resized.size).toBe(48)
      expect(resized.x).toBe(10)
      expect(resized.y).toBe(20)
    }
  })

  it('keeps icon anchor fixed when resizing from the southeast handle', () => {
    const element = {
      type: 'icon' as const,
      value: 'home',
      x: 100,
      y: 100,
      size: 40,
      anchor: 'mm',
    }
    const startBounds = { x: 80, y: 80, width: 40, height: 40 }
    const resized = applySeSizeResize(element, startBounds, 130, 130)
    expect(resized.type).toBe('icon')
    if (resized.type === 'icon') {
      expect(resized.size).toBe(60)
      expect(resized.x).toBe(100)
      expect(resized.y).toBe(100)
    }
  })

  it('shows the east handle for lm-anchored icons', () => {
    const element = {
      type: 'icon' as const,
      value: 'home',
      x: 10,
      y: 100,
      size: 40,
      anchor: 'lm',
    }
    expect(getCanvasResizeHandles(element)).toEqual([{ handle: 'e', interactive: true }])
  })

  it('shows the northwest handle for rb-anchored icons', () => {
    const element = {
      type: 'icon' as const,
      value: 'home',
      x: 100,
      y: 100,
      size: 40,
      anchor: 'rb',
    }
    expect(getCanvasResizeHandles(element)).toEqual([{ handle: 'nw', interactive: true }])
  })

  it('resizes rb-anchored icons from the northwest without moving the anchor', () => {
    const element = {
      type: 'icon' as const,
      value: 'home',
      x: 100,
      y: 100,
      size: 40,
      anchor: 'rb',
    }
    const startBounds = { x: 60, y: 60, width: 40, height: 40 }
    const resized = applySeSizeResize(element, startBounds, 50, 50, 'nw')
    expect(resized.type).toBe('icon')
    if (resized.type === 'icon') {
      expect(resized.size).toBe(50)
      expect(resized.x).toBe(100)
      expect(resized.y).toBe(100)
    }
  })

  it('resizes icon_sequence size from bounds height', () => {
    const element = {
      type: 'icon_sequence' as const,
      x: 0,
      y: 0,
      icons: ['home', 'home'],
      size: 20,
      spacing: 8,
      direction: 'right' as const,
    }
    expect(supportsSeSizeResize(element)).toBe(true)
    const resized = applyBoundsResize(element, { x: 0, y: 0, width: 100, height: 36 })
    expect(resized.type).toBe('icon_sequence')
    if (resized.type === 'icon_sequence') {
      expect(resized.size).toBe(36)
    }
  })

  it('resizes qrcode boxsize from the southeast handle bounds', () => {
    const element = {
      type: 'qrcode' as const,
      data: 'https://www.example.com',
      x: 100,
      y: 50,
      boxsize: 2,
      border: 1,
    }
    expect(supportsSeSizeResize(element)).toBe(true)

    const { modules } = createQrModuleGrid(element.data)
    const startSize = qrRenderedSize(modules, element.boxsize, element.border)
    const startBounds = { x: 100, y: 50, width: startSize, height: startSize }
    const resized = applySeSizeResize(element, startBounds, 100 + startSize + 23, 50 + startSize + 23)

    expect(resized.type).toBe('qrcode')
    if (resized.type === 'qrcode') {
      expect(resized.boxsize).toBe(3)
      expect(resized.x).toBe(100)
      expect(resized.y).toBe(50)
    }
  })

  it('resizes circle radius from the southeast handle while keeping center fixed', () => {
    const element = {
      type: 'circle' as const,
      x: 100,
      y: 100,
      radius: 20,
    }
    expect(supportsSeSizeResize(element)).toBe(true)

    const startBounds = { x: 80, y: 80, width: 40, height: 40 }
    const resized = applySeSizeResize(element, startBounds, 140, 140)

    expect(resized.type).toBe('circle')
    if (resized.type === 'circle') {
      expect(resized.radius).toBe(40)
      expect(resized.x).toBe(100)
      expect(resized.y).toBe(100)
    }
  })

  it('resizes vertical icon_sequence from bounds width and height', () => {
    const element = {
      type: 'icon_sequence' as const,
      x: 0,
      y: 0,
      icons: ['home', 'home', 'home'],
      size: 20,
      spacing: 8,
      direction: 'down' as const,
    }
    const resized = applyBoundsResize(element, { x: 0, y: 0, width: 36, height: 120 })
    expect(resized.type).toBe('icon_sequence')
    if (resized.type === 'icon_sequence') {
      expect(resized.size).toBe(36)
    }
  })

  it('treats numeric string coordinates as interactive', () => {
    expect(isInteractiveCoordinate('50')).toBe(true)
    const element = { type: 'text' as const, value: 'Hi', x: '50', y: '20' }
    expect(isElementDraggable(element)).toBe(true)
    const moved = translateElement(element, 5, 0)
    if (moved.type === 'text') {
      expect(moved.x).toBe(55)
    }
  })

  it('allows drag for percentage coordinates when not templated', () => {
    const element = { type: 'text' as const, value: 'Hi', x: '50%', y: '25%' }
    expect(isElementDraggable(element)).toBe(true)
    const moved = translateElement(element, 10, 5, { width: 400, height: 200 })
    if (moved.type === 'text') {
      expect(moved.x).toBe(210)
      expect(moved.y).toBe(55)
    }
    expect(applyAxisDelta('50%', 10, undefined, 400)).toBe(210)
  })

  it('marks template text as not draggable on x', () => {
    const element = {
      ...createElementFromTemplate('text'),
      x: "{{ states('sensor.temp') }}",
    }
    expect(isElementDraggable(element)).toBe(false)
  })

  it('shows a disabled southeast handle when icon size is templated', () => {
    const element = {
      type: 'icon' as const,
      value: 'home',
      x: 10,
      y: 20,
      size: "{{ 48 if is_state('input_boolean.big', 'on') else 24 }}",
    }
    expect(isElementDraggable(element)).toBe(true)
    expect(supportsSeSizeResize(element)).toBe(false)
    expect(getCanvasResizeHandles(element)).toEqual([{ handle: 'se', interactive: false }])
    expect(getInteractiveResizeHandles(element)).toEqual([])
  })

  it('allows icon resize when size is a numeric literal', () => {
    const element = {
      type: 'icon' as const,
      value: 'home',
      x: 10,
      y: 20,
      size: 48,
    }
    expect(getCanvasResizeHandles(element)).toEqual([{ handle: 'se', interactive: true }])
    expect(supportsSeSizeResize(element)).toBe(true)
  })

  it('shows disabled box handles when rectangle coordinates are templated', () => {
    const element = {
      ...createElementFromTemplate('rectangle'),
      x_start: '{{ 10 }}',
    }
    const handles = getCanvasResizeHandles(element)
    expect(handles.length).toBe(8)
    expect(handles.every((entry) => !entry.interactive)).toBe(true)
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

  it('returns the same array when toIndex is out of bounds', () => {
    const items = ['a', 'b', 'c']
    expect(moveElementInArray(items, 0, 3)).toBe(items)
    expect(moveElementInArray(items, 1, 5)).toBe(items)
  })

  it('drags a line start endpoint to new coordinates', () => {
    const element = {
      type: 'line' as const,
      x_start: 10,
      y_start: 20,
      x_end: 100,
      y_end: 80,
    }
    const updated = applyLineEndpoint(element, 'start', 30, 40)
    expect(updated).toEqual({
      type: 'line',
      x_start: 30,
      y_start: 40,
      x_end: 100,
      y_end: 80,
    })
  })

  it('drags a line end endpoint to new coordinates', () => {
    const element = {
      type: 'line' as const,
      x_start: 10,
      y_start: 20,
      x_end: 100,
      y_end: 80,
    }
    const updated = applyLineEndpoint(element, 'end', 150, 90)
    expect(updated).toEqual({
      type: 'line',
      x_start: 10,
      y_start: 20,
      x_end: 150,
      y_end: 90,
    })
  })

  it('resizes a rectangle via the southeast handle bounds', () => {
    const element = createElementFromTemplate('rectangle')
    const startBounds = { x: 20, y: 30, width: 80, height: 50 }
    const nextBounds = resizeBoundsWithHandle(startBounds, 'se', 120, 100)
    const resized = applyBoundsResize(element, nextBounds)
    expect(resized.type).toBe('rectangle')
    if (resized.type === 'rectangle') {
      expect(resized.x_start).toBe(20)
      expect(resized.y_start).toBe(30)
      expect(resized.x_end).toBe(120)
      expect(resized.y_end).toBe(100)
    }
  })
})

describe('keyboard nudge guard', () => {
  it('does not call nudge when nothing is selected', () => {
    let called = false
    nudgeWhenSelected(null, () => {
      called = true
    }, 5, 0)
    expect(called).toBe(false)
  })

  it('calls nudge with the selected index', () => {
    let nudgedIndex: number | null = null
    nudgeWhenSelected(2, (index, dx, dy) => {
      nudgedIndex = index
      expect(dx).toBe(5)
      expect(dy).toBe(-3)
    }, 5, -3)
    expect(nudgedIndex).toBe(2)
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
    expect(shouldUseEnumDropdown('fill', null, ['red', 'black', 'none'])).toBe(true)
    expect(shouldUseEnumDropdown('corners', undefined, ['all'])).toBe(true)
    expect(getPropertyFieldKind('corners', 'all')).toBe('enum')
    expect(getPropertyFieldKind('corners', 'top_left,top_right')).toBe('enum')
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
