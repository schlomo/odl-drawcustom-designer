import { describe, expect, it } from 'vitest'
import {
  buildYamlDownloadFilename,
  createYamlDownloadBlob,
  sanitizeExportFilename,
} from '../../../src/ui/lib/export-download'

describe('sanitizeExportFilename', () => {
  it('strips unsafe characters and trims whitespace', () => {
    expect(sanitizeExportFilename('  My Design!  ', 'yaml')).toBe('My-Design.yaml')
    expect(sanitizeExportFilename('', 'png')).toBe('design.png')
  })

  it('collapses repeated separators', () => {
    expect(sanitizeExportFilename('a---b', 'yaml')).toBe('a-b.yaml')
  })
})

describe('YAML download helpers', () => {
  it('builds a .yaml filename from the session name', () => {
    expect(buildYamlDownloadFilename('Door tag')).toBe('Door-tag.yaml')
  })

  it('creates a UTF-8 YAML blob', () => {
    const blob = createYamlDownloadBlob('- type: text\n  value: hi\n')
    expect(blob.type).toBe('text/yaml;charset=utf-8')
  })
})
