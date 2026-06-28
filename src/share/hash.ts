import { deflate, inflate } from 'pako'
import { isTagColorMode } from '../core/display/palette'
import type { AppBootstrap } from '../ui/bootstrap/appBootstrap'
import type { MockData } from '../ui/preferences/mockStates'
import {
  buildSharePayload,
  resolvePreviewDitherFromShare,
  shareCanvasToDisplayConfig,
  SHARE_PAYLOAD_VERSION,
  type ShareBuildInput,
  type SharePayload,
} from './types'

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBytes(encoded: string): Uint8Array | null {
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    return null
  }

  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const padLength = (4 - (padded.length % 4)) % 4
  const base64 = padded + '='.repeat(padLength)

  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index)
    }
    return bytes
  } catch {
    return null
  }
}

function isRotation(value: unknown): value is SharePayload['canvas']['rotation'] {
  return value === 0 || value === 90 || value === 180 || value === 270
}

function parseSharePayload(value: unknown): SharePayload | null {
  if (value == null || typeof value !== 'object') {
    return null
  }

  const record = value as Partial<SharePayload>
  if (record.v !== SHARE_PAYLOAD_VERSION) {
    return null
  }
  if (typeof record.name !== 'string') {
    return null
  }
  if (!Array.isArray(record.elements)) {
    return null
  }

  const canvas = record.canvas
  if (canvas == null || typeof canvas !== 'object') {
    return null
  }

  const canvasRecord = canvas as Partial<SharePayload['canvas']>
  const hasAccent = canvasRecord.accent === 'red' || canvasRecord.accent === 'yellow'
  const hasColorMode = isTagColorMode(canvasRecord.colorMode)
  if (
    typeof canvasRecord.width !== 'number' ||
    !Number.isFinite(canvasRecord.width) ||
    canvasRecord.width < 1 ||
    typeof canvasRecord.height !== 'number' ||
    !Number.isFinite(canvasRecord.height) ||
    canvasRecord.height < 1 ||
    !isRotation(canvasRecord.rotation) ||
    (!hasAccent && !hasColorMode)
  ) {
    return null
  }

  const accent = hasAccent ? canvasRecord.accent! : canvasRecord.colorMode === 'bwy' ? 'yellow' : 'red'

  return {
    v: SHARE_PAYLOAD_VERSION,
    name: record.name,
    canvas: {
      width: Math.round(canvasRecord.width),
      height: Math.round(canvasRecord.height),
      rotation: canvasRecord.rotation,
      accent,
      ...(hasColorMode ? { colorMode: canvasRecord.colorMode } : {}),
    },
    ...(record.service != null ? { service: record.service } : {}),
    elements: record.elements,
  }
}

export function encodeShareHash(payload: SharePayload): string {
  const json = JSON.stringify(payload)
  return bytesToBase64Url(deflate(json))
}

export function decodeShareHash(encoded: string): SharePayload | null {
  const bytes = base64UrlToBytes(encoded)
  if (!bytes) {
    return null
  }

  try {
    const json = inflate(bytes, { to: 'string' })
    return parseSharePayload(JSON.parse(json))
  } catch {
    return null
  }
}

export function parseShareHashFromLocation(hash: string): string | null {
  const match = /^#d=(.+)$/.exec(hash)
  return match?.[1] ?? null
}

/** Remove `#d=…` from the address bar after a successful hash import. */
export function clearShareHashFromLocation(): void {
  if (typeof window === 'undefined' || !window.location.hash.startsWith('#d=')) {
    return
  }
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
}

export interface ShareUrlParts {
  origin: string
  pathname: string
}

export function buildShareUrl(encoded: string, locationParts: ShareUrlParts): string {
  return `${locationParts.origin}${locationParts.pathname}#d=${encoded}`
}

export function sharePayloadToBootstrap(
  payload: SharePayload,
  mock: MockData,
): AppBootstrap {
  const previewDitherMode = resolvePreviewDitherFromShare(payload.service)

  return {
    sessionName: payload.name,
    elements: payload.elements,
    canvas: shareCanvasToDisplayConfig(payload.canvas, previewDitherMode),
    service: payload.service,
    mockStates: mock.states,
    mockAttributes: mock.attributes,
    importSource: 'hash',
  }
}

export function buildSharePayloadFromBootstrap(
  input: ShareBuildInput,
): SharePayload {
  return buildSharePayload(input)
}

export { buildSharePayload } from './types'
export type { ShareBuildInput, SharePayload } from './types'
