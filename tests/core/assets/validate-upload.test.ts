import { describe, expect, it } from 'vitest'
import { validateAssetUpload } from '../../../src/core/assets/validateUpload'

function mockFile(type: string, name: string): File {
  return { type, name } as File
}

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
      expect(result.message).toContain('font')
    }
  })

  it('accepts ttf for font slots', () => {
    expect(validateAssetUpload('font', mockFile('font/ttf', 'custom.ttf'), 'custom.ttf')).toEqual({
      ok: true,
      mime: 'font/ttf',
    })
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
