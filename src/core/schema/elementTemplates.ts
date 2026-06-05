import { DRAW_ELEMENT_TYPES, type DrawElement } from './elements'

/** Body inserted after `type: ` — type name plus required property lines. */
export const ELEMENT_TYPE_INSERTIONS: Record<DrawElement['type'], string> = {
  debug_grid: `debug_grid
  spacing: 20
  line_color: black`,
  text: `text
  value: Hello World!
  font: ppb.ttf
  x: 0
  y: 0
  size: 40
  color: red`,
  multiline: `multiline
  value: Line 1|Line 2|Line 3
  delimiter: "|"
  font: ppb.ttf
  x: 0
  offset_y: 50
  size: 40
  color: black`,
  line: `line
  x_start: 20
  x_end: 380
  y_start: 15
  y_end: 15
  width: 1
  fill: red`,
  rectangle: `rectangle
  x_start: 20
  x_end: 80
  y_start: 15
  y_end: 30
  width: 2
  fill: red
  outline: black`,
  rectangle_pattern: `rectangle_pattern
  x_start: 5
  x_size: 35
  x_offset: 10
  y_start: 28
  y_size: 18
  y_offset: 2
  fill: white
  outline: red
  width: 1
  x_repeat: 1
  y_repeat: 4`,
  polygon: `polygon
  points: [[10, 10], [50, 10], [50, 50], [10, 50]]
  fill: red
  outline: black`,
  circle: `circle
  x: 50
  y: 50
  radius: 20`,
  ellipse: `ellipse
  x_start: 50
  x_end: 100
  y_start: 50
  y_end: 100`,
  arc: `arc
  x: 100
  y: 75
  radius: 50
  start_angle: 0
  end_angle: 90
  fill: red`,
  icon: `icon
  value: account-cowboy-hat
  x: 60
  y: 120
  size: 120
  color: red`,
  icon_sequence: `icon_sequence
  x: 10
  y: 10
  icons:
    - mdi:home
    - mdi:arrow-right
    - mdi:office-building
  size: 24
  direction: right`,
  dlimg: `dlimg
  url: https://example.com/logo.png
  x: 10
  y: 10
  xsize: 120
  ysize: 120
  rotate: 0`,
  qrcode: `qrcode
  data: https://www.example.com
  x: 140
  y: 50
  boxsize: 2
  border: 2
  color: black
  bgcolor: white`,
  plot: `plot
  x_start: 10
  y_start: 20
  x_end: 199
  y_end: 119
  duration: 36000
  low: 10
  high: 20
  font: ppb.ttf
  data:
    - entity: sensor.temperature
      width: 3
    - entity: sensor.humidity
      color: red`,
  progress_bar: `progress_bar
  x_start: 10
  y_start: 10
  x_end: 280
  y_end: 30
  fill: red
  outline: black
  width: 1
  progress: 42
  direction: right
  show_percentage: true
  font: ppb.ttf`,
}

const TOP_LEVEL_PROPERTY = /^ {2}([a-z_][a-z0-9_]*):/

export function parseListItemPropertyKeys(block: string): Set<string> {
  const keys = new Set<string>()

  for (const line of block.split('\n')) {
    if (/^\s*-\s*type:/.test(line)) {
      keys.add('type')
      continue
    }

    const match = line.match(TOP_LEVEL_PROPERTY)
    if (match?.[1]) {
      keys.add(match[1])
    }
  }

  return keys
}

function splitInsertionPropertyStanzas(propertyLines: string[]): string[][] {
  const stanzas: string[][] = []
  let current: string[] = []

  for (const line of propertyLines) {
    if (TOP_LEVEL_PROPERTY.test(line)) {
      if (current.length > 0) {
        stanzas.push(current)
      }
      current = [line]
      continue
    }

    if (current.length > 0) {
      current.push(line)
    }
  }

  if (current.length > 0) {
    stanzas.push(current)
  }

  return stanzas
}

export function getElementTypeInsertion(type: DrawElement['type']): string {
  return ELEMENT_TYPE_INSERTIONS[type]
}

/** Insert only missing template keys when converting an existing list item. */
export function getElementTypeInsertionForBlock(
  type: DrawElement['type'],
  existingBlock: string,
): string {
  const trimmed = existingBlock.trim()
  if (!trimmed) {
    return getElementTypeInsertion(type)
  }

  const existingKeys = parseListItemPropertyKeys(existingBlock)
  const hasPropertiesBesidesType = [...existingKeys].some((key) => key !== 'type')
  if (!hasPropertiesBesidesType) {
    return getElementTypeInsertion(type)
  }

  const [typeName, ...propertyLines] = getElementTypeInsertion(type).split('\n')
  const missingStanzas = splitInsertionPropertyStanzas(propertyLines).filter((stanza) => {
    const key = stanza[0]?.match(TOP_LEVEL_PROPERTY)?.[1]
    return key !== undefined && !existingKeys.has(key)
  })

  if (missingStanzas.length === 0) {
    return typeName
  }

  return [typeName, ...missingStanzas.flat()].join('\n')
}

export function isDrawElementType(value: string): value is DrawElement['type'] {
  return (DRAW_ELEMENT_TYPES as readonly string[]).includes(value)
}
