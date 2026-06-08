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

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export async function copyBlobToClipboard(blob: Blob): Promise<boolean> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    return true
  } catch {
    return false
  }
}
