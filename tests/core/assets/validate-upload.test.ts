import { describe, expect, it } from 'vitest'
import {
  FONT_UPLOAD_ACCEPT,
  isSupportedFontKey,
  unsupportedFontFormatMessage,
} from '../../../src/core/assets/mime'
import { validateAssetUpload } from '../../../src/core/assets/validateUpload'

function mockFile(type: string, name: string): File {
  return { type, name } as File
}

describe('font mime support', () => {
  it('accepts only ttf and otf extensions', () => {
    expect(isSupportedFontKey('Custom.ttf')).toBe(true)
    expect(isSupportedFontKey('Custom.otf')).toBe(true)
    expect(isSupportedFontKey('web.woff')).toBe(false)
    expect(isSupportedFontKey('web.woff2')).toBe(false)
  })

  it('documents upload accept list', () => {
    expect(FONT_UPLOAD_ACCEPT).toBe('.ttf,.otf')
  })

  it('explains unsupported web font formats', () => {
    expect(unsupportedFontFormatMessage('MyFont.woff2')).toContain('.ttf and .otf')
    expect(unsupportedFontFormatMessage('MyFont.woff2')).toContain('.woff2')
  })
})

describe('validateAssetUpload', () => {
  it('accepts png for image slots', () => {
    expect(validateAssetUpload('image', mockFile('image/png', 'logo.png'), '/local/logo.png')).toEqual({
      ok: true,
      mime: 'image/png',
    })
  })

  it('rejects fonts uploaded to image slots', () => {
    const result = validateAssetUpload('image', mockFile('font/ttf', 'ppb.ttf'), '/local/logo.png')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('font')
      expect(result.message).toContain('image')
    }
  })

  it('rejects images uploaded to font slots', () => {
    const result = validateAssetUpload('font', mockFile('image/png', 'logo.png'), 'ppb.ttf')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('image')
      expect(result.message).toContain('.ttf or .otf')
    }
  })

  it('accepts ttf for font slots', () => {
    expect(validateAssetUpload('font', mockFile('font/ttf', 'custom.ttf'), 'custom.ttf')).toEqual({
      ok: true,
      mime: 'font/ttf',
    })
  })

  it('accepts otf for font slots', () => {
    expect(validateAssetUpload('font', mockFile('font/otf', 'custom.otf'), 'custom.otf')).toEqual({
      ok: true,
      mime: 'font/otf',
    })
  })

  it('rejects woff for font slots', () => {
    const result = validateAssetUpload('font', mockFile('font/woff', 'web.woff'), 'web.woff')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('.ttf and .otf')
      expect(result.message).toContain('.woff')
    }
  })

  it('rejects woff2 for font slots', () => {
    const result = validateAssetUpload('font', mockFile('font/woff2', 'web.woff2'), 'web.woff2')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('.ttf and .otf')
    }
  })

  it('rejects unknown types for image slots', () => {
    const result = validateAssetUpload(
      'image',
      mockFile('application/pdf', 'doc.pdf'),
      '/local/logo.png',
    )
    expect(result.ok).toBe(false)
  })

  it('infers mime from key when file.type is empty', () => {
    expect(validateAssetUpload('image', mockFile('', 'logo.png'), '/local/logo.png')).toEqual({
      ok: true,
      mime: 'image/png',
    })
  })
})
