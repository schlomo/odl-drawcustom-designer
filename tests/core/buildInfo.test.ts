import { describe, expect, it } from 'vitest'
import {
  APP_GIT_BRANCH,
  APP_GIT_REVISION,
  formatGitBranchLabel,
  formatGitRevisionLabel,
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
