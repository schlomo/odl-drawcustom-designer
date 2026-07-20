import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Assemble the deployed GitHub Pages site (issue #69): standalone app at `/`
 * (the `dist/` app build, untouched) plus the embed demo at `/embed/` (the
 * `dist-lib/` library build: self-contained ESM + demo host page).
 *
 * Run via `npm run build:site`; the Pages workflow calls that script for both
 * production and PR previews (thin CI — the logic lives here, not in YAML).
 *
 * Fails loudly when either build output is missing, and refuses to publish a
 * demo page that would break under the `/embed/` subpath: every reference in
 * the demo's index.html and host.js must be relative (the library ESM itself
 * is self-contained — assets inlined by Vite library mode).
 */

const LIB_ESM = 'odl-drawcustom-designer.js'
const REQUIRED_LIB_FILES = ['index.html', 'host.js', LIB_ESM]

interface AssembleSiteOptions {
  /** App build output; becomes the site root. */
  distDir: string
  /** Library build output; becomes `<distDir>/embed/`. */
  distLibDir: string
}

function assertSubpathSafe(name: string, refs: string[]): void {
  for (const ref of refs) {
    if (ref.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(ref)) {
      throw new Error(
        `${name} references "${ref}" — the embed demo is served under /embed/, ` +
          'so every reference must be relative (./…)',
      )
    }
  }
}

function htmlUrlRefs(html: string): string[] {
  return [...html.matchAll(/\b(?:src|href)\s*=\s*"([^"]*)"/g)].map((match) => match[1])
}

function jsImportSpecifiers(js: string): string[] {
  return [...js.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((match) => match[1])
}

export function assembleSite({ distDir, distLibDir }: AssembleSiteOptions): void {
  if (!existsSync(join(distDir, 'index.html'))) {
    throw new Error(`${distDir}/index.html not found — run \`npm run build\` first`)
  }
  for (const file of REQUIRED_LIB_FILES) {
    if (!existsSync(join(distLibDir, file))) {
      throw new Error(`${distLibDir}/${file} not found — run \`npm run build:lib\` first`)
    }
  }

  assertSubpathSafe('index.html', htmlUrlRefs(readFileSync(join(distLibDir, 'index.html'), 'utf8')))
  assertSubpathSafe('host.js', jsImportSpecifiers(readFileSync(join(distLibDir, 'host.js'), 'utf8')))

  const embedDir = join(distDir, 'embed')
  rmSync(embedDir, { recursive: true, force: true })
  cpSync(distLibDir, embedDir, { recursive: true })
  console.log(`Assembled site: ${distDir} (app) + ${embedDir} (embed demo)`)
}

if (import.meta.main) {
  assembleSite({ distDir: 'dist', distLibDir: 'dist-lib' })
}
