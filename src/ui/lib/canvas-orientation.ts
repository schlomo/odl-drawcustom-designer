/**
 * Orientation of the logical drawing surface (issue #139).
 *
 * A display has **two dimensions**; its rotation says which of them is the
 * width. The two are therefore one indivisible fact — an *oriented surface* —
 * and this module is the only place that turns one into another.
 */

export type CanvasRotation = 0 | 90 | 180 | 270

/**
 * Dimensions **and the rotation they are expressed in**, together.
 *
 * Every adoption of a display (mount seed, target pick, single-target push,
 * re-push re-apply, re-lock) stores both in the same object, so the rotation a
 * later re-orientation measures *from* is always the one those dimensions
 * arrived with. Taking the pair as a single argument is what makes mixing a
 * rotation from one adoption with dimensions from another impossible to write
 * (issue #139 review, maintainer ruling 2026-08-16).
 */
export interface OrientedSurface {
  width: number
  height: number
  rotation: CanvasRotation
}

export function isQuarterTurn(rotation: CanvasRotation): boolean {
  return rotation === 90 || rotation === 270
}

/**
 * The same surface held at a different orientation.
 *
 * Moving between an upright rotation (0/180) and a quarter turn (90/270) swaps
 * the two dimensions; any other change leaves them alone. This is the *only*
 * thing rotation does to the canvas — nothing downstream turns a stage or a
 * raster.
 */
export function reorientCanvasSize(
  surface: OrientedSurface,
  to: CanvasRotation,
): { width: number; height: number } {
  return isQuarterTurn(surface.rotation) === isQuarterTurn(to)
    ? { width: surface.width, height: surface.height }
    : { width: surface.height, height: surface.width }
}
