import type { ReactNode } from 'react'
import {
  buildArcPiePath,
  type SvgPrimitive as SvgPrimitiveType,
} from '../../core'
import { clampStrokeWidth, resolveSvgFontFamily } from '../lib/svg-font-family'

interface SvgPrimitiveProps {
  primitive: SvgPrimitiveType
  fontFamilies?: ReadonlyMap<string, string>
}

const MDI_VIEWBOX_SIZE = 24

function mdiIconPath(
  x: number,
  y: number,
  size: number,
  path: string,
  fill: string,
): ReactNode {
  const scale = size / MDI_VIEWBOX_SIZE
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`}>
      <path d={path} fill={fill} />
    </g>
  )
}

function unknownIconFallback(
  x: number,
  y: number,
  size: number,
  label: string,
  fill: string,
): ReactNode {
  const fontSize = Math.min(11, Math.max(8, size / 10))
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={size}
        height={size}
        fill="#f8fafc"
        stroke={fill}
        strokeWidth={1}
        strokeDasharray="4 2"
      />
      <text
        x={x + size / 2}
        y={y + size / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fontSize}
        fill={fill}
      >
        {label.length > 14 ? `${label.slice(0, 12)}…` : label}
      </text>
    </g>
  )
}

export function SvgPrimitive({ primitive, fontFamilies = new Map() }: SvgPrimitiveProps) {
  switch (primitive.kind) {
    case 'line':
      return (
        <line
          x1={primitive.x1}
          y1={primitive.y1}
          x2={primitive.x2}
          y2={primitive.y2}
          stroke={primitive.stroke}
          strokeWidth={clampStrokeWidth(primitive.strokeWidth)}
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
          strokeWidth={clampStrokeWidth(primitive.strokeWidth)}
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
          strokeWidth={clampStrokeWidth(primitive.strokeWidth)}
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
          strokeWidth={clampStrokeWidth(primitive.strokeWidth)}
        />
      )
    case 'polygon': {
      const points = primitive.points.map(([x, y]) => `${x},${y}`).join(' ')
      return (
        <polygon
          points={points}
          fill={primitive.fill ?? 'none'}
          stroke={primitive.stroke}
          strokeWidth={clampStrokeWidth(primitive.strokeWidth)}
        />
      )
    }
    case 'arc':
      return (
        <path
          d={buildArcPiePath(
            primitive.cx,
            primitive.cy,
            primitive.r,
            primitive.startAngle,
            primitive.endAngle,
          )}
          fill={primitive.fill ?? 'none'}
          stroke={primitive.stroke}
          strokeWidth={clampStrokeWidth(primitive.strokeWidth)}
        />
      )
    case 'icon': {
      const label = primitive.value.replace(/^mdi:/, '')
      if (primitive.path) {
        return mdiIconPath(primitive.x, primitive.y, primitive.size, primitive.path, primitive.fill)
      }
      return unknownIconFallback(primitive.x, primitive.y, primitive.size, label, primitive.fill)
    }
    case 'icon_sequence':
      return (
        <g>
          {primitive.icons.map((icon, index) => (
            <g key={`${icon.name}-${index}`}>
              {icon.path
                ? mdiIconPath(icon.x, icon.y, primitive.size, icon.path, primitive.fill)
                : unknownIconFallback(
                    icon.x,
                    icon.y,
                    primitive.size,
                    icon.name.replace(/^mdi:/, ''),
                    primitive.fill,
                  )}
            </g>
          ))}
        </g>
      )
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
              strokeWidth={clampStrokeWidth(rect.strokeWidth)}
              rx={rect.radius}
            />
          ))}
        </g>
      )
    case 'progress-bar-stub': {
      const progressLabel = `${Math.round(Math.min(100, Math.max(0, primitive.progress)))}%`
      const percentageFontFamily = resolveSvgFontFamily(primitive.percentageFontKey, fontFamilies)
      return (
        <g>
          <rect
            x={primitive.background.x}
            y={primitive.background.y}
            width={primitive.background.width}
            height={primitive.background.height}
            fill={primitive.background.fill ?? '#FFFFFF'}
            stroke={primitive.background.stroke}
            strokeWidth={clampStrokeWidth(primitive.background.strokeWidth)}
          />
          <rect
            x={primitive.fill.x}
            y={primitive.fill.y}
            width={primitive.fill.width}
            height={primitive.fill.height}
            fill={primitive.fill.fill ?? '#000000'}
          />
          {primitive.showPercentage ? (
            <text
              x={primitive.background.x + primitive.background.width / 2}
              y={primitive.background.y + primitive.background.height / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={primitive.percentageFontSize ?? 12}
              fontFamily={percentageFontFamily}
              fill={primitive.percentageColor ?? '#000000'}
            >
              {progressLabel}
            </text>
          ) : null}
        </g>
      )
    }
    case 'debug-grid-stub': {
      const lines: ReactNode[] = []
      const labels: ReactNode[] = []
      const labelFontSize = primitive.labelFontSize ?? 12
      const labelFontFamily = resolveSvgFontFamily(primitive.labelFontKey, fontFamilies)
      const labelStep = primitive.labelStep ?? 40

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
        if (primitive.showLabels && x % labelStep === 0 && x !== 0) {
          labels.push(
            <text
              key={`label-x-${x}`}
              x={x + 2}
              y={2}
              dominantBaseline="hanging"
              fontSize={labelFontSize}
              fontFamily={labelFontFamily}
              fill={primitive.labelColor ?? primitive.stroke}
            >
              {x}
            </text>,
          )
        }
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
        if (primitive.showLabels && y % labelStep === 0 && y !== 0) {
          labels.push(
            <text
              key={`label-y-${y}`}
              x={2}
              y={y}
              dominantBaseline="middle"
              fontSize={labelFontSize}
              fontFamily={labelFontFamily}
              fill={primitive.labelColor ?? primitive.stroke}
            >
              {y}
            </text>,
          )
        }
      }
      if (primitive.showLabels) {
        labels.push(
          <text
            key="label-origin"
            x={2}
            y={2}
            dominantBaseline="hanging"
            fontSize={labelFontSize}
            fontFamily={labelFontFamily}
            fill={primitive.labelColor ?? primitive.stroke}
          >
            0
          </text>,
        )
      }
      return (
        <g>
          {lines}
          {labels}
        </g>
      )
    }
    default: {
      const _exhaustive: never = primitive
      return _exhaustive
    }
  }
}
