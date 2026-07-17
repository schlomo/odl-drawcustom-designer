import { describe, expect, it } from 'vitest'
import { resolveGitBranch, resolveGitPrNumber, resolveGitRevision } from '../../tools/gitRevision'

describe('resolveGitRevision', () => {
  it('returns test under Vitest', () => {
    expect(resolveGitRevision({ vitest: true })).toBe('test')
  })

  it('truncates VITE_GIT_REVISION to seven characters', () => {
    expect(
      resolveGitRevision({ viteGitRevision: 'abcdef0123456789abcdef0123456789abcdef12' }),
    ).toBe('abcdef0')
  })

  it('uses a short VITE_GIT_REVISION as-is', () => {
    expect(resolveGitRevision({ viteGitRevision: 'abc1234' })).toBe('abc1234')
  })

  it('falls back to the first seven characters of GITHUB_SHA', () => {
    expect(
      resolveGitRevision({ githubSha: 'abcdef0123456789abcdef0123456789abcdef12' }),
    ).toBe('abcdef0')
  })

  it('uses git short head when env vars are absent', () => {
    expect(resolveGitRevision({ gitShortHead: '47ec093' })).toBe('47ec093')
  })

  it('returns dev when no revision source is available', () => {
    expect(resolveGitRevision({})).toBe('dev')
  })
})

describe('resolveGitBranch', () => {
  it('returns test under Vitest', () => {
    expect(resolveGitBranch({ vitest: true })).toBe('test')
  })

  it('uses VITE_GIT_BRANCH when set', () => {
    expect(resolveGitBranch({ viteGitBranch: 'feature/foo' })).toBe('feature/foo')
  })

  it('trims VITE_GIT_BRANCH', () => {
    expect(resolveGitBranch({ viteGitBranch: '  main  ' })).toBe('main')
  })

  it('falls back to GITHUB_REF_NAME', () => {
    expect(resolveGitBranch({ githubRefName: 'main' })).toBe('main')
  })

  it('uses GITHUB_HEAD_REF instead of a PR merge ref', () => {
    expect(
      resolveGitBranch({ githubRefName: '11/merge', githubHeadRef: 'feature/foo' }),
    ).toBe('feature/foo')
  })

  it('falls back to the merge ref when GITHUB_HEAD_REF is absent', () => {
    expect(resolveGitBranch({ githubRefName: '11/merge' })).toBe('11/merge')
  })

  it('uses git branch when env vars are absent', () => {
    expect(resolveGitBranch({ gitBranch: 'main' })).toBe('main')
  })

  it('returns dev when no branch source is available', () => {
    expect(resolveGitBranch({})).toBe('dev')
  })
})

describe('resolveGitPrNumber', () => {
  it('extracts the PR number from a merge ref', () => {
    expect(resolveGitPrNumber({ githubRefName: '11/merge' })).toBe(11)
    expect(resolveGitPrNumber({ githubRefName: '1/merge' })).toBe(1)
    expect(resolveGitPrNumber({ githubRefName: '123/merge' })).toBe(123)
  })

  it('returns undefined for non-PR refs', () => {
    expect(resolveGitPrNumber({ githubRefName: 'main' })).toBeUndefined()
    expect(resolveGitPrNumber({ githubRefName: 'feature/foo' })).toBeUndefined()
    expect(resolveGitPrNumber({})).toBeUndefined()
  })

  it('trims whitespace before matching', () => {
    expect(resolveGitPrNumber({ githubRefName: '  11/merge  ' })).toBe(11)
  })
})
