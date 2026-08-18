import { describe, expect, it } from 'vitest'
import { buildNpmPackageJson, NPM_PACKAGE_NAME } from '../../tools/npmPackage'

// npm publish staging (issue #103): package.json is generated at staging
// time with the REAL derived release version — the tracked repo
// package.json stays pinned at 0.0.0 forever (docs/releasing.md's
// version-source policy is unchanged, ADR-untouched).

describe('NPM_PACKAGE_NAME', () => {
  it('is an explicit constant, not derived from the root package.json name field', () => {
    // Scoped under the `schlomo` npm org (maintainer update, 2026-08-16).
    // The root package.json's own "name" is a separate, cosmetic field
    // (stays private:true/0.0.0 forever, docs/releasing.md's version-source
    // policy) — this is the one tested source of truth the generator uses.
    expect(NPM_PACKAGE_NAME).toBe('@schlomo/odl-drawcustom-designer')
  })
})

describe('buildNpmPackageJson', () => {
  it('injects the real derived version', () => {
    expect(buildNpmPackageJson('1.2.3').version).toBe('1.2.3')
  })

  it('sets the package name to the scoped npm package name (org "schlomo", scoped 2026-08-16)', () => {
    expect(buildNpmPackageJson('1.0.0').name).toBe('@schlomo/odl-drawcustom-designer')
  })

  it('is an ES module pointing main at the single bundled ESM file', () => {
    const pkg = buildNpmPackageJson('1.0.0')
    expect(pkg.type).toBe('module')
    expect(pkg.main).toBe('./odl-drawcustom-designer.js')
  })

  it('points types and exports.types at the bundled declaration file (issue #122)', () => {
    const pkg = buildNpmPackageJson('1.0.0')
    expect(pkg.types).toBe('./odl-drawcustom-designer.d.ts')
    expect(pkg.exports).toEqual({
      '.': { types: './odl-drawcustom-designer.d.ts', default: './odl-drawcustom-designer.js' },
    })
  })

  it('lists the built file, its declaration file, plus license/notice assets in files', () => {
    const pkg = buildNpmPackageJson('1.0.0')
    expect(pkg.files).toEqual(
      expect.arrayContaining([
        'odl-drawcustom-designer.js',
        'odl-drawcustom-designer.d.ts',
        'LICENSE',
        'NOTICE',
        'THIRD_PARTY.md',
      ]),
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

  it('carries a description and a bugs URL — npmjs.com renders both on the package page', () => {
    const pkg = buildNpmPackageJson('1.0.0')
    expect(pkg.description.length).toBeGreaterThan(0)
    expect(pkg.bugs).toEqual({ url: 'https://github.com/schlomo/odl-drawcustom-designer/issues' })
  })

  it('lists README.md in files so npm includes it in the published tarball', () => {
    const pkg = buildNpmPackageJson('1.0.0')
    expect(pkg.files).toEqual(expect.arrayContaining(['README.md']))
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
