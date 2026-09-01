import { Fragment, type ReactNode } from 'react'
import {
  APP_GITHUB_REPO_URL,
  APP_GIT_BRANCH,
  APP_GIT_MERGE_REVISION,
  APP_GIT_PR_NUMBER,
  APP_GIT_REVISION,
  APP_HEADER_VERSION,
  APP_PRIVACY_HEADLINE,
  APP_PRIVACY_NOTE,
  formatGitBranchLabel,
  formatGitRevisionLabel,
  formatRevisionTooltip,
  githubBranchUrl,
  githubCommitUrl,
  githubReleaseUrl,
} from '../../core'
import {
  HEADER_META_SEGMENT_ATTR,
  HEADER_META_SEPARATOR_ATTR,
} from '../hooks/useHeaderMetaSegments'
import type { HeaderMetaSegment } from '../lib/header-meta-collapse'
import { shell } from '../styles/shell'

interface HeaderMetaRowProps {
  /** Segments to render; ignored when {@link measureOnly} is set. */
  visible: ReadonlySet<HeaderMetaSegment>
  /**
   * Off-screen probe: render every segment at its natural width so
   * `useHeaderMetaSegments` can measure what each one costs (ADR-016 probe
   * model). Never shown to the user.
   */
  measureOnly?: boolean
}

const LINK_CLASS = 'shrink-0 underline-offset-2 hover:underline'
const MONO_LINK_CLASS = 'shrink-0 font-mono underline-offset-2 hover:underline'

/**
 * Build metadata line in the page header.
 *
 * Segments are whole units: one either shows in full or is dropped from the DOM
 * entirely (maintainer ruling 2026-08-31 — a header that ellipses `Client-…` and
 * `feat/si…` costs width and communicates nothing, and it did so while the
 * action buttons beside it kept their full labels). Priority and the drop order
 * live in `header-meta-collapse.ts`. The branch name is the one segment still
 * allowed a CSS ellipsis inside its own budget: a partially shown branch next to
 * a full `PR #n` is still readable, which is why PR #173 gave it `truncate`.
 */
export function HeaderMetaRow({ visible, measureOnly = false }: HeaderMetaRowProps) {
  const tag = (id: HeaderMetaSegment) => ({ [HEADER_META_SEGMENT_ATTR]: id })

  const segments: Array<{ id: HeaderMetaSegment; node: ReactNode }> = [
    {
      id: 'privacy',
      // No `truncate`: this segment is dropped rather than shown as a stub.
      node: (
        <span {...tag('privacy')} className="shrink-0 whitespace-nowrap" title={APP_PRIVACY_NOTE}>
          {APP_PRIVACY_HEADLINE}
        </span>
      ),
    },
    {
      id: 'github',
      node: (
        <a
          {...tag('github')}
          href={APP_GITHUB_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK_CLASS}
        >
          GitHub
        </a>
      ),
    },
  ]

  if (APP_HEADER_VERSION) {
    // A build out of the release pipeline: the release version is the
    // build's identity — for the standalone production site and for a
    // library build vendored into a host alike, since both bake the one
    // `APP_VERSION` that run computed (src/core/buildInfo.ts).
    segments.push({
      id: 'version',
      node: (
        <a
          {...tag('version')}
          href={githubReleaseUrl(APP_HEADER_VERSION)}
          target="_blank"
          rel="noopener noreferrer"
          className={MONO_LINK_CLASS}
          title={`Release v${APP_HEADER_VERSION}`}
        >
          {`v${APP_HEADER_VERSION}`}
        </a>
      ),
    })
  } else if (APP_GIT_PR_NUMBER > 0) {
    // PR preview build: `PR #n` is the identity and never shrinks; the branch
    // name beside it may ellipse, and is dropped before the PR number is.
    segments.push({
      id: 'version',
      node: (
        <span {...tag('version')} className="shrink-0 whitespace-nowrap font-mono">
          {`PR #${APP_GIT_PR_NUMBER}`}
        </span>
      ),
    })
    segments.push({
      id: 'branch',
      node: (
        <a
          {...tag('branch')}
          href={githubBranchUrl(APP_GIT_BRANCH, APP_GIT_PR_NUMBER)}
          target="_blank"
          rel="noopener noreferrer"
          className={measureOnly ? MONO_LINK_CLASS : 'truncate font-mono underline-offset-2 hover:underline'}
          title={`PR #${APP_GIT_PR_NUMBER} · Branch: ${APP_GIT_BRANCH}`}
        >
          {APP_GIT_BRANCH}
        </a>
      ),
    })
  } else {
    // Local dev / CI checks / a local build:site with no PR context.
    segments.push({
      id: 'branch',
      node: (
        <a
          {...tag('branch')}
          href={githubBranchUrl(APP_GIT_BRANCH, APP_GIT_PR_NUMBER)}
          target="_blank"
          rel="noopener noreferrer"
          className={MONO_LINK_CLASS}
          title={`Branch: ${APP_GIT_BRANCH}`}
        >
          {formatGitBranchLabel(APP_GIT_BRANCH)}
        </a>
      ),
    })
  }

  segments.push({
    id: 'sha',
    node: (
      <a
        {...tag('sha')}
        href={githubCommitUrl(APP_GIT_REVISION)}
        target="_blank"
        rel="noopener noreferrer"
        className={MONO_LINK_CLASS}
        title={formatRevisionTooltip(APP_GIT_REVISION, APP_GIT_MERGE_REVISION)}
      >
        {formatGitRevisionLabel(APP_GIT_REVISION)}
      </a>
    ),
  })

  const shown = measureOnly ? segments : segments.filter(({ id }) => visible.has(id))

  return (
    <div
      data-testid={measureOnly ? 'header-meta-row-probe' : 'header-meta-row'}
      // The separators carry their own `px-1` spacing instead of the row using
      // `gap`, so one measured separator element is the exact cost of joining
      // two segments — no gap fudge factor in `headerMetaSegmentsWidth`.
      // `overflow-hidden` on the live row is the backstop for the frame before
      // the first measurement lands: the row is `min-w-0`, so even holding
      // every segment it can never widen the header.
      className={`flex items-center text-xs ${shell.muted} ${
        measureOnly ? 'w-max' : 'w-full min-w-0 justify-center overflow-hidden'
      }`}
    >
      {shown.map(({ id, node }, index) => (
        <Fragment key={id}>
          {index > 0 ? (
            <span
              {...{ [HEADER_META_SEPARATOR_ATTR]: '' }}
              aria-hidden="true"
              className="shrink-0 px-1"
            >
              ·
            </span>
          ) : null}
          {node}
        </Fragment>
      ))}
    </div>
  )
}
