import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { gitBuildDefines } from './tools/buildDefines.ts'

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
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    ...gitBuildDefines(),
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
