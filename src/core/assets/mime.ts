const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.woff', '.woff2'])
const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.bmp',
  '.ico',
])

export function fileExtension(name: string): string {
  const index = name.lastIndexOf('.')
  if (index < 0) {
    return ''
  }
  return name.slice(index).toLowerCase()
}

/** Guess MIME type from a YAML asset key when the browser omits file.type. */
export function guessMimeFromAssetKey(key: string): string {
  const ext = fileExtension(key)
  switch (ext) {
    case '.ttf':
      return 'font/ttf'
    case '.otf':
      return 'font/otf'
    case '.woff':
      return 'font/woff'
    case '.woff2':
      return 'font/woff2'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.svg':
      return 'image/svg+xml'
    case '.bmp':
      return 'image/bmp'
    case '.ico':
      return 'image/x-icon'
    default:
      return 'application/octet-stream'
  }
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith('image/')
}

export function isFontMime(mime: string): boolean {
  return (
    mime.startsWith('font/') ||
    mime === 'application/font-woff' ||
    mime === 'application/font-woff2' ||
    mime === 'application/vnd.ms-fontobject' ||
    mime === 'application/x-font-ttf' ||
    mime === 'application/x-font-opentype'
  )
}

export function isImageExtension(ext: string): boolean {
  return IMAGE_EXTENSIONS.has(ext)
}

export function isFontExtension(ext: string): boolean {
  return FONT_EXTENSIONS.has(ext)
}

export function resolveUploadMime(fileType: string, key: string): string {
  return fileType || guessMimeFromAssetKey(key)
}
