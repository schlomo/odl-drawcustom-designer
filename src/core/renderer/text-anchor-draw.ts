/** Map Pillow text anchors to Canvas fillText alignment (docs/spec/supported_types.md). */

export interface CanvasTextDrawStyle {
  textAlign: CanvasTextAlign
  textBaseline: CanvasTextBaseline
}

export function getCanvasTextDrawStyle(
  anchor: string | undefined,
  defaultAnchor = 'lt',
): CanvasTextDrawStyle {
  const normalized = (anchor ?? defaultAnchor).trim().toLowerCase()
  const horizontal = normalized[0] ?? 'l'
  const vertical = normalized[1] ?? 'a'

  let textAlign: CanvasTextAlign = 'left'
  if (horizontal === 'm') {
    textAlign = 'center'
  } else if (horizontal === 'r') {
    textAlign = 'right'
  }

  let textBaseline: CanvasTextBaseline = 'top'
  if (vertical === 'm') {
    textBaseline = 'middle'
  } else if (vertical === 's') {
    textBaseline = 'alphabetic'
  } else if (vertical === 'b' || vertical === 'd') {
    textBaseline = 'bottom'
  }

  return { textAlign, textBaseline }
}
