/** Minimal HA-compatible datetime for template preview (`now().strftime(...)`). */

export interface HaDateTime {
  strftime(format: string): string
  /**
   * Python datetime attributes, as NUMBERS. Template arithmetic must use
   * these (`now().second / 60`), never a `strftime` result — strftime returns
   * a string, and on real HA dividing it raises
   * `TypeError: unsupported operand type(s) for /: 'str' and 'int'` while the
   * JS preview silently coerces (observed on a live send, designer 3.4.9).
   */
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const pad2 = (value: number): string => String(value).padStart(2, '0')

const FORMATTERS: Record<string, (date: Date) => string> = {
  Y: (date) => String(date.getFullYear()),
  m: (date) => pad2(date.getMonth() + 1),
  d: (date) => pad2(date.getDate()),
  H: (date) => pad2(date.getHours()),
  M: (date) => pad2(date.getMinutes()),
  S: (date) => pad2(date.getSeconds()),
}

const ESCAPED_PERCENT_TOKEN = '__LITERAL_PERCENT__'

export function formatHaDateTime(date: Date, format: string): string {
  const escaped = format.replace(/%%/g, ESCAPED_PERCENT_TOKEN)
  const formatted = escaped.replace(/%([YmdHMS])/g, (match, code: string) => {
    const formatter = FORMATTERS[code]
    return formatter ? formatter(date) : match
  })
  return formatted.replaceAll(ESCAPED_PERCENT_TOKEN, '%')
}

export function createHaDateTime(date: Date): HaDateTime {
  return {
    strftime(format: string) {
      return formatHaDateTime(date, format)
    },
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
  }
}
