import { describe, expect, it } from 'vitest'
import {
  statusRowClassName,
  statusSurfaceClassName,
  statusTextClassName,
} from '../../../src/ui/lib/status-styles'

describe('status styles', () => {
  it('uses shell warning theme tokens for warnings', () => {
    expect(statusSurfaceClassName('warning')).toContain('var(--shell-warning-bg)')
    expect(statusTextClassName('warning')).toContain('var(--shell-warning-fg)')
    expect(statusRowClassName('warning')).toContain('var(--shell-warning-bg)')
    expect(statusRowClassName('warning')).toContain('var(--shell-text)')
  })

  it('uses shell danger theme tokens for errors', () => {
    expect(statusSurfaceClassName('error')).toContain('var(--shell-danger')
  })
})
