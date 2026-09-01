import { describe, expect, it } from 'vitest'
import {
  ghReleaseCreateArgs,
  ghReleaseUploadArgs,
  ghReleaseViewAssetsArgs,
  planReleaseReconcile,
  RELEASE_ASSET_NAMES,
  requireReleaseEnv,
} from '../../tools/createRelease'

// Step two of the release pipeline: build the library at the version the
// `version` job already computed and — when this run owns that version —
// create the tag + GitHub release. It must NEVER derive a version of its
// own (maintainer ruling 2026-09-01, "compute the version ONCE, up front"),
// so everything it needs arrives through the environment and is validated
// loudly here, before the slow build.

describe('requireReleaseEnv', () => {
  const base = { APP_VERSION: '3.4.0', CREATE_RELEASE: 'true', GITHUB_SHA: 'abc123', GH_TOKEN: 'secret' }

  it('accepts a complete release environment', () => {
    expect(requireReleaseEnv(base)).toEqual({ version: '3.4.0', createRelease: true, targetSha: 'abc123' })
  })

  it('throws loudly when APP_VERSION is missing — it must come from the version job, never be derived here', () => {
    expect(() => requireReleaseEnv({ ...base, APP_VERSION: undefined })).toThrow(/APP_VERSION/)
  })

  it('throws loudly when APP_VERSION is not a plain X.Y.Z version', () => {
    expect(() => requireReleaseEnv({ ...base, APP_VERSION: '0.0.0-dev' })).toThrow(/APP_VERSION/)
    expect(() => requireReleaseEnv({ ...base, APP_VERSION: 'v3.4.0' })).toThrow(/APP_VERSION/)
  })

  it('throws loudly when GITHUB_SHA is missing', () => {
    expect(() => requireReleaseEnv({ ...base, GITHUB_SHA: undefined })).toThrow(/GITHUB_SHA/)
  })

  it('throws loudly when GH_TOKEN is missing and a release must be created', () => {
    expect(() => requireReleaseEnv({ ...base, GH_TOKEN: undefined })).toThrow(/GH_TOKEN/)
  })

  it('does not require GH_TOKEN when the release already exists (nothing will be created)', () => {
    expect(requireReleaseEnv({ ...base, CREATE_RELEASE: 'false', GH_TOKEN: undefined })).toEqual({
      version: '3.4.0',
      createRelease: false,
      targetSha: 'abc123',
    })
  })

  // A job output that arrives empty or misspelled must not be read as
  // "false" — that would silently skip creating the release for a version
  // both publish jobs then go on to publish.
  it('throws loudly on a CREATE_RELEASE value that is neither "true" nor "false"', () => {
    for (const value of [undefined, '', 'yes', 'TRUE', '1']) {
      expect(() => requireReleaseEnv({ ...base, CREATE_RELEASE: value })).toThrow(/CREATE_RELEASE/)
    }
  })
})

describe('ghReleaseCreateArgs', () => {
  it('pins the tag to the exact commit that was gated, and attaches every asset', () => {
    const args = ghReleaseCreateArgs('v3.4.0', 'abc123', ['dist-lib/lib.js', 'LICENSE'])
    expect(args.slice(0, 3)).toEqual(['release', 'create', 'v3.4.0'])
    expect(args).toContain('dist-lib/lib.js')
    expect(args).toContain('LICENSE')
    const targetIndex = args.indexOf('--target')
    expect(targetIndex).toBeGreaterThan(-1)
    expect(args[targetIndex + 1]).toBe('abc123')
  })

  it('titles the release with the tag and generates notes', () => {
    const args = ghReleaseCreateArgs('v3.4.0', 'abc123', [])
    expect(args[args.indexOf('--title') + 1]).toBe('v3.4.0')
    expect(args).toContain('--generate-notes')
  })
})

// Reconcile (Copilot review on PR #183): `gh release create` is NOT atomic —
// it creates the tag, then uploads assets one by one. If an upload dies, the
// tag exists and is reachable from HEAD, so the next run's releaseVersion.ts
// reports `already-released` and this script must NOT just exit: it would
// leave the GitHub release permanently incomplete while npm and Pages sail
// past. The already-released path therefore reconciles what the release has
// against what it should have.

describe('RELEASE_ASSET_NAMES', () => {
  it('names every asset a complete release carries', () => {
    expect([...RELEASE_ASSET_NAMES].sort()).toEqual(
      [
        'LICENSE',
        'NOTICE',
        'THIRD_PARTY.md',
        'odl-drawcustom-designer.d.ts',
        'odl-drawcustom-designer.d.ts.sha256',
        'odl-drawcustom-designer.js',
        'odl-drawcustom-designer.js.sha256',
      ].sort(),
    )
  })
})

describe('planReleaseReconcile', () => {
  const fresh = {
    'odl-drawcustom-designer.js.sha256': 'aaa  odl-drawcustom-designer.js\n',
    'odl-drawcustom-designer.d.ts.sha256': 'bbb  odl-drawcustom-designer.d.ts\n',
  }
  const completeAssets = (): string[] => [...RELEASE_ASSET_NAMES]

  it('is a no-op when the release already carries every asset', () => {
    const decision = planReleaseReconcile({
      tag: 'v3.4.2',
      release: { exists: true, assetNames: completeAssets() },
      freshChecksums: fresh,
      recordedChecksums: fresh,
    })
    expect(decision).toMatchObject({ action: 'complete' })
  })

  it('uploads exactly the assets a partial release is missing', () => {
    const decision = planReleaseReconcile({
      tag: 'v3.4.2',
      release: {
        exists: true,
        assetNames: ['odl-drawcustom-designer.js', 'odl-drawcustom-designer.js.sha256', 'LICENSE'],
      },
      freshChecksums: fresh,
      recordedChecksums: { 'odl-drawcustom-designer.js.sha256': fresh['odl-drawcustom-designer.js.sha256'] },
    })
    expect(decision).toMatchObject({ action: 'upload' })
    expect(decision.action === 'upload' && [...decision.assetNames].sort()).toEqual(
      ['NOTICE', 'THIRD_PARTY.md', 'odl-drawcustom-designer.d.ts', 'odl-drawcustom-designer.d.ts.sha256'].sort(),
    )
  })

  it('uploads everything when the tag exists but the release carries no assets at all', () => {
    const decision = planReleaseReconcile({
      tag: 'v3.4.2',
      release: { exists: true, assetNames: [] },
      freshChecksums: fresh,
      recordedChecksums: {},
    })
    expect(decision).toMatchObject({ action: 'upload' })
    expect(decision.action === 'upload' && decision.assetNames.length).toBe(completeAssets().length)
  })

  // The rebuild is byte-reproducible at a fixed APP_VERSION (verified: two
  // `build:lib` runs produce identical sha256), so a recorded checksum that
  // disagrees with the fresh one is a real anomaly — never something to
  // silently clobber over bytes a consumer may already have downloaded.
  it('fails loudly when a checksum already on the release disagrees with the fresh build', () => {
    expect(() =>
      planReleaseReconcile({
        tag: 'v3.4.2',
        release: { exists: true, assetNames: completeAssets() },
        freshChecksums: fresh,
        recordedChecksums: {
          ...fresh,
          'odl-drawcustom-designer.js.sha256': 'DIFFERENT  odl-drawcustom-designer.js\n',
        },
      }),
    ).toThrow(/checksum/i)
  })

  it('tolerates whitespace differences when comparing checksum files', () => {
    const decision = planReleaseReconcile({
      tag: 'v3.4.2',
      release: { exists: true, assetNames: completeAssets() },
      freshChecksums: fresh,
      recordedChecksums: {
        'odl-drawcustom-designer.js.sha256': '  aaa  odl-drawcustom-designer.js  ',
        'odl-drawcustom-designer.d.ts.sha256': 'bbb  odl-drawcustom-designer.d.ts',
      },
    })
    expect(decision).toMatchObject({ action: 'complete' })
  })

  // A tag with no release is not a state this pipeline can produce (`gh
  // release create` makes both together), so it means someone deleted the
  // release. Recreating it would regenerate notes over a range that was
  // deliberately changed and would mask a destructive action.
  it('fails loudly when the tag exists but the release does not', () => {
    expect(() =>
      planReleaseReconcile({
        tag: 'v3.4.2',
        release: { exists: false, assetNames: [] },
        freshChecksums: fresh,
        recordedChecksums: {},
      }),
    ).toThrow(/no GitHub release/i)
  })
})

describe('ghReleaseUploadArgs', () => {
  it('uploads the named files against the tag, clobbering so a re-run converges', () => {
    const args = ghReleaseUploadArgs('v3.4.2', ['dist-lib/a.js', 'NOTICE'])
    expect(args.slice(0, 3)).toEqual(['release', 'upload', 'v3.4.2'])
    expect(args).toContain('dist-lib/a.js')
    expect(args).toContain('NOTICE')
    expect(args).toContain('--clobber')
  })
})

describe('ghReleaseViewAssetsArgs', () => {
  it('asks only for the asset list, as JSON', () => {
    expect(ghReleaseViewAssetsArgs('v3.4.2')).toEqual(['release', 'view', 'v3.4.2', '--json', 'assets'])
  })
})
