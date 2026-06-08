import { describe, expect, it } from 'vitest'
import {
  EXPORT_ACTION_FEEDBACK_MS,
  getExportActionButtonClassName,
} from '../../../src/ui/lib/export-action-feedback'
import { shell } from '../../../src/ui/styles/shell'

describe('export action feedback', () => {
  it('uses a shared flash duration', () => {
    expect(EXPORT_ACTION_FEEDBACK_MS).toBeGreaterThan(0)
  })

  it('returns the base button class when there is no feedback', () => {
    expect(getExportActionButtonClassName(null)).toBe(shell.button)
    expect(getExportActionButtonClassName(undefined)).toBe(shell.button)
  })

  it('adds success styling for a completed export action', () => {
    const className = getExportActionButtonClassName('success')
    expect(className).toContain('--shell-success-bg')
    expect(className).toContain('--shell-success-fg')
    expect(className).not.toContain('--shell-danger')
    expect(className).not.toContain(shell.button)
  })

  it('adds danger styling for a failed export action', () => {
    const className = getExportActionButtonClassName('error')
    expect(className).toContain('--shell-danger')
    expect(className).not.toContain('--shell-success')
  })
})
