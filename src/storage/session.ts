import type { DrawElement, ServiceOptions } from '../core'
import { db, ensureDbReady } from './db'
import {
  SESSION_ROW_ID,
  type PersistedEditHistory,
  type SessionCanvas,
  type SessionEditSnapshot,
  type SessionSnapshot,
} from './types'

/** Matches {@link EDIT_HISTORY_MAX} in `src/ui/lib/edit-history.ts`. */
const SESSION_EDIT_HISTORY_MAX = 50

const ROTATIONS = new Set<SessionCanvas['rotation']>([0, 90, 180, 270])
const ACCENT_MODES = new Set<SessionCanvas['accentMode']>(['red', 'yellow'])
const PREVIEW_DITHER_MODES = new Set<SessionCanvas['previewDitherMode']>([0, 2])

function isDrawElement(value: unknown): value is DrawElement {
  return value != null && typeof value === 'object' && 'type' in value
}

function parseSessionCanvas(value: unknown): SessionCanvas | null {
  if (value == null || typeof value !== 'object') {
    return null
  }

  const record = value as Partial<SessionCanvas>
  if (
    typeof record.width !== 'number' ||
    !Number.isFinite(record.width) ||
    record.width < 1 ||
    typeof record.height !== 'number' ||
    !Number.isFinite(record.height) ||
    record.height < 1 ||
    typeof record.rotation !== 'number' ||
    !ROTATIONS.has(record.rotation as SessionCanvas['rotation']) ||
    typeof record.accentMode !== 'string' ||
    !ACCENT_MODES.has(record.accentMode as SessionCanvas['accentMode'])
  ) {
    return null
  }

  const previewDitherMode = PREVIEW_DITHER_MODES.has(
    record.previewDitherMode as SessionCanvas['previewDitherMode'],
  )
    ? (record.previewDitherMode as SessionCanvas['previewDitherMode'])
    : 0

  return {
    width: Math.round(record.width),
    height: Math.round(record.height),
    rotation: record.rotation as SessionCanvas['rotation'],
    accentMode: record.accentMode as SessionCanvas['accentMode'],
    previewDitherMode,
  }
}

function parseSelectedIndices(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  if (
    !value.every(
      (entry) => typeof entry === 'number' && Number.isInteger(entry) && entry >= 0,
    )
  ) {
    return null
  }
  return value
}

function parseEditSnapshot(value: unknown): SessionEditSnapshot | null {
  if (value == null || typeof value !== 'object') {
    return null
  }

  const record = value as Partial<SessionEditSnapshot>
  const canvas = parseSessionCanvas(record.canvas)
  if (!canvas) {
    return null
  }
  if (!Array.isArray(record.elements) || !record.elements.every(isDrawElement)) {
    return null
  }
  const selectedIndices = parseSelectedIndices(record.selectedIndices)
  if (!selectedIndices) {
    return null
  }

  return {
    elements: record.elements,
    canvas,
    service: record.service as ServiceOptions | undefined,
    selectedIndices,
  }
}

function trimEditHistoryStack(stack: SessionEditSnapshot[]): SessionEditSnapshot[] {
  if (stack.length <= SESSION_EDIT_HISTORY_MAX) {
    return stack
  }
  return stack.slice(stack.length - SESSION_EDIT_HISTORY_MAX)
}

export function parsePersistedEditHistory(value: unknown): PersistedEditHistory | null {
  if (value == null || typeof value !== 'object') {
    return null
  }

  const record = value as Partial<PersistedEditHistory>
  if (!Array.isArray(record.undoStack) || !Array.isArray(record.redoStack)) {
    return null
  }

  const undoStack: SessionEditSnapshot[] = []
  for (const entry of record.undoStack) {
    const parsed = parseEditSnapshot(entry)
    if (!parsed) {
      return null
    }
    undoStack.push(parsed)
  }

  const redoStack: SessionEditSnapshot[] = []
  for (const entry of record.redoStack) {
    const parsed = parseEditSnapshot(entry)
    if (!parsed) {
      return null
    }
    redoStack.push(parsed)
  }

  return {
    undoStack: trimEditHistoryStack(undoStack),
    redoStack: trimEditHistoryStack(redoStack),
  }
}

export function parseSessionSnapshot(value: unknown): SessionSnapshot | null {
  if (value == null || typeof value !== 'object') {
    return null
  }

  const record = value as Partial<SessionSnapshot>
  if (typeof record.name !== 'string' || record.name.length === 0) {
    return null
  }

  const canvas = parseSessionCanvas(record.canvas)
  if (!canvas) {
    return null
  }

  if (!Array.isArray(record.elements) || !record.elements.every(isDrawElement)) {
    return null
  }

  const updatedAt =
    typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : Date.now()

  const editHistory =
    record.editHistory == null ? undefined : parsePersistedEditHistory(record.editHistory) ?? undefined

  return {
    id: SESSION_ROW_ID,
    name: record.name,
    canvas,
    service: record.service as ServiceOptions | undefined,
    elements: record.elements,
    editHistory,
    updatedAt,
  }
}

export async function readSessionFromDb(): Promise<SessionSnapshot | null> {
  await ensureDbReady()
  const row = await db.session.get(SESSION_ROW_ID)
  if (!row) {
    return null
  }
  return parseSessionSnapshot(row)
}

export interface SessionWritePayload {
  name: string
  canvas: SessionCanvas
  service?: ServiceOptions
  elements: DrawElement[]
  editHistory?: PersistedEditHistory
}

export async function writeSessionToDb(payload: SessionWritePayload): Promise<void> {
  await ensureDbReady()
  const snapshot: SessionSnapshot = {
    id: SESSION_ROW_ID,
    ...payload,
    updatedAt: Date.now(),
  }
  await db.session.put(snapshot)
}
