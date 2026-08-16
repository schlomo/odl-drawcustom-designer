import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { buildNpmPackageJson } from './npmPackage.ts'

/**
 * Assembles the npm-publish staging directory (issue #103): the built ESM,
 * a generated package.json carrying the real derived version, and
 * LICENSE/NOTICE/THIRD_PARTY.md. `npm publish --access public --provenance`
 * (or `--dry-run` for local testing) runs against this directory —
 * assembled by this tested function, not ad hoc shell in the workflow
 * (thin CI, AGENTS.md).
 */

export interface StageNpmPackageOptions {
  /** The derived release version, e.g. "1.2.3" (git tags, not package.json — docs/releasing.md). */
  version: string
  /** Repository root, for LICENSE/NOTICE. */
  repoRoot: string
  /** Path to the built single-file ESM (dist-lib/odl-drawcustom-designer.js). */
  distLibJsPath: string
  /** Directory to assemble the npm package into (e.g. dist-npm/). Created if missing. */
  stagingDir: string
  /** Pre-generated THIRD_PARTY.md content (tools/thirdPartyNotices.ts) — generated once, reused here. */
  thirdPartyMarkdown: string
}

export function stageNpmPackage(options: StageNpmPackageOptions): void {
  const { version, repoRoot, distLibJsPath, stagingDir, thirdPartyMarkdown } = options
  mkdirSync(stagingDir, { recursive: true })

  copyFileSync(distLibJsPath, join(stagingDir, basename(distLibJsPath)))
  copyFileSync(join(repoRoot, 'LICENSE'), join(stagingDir, 'LICENSE'))
  copyFileSync(join(repoRoot, 'NOTICE'), join(stagingDir, 'NOTICE'))
  copyFileSync(join(repoRoot, 'docs', 'npm-README.md'), join(stagingDir, 'README.md'))
  writeFileSync(join(stagingDir, 'THIRD_PARTY.md'), thirdPartyMarkdown)
  writeFileSync(join(stagingDir, 'package.json'), `${JSON.stringify(buildNpmPackageJson(version), null, 2)}\n`)
}
