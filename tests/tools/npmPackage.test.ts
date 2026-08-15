import { describe, expect, it } from 'vitest'
import { buildNpmPackageJson } from '../../tools/npmPackage'

// npm publish staging (issue #103): package.json is generated at staging
// time with the REAL derived release version — the tracked repo
// package.json stays pinned at 0.0.0 forever (docs/releasing.md's
// version-source policy is unchanged, ADR-untouched).

describe('buildNpmPackageJson', () => {
  it('injects the real derived version', () => {
    expect(buildNpmPackageJson('1.2.3').version).toBe('1.2.3')
  })

  it('sets the package name to the product slug', () => {
    expect(buildNpmPackageJson('1.0.0').name).toBe('odl-drawcustom-designer')
  })

  it('is an ES module pointing exports/main at the single bundled ESM file', () => {
    const pkg = buildNpmPackageJson('1.0.0')
    expect(pkg.type).toBe('module')
    expect(pkg.main).toBe('./odl-drawcustom-designer.js')
    expect(pkg.exports).toEqual({ '.': './odl-drawcustom-designer.js' })
  })

  it('lists the built file plus license/notice assets in files', () => {
    const pkg = buildNpmPackageJson('1.0.0')
    expect(pkg.files).toEqual(
      expect.arrayContaining(['odl-drawcustom-designer.js', 'LICENSE', 'NOTICE', 'THIRD_PARTY.md']),
    )
  })

  it('declares Apache-2.0 and repository/homepage metadata', () => {
    const pkg = buildNpmPackageJson('1.0.0')
    expect(pkg.license).toBe('Apache-2.0')
    expect(pkg.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/schlomo/odl-drawcustom-designer.git',
    })
    expect(pkg.homepage).toMatch(/^https:\/\/.*schlomo.*odl-drawcustom-designer/)
  })

  it('carries descriptive keywords', () => {
    const pkg = buildNpmPackageJson('1.0.0')
    expect(Array.isArray(pkg.keywords)).toBe(true)
    expect((pkg.keywords as string[]).length).toBeGreaterThan(0)
  })

  it('never carries "private" — the repo package.json sets it, but the published package must not', () => {
    expect('private' in buildNpmPackageJson('1.0.0')).toBe(false)
  })

  it('never carries a "dependencies" field — the ESM is self-contained, nothing to resolve', () => {
    const pkg = buildNpmPackageJson('1.0.0')
    expect('dependencies' in pkg).toBe(false)
  })

  it('rejects a non-plain-semver version (fail loudly, mirrors applyBump)', () => {
    expect(() => buildNpmPackageJson('1.2.3-beta.1')).toThrow(/semver/)
  })
})
