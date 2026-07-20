import { defineConfig, devices } from '@playwright/test'
import net from 'node:net'

/**
 * Playwright e2e harness (ADR-011, 2026-07-15 revision): a small smoke suite for
 * real three-panel wiring (CodeMirror <-> React <-> canvas) that Vitest/jsdom
 * cannot exercise — real pointer events, debounce timing, real EditorView layout.
 *
 * Runs against `vite preview` (the production build), not `vite dev`: preview
 * serves the same static bundle CI builds and Pages deploys, so a green e2e run
 * means the actual shipped artifact works, not just the dev server. This does
 * mean `npm run build` must run before `npx playwright test` (CI does this as a
 * separate gate step already; locally run `npm run build && npm run test:e2e`).
 */

/**
 * Find a free TCP port by asking the OS for one (bind to port 0), then
 * releasing it immediately. There's a theoretical race between closing the
 * probe socket and `vite preview` binding the same port, but in practice the
 * OS won't hand the same ephemeral port back out immediately, so this is
 * reliable enough for local dev and CI alike — and it's what lets concurrent
 * git worktrees run `npx playwright test` at the same time without colliding.
 *
 * Set `PW_PORT` to pin a fixed port instead (e.g. to reuse an already-running
 * preview server across repeated local runs).
 */
async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close()
        reject(new Error('Could not determine a free port'))
        return
      }
      const { port } = address
      server.close(() => resolve(port))
    })
  })
}

// Playwright's test runner loads this config once in the main process (to
// start `webServer`) and again in every worker subprocess (to resolve
// `baseURL`). Each load must agree on the same port. Worker subprocesses
// inherit `process.env` from the main process, so: resolve the port once,
// stash it back into `process.env.PW_PORT`, and every later load — whether
// PW_PORT was already set by the caller or just set by us — reads the same
// value instead of each independently probing for (and getting) a different
// free port.
if (!process.env.PW_PORT) {
  process.env.PW_PORT = String(await findFreePort())
}
const PORT = Number(process.env.PW_PORT)

// Second server: the embed demo host page (tests/e2e/embed-mount.spec.ts).
// Serves dist-lib — the library build output plus the demo/ host page — the
// way docs/embedding.md tells humans to (`python3 -m http.server -d dist-lib`).
// Same resolve-once-and-stash pattern as PW_PORT above; the loop guards the
// (unlikely) case of the OS handing back the port PW_PORT already claimed.
if (!process.env.PW_EMBED_PORT) {
  let embedPort = await findFreePort()
  while (embedPort === PORT) {
    embedPort = await findFreePort()
  }
  process.env.PW_EMBED_PORT = String(embedPort)
}
const EMBED_PORT = Number(process.env.PW_EMBED_PORT)

// Third server: the assembled GitHub Pages site (tests/e2e/embed-site.spec.ts).
// Serves dist/ after `npm run build:site` — the exact layout Pages deploys:
// standalone app at `/`, embed demo at `/embed/`. Same resolve-once-and-stash
// pattern as above.
if (!process.env.PW_SITE_PORT) {
  let sitePort = await findFreePort()
  while (sitePort === PORT || sitePort === EMBED_PORT) {
    sitePort = await findFreePort()
  }
  process.env.PW_SITE_PORT = String(sitePort)
}
const SITE_PORT = Number(process.env.PW_SITE_PORT)

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  // CI adds: `github` (inline PR annotations), `html` (browsable artifact),
  // `junit` (published as a check-run report by dorny/test-reporter). The
  // JUnit file lives in reports/ — NOT test-results/, which Playwright wipes
  // at run start (it would delete the vitest JUnit written by `test:ci`).
  reporter: process.env.CI
    ? [
        ['list'],
        ['github'],
        ['html', { open: 'never' }],
        ['junit', { outputFile: 'reports/playwright-junit.xml' }],
      ]
    : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  // Chromium only — keep the harness lean (ADR-011); this suite tests wiring,
  // not cross-browser rendering quirks.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `npm run preview -- --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      // Unchanged from before: false in CI (always start fresh). Locally this
      // only matters when PW_PORT pins a fixed port — a random port is unique
      // per run, so there's never an existing server on it to reuse.
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      // Build the library bundle fresh, then serve it plus the demo host
      // page. Building inside the command keeps `npm run test:e2e`
      // self-sufficient for the embed suite (the app build stays a separate
      // explicit step, as before); the timeout covers the build.
      command: `npm run build:lib && python3 -m http.server ${EMBED_PORT} --bind 127.0.0.1 --directory dist-lib`,
      url: `http://localhost:${EMBED_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Assemble the deployed site fresh (app build + library build + copy),
      // then serve dist/ the way GitHub Pages does. Running `build:site`
      // inside the command mirrors the dist-lib server above and keeps
      // `npm run test:e2e` self-sufficient for the site suite; the timeout
      // covers both builds. build:site's own `build:lib` step starts only
      // after the (much longer) app build, so it never races the dist-lib
      // server's parallel `build:lib` — and tests don't start until every
      // webServer is ready, so both suites see the final, complete outputs.
      // Readiness polls /embed/ so a stale dist/ without the assembled embed
      // subtree can never report ready.
      command: `npm run build:site && python3 -m http.server ${SITE_PORT} --bind 127.0.0.1 --directory dist`,
      url: `http://localhost:${SITE_PORT}/embed/`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
  ],
})
