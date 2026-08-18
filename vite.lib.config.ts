import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import dts from 'vite-plugin-dts'
import { buildDefines } from './tools/buildDefines.ts'
import { demoHostAssets } from './tools/demoHostAssets.ts'
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
 * `include` is narrowed to `src/embed` + `src/core` (plus the two ambient
 * `.d.ts` shims those files need — `vite-env.d.ts` for `import.meta.env`,
 * `bidi-js.d.ts` for the untyped `bidi-js` import) rather than the whole
 * `src` tree tsconfig.app.json declares: the embed entry only ever needs
 * types reachable from `mount`/`MountOptions`/`MountHandle`, and pulling in
 * `src/ui` here would type-check unrelated React code as a side effect of a
 * config meant to describe the published surface.
 *
 * `afterDiagnostic` fails the build LOUDLY (AGENTS.md, "fail early and
 * loudly") on any TypeScript diagnostic the declaration build's own program
 * finds — `vite-plugin-dts`/`vite build` otherwise print diagnostics to the
 * console but still exit 0, which would ship a package with a missing or
 * wrong `.d.ts` and no build failure to notice it by (tools/dtsDiagnostics.ts,
 * tested in tests/tools/dtsDiagnostics.test.ts).
 */
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    demoHostAssets(),
    dts({
      tsconfigPath: 'tsconfig.app.json',
      include: [
        'src/embed/**/*.ts',
        'src/embed/**/*.tsx',
        'src/core/**/*.ts',
        'src/vite-env.d.ts',
        'src/bidi-js.d.ts',
      ],
      bundleTypes: true,
      afterDiagnostic: assertNoDtsDiagnostics,
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
