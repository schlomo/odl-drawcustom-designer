import { useEffect, useState } from 'react'

function msUntilNextMinute(from = new Date()): number {
  return (60 - from.getSeconds()) * 1000 - from.getMilliseconds() + 1
}

/** Live clock for template preview only — never mutates YAML source or undo history. */
export function useTemplatePreviewClock(): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timeoutId = 0

    const schedule = () => {
      timeoutId = window.setTimeout(() => {
        setNow(new Date())
        schedule()
      }, msUntilNextMinute())
    }

    schedule()
    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [])

  return now
}
