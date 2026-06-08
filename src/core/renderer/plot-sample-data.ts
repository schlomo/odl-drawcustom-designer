export function hashString(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

export function generateSampleSeriesValues(
  entity: string,
  seriesIndex: number,
  pointCount: number,
  low: number,
  high: number,
): number[] {
  const span = high - low
  const mid = low + span / 2
  const amplitude = span * 0.35
  const seed = hashString(`${entity}:${seriesIndex}`)
  const phase = (seed % 360) * (Math.PI / 180)
  const frequency = 1.5 + (seed % 5) * 0.2
  const values: number[] = []

  for (let index = 0; index < pointCount; index++) {
    const t = pointCount <= 1 ? 0 : index / (pointCount - 1)
    const wave = Math.sin(t * Math.PI * 2 * frequency + phase)
    const ripple = Math.sin(t * Math.PI * 6 + phase * 0.5) * 0.15
    const offset = ((seed % 7) - 3) * 0.02 * span
    values.push(mid + amplitude * (wave + ripple) + offset)
  }

  return values
}

export function resolvePlotValueRange(
  low: number | undefined,
  high: number | undefined,
  sampleValues: readonly number[],
): { low: number; high: number } {
  const hasLow = typeof low === 'number' && Number.isFinite(low)
  const hasHigh = typeof high === 'number' && Number.isFinite(high)

  if (hasLow && hasHigh && high! > low!) {
    return { low: low!, high: high! }
  }

  const min = Math.min(...sampleValues)
  const max = Math.max(...sampleValues)
  const padding = Math.max((max - min) * 0.1, 0.5)

  if (hasLow) {
    return { low: low!, high: Math.max(max + padding, low! + padding) }
  }
  if (hasHigh) {
    return { low: Math.min(min - padding, high! - padding), high: high! }
  }

  return { low: min - padding, high: max + padding }
}
