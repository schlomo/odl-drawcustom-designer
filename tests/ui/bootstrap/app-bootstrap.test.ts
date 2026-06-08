import { beforeEach, describe, expect, it } from 'vitest'
import { DRAW_ELEMENT_TYPES, validatePayload } from '../../../src/core'
import { SAMPLE_CANVAS, SAMPLE_ELEMENTS } from '../../../src/ui/data/sample-elements'
import {
  buildAppBootstrap,
  resolveCanvasForLoad,
  resolveElementsForLoad,
} from '../../../src/ui/bootstrap/appBootstrap'
import { SHOWCASE_BUNDLED_SUPPRESSED_STORAGE_KEY } from '../../../src/ui/preferences/keys'
import { suppressShowcaseBundled } from '../../../src/ui/preferences/showcaseAsset'
import type { SessionSnapshot } from '../../../src/storage'

function sessionWithElements(elements: SessionSnapshot['elements']): SessionSnapshot {
  return {
    id: 'current',
    name: 'Saved',
    canvas: {
      width: 400,
      height: 300,
      rotation: 0,
      accentMode: 'red',
      previewDitherMode: 0,
    },
    elements,
    updatedAt: 1,
  }
}

describe('app bootstrap', () => {
  it('restores sample dashboard when session is missing', () => {
    expect(resolveElementsForLoad(null)).toBe(SAMPLE_ELEMENTS)
    expect(resolveCanvasForLoad(null)).toBe(SAMPLE_CANVAS)
    expect(buildAppBootstrap(null, {}).elements).toBe(SAMPLE_ELEMENTS)
    expect(buildAppBootstrap(null, {}).canvas).toBe(SAMPLE_CANVAS)
  })

  it('restores sample dashboard when session has no elements', () => {
    const session = sessionWithElements([])
    expect(resolveElementsForLoad(session)).toBe(SAMPLE_ELEMENTS)
    expect(resolveCanvasForLoad(session)).toBe(SAMPLE_CANVAS)
    expect(buildAppBootstrap(session, {}).elements).toBe(SAMPLE_ELEMENTS)
    expect(buildAppBootstrap(session, {}).canvas).toBe(SAMPLE_CANVAS)
  })

  it('keeps non-empty saved session elements and canvas', () => {
    const elements = [{ type: 'text' as const, value: 'Hello', x: 0, y: 0 }]
    const session = sessionWithElements(elements)
    expect(resolveElementsForLoad(session)).toEqual(elements)
    expect(resolveCanvasForLoad(session)).toEqual(session.canvas)
    expect(buildAppBootstrap(session, {}).elements).toEqual(elements)
    expect(buildAppBootstrap(session, {}).canvas).toEqual(session.canvas)
  })
})

describe('sample showcase dashboard', () => {
  beforeEach(() => {
    localStorage.removeItem(SHOWCASE_BUNDLED_SUPPRESSED_STORAGE_KEY)
  })

  it('includes every supported element type', () => {
    const types = new Set(SAMPLE_ELEMENTS.map((element) => element.type))
    expect([...types].sort()).toEqual([...DRAW_ELEMENT_TYPES].sort())
  })

  it('validates against the core schema', () => {
    expect(validatePayload(SAMPLE_ELEMENTS).success).toBe(true)
  })
})

describe('showcase bundled demo reset', () => {
  beforeEach(() => {
    localStorage.removeItem(SHOWCASE_BUNDLED_SUPPRESSED_STORAGE_KEY)
  })

  it('re-enables the bundled demo image when loading the sample dashboard', () => {
    suppressShowcaseBundled()
    buildAppBootstrap(null, {})
    expect(localStorage.getItem(SHOWCASE_BUNDLED_SUPPRESSED_STORAGE_KEY)).toBeNull()
  })

  it('keeps bundled demo suppressed when restoring a saved session', () => {
    suppressShowcaseBundled()
    const session = sessionWithElements([{ type: 'text' as const, value: 'Saved', x: 0, y: 0 }])
    buildAppBootstrap(session, {})
    expect(localStorage.getItem(SHOWCASE_BUNDLED_SUPPRESSED_STORAGE_KEY)).toBe('1')
  })

  it('re-enables bundled demo after clear-all reload via empty session', () => {
    suppressShowcaseBundled()
    buildAppBootstrap(sessionWithElements([]), {})
    expect(localStorage.getItem(SHOWCASE_BUNDLED_SUPPRESSED_STORAGE_KEY)).toBeNull()
  })
})
