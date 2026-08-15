import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  bundledDependencyNames,
  collectBundledDependencyInfo,
  generateThirdPartyMarkdown,
  readDependencyLicenseInfo,
} from '../../tools/thirdPartyNotices'

// Third-party license inventory for bundled deps (issue #103). NOT a
// heavyweight scanner — package.json license fields suffice; fails loudly on
// a missing license field. The dependency list is derived from
// package.json's own "dependencies" map (every runtime dependency is bundled
// into the single ESM by vite lib mode — docs/bundle-audit.md), never
// hardcoded separately, so it can't drift from the real bundle composition.

function writeFixturePackage(nodeModulesDir: string, name: string, pkg: Record<string, unknown>): void {
  const dir = join(nodeModulesDir, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg))
}

describe('bundledDependencyNames', () => {
  it('returns the sorted keys of the dependencies map (the actual bundle composition)', () => {
    const packageJson = { dependencies: { react: '^19.0.0', dexie: '^4.0.0', zod: '^4.0.0' } }
    expect(bundledDependencyNames(packageJson)).toEqual(['dexie', 'react', 'zod'])
  })

  it('returns an empty array when there are no dependencies', () => {
    expect(bundledDependencyNames({})).toEqual([])
  })
})

describe('readDependencyLicenseInfo', () => {
  let nodeModulesDir: string

  afterEach(() => {
    if (nodeModulesDir) rmSync(nodeModulesDir, { recursive: true, force: true })
  })

  it('reads name/version/license/link from node_modules/<pkg>/package.json', () => {
    nodeModulesDir = mkdtempSync(join(tmpdir(), 'third-party-test-'))
    writeFixturePackage(nodeModulesDir, 'dexie', {
      name: 'dexie',
      version: '4.4.3',
      license: 'Apache-2.0',
      homepage: 'https://dexie.org',
    })

    expect(readDependencyLicenseInfo('dexie', nodeModulesDir)).toEqual({
      name: 'dexie',
      version: '4.4.3',
      license: 'Apache-2.0',
      link: 'https://dexie.org',
    })
  })

  it('falls back to repository.url when homepage is absent', () => {
    nodeModulesDir = mkdtempSync(join(tmpdir(), 'third-party-test-'))
    writeFixturePackage(nodeModulesDir, 'yaml', {
      name: 'yaml',
      version: '2.9.0',
      license: 'ISC',
      repository: { type: 'git', url: 'https://github.com/eemeli/yaml.git' },
    })

    expect(readDependencyLicenseInfo('yaml', nodeModulesDir).link).toBe('https://github.com/eemeli/yaml.git')
  })

  it('fails loudly when the license field is missing', () => {
    nodeModulesDir = mkdtempSync(join(tmpdir(), 'third-party-test-'))
    writeFixturePackage(nodeModulesDir, 'no-license-pkg', { name: 'no-license-pkg', version: '1.0.0' })

    expect(() => readDependencyLicenseInfo('no-license-pkg', nodeModulesDir)).toThrow(/license/i)
  })

  it('fails loudly when the package is not installed', () => {
    nodeModulesDir = mkdtempSync(join(tmpdir(), 'third-party-test-'))
    expect(() => readDependencyLicenseInfo('missing-pkg', nodeModulesDir)).toThrow(/missing-pkg/)
  })
})

describe('collectBundledDependencyInfo', () => {
  let nodeModulesDir: string

  afterEach(() => {
    if (nodeModulesDir) rmSync(nodeModulesDir, { recursive: true, force: true })
  })

  it('collects license info for every named dependency, sorted by name', () => {
    nodeModulesDir = mkdtempSync(join(tmpdir(), 'third-party-test-'))
    writeFixturePackage(nodeModulesDir, 'zod', { name: 'zod', version: '4.4.3', license: 'MIT' })
    writeFixturePackage(nodeModulesDir, 'dexie', { name: 'dexie', version: '4.4.3', license: 'Apache-2.0' })

    const infos = collectBundledDependencyInfo(['zod', 'dexie'], nodeModulesDir)
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
