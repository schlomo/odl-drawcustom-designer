import { defineConfig, devices } from '@playwright/test'

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
const PORT = 4173

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  // Chromium only — keep the harness lean (ADR-011); this suite tests wiring,
  // not cross-browser rendering quirks.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
