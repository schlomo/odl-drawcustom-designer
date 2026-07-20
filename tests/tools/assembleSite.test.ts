import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { assembleSite } from '../../tools/assembleSite'

// Behavior under test (issue #69): the deployed site is the standalone app at
// `/` plus the embed demo at `/embed/` — dist-lib (library ESM + demo host
// page) copied into dist/embed. The assembly must fail loudly when either
// build output is missing or when the demo page would break under the
// `/embed/` subpath (any non-relative reference).

const tempDirs: string[] = []

function makeSiteFixture({
  demoIndexHtml = '<!doctype html><html><body><script type="module" src="./host.js"></script></body></html>',
  hostJs = "import { mount } from './odl-drawcustom-designer.js'\nmount(document.body, {})\n",
  withLibEsm = true,
  withAppIndex = true,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'assemble-site-'))
  tempDirs.push(root)
  const distDir = join(root, 'dist')
  const distLibDir = join(root, 'dist-lib')
  mkdirSync(distDir, { recursive: true })
  mkdirSync(distLibDir, { recursive: true })
  if (withAppIndex) writeFileSync(join(distDir, 'index.html'), '<!doctype html>app')
  writeFileSync(join(distLibDir, 'index.html'), demoIndexHtml)
  writeFileSync(join(distLibDir, 'host.js'), hostJs)
  if (withLibEsm) writeFileSync(join(distLibDir, 'odl-drawcustom-designer.js'), 'export const mount = () => {}\n')
  return { distDir, distLibDir }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('assembleSite', () => {
  it('copies the embed demo (host page + library ESM) into dist/embed', () => {
    const { distDir, distLibDir } = makeSiteFixture()

    assembleSite({ distDir, distLibDir })

    const embedDir = join(distDir, 'embed')
    expect(readFileSync(join(embedDir, 'index.html'), 'utf8')).toContain('./host.js')
    expect(readFileSync(join(embedDir, 'host.js'), 'utf8')).toContain('./odl-drawcustom-designer.js')
    expect(existsSync(join(embedDir, 'odl-drawcustom-designer.js'))).toBe(true)
    // App build stays untouched at the site root.
    expect(readFileSync(join(distDir, 'index.html'), 'utf8')).toContain('app')
  })

  it('re-running replaces dist/embed wholesale — stale files from a previous assembly disappear', () => {
    const { distDir, distLibDir } = makeSiteFixture()
    mkdirSync(join(distDir, 'embed'), { recursive: true })
    writeFileSync(join(distDir, 'embed', 'stale-from-last-deploy.js'), 'old')

    assembleSite({ distDir, distLibDir })

    expect(existsSync(join(distDir, 'embed', 'stale-from-last-deploy.js'))).toBe(false)
    expect(existsSync(join(distDir, 'embed', 'odl-drawcustom-designer.js'))).toBe(true)
  })

  it('fails when the app build output is missing', () => {
    const { distDir, distLibDir } = makeSiteFixture({ withAppIndex: false })

    expect(() => assembleSite({ distDir, distLibDir })).toThrow(/npm run build\b/)
    expect(existsSync(join(distDir, 'embed'))).toBe(false)
  })

  it('fails when the library ESM is missing from dist-lib', () => {
    const { distDir, distLibDir } = makeSiteFixture({ withLibEsm: false })

    expect(() => assembleSite({ distDir, distLibDir })).toThrow(/odl-drawcustom-designer\.js/)
    expect(existsSync(join(distDir, 'embed'))).toBe(false)
  })

  it('rejects a demo index.html with a root-relative reference (breaks under /embed/)', () => {
    const { distDir, distLibDir } = makeSiteFixture({
      demoIndexHtml: '<script type="module" src="/host.js"></script>',
    })

    expect(() => assembleSite({ distDir, distLibDir })).toThrow(/\/host\.js/)
    expect(existsSync(join(distDir, 'embed'))).toBe(false)
  })

  it('rejects a demo host.js with a non-relative import specifier', () => {
    const { distDir, distLibDir } = makeSiteFixture({
      hostJs: "import { mount } from '/odl-drawcustom-designer.js'\n",
    })

    expect(() => assembleSite({ distDir, distLibDir })).toThrow(/odl-drawcustom-designer\.js/)
    expect(existsSync(join(distDir, 'embed'))).toBe(false)
  })
})
