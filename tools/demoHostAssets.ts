import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

/**
 * The demo host page (issue #138) serves a font "out of its own font
 * directory", the way an integration host does. That font is just a copy of the
 * bundled `rbm.ttf` — so it is emitted into the library output at build time
 * instead of being committed a second time under `demo/assets/`: a 165 KB
 * binary duplicated in git is a duplicate to keep in sync forever, and the
 * demo's whole point is that the *designer* has never seen the file.
 *
 * `demo/` is the library build's `publicDir`, so this lands next to the demo's
 * own static assets in `dist-lib/assets/` (and, via `tools/assembleSite.ts`,
 * in the deployed `/embed/assets/`).
 */
export const DEMO_HOST_FONT_PATH = 'assets/demo-host-font.ttf'

/** Source of those bytes — the designer's own bundled font, read once at build. */
const DEMO_HOST_FONT_SOURCE = 'src/assets/fonts/rbm.ttf'

export function demoHostAssets(): Plugin {
  return {
    name: 'odl-demo-host-assets',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: DEMO_HOST_FONT_PATH,
        source: readFileSync(DEMO_HOST_FONT_SOURCE),
      })
    },
  }
}
