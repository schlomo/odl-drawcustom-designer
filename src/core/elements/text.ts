export interface TextElement {
  type: 'text'
  value: string
  font?: string
  x: number
  y: number
  size: number
  color: string
}

export function createDefaultTextElement(): TextElement {
  return {
    type: 'text',
    value: 'Hello World!',
    font: 'ppb.ttf',
    x: 0,
    y: 0,
    size: 40,
    color: 'red',
  }
}

export function updateTextValue(element: TextElement, value: string): TextElement {
  return { ...element, value }
}

export function describeTextElement(element: TextElement): string {
  return `"${element.value}" at (${element.x}, ${element.y})`
}
