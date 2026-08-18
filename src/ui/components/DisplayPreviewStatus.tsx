import { shell } from '../styles/shell'

interface DisplayPreviewStatusProps {
  loading: boolean
  error: string | null
}

/**
 * What the preview area says while the host is rendering, and when it could
 * not (issue #109).
 *
 * Two deliberately different weights:
 *
 * - **Loading is subtle** — a corner chip, non-blocking. A dither flip or a
 *   payload edit keeps the previous host render on screen underneath while it
 *   re-requests, since neither can change the image's shape. A geometry
 *   change (a resolution pick, a re-orientation) is the one exception: the
 *   hook clears the image immediately on that change (maintainer
 *   manual-validation finding, PR #143) — the old image is authored for the
 *   old shape, so leaving it up would letterbox into the new canvas box
 *   before the new render lands, a visible double resize. This chip is what
 *   fills the blank paper in between.
 * - **A failure is explicit** — a centered, stated error, and the hook has
 *   already dropped the image: a clear error beats a stale or wrong render
 *   (maintainer ruling). Never a silent fall back to the designer's own
 *   rasterization, which would quietly answer a different question.
 */
export function DisplayPreviewStatus({ loading, error }: DisplayPreviewStatusProps) {
  if (error != null) {
    return (
      <div
        data-testid="display-preview-error"
        role="alert"
        className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center p-4 text-center"
      >
        <p
          className={`max-w-sm rounded-md border ${shell.panelBorder} ${shell.panel} px-3 py-1.5 text-sm text-[var(--shell-danger)]`}
        >
          Display preview failed — {error}
        </p>
      </div>
    )
  }

  if (!loading) {
    return null
  }

  return (
    <div
      data-testid="display-preview-loading"
      role="status"
      aria-live="polite"
      className={`pointer-events-none absolute top-3 left-3 z-40 rounded-md border ${shell.panelBorder} ${shell.panel} px-2 py-0.5 text-xs ${shell.muted}`}
    >
      Rendering on the display…
    </div>
  )
}
