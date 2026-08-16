import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { chromium } from '@playwright/test'

/**
 * Repeatable README screenshot capture (maintainer ruling 2026-08-16): builds
 * the standalone app, serves `dist/` statically, loads it in headless
 * Chromium, clicks Load Demo to seed the showcase bundle (`src/assets/showcase/`,
 * ADR-015), waits for it to actually render (condition-based, not a sleep —
 * `docs/testing.md`'s "wait for the real thing" rule applies to captures too),
 * and saves a 1200px-wide PNG to `docs/assets/designer-screenshot.png`.
 *
 * Runs identically on a laptop or in CI: `node tools/screenshot.ts` (also
 * wired as `npm run screenshot`). Not a Playwright test — this is a one-shot
 * capture script, so it drives `chromium` directly rather than going through
 * the `tests/e2e/` harness (that suite is scoped to real-browser *wiring*
 * assertions, not asset generation — `docs/testing.md`).
 */

const DIST_DIR = join(import.meta.dirname, '..', 'dist')
const OUTPUT_PATH = join(import.meta.dirname, '..', 'docs', 'assets', 'designer-screenshot.png')
const VIEWPORT = { width: 1200, height: 800 }
const SHOWCASE_ELEMENT_COUNT = 22 // src/assets/showcase/showcase.yml element count

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
}

async function serveStatic(rootDir: string): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    void (async () => {
      const requestPath = (req.url ?? '/').split('?')[0]
      const relativePath = requestPath === '/' ? '/index.html' : requestPath
      const filePath = join(rootDir, relativePath)
      try {
        const body = await readFile(filePath)
        const mime = MIME_TYPES[extname(filePath)] ?? 'application/octet-stream'
        res.writeHead(200, { 'Content-Type': mime })
        res.end(body)
      } catch {
        res.writeHead(404)
        res.end('Not found')
      }
    })()
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('Could not determine screenshot server port')
  }
  const url = `http://127.0.0.1:${address.port}/`
  return {
    url,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  }
}

async function main(): Promise<void> {
  console.log('Building app (npm run build)…')
  execFileSync('npm', ['run', 'build'], {
    stdio: 'inherit',
    cwd: join(import.meta.dirname, '..'),
    // Force the header's branch label to `main` regardless of the branch
    // this script actually runs from (a worktree doing doc work, a
    // dependabot branch, …) — the committed screenshot must look the same
    // and reproducible no matter where it was captured.
    env: { ...process.env, VITE_GIT_BRANCH: 'main' },
  })
  if (!existsSync(join(DIST_DIR, 'index.html'))) {
    throw new Error(`${DIST_DIR}/index.html not found after build`)
  }

  const server = await serveStatic(DIST_DIR)
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: VIEWPORT })
    await page.goto(server.url)

    await page.getByRole('button', { name: 'Load Demo' }).click()

    // Condition-based settle: wait for every showcase element to actually
    // render as a list row, then for the canvas paper to report real
    // dimensions — not a fixed sleep.
    await page.getByTestId('element-list-row').nth(SHOWCASE_ELEMENT_COUNT - 1).waitFor()
    await page.waitForFunction(() => {
      const paper = document.querySelector('[data-canvas-paper]')
      const box = paper?.getBoundingClientRect()
      return Boolean(box && box.width > 0 && box.height > 0)
    })

    await page.screenshot({ path: OUTPUT_PATH })
    console.log(`Wrote ${OUTPUT_PATH}`)
  } finally {
    await browser.close()
    await server.close()
  }
}

await main()
