export type ResolutionOrientation = 'landscape' | 'portrait' | 'square'

export function resolutionOrientation(width: number, height: number): ResolutionOrientation {
  if (width === height) {
    return 'square'
  }
  return width > height ? 'landscape' : 'portrait'
}

export function resolutionOrientationHint(width: number, height: number): string {
  switch (resolutionOrientation(width, height)) {
    case 'square':
      return 'Square'
    case 'portrait':
      return 'Portrait'
    default:
      return 'Landscape'
  }
}
