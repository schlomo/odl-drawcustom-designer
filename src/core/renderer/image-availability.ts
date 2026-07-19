/**
 * Confirmed-unavailable dlimg image assets — mirrors `fonts.ts`'s
 * `unavailable` map (issue #53) for the same reason: "not marked" alone must
 * still mean "maybe just loading" (the ordinary transient startup window),
 * not an error. Only an explicit `markImageUnavailable(key, message)` entry
 * means "confirmed missing/failed", set by the UI's image loader
 * (`load-asset-images.ts`) once its async resolution settles either way.
 *
 * Unlike fonts, core has no "registry" of successfully decoded images (image
 * decoding is a browser/DOM concern that lives entirely in the UI layer) —
 * this module is only the unavailable-mark side of that pair.
 *
 * Deliberately never cleared wholesale on project-level transitions (Clear
 * all / Load Demo / share-hash import) — independent review question on
 * PR #58, adjudicated as refuted rather than fixed:
 *
 * - None of those three transitions touch the content map at all (`Clear
 *   all` only resets State Simulator mock data, `clear-demo-data.ts`; Load
 *   Demo and hash import only replace `elements`/simulator state — grep for
 *   `setAsset`/`resetContentMap`/`loadAssetsIntoContentMap` finds no call
 *   from any of them). The content map is a single, persistent,
 *   project-independent store; a mark reflects that store's actual state,
 *   not which project happens to be open.
 * - A mark can only go stale (wrong) if the underlying asset's real
 *   availability changes — which only happens via Content Manager
 *   upload/delete. Both bump `assetRevision`, which is a dependency of
 *   DesignerCanvas's loading effect for the CURRENTLY ACTIVE project — and
 *   Content Manager only ever offers a row (so only ever allows an
 *   upload/delete) for a key that project currently references or has
 *   stored. So any action that could invalidate a mark necessarily
 *   re-triggers a fresh load for that exact key before any later project
 *   switch could observe a stale value.
 * - A key marked in one project but never referenced again just sits here
 *   unused (a small, bounded memory footprint per ever-missing URL this
 *   session) — never queried again since `renderDlimg` only looks up a
 *   mark for an element's own `url`, so it cannot leak into unrelated keys.
 *
 * If this reasoning is ever invalidated (e.g. a future feature loads
 * per-project content maps, or lets Content Manager reference arbitrary
 * unstored keys), revisit with an explicit clear on that transition.
 */
const unavailable = new Map<string, string>()

export function markImageUnavailable(key: string, message: string): void {
  unavailable.set(key, message)
}

export function clearImageUnavailable(key: string): void {
  unavailable.delete(key)
}

export function imageUnavailableMessage(key: string): string | undefined {
  return unavailable.get(key)
}

export function clearImageAvailabilityRegistry(): void {
  unavailable.clear()
}
