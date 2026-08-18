import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import dts from 'vite-plugin-dts'
import { buildDefines } from './tools/buildDefines.ts'
import { demoHostAssets } from './tools/demoHostAssets.ts'
import { assertSoundDtsArtifacts } from './tools/dtsArtifactChecks.ts'
import { assertNoDtsDiagnostics } from './tools/dtsDiagnostics.ts'

/**
 * Library build (issue #20): bundles src/embed/index.ts into ONE
 * self-contained ESM file — React included, all assets inlined (Vite library
 * mode always inlines assets), stylesheet compiled into the bundle via the
 * `?inline` import in src/embed/mount.tsx. Hosts (e.g. the OpenDisplay HA
 * integration custom panel) import it without providing any dependencies.
 *
 * The GH Pages app build (vite.config.ts) is untouched; run this one with
 * `npm run build:lib`. Never loaded by Vitest, but the shared defines keep
 * the `vitest:` guard anyway (AGENTS.md, "Build-time defines").
 *
 * Declarations (issue #122): `vite-plugin-dts` with `bundleTypes: true` rolls
 * every type reachable from `src/embed/index.ts`'s public exports (via
 * `@microsoft/api-extractor`) into ONE `odl-drawcustom-designer.d.ts` next to
 * the ESM — same single-artifact ethos as the JS, no `@types` package, no
 * per-module `.d.ts` sprawl. Picked over `dts-bundle-generator` because it
 * needs zero extra build step or config file: it hooks into this existing
 * `vite build` invocation and reuses the project's own tsconfig, where
 * `dts-bundle-generator` would need its own standalone script + config
 * chained after `build:lib` in package.json (see the PR body for the full
 * comparison).
 *
 * **What `include` actually controls (corrected 2026-08-18, review finding
 * MINOR 6 — the original comment here was wrong):** `include` is narrowed to
 * `src/embed` + `src/core` + `vite-env.d.ts` (for `import.meta.env`), but
 * this does NOT stop `src/ui` from being type-checked. `mount.tsx` imports
 * the whole React shell (`../ui/App`), so the plugin's TypeScript program
 * still resolves and type-checks every file reachable through that import —
 * `include` only decides which files are *root/entry* files (and therefore
 * which ambient `.d.ts` shims join the program at all; dropping
 * `vite-env.d.ts` here would make `import.meta.env` unresolvable in
 * `src/core/buildInfo.ts`).
 *
 * The practical consequence: **declaration-emit-only diagnostics
 * (`getDeclarationDiagnostics()` — TS4094, TS2742, TS4023, …) anywhere in the
 * reachable graph, including `src/ui`, gate `build:lib`**, even though
 * `npm test`/`npm run lint`/`npm run build` (all `noEmit: true`) never run
 * declaration emission and stay silent on the exact same code. This is how a
 * real, pre-existing bug in `src/ui/editor/yamlTemplatePreview.ts` (an
 * anonymous class with a private member as an inferred return type) surfaced
 * only once this plugin started emitting real declarations — see that file's
 * `showTemplatePreview()` fix. Whether `AGENTS.md`'s pre-finish gate command
 * should grow `&& npm run build:lib` to catch this class of bug earlier is a
 * maintainer policy call (see the PR body), not something this file decides.
 *
 * `afterDiagnostic` fails the build LOUDLY (AGENTS.md, "fail early and
 * loudly") on any TypeScript diagnostic the declaration build's own program
 * finds — `vite-plugin-dts`/`vite build` otherwise print diagnostics to the
 * console but still exit 0, which would ship a package with a missing or
 * wrong `.d.ts` and no build failure to notice it by (tools/dtsDiagnostics.ts,
 * tested in tests/tools/dtsDiagnostics.test.ts).
 *
 * `afterBuild` is a second, complementary gate (issue #122 review finding
 * MINOR 4): a clean compile can still emit a `.d.ts` that is empty, missing
 * the public API, leaking an ambient `declare module`/`declare global` (see
 * MAJOR 1 below), or importing a type from an external package this npm
 * package declares no dependency on. tools/dtsArtifactChecks.ts inspects the
 * actual bytes written to `dist-lib/` and throws on any of those.
 *
 * DO NOT REMOVE either `afterDiagnostic` or `afterBuild` below — they are
 * this build's only defense against silently shipping a broken or missing
 * `.d.ts` (`vite build` exits 0 either way without them). Neither is
 * exercised by Vitest (this config is never loaded under Vitest), so nothing
 * else in the test suite would catch a regression here.
 *
 * **Ambient module note (MAJOR 1, fixed 2026-08-18):** `bundleTypes`
 * preserves any ambient module augmentation reachable from the program and
 * appends it verbatim to the rolled-up file — this repo used to carry
 * `src/bidi-js.d.ts` (`declare module 'bidi-js'`) for the untyped `bidi-js`
 * import, and it leaked straight into the published `.d.ts`. Fixed by
 * eliminating the ambient module at its source: `src/core/renderer/bidi-module.ts`
 * does the untyped import once with a single localized cast, so nothing here
 * ever needs an ambient shim again. `afterBuild`'s "no declare module/global"
 * check above is the regression guard.
 */
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    demoHostAssets(),
    dts({
      tsconfigPath: 'tsconfig.app.json',
      include: ['src/embed/**/*.ts', 'src/embed/**/*.tsx', 'src/core/**/*.ts', 'src/vite-env.d.ts'],
      bundleTypes: true,
      // DO NOT REMOVE — release gate (see the file-level comment above).
      afterDiagnostic: assertNoDtsDiagnostics,
      // DO NOT REMOVE — release gate (see the file-level comment above).
      afterBuild: assertSoundDtsArtifacts,
    }),
  ],
  define: {
    ...buildDefines(),
    // Vite's app build injects this automatically; library mode does not.
    // Without it the bundled React keeps its `process.env.NODE_ENV` checks
    // and throws `process is not defined` in the browser.
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  // The demo host page ships as the static content of the library output —
  // `python3 -m http.server -d dist-lib` serves a working embed demo.
  publicDir: 'demo',
  build: {
    outDir: 'dist-lib',
    lib: {
      entry: 'src/embed/index.ts',
      formats: ['es'],
      fileName: () => 'odl-drawcustom-designer.js',
    },
    rollupOptions: {
      output: {
        codeSplitting: false,
      },
    },
  },
})
