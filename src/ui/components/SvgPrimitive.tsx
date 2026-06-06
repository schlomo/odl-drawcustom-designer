import type { ReactNode } from 'react'
import { iconSequenceBoxSize } from '../../core/renderer/anchors'
import type { SvgPrimitive as SvgPrimitiveType } from '../../core/renderer/types'

interface SvgPrimitiveProps {
  primitive: SvgPrimitiveType
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = {
    x: cx + r * Math.cos(startAngle),
    y: cy + r * Math.sin(startAngle),
  }
  const end = {
    x: cx + r * Math.cos(endAngle),
    y: cy + r * Math.sin(endAngle),
  }
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`
}

export function SvgPrimitive({ primitive }: SvgPrimitiveProps) {
  switch (primitive.kind) {
    case 'line':
      return (
        <line
          x1={primitive.x1}
          y1={primitive.y1}
          x2={primitive.x2}
          y2={primitive.y2}
          stroke={primitive.stroke}
          strokeWidth={primitive.strokeWidth}
          strokeDasharray={
            primitive.dashed
              ? `${primitive.dashLength ?? 4} ${primitive.spaceLength ?? 4}`
              : undefined
          }
        />
      )
    case 'rect':
      return (
        <rect
          x={primitive.x}
          y={primitive.y}
          width={primitive.width}
          height={primitive.height}
          fill={primitive.fill ?? 'none'}
          stroke={primitive.stroke}
          strokeWidth={primitive.strokeWidth}
          rx={primitive.radius}
        />
      )
    case 'circle':
      return (
        <circle
          cx={primitive.cx}
          cy={primitive.cy}
          r={primitive.r}
          fill={primitive.fill ?? 'none'}
          stroke={primitive.stroke}
          strokeWidth={primitive.strokeWidth}
        />
      )
    case 'ellipse':
      return (
        <ellipse
          cx={primitive.cx}
          cy={primitive.cy}
          rx={primitive.rx}
          ry={primitive.ry}
          fill={primitive.fill ?? 'none'}
          stroke={primitive.stroke}
          strokeWidth={primitive.strokeWidth}
        />
      )
    case 'polygon': {
      const points = primitive.points.map(([x, y]) => `${x},${y}`).join(' ')
      return (
        <polygon
          points={points}
          fill={primitive.fill ?? 'none'}
          stroke={primitive.stroke}
          strokeWidth={primitive.strokeWidth}
        />
      )
    }
    case 'arc':
      return (
        <path
          d={arcPath(
            primitive.cx,
            primitive.cy,
            primitive.r,
            primitive.startAngle,
            primitive.endAngle,
          )}
          fill={primitive.fill ?? 'none'}
          stroke={primitive.stroke}
          strokeWidth={primitive.strokeWidth}
        />
      )
    case 'icon-stub':
      return (
        <g>
          <rect
            x={primitive.x}
            y={primitive.y}
            width={primitive.size}
            height={primitive.size}
            fill="none"
            stroke={primitive.fill}
            strokeWidth={1}
            strokeDasharray="4 2"
          />
          <text
            x={primitive.x + primitive.size / 2}
            y={primitive.y + primitive.size / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={10}
            fill={primitive.fill}
          >
            {primitive.value}
          </text>
        </g>
      )
    case 'icon-sequence-stub': {
      const sequenceBounds = iconSequenceBoxSize(
        primitive.size,
        primitive.icons.length,
        primitive.spacing,
        primitive.direction,
      )
      return (
        <g>
          <rect
            x={primitive.x}
            y={primitive.y}
            width={sequenceBounds.width}
            height={sequenceBounds.height}
            fill="none"
            stroke={primitive.fill}
            strokeWidth={1}
            strokeDasharray="4 2"
          />
          <text
            x={primitive.x + sequenceBounds.width / 2}
            y={primitive.y + sequenceBounds.height / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={9}
            fill={primitive.fill}
          >
            {primitive.icons.length} icons
          </text>
        </g>
      )
    }
    case 'rectangle-pattern-stub':
      return (
        <g>
          {primitive.rects.map((rect, index) => (
            <rect
              key={index}
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              fill={rect.fill ?? 'none'}
              stroke={rect.stroke}
              strokeWidth={rect.strokeWidth}
              rx={rect.radius}
            />
          ))}
        </g>
      )
    case 'progress-bar-stub':
      return (
        <g>
          <rect
            x={primitive.background.x}
            y={primitive.background.y}
            width={primitive.background.width}
            height={primitive.background.height}
            fill={primitive.background.fill ?? '#FFFFFF'}
            stroke={primitive.background.stroke}
            strokeWidth={primitive.background.strokeWidth}
          />
          <rect
            x={primitive.fill.x}
            y={primitive.fill.y}
            width={primitive.fill.width}
            height={primitive.fill.height}
            fill={primitive.fill.fill ?? '#000000'}
          />
        </g>
      )
    case 'debug-grid-stub': {
      const lines: ReactNode[] = []
      for (let x = 0; x <= primitive.width; x += primitive.spacing) {
        lines.push(
          <line
            key={`v-${x}`}
            x1={x}
            y1={0}
            x2={x}
            y2={primitive.height}
            stroke={primitive.stroke}
            strokeWidth={0.5}
            strokeDasharray={
              primitive.dashed
                ? `${primitive.dashLength ?? 4} ${primitive.spaceLength ?? 4}`
                : undefined
            }
          />,
        )
      }
      for (let y = 0; y <= primitive.height; y += primitive.spacing) {
        lines.push(
          <line
            key={`h-${y}`}
            x1={0}
            y1={y}
            x2={primitive.width}
            y2={y}
            stroke={primitive.stroke}
            strokeWidth={0.5}
            strokeDasharray={
              primitive.dashed
                ? `${primitive.dashLength ?? 4} ${primitive.spaceLength ?? 4}`
                : undefined
            }
          />,
        )
      }
      return <g>{lines}</g>
    }
    default: {
      const _exhaustive: never = primitive
      return _exhaustive
    }
  }
}
