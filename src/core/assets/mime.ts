const SUPPORTED_FONT_EXTENSIONS = new Set(['.ttf', '.otf'])
const LEGACY_FONT_EXTENSIONS = new Set(['.woff', '.woff2'])

/** HTML file input `accept` value for font uploads. */
export const FONT_UPLOAD_ACCEPT = '.ttf,.otf'

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

export function isSupportedFontExtension(ext: string): boolean {
  return SUPPORTED_FONT_EXTENSIONS.has(ext.toLowerCase())
}

export function isSupportedFontKey(key: string): boolean {
  return isSupportedFontExtension(fileExtension(key))
}

export function isLegacyFontExtension(ext: string): boolean {
  return LEGACY_FONT_EXTENSIONS.has(ext.toLowerCase())
}

export function unsupportedFontFormatMessage(key: string): string {
  const ext = fileExtension(key)
  if (isLegacyFontExtension(ext)) {
    return `${key} uses ${ext} — only .ttf and .otf fonts are supported. Convert the file or upload a TrueType/OpenType version.`
  }
  if (ext) {
    return `${key} (${ext}) is not a supported font format — only .ttf and .otf are supported.`
  }
  return `${key} is not a supported font format — only .ttf and .otf are supported.`
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

export function isSupportedFontMime(mime: string): boolean {
  return (
    mime === 'font/ttf' ||
    mime === 'font/otf' ||
    mime === 'application/x-font-ttf' ||
    mime === 'application/x-font-opentype' ||
    mime === 'application/vnd.ms-opentype'
  )
}

/** Any font-like MIME (including unsupported web formats). */
export function isFontMime(mime: string): boolean {
  return (
    isSupportedFontMime(mime) ||
    mime === 'font/woff' ||
    mime === 'font/woff2' ||
    mime === 'application/font-woff' ||
    mime === 'application/font-woff2' ||
    mime === 'application/vnd.ms-fontobject'
  )
}

export function isImageExtension(ext: string): boolean {
  return IMAGE_EXTENSIONS.has(ext)
}

/** True for .ttf and .otf only. */
export function isFontExtension(ext: string): boolean {
  return isSupportedFontExtension(ext)
}

export function resolveUploadMime(fileType: string, key: string): string {
  return fileType || guessMimeFromAssetKey(key)
}
