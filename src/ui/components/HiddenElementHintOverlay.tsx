import type { HiddenElementHint } from '../lib/hidden-element-hints'
import { hiddenHintTitle } from '../lib/hidden-element-hints'

interface HiddenElementHintOverlayProps {
  hint: HiddenElementHint
  width: number
  height: number
}

const GHOST_STROKE = '#64748b'

export function HiddenElementHintOverlay({ hint, width, height }: HiddenElementHintOverlayProps) {
  const { bounds, reason } = hint

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    >
      <title>{hiddenHintTitle(reason)}</title>
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        fill="none"
        stroke={GHOST_STROKE}
        strokeWidth={1}
        strokeDasharray="4 3"
        opacity={0.85}
      />
      <text
        x={bounds.x + bounds.width / 2}
        y={bounds.y + bounds.height / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={Math.min(11, Math.max(8, bounds.height / 3))}
        fill={GHOST_STROKE}
        opacity={0.75}
      >
        invisible
      </text>
    </svg>
  )
}
