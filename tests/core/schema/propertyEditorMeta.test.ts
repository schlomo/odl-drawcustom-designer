import { describe, expect, it } from 'vitest'
import {
  elementGeometryLocked,
  elementPositionLocked,
  getPropertyEditorShape,
  getPositionLockProperties,
  isPropertyTemplated,
  resolveEditorMode,
} from '../../../src/core/schema/propertyEditorMeta'

describe('propertyEditorMeta', () => {
  it('resolves editor mode from stored value and shape', () => {
    expect(resolveEditorMode(42, 'number')).toBe('scalar')
    expect(resolveEditorMode('{{ 1 }}', 'number')).toBe('template')
    expect(resolveEditorMode('{{ [] | tojson }}', 'json')).toBe('template')
    expect(resolveEditorMode([{ entity: 'sensor.a' }], 'json')).toBe('scalar')
  })

  it('maps property shapes for representative fields', () => {
    expect(getPropertyEditorShape('text', 'x')).toBe('coordinate')
    expect(getPropertyEditorShape('text', 'size')).toBe('number')
    expect(getPropertyEditorShape('text', 'visible')).toBe('boolean')
    expect(getPropertyEditorShape('text', 'color')).toBe('color')
    expect(getPropertyEditorShape('polygon', 'points')).toBe('json')
    expect(getPropertyEditorShape('progress_bar', 'progress')).toBe('number')
  })

  it('detects templated geometry properties', () => {
    const element = {
      type: 'text' as const,
      value: 'Hi',
      x: "{{ states('sensor.x') }}",
      y: 0,
    }
    expect(isPropertyTemplated(element, 'x')).toBe(true)
    expect(isPropertyTemplated(element, 'y')).toBe(false)
    expect(elementGeometryLocked(element)).toBe(true)
  })

  it('locks geometry when polygon points are templated', () => {
    const element = {
      type: 'polygon' as const,
      points: "{{ states('sensor.points') | from_json }}",
    }
    expect(isPropertyTemplated(element, 'points')).toBe(true)
    expect(elementGeometryLocked(element)).toBe(true)
  })

  it('does not lock progress_bar geometry when only progress is templated', () => {
    const element = {
      type: 'progress_bar' as const,
      x_start: 60,
      y_start: 360,
      x_end: 405,
      y_end: 398,
      progress: "{{ (now().strftime('%S')/60*100) | round(0) }}",
    }
    expect(isPropertyTemplated(element, 'progress')).toBe(true)
    expect(elementPositionLocked(element)).toBe(false)
  })

  it('locks progress_bar geometry when bounds are templated', () => {
    const element = {
      type: 'progress_bar' as const,
      x_start: '{{ 60 }}',
      y_start: 360,
      x_end: 405,
      y_end: 398,
      progress: 50,
    }
    expect(elementPositionLocked(element)).toBe(true)
  })

  it('does not lock arc move when only angles are templated', () => {
    const element = {
      type: 'arc' as const,
      x: 100,
      y: 100,
      radius: 40,
      start_angle: 0,
      end_angle: "{{ states('sensor.end') | float(90) }}",
    }
    expect(getPositionLockProperties(element)).toEqual(['x', 'y'])
    expect(elementPositionLocked(element)).toBe(false)
  })

  it('does not lock icon move when only size is templated', () => {
    const element = {
      type: 'icon' as const,
      value: 'home',
      x: 10,
      y: 20,
      size: '{{ 48 }}',
    }
    expect(elementPositionLocked(element)).toBe(false)
  })

  it('does not lock plot move when only data is templated', () => {
    const element = {
      type: 'plot' as const,
      x_start: 0,
      y_start: 0,
      x_end: 100,
      y_end: 50,
      data: "{{ states('sensor.plot') | from_json }}",
    }
    expect(elementPositionLocked(element)).toBe(false)
  })

  it('does not lock rectangle_pattern move when repeat/size fields are templated', () => {
    const element = {
      type: 'rectangle_pattern' as const,
      x_start: 0,
      y_start: 0,
      x_size: '{{ 10 }}',
      y_size: 10,
      x_offset: 0,
      y_offset: 0,
      x_repeat: '{{ 3 }}',
      y_repeat: 3,
    }
    expect(elementPositionLocked(element)).toBe(false)
  })
})
