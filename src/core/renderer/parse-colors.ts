export interface TextColorSegment {
  text: string
  color: string
}

const OPEN_BRACKET = '['.charCodeAt(0)

export function stripColorMarkup(text: string): string {
  return parseColorMarkup(text, 'black')
    .map((segment) => segment.text)
    .join('')
}

export function parseColorMarkup(text: string, defaultColor: string): TextColorSegment[] {
  const segments: TextColorSegment[] = []
  let pos = 0

  const pushSegment = (segmentText: string, color: string): void => {
    if (segmentText.length === 0) {
      return
    }
    const last = segments[segments.length - 1]
    if (last != null && last.color === color) {
      last.text += segmentText
      return
    }
    segments.push({ text: segmentText, color })
  }

  while (pos < text.length) {
    if (text.charCodeAt(pos) !== OPEN_BRACKET) {
      const nextOpen = text.indexOf('[', pos)
      const end = nextOpen === -1 ? text.length : nextOpen
      pushSegment(text.slice(pos, end), defaultColor)
      pos = end
      continue
    }

    const closeName = text.indexOf(']', pos + 1)
    if (closeName === -1) {
      pushSegment(text.slice(pos), defaultColor)
      break
    }

    const colorName = text.slice(pos + 1, closeName)
    const closeTag = `[/${colorName}]`
    const closeTagIndex = text.indexOf(closeTag, closeName + 1)
    if (closeTagIndex === -1) {
      pushSegment(text.slice(pos), defaultColor)
      break
    }

    pushSegment(text.slice(closeName + 1, closeTagIndex), colorName)
    pos = closeTagIndex + closeTag.length
  }

  if (segments.length === 0) {
    return [{ text: '', color: defaultColor }]
  }

  return segments
}
