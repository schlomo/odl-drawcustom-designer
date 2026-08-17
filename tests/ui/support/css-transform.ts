import { expect } from 'vitest'

/**
 * Minimal CSS `transform` reader for tests (jsdom has no `DOMMatrix`).
 *
 * Exists so an "the paper is never turned" assertion can read the *geometry* a
 * transform actually produces instead of matching its source text: a literal
 * `scale(0.5)` comparison passes a half turn written as `scale(-0.5)` and says
 * nothing about what the user sees (issue #139 review, F4/F5).
 *
 * Supports the function forms this app emits or could plausibly regress into —
 * `scale`, `scaleX`, `scaleY`, `rotate`, `translate` and `matrix` — composed
 * left to right, as CSS does.
 */

/** The linear part of a 2D affine transform, plus its translation. */
export interface Transform2D {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

const IDENTITY: Transform2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

function multiply(left: Transform2D, right: Transform2D): Transform2D {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  }
}

function toRadians(angle: string): number {
  const value = parseFloat(angle)
  if (angle.trim().endsWith('rad')) {
    return value
  }
  if (angle.trim().endsWith('turn')) {
    return value * 2 * Math.PI
  }
  return (value * Math.PI) / 180
}

function functionToMatrix(name: string, args: string[]): Transform2D {
  const numbers = args.map((arg) => parseFloat(arg))
  switch (name) {
    case 'scale':
      return { ...IDENTITY, a: numbers[0]!, d: numbers[1] ?? numbers[0]! }
    case 'scaleX':
      return { ...IDENTITY, a: numbers[0]! }
    case 'scaleY':
      return { ...IDENTITY, d: numbers[0]! }
    case 'rotate': {
      const radians = toRadians(args[0]!)
      const cos = Math.cos(radians)
      const sin = Math.sin(radians)
      return { ...IDENTITY, a: cos, b: sin, c: -sin, d: cos }
    }
    case 'translate':
      return { ...IDENTITY, e: numbers[0]!, f: numbers[1] ?? 0 }
    case 'matrix':
      return {
        a: numbers[0]!,
        b: numbers[1]!,
        c: numbers[2]!,
        d: numbers[3]!,
        e: numbers[4]!,
        f: numbers[5]!,
      }
    default:
      throw new Error(`unsupported CSS transform function: ${name}()`)
  }
}

export function parseCssTransform(transform: string): Transform2D {
  const value = transform.trim()
  if (value === '' || value === 'none') {
    return IDENTITY
  }

  let matrix = IDENTITY
  const pattern = /([a-zA-Z]+)\(([^)]*)\)/g
  let match = pattern.exec(value)
  if (match == null) {
    throw new Error(`unparseable CSS transform: ${JSON.stringify(transform)}`)
  }
  while (match != null) {
    matrix = multiply(matrix, functionToMatrix(match[1]!, match[2]!.split(',')))
    match = pattern.exec(value)
  }
  return matrix
}

/** Where a point in the transformed element's own coordinates lands on screen. */
export function applyCssTransform(
  matrix: Transform2D,
  x: number,
  y: number,
): { x: number; y: number } {
  return {
    x: matrix.a * x + matrix.c * y + matrix.e,
    y: matrix.b * x + matrix.d * y + matrix.f,
  }
}

/**
 * Assert a transform is a **plain, upright magnification**: no rotation, no
 * flip, no shear (issue #139). A quarter turn shows up as a non-zero `b`/`c`; a
 * half turn — the case a "no `rotate(` in the string" check sails straight past
 * — shows up as negative `a`/`d`.
 */
export function expectUprightScale(transform: string, expectedScale?: number): void {
  const matrix = parseCssTransform(transform)
  const detail = `transform ${JSON.stringify(transform)}`
  expect(matrix.b, `${detail} must not shear or turn`).toBeCloseTo(0, 10)
  expect(matrix.c, `${detail} must not shear or turn`).toBeCloseTo(0, 10)
  expect(matrix.a, `${detail} must magnify upright, not flip`).toBeGreaterThan(0)
  expect(matrix.d, `${detail} must magnify uniformly`).toBeCloseTo(matrix.a, 10)
  if (expectedScale !== undefined) {
    expect(matrix.a, `${detail} must scale by ${expectedScale}`).toBeCloseTo(expectedScale, 10)
  }
}
