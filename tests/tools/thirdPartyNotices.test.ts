import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  bundledDependencyNames,
  collectBundledDependencyInfo,
  generateThirdPartyMarkdown,
  readDependencyLicenseInfo,
  resolveLockedDependencyPath,
  resolveTransitiveRuntimeDependencyPaths,
  type LockedPackageEntry,
} from '../../tools/thirdPartyNotices'

// Third-party license inventory for bundled deps (issue #103). NOT a
// heavyweight scanner — package.json license fields suffice; fails loudly on
// a missing license field. The dependency list is the transitive closure of
// package.json's "dependencies" map, traversed through package-lock.json's
// locked graph (production deps only — never devDependencies), since every
// package reachable that way — direct or transitive — is bundled into the
// single ESM by vite lib mode (docs/bundle-audit.md). Never hardcoded, so it
// can't drift from the real bundle composition.

function writeFixturePackage(repoRoot: string, packagePath: string, pkg: Record<string, unknown>): void {
  const dir = join(repoRoot, packagePath)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg))
}

describe('bundledDependencyNames', () => {
  it('returns the sorted keys of the dependencies map (the transitive closure seed)', () => {
    const packageJson = { dependencies: { react: '^19.0.0', dexie: '^4.0.0', zod: '^4.0.0' } }
    expect(bundledDependencyNames(packageJson)).toEqual(['dexie', 'react', 'zod'])
  })

  it('returns an empty array when there are no dependencies', () => {
    expect(bundledDependencyNames({})).toEqual([])
  })
})

describe('resolveLockedDependencyPath', () => {
  const packages: Record<string, LockedPackageEntry> = {
    'node_modules/@codemirror/view': { version: '6.43.0', dependencies: { crelt: '^1.0.6' } },
    'node_modules/crelt': { version: '1.0.6' },
    'node_modules/dev-only-pkg': { version: '1.0.0', dev: true },
  }

  it('resolves a root-level dependency at the repo root node_modules', () => {
    expect(resolveLockedDependencyPath(packages, '', 'crelt')).toBe('node_modules/crelt')
  })

  it('resolves a nested dependency required by a scoped package', () => {
    expect(resolveLockedDependencyPath(packages, 'node_modules/@codemirror/view', 'crelt')).toBe('node_modules/crelt')
  })

  it('returns undefined for a dependency not present in the lockfile', () => {
    expect(resolveLockedDependencyPath(packages, '', 'does-not-exist')).toBeUndefined()
  })

  it('never resolves to a dev-only entry', () => {
    expect(resolveLockedDependencyPath(packages, '', 'dev-only-pkg')).toBeUndefined()
  })
})

describe('resolveTransitiveRuntimeDependencyPaths', () => {
  it('walks transitive prod dependencies (e.g. @codemirror/view -> crelt/style-mod/w3c-keyname)', () => {
    const packageLock = {
      packages: {
        'node_modules/@codemirror/view': {
          version: '6.43.0',
          dependencies: { crelt: '^1.0.6', 'style-mod': '^4.1.0', 'w3c-keyname': '^2.2.4' },
        },
        'node_modules/crelt': { version: '1.0.6' },
        'node_modules/style-mod': { version: '4.1.2' },
        'node_modules/w3c-keyname': { version: '2.2.8' },
      },
    }

    const resolved = resolveTransitiveRuntimeDependencyPaths(packageLock, ['@codemirror/view'])

    expect([...resolved.keys()].sort()).toEqual(['@codemirror/view', 'crelt', 'style-mod', 'w3c-keyname'])
    expect(resolved.get('crelt')).toBe('node_modules/crelt')
  })

  it('never follows a dev-only branch of the graph', () => {
    const packageLock = {
      packages: {
        'node_modules/dexie': { version: '4.4.3' },
        'node_modules/vitest': { version: '3.0.0', dev: true, dependencies: { tinypool: '^1.0.0' } },
        'node_modules/tinypool': { version: '1.0.0', dev: true },
      },
    }

    const resolved = resolveTransitiveRuntimeDependencyPaths(packageLock, ['dexie'])

    expect([...resolved.keys()]).toEqual(['dexie'])
  })

  it('throws loudly when a dependency is missing from the lockfile', () => {
    const packageLock = { packages: {} }
    expect(() => resolveTransitiveRuntimeDependencyPaths(packageLock, ['ghost-package'])).toThrow(/ghost-package/)
  })

  it('finds the real repo closure: @codemirror/view pulls in crelt, style-mod, and w3c-keyname', () => {
    // Regression for issue #113 review finding: THIRD_PARTY.md derived only
    // from package.json's direct "dependencies" map misses these — they're
    // transitive deps of @codemirror/view (package-lock.json), but still
    // compiled into the ESM by vite lib mode. This exercises the REAL,
    // committed package-lock.json — not a fixture — so it fails pre-fix.
    const repoRoot = join(import.meta.dirname, '..', '..')
    const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    const packageLock = JSON.parse(readFileSync(join(repoRoot, 'package-lock.json'), 'utf8'))

    const resolved = resolveTransitiveRuntimeDependencyPaths(packageLock, bundledDependencyNames(packageJson))
    const names = [...resolved.keys()]

    expect(names).toContain('crelt')
    expect(names).toContain('style-mod')
    expect(names).toContain('w3c-keyname')
    // The closure is strictly larger than the direct-deps-only list it replaces.
    expect(names.length).toBeGreaterThan(Object.keys(packageJson.dependencies ?? {}).length)
  })
})

describe('readDependencyLicenseInfo', () => {
  let repoRoot: string

  afterEach(() => {
    if (repoRoot) rmSync(repoRoot, { recursive: true, force: true })
  })

  it('reads name/version/license/link from <repoRoot>/<packagePath>/package.json', () => {
    repoRoot = mkdtempSync(join(tmpdir(), 'third-party-test-'))
    writeFixturePackage(repoRoot, 'node_modules/dexie', {
      name: 'dexie',
      version: '4.4.3',
      license: 'Apache-2.0',
      homepage: 'https://dexie.org',
    })

    expect(readDependencyLicenseInfo('dexie', 'node_modules/dexie', repoRoot)).toEqual({
      name: 'dexie',
      version: '4.4.3',
      license: 'Apache-2.0',
      link: 'https://dexie.org',
    })
  })

  it('reads a nested (non-hoisted) dependency from its own node_modules path', () => {
    repoRoot = mkdtempSync(join(tmpdir(), 'third-party-test-'))
    writeFixturePackage(repoRoot, 'node_modules/yargs/node_modules/find-up', {
      name: 'find-up',
      version: '4.1.0',
      license: 'MIT',
    })

    expect(readDependencyLicenseInfo('find-up', 'node_modules/yargs/node_modules/find-up', repoRoot).version).toBe(
      '4.1.0',
    )
  })

  it('falls back to repository.url when homepage is absent', () => {
    repoRoot = mkdtempSync(join(tmpdir(), 'third-party-test-'))
    writeFixturePackage(repoRoot, 'node_modules/yaml', {
      name: 'yaml',
      version: '2.9.0',
      license: 'ISC',
      repository: { type: 'git', url: 'https://github.com/eemeli/yaml.git' },
    })

    expect(readDependencyLicenseInfo('yaml', 'node_modules/yaml', repoRoot).link).toBe(
      'https://github.com/eemeli/yaml.git',
    )
  })

  it('fails loudly when the license field is missing', () => {
    repoRoot = mkdtempSync(join(tmpdir(), 'third-party-test-'))
    writeFixturePackage(repoRoot, 'node_modules/no-license-pkg', { name: 'no-license-pkg', version: '1.0.0' })

    expect(() => readDependencyLicenseInfo('no-license-pkg', 'node_modules/no-license-pkg', repoRoot)).toThrow(
      /license/i,
    )
  })

  it('fails loudly when the package is not installed', () => {
    repoRoot = mkdtempSync(join(tmpdir(), 'third-party-test-'))
    expect(() => readDependencyLicenseInfo('missing-pkg', 'node_modules/missing-pkg', repoRoot)).toThrow(
      /missing-pkg/,
    )
  })
})

describe('collectBundledDependencyInfo', () => {
  let repoRoot: string

  afterEach(() => {
    if (repoRoot) rmSync(repoRoot, { recursive: true, force: true })
  })

  it('collects license info for every resolved dependency, sorted by name', () => {
    repoRoot = mkdtempSync(join(tmpdir(), 'third-party-test-'))
    writeFixturePackage(repoRoot, 'node_modules/zod', { name: 'zod', version: '4.4.3', license: 'MIT' })
    writeFixturePackage(repoRoot, 'node_modules/dexie', { name: 'dexie', version: '4.4.3', license: 'Apache-2.0' })

    const resolvedPaths = new Map([
      ['zod', 'node_modules/zod'],
      ['dexie', 'node_modules/dexie'],
    ])
    const infos = collectBundledDependencyInfo(resolvedPaths, repoRoot)
    expect(infos.map((info) => info.name)).toEqual(['dexie', 'zod'])
  })
})

describe('generateThirdPartyMarkdown', () => {
  it('renders a markdown table of the bundled dependencies', () => {
    const markdown = generateThirdPartyMarkdown([
      { name: 'dexie', version: '4.4.3', license: 'Apache-2.0', link: 'https://dexie.org' },
      { name: 'react', version: '19.2.7', license: 'MIT', link: 'https://react.dev/' },
    ])

    expect(markdown).toContain('# Third-party notices (bundled dependencies)')
    expect(markdown).toContain(
      '[`docs/THIRD_PARTY.md`](https://github.com/schlomo/odl-drawcustom-designer/blob/main/docs/THIRD_PARTY.md)',
    )
    expect(markdown).toContain('| Package | Version | License | Link |')
    expect(markdown).toContain('| dexie | 4.4.3 | Apache-2.0 | https://dexie.org |')
    expect(markdown).toContain('| react | 19.2.7 | MIT | https://react.dev/ |')
  })

  it('omits the link cell gracefully when a dependency has none', () => {
    const markdown = generateThirdPartyMarkdown([{ name: 'foo', version: '1.0.0', license: 'MIT' }])
    expect(markdown).toContain('| foo | 1.0.0 | MIT |  |')
  })
})
