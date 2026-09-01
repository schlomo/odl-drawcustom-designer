import { describe, expect, it } from 'vitest'
import {
  APP_GIT_BRANCH,
  APP_GIT_MERGE_REVISION,
  APP_GIT_PR_NUMBER,
  APP_GIT_REVISION,
  APP_HEADER_LEGAL_HTML,
  APP_HEADER_VERSION,
  APP_SITE_VERSION,
  APP_VERSION,
  formatGitBranchLabel,
  formatGitRevisionLabel,
  formatRevisionTooltip,
  githubBranchUrl,
  githubCommitUrl,
  githubReleaseUrl,
  isReleasedVersion,
  resolveHeaderVersion,
} from '../../src/core/buildInfo'

describe('APP_GIT_REVISION', () => {
  it('is injected by Vitest as test', () => {
    expect(APP_GIT_REVISION).toBe('test')
  })
})

describe('APP_GIT_BRANCH', () => {
  it('is injected by Vitest as test', () => {
    expect(APP_GIT_BRANCH).toBe('test')
  })
})

describe('APP_GIT_MERGE_REVISION', () => {
  it('is injected by Vitest as test (vitest-hermetic)', () => {
    expect(APP_GIT_MERGE_REVISION).toBe('test')
  })
})

describe('APP_VERSION', () => {
  it('is injected by Vitest as test (issue #23 runtime version reporting)', () => {
    expect(APP_VERSION).toBe('test')
  })
})

describe('APP_SITE_VERSION', () => {
  // Proves the Vitest short-circuit (AGENTS.md, "Build-time defines"): the
  // production-only SITE_VERSION env var must never leak into the Vitest
  // runtime, the same way GITHUB_REF_NAME once did for the branch label.
  it('is empty when VITEST short-circuits SITE_VERSION (never a placeholder)', () => {
    expect(APP_SITE_VERSION).toBe('')
  })
})

describe('APP_HEADER_LEGAL_HTML', () => {
  it('is empty when VITE_HEADER_LEGAL_HTML is unset', () => {
    expect(APP_HEADER_LEGAL_HTML).toBe('')
  })
})

describe('isReleasedVersion', () => {
  it('accepts a plain X.Y.Z release version', () => {
    expect(isReleasedVersion('3.3.0')).toBe(true)
    expect(isReleasedVersion('1.0.0')).toBe(true)
    expect(isReleasedVersion('10.20.30')).toBe(true)
  })

  it('rejects the dev placeholder (tools/version.ts DEV_APP_VERSION)', () => {
    expect(isReleasedVersion('0.0.0-dev')).toBe(false)
  })

  it("rejects Vitest's own short-circuited placeholder", () => {
    expect(isReleasedVersion('test')).toBe(false)
  })

  it('rejects a leading v, a pre-release suffix, and empty', () => {
    expect(isReleasedVersion('v3.3.0')).toBe(false)
    expect(isReleasedVersion('3.3.0-rc.1')).toBe(false)
    expect(isReleasedVersion('')).toBe(false)
  })
})

describe('resolveHeaderVersion', () => {
  // Point 1 (issue: embedded designer showed a SHA instead of its version):
  // priority order between the two independent version signals.
  it('prefers the site version when present, regardless of the app version', () => {
    expect(resolveHeaderVersion('3.0.0', '0.0.0-dev')).toBe('3.0.0')
    expect(resolveHeaderVersion('3.0.0', '3.3.0')).toBe('3.0.0')
  })

  it('falls back to the app/library version when it is a real release — the library-build fix', () => {
    expect(resolveHeaderVersion('', '3.3.0')).toBe('3.3.0')
  })

  it('never presents the dev placeholder as a real version', () => {
    expect(resolveHeaderVersion('', '0.0.0-dev')).toBe('')
  })

  it("never presents Vitest's own placeholder as a real version", () => {
    expect(resolveHeaderVersion('', 'test')).toBe('')
  })

  it('is empty when neither source has a real version (local dev, CI checks, PR previews)', () => {
    expect(resolveHeaderVersion('', '')).toBe('')
  })
})

describe('APP_HEADER_VERSION', () => {
  // Proves the Vitest short-circuit holds end-to-end for the resolved
  // export too: real APP_SITE_VERSION is '' and real APP_VERSION is the
  // Vitest placeholder 'test' under the runtime's own build-time defines
  // (AGENTS.md, "Build-time defines") — neither leaks through as a shown
  // version.
  it('is empty under Vitest (neither source supplies a real version)', () => {
    expect(APP_HEADER_VERSION).toBe('')
    expect(APP_HEADER_VERSION).toBe(resolveHeaderVersion(APP_SITE_VERSION, APP_VERSION))
  })
})

describe('APP_GIT_PR_NUMBER', () => {
  it('is 0 when VITE_GIT_PR_NUMBER is unset', () => {
    expect(APP_GIT_PR_NUMBER).toBe(0)
  })
})

describe('formatGitBranchLabel', () => {
  it('keeps short branch names', () => {
    expect(formatGitBranchLabel('main')).toBe('main')
    expect(formatGitBranchLabel('gh-pages')).toBe('gh-pages')
  })

  it('uses the leaf segment for nested branches', () => {
    expect(formatGitBranchLabel('feature/add-header-metadata')).toBe('add-header-…')
  })

  it('keeps dev and test labels', () => {
    expect(formatGitBranchLabel('dev')).toBe('dev')
    expect(formatGitBranchLabel('test')).toBe('test')
  })
})

describe('formatGitRevisionLabel', () => {
  it('shortens full commit SHAs to 7 characters', () => {
    expect(formatGitRevisionLabel('895142a1b2c3d4e5f678901234567890abcd')).toBe('895142a')
  })

  it('keeps short revisions', () => {
    expect(formatGitRevisionLabel('abc1234')).toBe('abc1234')
    expect(formatGitRevisionLabel('dev')).toBe('dev')
    expect(formatGitRevisionLabel('test')).toBe('test')
  })
})

describe('formatRevisionTooltip', () => {
  it('shows only the revision when the merge SHA matches it', () => {
    expect(formatRevisionTooltip('abc1234', 'abc1234')).toBe('Revision: abc1234')
  })

  it('shows only the revision when the merge SHA is a dev/test label', () => {
    expect(formatRevisionTooltip('abc1234', 'dev')).toBe('Revision: abc1234')
    expect(formatRevisionTooltip('abc1234', 'test')).toBe('Revision: abc1234')
  })

  it('appends the merge SHA when it differs from the shown (PR head) revision', () => {
    expect(
      formatRevisionTooltip('feedbee', '895142a1b2c3d4e5f678901234567890abcd'),
    ).toBe('Revision: feedbee · built from merge 895142a')
  })
})

describe('githubBranchUrl', () => {
  it('defaults to the injected build branch', () => {
    expect(githubBranchUrl()).toBe(
      'https://github.com/schlomo/odl-drawcustom-designer/commits/main',
    )
  })

  it('links to a branch tree', () => {
    expect(githubBranchUrl('feature/foo')).toBe(
      'https://github.com/schlomo/odl-drawcustom-designer/tree/feature%2Ffoo',
    )
  })

  it('links to the PR page when a PR number is provided', () => {
    expect(githubBranchUrl('feature/foo', 11)).toBe(
      'https://github.com/schlomo/odl-drawcustom-designer/pull/11',
    )
  })

  it('links to main history for local dev branch', () => {
    expect(githubBranchUrl('dev')).toBe(
      'https://github.com/schlomo/odl-drawcustom-designer/commits/main',
    )
  })

  it('links to main history for Vitest branch', () => {
    expect(githubBranchUrl('test')).toBe(
      'https://github.com/schlomo/odl-drawcustom-designer/commits/main',
    )
  })
})

describe('githubCommitUrl', () => {
  it('defaults to the injected build revision', () => {
    expect(githubCommitUrl()).toBe(
      'https://github.com/schlomo/odl-drawcustom-designer/commits/main',
    )
  })

  it('links to a specific commit', () => {
    expect(githubCommitUrl('abc1234')).toBe(
      'https://github.com/schlomo/odl-drawcustom-designer/commit/abc1234',
    )
  })

  it('links to main history for local dev revision', () => {
    expect(githubCommitUrl('dev')).toBe(
      'https://github.com/schlomo/odl-drawcustom-designer/commits/main',
    )
  })

  it('links to main history for Vitest revision', () => {
    expect(githubCommitUrl('test')).toBe(
      'https://github.com/schlomo/odl-drawcustom-designer/commits/main',
    )
  })
})

describe('githubReleaseUrl', () => {
  it('links to the vX.Y.Z release page for a given version', () => {
    expect(githubReleaseUrl('3.0.0')).toBe(
      'https://github.com/schlomo/odl-drawcustom-designer/releases/tag/v3.0.0',
    )
  })

  it('defaults to the injected build site version', () => {
    expect(githubReleaseUrl()).toBe(
      `https://github.com/schlomo/odl-drawcustom-designer/releases/tag/v${APP_SITE_VERSION}`,
    )
  })
})
