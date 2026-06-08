/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DrawElement } from '../../../src/core'
import { ContentManager } from '../../../src/ui/components/ContentManager'

const elements: DrawElement[] = [
  {
    type: 'dlimg',
    url: '/media/pohl89-480h.png',
    x: 0,
    y: 0,
    xsize: 10,
    ysize: 10,
  },
]

describe('ContentManager upload', () => {
  it('clears the checking state when upload rejects', async () => {
    const onUpload = vi.fn().mockRejectedValue(new Error('Dexie UpgradeError'))
    render(
      <ContentManager
        elements={elements}
        assetRevision={0}
        scope="current"
        onScopeChange={() => {}}
        onUpload={onUpload}
        onClear={() => {}}
      />,
    )

    const uploadButton = screen.getByRole('button', { name: 'Upload' })
    const input = document.getElementById('content-upload-%2Fmedia%2Fpohl89-480h.png') as HTMLInputElement
    expect(input).toBeTruthy()

    const file = new File(['png'], 'pohl89-480h.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByRole('button', { name: 'Upload' })).toBe(uploadButton)
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not save the file locally/)
  })

  it('clears the checking state when upload returns an error result', async () => {
    const onUpload = vi.fn().mockResolvedValue({
      ok: false,
      message: 'Could not decode image.',
    })
    render(
      <ContentManager
        elements={elements}
        assetRevision={0}
        scope="current"
        onScopeChange={() => {}}
        onUpload={onUpload}
        onClear={() => {}}
      />,
    )

    const input = document.getElementById('content-upload-%2Fmedia%2Fpohl89-480h.png') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'bad.png', { type: 'image/png' })] } })

    expect(await screen.findByRole('button', { name: 'Upload' })).toBeTruthy()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not decode image.')
  })
})
