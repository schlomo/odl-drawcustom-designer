import { DRAW_ELEMENT_TYPES, type DrawElement } from './elements'

/** Body inserted after `type: ` — type name plus required property lines. */
/** Required fields only — see docs/spec/supported_types.md and tests/fixtures/spec/*-minimal.yaml */
export const ELEMENT_TYPE_INSERTIONS: Record<DrawElement['type'], string> = {
  debug_grid: 'debug_grid',
  text: `text
  value: Hello World!
  x: 0
  y: 0`,
  multiline: `multiline
  value: Line 1|Line 2|Line 3
  delimiter: "|"
  x: 0
  offset_y: 50`,
  line: `line
  x_start: 20
  x_end: 380
  y_start: 0
  y_end: 0`,
  rectangle: `rectangle
  x_start: 20
  x_end: 80
  y_start: 15
  y_end: 30`,
  rectangle_pattern: `rectangle_pattern
  x_start: 5
  x_size: 35
  x_offset: 10
  y_start: 28
  y_size: 18
  y_offset: 2
  x_repeat: 1
  y_repeat: 4`,
  polygon: `polygon
  points: [[120, 40], [200, 140], [160, 200], [80, 200], [40, 140]]`,
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
  end_angle: 90`,
  icon: `icon
  value: account-cowboy-hat
  x: 60
  y: 120
  size: 120`,
  icon_sequence: `icon_sequence
  x: 10
  y: 10
  icons:
    - mdi:home
    - mdi:arrow-right
    - mdi:office-building
  size: 24`,
  dlimg: `dlimg
  url: https://example.com/logo.png
  x: 10
  y: 10
  xsize: 120
  ysize: 120`,
  qrcode: `qrcode
  data: https://www.example.com
  x: 140
  y: 50`,
  plot: `plot
  data:
    - entity: sensor.temperature`,
  progress_bar: `progress_bar
  x_start: 10
  y_start: 10
  x_end: 280
  y_end: 30
  progress: 42`,
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
