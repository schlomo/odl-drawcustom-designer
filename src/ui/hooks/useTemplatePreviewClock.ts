import { useEffect, useState } from 'react'
import type { PreviewClockInterval } from '../../core'

/** Milliseconds until the next whole second (for aligned second ticks). */
export function msUntilNextSecond(from = new Date()): number {
  return 1000 - from.getMilliseconds()
}

/** Milliseconds until the next whole minute (for aligned minute ticks). */
export function msUntilNextMinute(from = new Date()): number {
  return (60 - from.getSeconds()) * 1000 - from.getMilliseconds()
}

function msUntilNextTick(interval: Exclude<PreviewClockInterval, 'off'>, from = new Date()): number {
  return interval === 'second' ? msUntilNextSecond(from) : msUntilNextMinute(from)
}

/** Live clock for template preview only — never mutates YAML source or undo history. */
export function useTemplatePreviewClock(interval: PreviewClockInterval = 'second'): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (interval === 'off') {
      return
    }

    let timeoutId = 0

    const schedule = () => {
      timeoutId = window.setTimeout(() => {
        setNow(new Date())
        schedule()
      }, msUntilNextTick(interval))
    }

    schedule()
    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [interval])

  return now
}
