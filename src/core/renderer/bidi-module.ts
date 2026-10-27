/**
 * Typed wrapper around `bidi-js` (issue #122 review finding, MAJOR 1).
 *
 * `bidi-js` 1.0.x shipped no TypeScript declarations, so this repo used to
 * carry an ambient `declare module 'bidi-js'` shim (`src/bidi-js.d.ts`) that
 * every TS program needing `bidi-text.ts` had to include. The
 * library-declaration build (`vite.lib.config.ts`) needed that shim too — and
 * because ambient module augmentations aren't scoped to one program,
 * `bundleTypes` copied it verbatim into the PUBLIC
 * `odl-drawcustom-designer.d.ts`. That leaked two ways for a consumer: a real
 * `bidi-js` install plus `skipLibCheck: false` hits a hard `TS2665` (the same
 * ambient module declared twice), and even without a collision our fake
 * interfaces would silently merge into a consumer's view of a module they
 * never imported.
 *
 * `bidi-js` 1.1.0 ships its own declarations, but the wrapper stays: it keeps
 * the import in exactly ONE place and narrows to the local interfaces below,
 * so the public `odl-drawcustom-designer.d.ts` never references the package's
 * types (the library bundle inlines bidi-js — consumers don't install it).
 * Every other module imports `createBidi()` instead of `bidi-js` directly.
 */

import bidiFactoryUpstream from 'bidi-js'

/** The shape of bidi-js's embedding-levels result — verified against its documented API. */
export interface BidiEmbeddingLevels {
  paragraphs: Array<{ level: number }>
}

/** The subset of bidi-js's returned instance this codebase uses. */
export interface Bidi {
  getEmbeddingLevels(text: string): BidiEmbeddingLevels
  getReorderedString(text: string, embedding: BidiEmbeddingLevels): string
}

const bidiFactory = bidiFactoryUpstream as () => Bidi

/** A fresh, typed `bidi-js` instance. */
export function createBidi(): Bidi {
  return bidiFactory()
}
