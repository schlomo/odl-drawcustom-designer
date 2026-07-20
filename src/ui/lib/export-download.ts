const UNSAFE_FILENAME_CHARS = /[^a-zA-Z0-9._-]+/g

export function sanitizeExportFilename(name: string, extension: string): string {
  const trimmed = name.trim()
  const base =
    trimmed.length > 0
      ? trimmed.replace(UNSAFE_FILENAME_CHARS, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
      : 'design'
  const safeBase = base.length > 0 ? base : 'design'
  return `${safeBase}.${extension}`
}

export function buildYamlDownloadFilename(sessionName: string): string {
  return sanitizeExportFilename(sessionName, 'yaml')
}

export function buildPngDownloadFilename(sessionName: string): string {
  return sanitizeExportFilename(sessionName, 'png')
}

export function createYamlDownloadBlob(yaml: string): Blob {
  return new Blob([yaml], { type: 'text/yaml;charset=utf-8' })
}

export function createPngDownloadBlob(png: Blob): Blob {
  return png
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/**
 * Copy results carry a user-facing reason on failure (issue #76): on insecure
 * origins (LAN-IP http, file://) `navigator.clipboard` does not exist, and a
 * bare red flash with no explanation is itself a defect.
 */
export type CopyResult = { ok: true } | { ok: false; reason: string }

export const CLIPBOARD_INSECURE_CONTEXT_MESSAGE = 'Clipboard requires HTTPS or localhost'
export const COPY_FAILED_MESSAGE = 'Copy to clipboard failed'

function copyFailure(): CopyResult {
  return {
    ok: false,
    reason: window.isSecureContext ? COPY_FAILED_MESSAGE : CLIPBOARD_INSECURE_CONTEXT_MESSAGE,
  }
}

/**
 * Legacy synchronous copy path — the only one available on insecure origins.
 * The textarea goes on `document.body` (not the mount container), which keeps
 * it independent of where an embedded designer is mounted, shadow roots
 * included.
 */
function copyTextViaExecCommand(text: string): boolean {
  if (typeof document.execCommand !== 'function') {
    return false
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  const previouslyFocused = document.activeElement
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
    if (previouslyFocused instanceof HTMLElement) {
      previouslyFocused.focus()
    }
  }
}

export async function copyTextToClipboard(text: string): Promise<CopyResult> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return { ok: true }
    } catch {
      // fall through to the execCommand fallback
    }
  }
  if (copyTextViaExecCommand(text)) {
    return { ok: true }
  }
  return copyFailure()
}

export async function copyBlobToClipboard(blob: Blob): Promise<CopyResult> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    return copyFailure()
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    return { ok: true }
  } catch {
    return copyFailure()
  }
}
