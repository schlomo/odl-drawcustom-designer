import {
  fileExtension,
  guessMimeFromAssetKey,
  isFontExtension,
  isFontMime,
  isImageExtension,
  isImageMime,
  isLegacyFontExtension,
  isSupportedFontExtension,
  isSupportedFontMime,
  resolveUploadMime,
} from './mime'
import type { AssetKind } from './types'

export type AssetUploadResult =
  | { ok: true; mime: string }
  | { ok: false; message: string }

function fileLabel(file: File, key: string): string {
  return file.name || key
}

function rejectUnsupportedFont(file: File, key: string): AssetUploadResult {
  const ext = fileExtension(file.name) || fileExtension(key)
  if (isLegacyFontExtension(ext)) {
    return {
      ok: false,
      message: `"${fileLabel(file, key)}" is ${ext} — only .ttf and .otf fonts are supported.`,
    }
  }
  return {
    ok: false,
    message: `"${fileLabel(file, key)}" is not a supported font format — use .ttf or .otf only.`,
  }
}

/** Reject uploads whose MIME type or extension does not match the YAML asset slot. */
export function validateAssetUpload(kind: AssetKind, file: File, key: string): AssetUploadResult {
  const mime = resolveUploadMime(file.type, key)
  const ext = fileExtension(file.name) || fileExtension(key)

  if (kind === 'font') {
    if (isImageMime(mime) || isImageExtension(ext)) {
      return {
        ok: false,
        message: `"${fileLabel(file, key)}" is an image — this slot expects a .ttf or .otf font.`,
      }
    }
    if (isLegacyFontExtension(ext) || (isFontMime(mime) && !isSupportedFontMime(mime))) {
      return rejectUnsupportedFont(file, key)
    }
    if (!isSupportedFontExtension(ext) && !isSupportedFontMime(mime)) {
      return rejectUnsupportedFont(file, key)
    }
    return { ok: true, mime: isSupportedFontMime(mime) ? mime : guessMimeFromAssetKey(key) }
  }

  if (isFontMime(mime) || isFontExtension(ext)) {
    return {
      ok: false,
      message: `"${fileLabel(file, key)}" is a font — this slot expects an image (PNG, JPEG, GIF, WebP, SVG).`,
    }
  }
  if (!isImageMime(mime) && !isImageExtension(ext)) {
    return {
      ok: false,
      message: `"${fileLabel(file, key)}" is not a supported image format.`,
    }
  }
  return { ok: true, mime: isImageMime(mime) ? mime : guessMimeFromAssetKey(key) }
}
