import { describe, expect, it } from 'vitest'
import {
  APP_GIT_BRANCH,
  APP_GIT_MERGE_REVISION,
  APP_GIT_PR_NUMBER,
  APP_GIT_REVISION,
  APP_HEADER_LEGAL_HTML,
  formatGitBranchLabel,
  formatGitRevisionLabel,
  formatRevisionTooltip,
  githubBranchUrl,
  githubCommitUrl,
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

describe('APP_HEADER_LEGAL_HTML', () => {
  it('is empty when VITE_HEADER_LEGAL_HTML is unset', () => {
    expect(APP_HEADER_LEGAL_HTML).toBe('')
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
