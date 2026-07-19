import { describe, expect, it } from 'vitest'
import { getImageStatusMessages } from '../../../src/ui/lib/image-readiness'

describe('image readiness messages (issue #55)', () => {
  const dlimg = {
    type: 'dlimg' as const,
    url: '/local/custom.png',
    x: 0,
    y: 0,
    xsize: 10,
    ysize: 10,
  }

  it('reports missing images as errors', () => {
    const messages = getImageStatusMessages(
      [dlimg],
      new Map([
        [
          '/local/custom.png',
          { key: '/local/custom.png', status: 'missing' as const, message: 'custom.png is not uploaded.' },
        ],
      ]),
    )

    expect(messages[0]).toMatchObject({
      severity: 'error',
      title: 'Image not available',
      summary: 'custom.png is not uploaded.',
    })
  })

  it('reports failed-to-load images as errors', () => {
    const messages = getImageStatusMessages(
      [dlimg],
      new Map([
        [
          '/local/custom.png',
          { key: '/local/custom.png', status: 'failed' as const, message: 'custom.png could not be decoded.' },
        ],
      ]),
    )

    expect(messages[0]).toMatchObject({
      severity: 'error',
      title: 'Image failed to load',
      summary: 'custom.png could not be decoded.',
    })
  })

  it('reports nothing for a ready image', () => {
    const messages = getImageStatusMessages(
      [dlimg],
      new Map([['/local/custom.png', { key: '/local/custom.png', status: 'ready' as const }]]),
    )
    expect(messages).toHaveLength(0)
  })

  it('reports nothing for a deliberately suppressed (dismissed bundled demo) image', () => {
    const messages = getImageStatusMessages(
      [dlimg],
      new Map([['/local/custom.png', { key: '/local/custom.png', status: 'suppressed' as const }]]),
    )
    expect(messages).toHaveLength(0)
  })

  it('reports nothing when no outcome is recorded yet (still loading)', () => {
    expect(getImageStatusMessages([dlimg], new Map())).toHaveLength(0)
  })
})
