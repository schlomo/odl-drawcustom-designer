/**
 * Typed wrapper around `bidi-js` (issue #122 review finding, MAJOR 1).
 *
 * `bidi-js` ships no TypeScript declarations of its own and has none on
 * DefinitelyTyped, so this repo used to carry an ambient
 * `declare module 'bidi-js'` shim (`src/bidi-js.d.ts`) that every TS program
 * needing `bidi-text.ts` had to include. The library-declaration build
 * (`vite.lib.config.ts`) needed that shim too — and because ambient module
 * augmentations aren't scoped to one program, `bundleTypes` copied it
 * verbatim into the PUBLIC `odl-drawcustom-designer.d.ts`. That leaked two
 * ways for a consumer: a real `bidi-js` install plus `skipLibCheck: false`
 * hits a hard `TS2665` (the same ambient module declared twice, once by us
 * and once — if it ever ships real types — by the package itself), and even
 * without a collision our fake interfaces would silently merge into a
 * consumer's view of a module they never imported.
 *
 * Fix: do the untyped import exactly ONCE, here, with a single localized
 * cast — no ambient module declaration anywhere in the program. Every other
 * module imports `createBidi()` instead of `bidi-js` directly.
 */

// @ts-expect-error bidi-js ships no type declarations; the shape below is hand-verified against its documented runtime API.
import bidiFactoryUntyped from 'bidi-js'

/** The shape of bidi-js's embedding-levels result — verified against its documented API. */
export interface BidiEmbeddingLevels {
  paragraphs: Array<{ level: number }>
}

/** The subset of bidi-js's returned instance this codebase uses. */
export interface Bidi {
  getEmbeddingLevels(text: string): BidiEmbeddingLevels
  getReorderedString(text: string, embedding: BidiEmbeddingLevels): string
}

const bidiFactory = bidiFactoryUntyped as () => Bidi

/** A fresh, typed `bidi-js` instance. */
export function createBidi(): Bidi {
  return bidiFactory()
}
