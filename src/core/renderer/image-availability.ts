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
