/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CLIPBOARD_INSECURE_CONTEXT_MESSAGE,
  COPY_FAILED_MESSAGE,
  COPY_PNG_INSECURE_HINT,
  copyBlobToClipboard,
  copyTextToClipboard,
  getCopyPngUnavailableReason,
} from '../../../src/ui/lib/export-download'

/**
 * Issue #76: on insecure origins (LAN-IP http, file://) `navigator.clipboard`
 * does not exist. Copy must either fall back (text via execCommand) or fail
 * with a reason the UI can show — never a bare boolean red flash.
 */

function stubNavigatorClipboard(value: unknown): void {
  Object.defineProperty(window.navigator, 'clipboard', {
    value,
    configurable: true,
    writable: true,
  })
}

function stubSecureContext(value: boolean): void {
  Object.defineProperty(window, 'isSecureContext', {
    value,
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  // jsdom has no navigator.clipboard by default; drop any stub we added.
  delete (window.navigator as unknown as Record<string, unknown>).clipboard
  delete (window as unknown as Record<string, unknown>).isSecureContext
  delete (document as unknown as Record<string, unknown>).execCommand
  delete (globalThis as unknown as Record<string, unknown>).ClipboardItem
})

describe('copyTextToClipboard', () => {
  it('reports ok via the async clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubNavigatorClipboard({ writeText })

    const result = await copyTextToClipboard('- type: text\n')

    expect(result).toEqual({ ok: true })
    expect(writeText).toHaveBeenCalledWith('- type: text\n')
  })

  it('falls back to execCommand when navigator.clipboard is missing (insecure context)', async () => {
    stubSecureContext(false)
    const execCommand = vi.fn().mockImplementation((command: string) => {
      if (command !== 'copy') return false
      const active = document.activeElement
      return active instanceof HTMLTextAreaElement && active.value === 'yaml text'
    })
    ;(document as unknown as Record<string, unknown>).execCommand = execCommand

    const result = await copyTextToClipboard('yaml text')

    expect(result).toEqual({ ok: true })
    expect(execCommand).toHaveBeenCalledWith('copy')
    // The helper textarea must not leak into the document.
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('explains the secure-context requirement when no copy path exists on an insecure origin', async () => {
    stubSecureContext(false)

    const result = await copyTextToClipboard('yaml text')

    expect(result).toEqual({ ok: false, reason: CLIPBOARD_INSECURE_CONTEXT_MESSAGE })
  })

  it('reports a generic failure when copy fails despite a secure context', async () => {
    stubSecureContext(true)
    const writeText = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    stubNavigatorClipboard({ writeText })
    ;(document as unknown as Record<string, unknown>).execCommand = vi.fn().mockReturnValue(false)

    const result = await copyTextToClipboard('yaml text')

    expect(result).toEqual({ ok: false, reason: COPY_FAILED_MESSAGE })
  })
})

describe('getCopyPngUnavailableReason', () => {
  // Issue #80: insecure-LAN HA boxes are the common deployment — the Copy PNG
  // button must signal unavailability upfront, not only after a failed click.
  it('returns null in a secure context (Copy PNG is available)', () => {
    stubSecureContext(true)

    expect(getCopyPngUnavailableReason()).toBeNull()
  })

  it('returns the upfront hint pointing at Download PNG on an insecure origin', () => {
    stubSecureContext(false)

    expect(getCopyPngUnavailableReason()).toBe(COPY_PNG_INSECURE_HINT)
    expect(COPY_PNG_INSECURE_HINT).toContain('HTTPS or localhost')
    expect(COPY_PNG_INSECURE_HINT).toContain('Download PNG')
  })
})

describe('copyBlobToClipboard', () => {
  it('reports ok via the async clipboard API when available', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    stubNavigatorClipboard({ write })
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(public items: Record<string, Blob>) {}
      },
    )

    const result = await copyBlobToClipboard(new Blob(['png'], { type: 'image/png' }))

    expect(result).toEqual({ ok: true })
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('explains the secure-context requirement when the clipboard API is missing on an insecure origin', async () => {
    stubSecureContext(false)

    const result = await copyBlobToClipboard(new Blob(['png'], { type: 'image/png' }))

    expect(result).toEqual({ ok: false, reason: CLIPBOARD_INSECURE_CONTEXT_MESSAGE })
  })

  it('reports a generic failure when the clipboard write rejects in a secure context', async () => {
    stubSecureContext(true)
    const write = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    stubNavigatorClipboard({ write })
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(public items: Record<string, Blob>) {}
      },
    )

    const result = await copyBlobToClipboard(new Blob(['png'], { type: 'image/png' }))

    expect(result).toEqual({ ok: false, reason: COPY_FAILED_MESSAGE })
  })
})
