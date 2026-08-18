import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { stageNpmPackage } from '../../tools/stageNpmPackage'

// npm publish staging directory (issue #103): assembled by a tested tools/
// function — the built ESM, its bundled declaration file (issue #122), a
// generated package.json with the real derived version, and
// LICENSE/NOTICE/THIRD_PARTY.md — so `npm publish --dry-run` against the
// staged dir works on a laptop, same as CI.
//
// README unification (maintainer ruling 2026-08-16): one README.md at the
// repo root serves both GitHub and npmjs.com — docs/npm-README.md is gone,
// and staging copies the root README.md instead.

function writeFixtureRepo(workDir: string): { repoRoot: string; distLibJsPath: string; distLibDtsPath: string } {
  const repoRoot = join(workDir, 'repo')
  const distLibDir = join(workDir, 'dist-lib')
  mkdirSync(repoRoot, { recursive: true })
  mkdirSync(distLibDir, { recursive: true })
  const distLibJsPath = join(distLibDir, 'odl-drawcustom-designer.js')
  const distLibDtsPath = join(distLibDir, 'odl-drawcustom-designer.d.ts')
  writeFileSync(distLibJsPath, 'export const version = "1.2.3"')
  writeFileSync(distLibDtsPath, 'export declare const version: string\n')
  writeFileSync(join(repoRoot, 'LICENSE'), 'Apache License text')
  writeFileSync(join(repoRoot, 'NOTICE'), 'Copyright notice text')
  writeFileSync(join(repoRoot, 'README.md'), '# @schlomo/odl-drawcustom-designer\n')
  return { repoRoot, distLibJsPath, distLibDtsPath }
}

describe('stageNpmPackage', () => {
  let workDir: string

  afterEach(() => {
    if (workDir) rmSync(workDir, { recursive: true, force: true })
  })

  it('assembles the ESM, its .d.ts, package.json, LICENSE, NOTICE and THIRD_PARTY.md into the staging dir', () => {
    workDir = mkdtempSync(join(tmpdir(), 'stage-npm-test-'))
    const { repoRoot, distLibJsPath, distLibDtsPath } = writeFixtureRepo(workDir)
    const stagingDir = join(workDir, 'dist-npm')

    stageNpmPackage({
      version: '1.2.3',
      repoRoot,
      distLibJsPath,
      distLibDtsPath,
      stagingDir,
      thirdPartyMarkdown: '# Third-party notices\n',
    })

    expect(readFileSync(join(stagingDir, 'odl-drawcustom-designer.js'), 'utf8')).toBe(
      'export const version = "1.2.3"',
    )
    expect(readFileSync(join(stagingDir, 'odl-drawcustom-designer.d.ts'), 'utf8')).toBe(
      'export declare const version: string\n',
    )
    expect(readFileSync(join(stagingDir, 'LICENSE'), 'utf8')).toBe('Apache License text')
    expect(readFileSync(join(stagingDir, 'NOTICE'), 'utf8')).toBe('Copyright notice text')
    expect(readFileSync(join(stagingDir, 'THIRD_PARTY.md'), 'utf8')).toBe('# Third-party notices\n')

    const pkg = JSON.parse(readFileSync(join(stagingDir, 'package.json'), 'utf8'))
    expect(pkg.name).toBe('@schlomo/odl-drawcustom-designer')
    expect(pkg.version).toBe('1.2.3')
    expect(pkg.types).toBe('./odl-drawcustom-designer.d.ts')
  })

  it('stages README.md alongside the package — npmjs.com renders it as the package page', () => {
    workDir = mkdtempSync(join(tmpdir(), 'stage-npm-test-'))
    const { repoRoot, distLibJsPath, distLibDtsPath } = writeFixtureRepo(workDir)
    const stagingDir = join(workDir, 'dist-npm')

    stageNpmPackage({
      version: '1.2.3',
      repoRoot,
      distLibJsPath,
      distLibDtsPath,
      stagingDir,
      thirdPartyMarkdown: '# Third-party notices\n',
    })

    const readme = readFileSync(join(stagingDir, 'README.md'), 'utf8')
    expect(readme).toContain('@schlomo/odl-drawcustom-designer')
  })

  it('creates the staging directory if it does not exist yet', () => {
    workDir = mkdtempSync(join(tmpdir(), 'stage-npm-test-'))
    const { repoRoot, distLibJsPath, distLibDtsPath } = writeFixtureRepo(workDir)
    const stagingDir = join(workDir, 'nested', 'dist-npm')

    expect(existsSync(stagingDir)).toBe(false)
    stageNpmPackage({
      version: '1.0.0',
      repoRoot,
      distLibJsPath,
      distLibDtsPath,
      stagingDir,
      thirdPartyMarkdown: 'x',
    })
    expect(existsSync(stagingDir)).toBe(true)
  })

  it('fails loudly when the declaration file is missing — no silent missing-types package', () => {
    workDir = mkdtempSync(join(tmpdir(), 'stage-npm-test-'))
    const { repoRoot, distLibJsPath } = writeFixtureRepo(workDir)
    const stagingDir = join(workDir, 'dist-npm')

    expect(() =>
      stageNpmPackage({
        version: '1.0.0',
        repoRoot,
        distLibJsPath,
        distLibDtsPath: join(workDir, 'dist-lib', 'does-not-exist.d.ts'),
        stagingDir,
        thirdPartyMarkdown: 'x',
      }),
    ).toThrow(/ENOENT/)
  })
})
