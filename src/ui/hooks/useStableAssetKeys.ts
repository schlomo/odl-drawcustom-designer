import { useMemo } from 'react'
import type { DrawElement } from '../../core'

/**
 * Collect asset keys from `elements` into a list whose IDENTITY only changes
 * when the collected keys themselves change.
 *
 * The asset key lists here are recomputed from `elements`, so every element
 * edit — every pointermove of a drag — produces a fresh array, and through
 * `displayAssetImages` a fresh `assetImages` Map. That broke the
 * `CanvasElementSlot` memo for EVERY element and re-ran the whole stack's
 * canvas draw effects (opentype glyph draw plus the per-pixel palette
 * quantize pass) once per move, defeating the `frozenElements` snapshot whose
 * entire job is to hold the base layers still during a drag.
 *
 * The signal these consumers actually want is "the set of referenced assets
 * changed", not "some element changed" — this restores that weaker signal.
 *
 * The key set is encoded to a `signature` string via `JSON.stringify` so two
 * different key sets can never alias to the same signature (a dlimg `url` is
 * an unconstrained string — pasted YAML, a share-hash import, or a template
 * result can embed any character, including separators a naive join would
 * pick). `JSON.parse` reconstructs the array only when the signature's VALUE
 * changes between renders — the primitive-string dependency lets the inner
 * `useMemo` skip recomputation (and keep returning the previous array
 * reference) even though `collect(elements)` allocates a new array every
 * render.
 */
export function useStableAssetKeys(
  elements: DrawElement[],
  collect: (elements: readonly DrawElement[]) => string[],
): string[] {
  const signature = useMemo(() => JSON.stringify(collect(elements)), [collect, elements])
  return useMemo(() => JSON.parse(signature) as string[], [signature])
}
