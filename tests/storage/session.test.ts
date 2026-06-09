import { describe, expect, it } from 'vitest'
import type { DrawElement } from '../../src/core'
import {
  parseSessionSnapshot,
  readSessionFromDb,
  SESSION_ROW_ID,
  writeSessionToDb,
} from '../../src/storage'

describe('session storage adapter', () => {
  it('round-trips undo/redo stacks with the session row', async () => {
    const elements: DrawElement[] = [{ type: 'text', value: 'Hello', x: 10, y: 20 }]
    const canvas = {
      width: 400,
      height: 300,
      rotation: 0 as const,
      accentMode: 'red' as const,
      previewDitherMode: 0 as const,
    }

    await writeSessionToDb({
      name: 'History session',
      canvas,
      elements: [{ type: 'text', value: 'After', x: 0, y: 0 }],
      editHistory: {
        undoStack: [
          {
            elements,
            canvas,
            selectedIndices: [0],
          },
        ],
        redoStack: [],
      },
    })

    const stored = await readSessionFromDb()
    expect(stored?.editHistory?.undoStack).toHaveLength(1)
    expect(stored?.editHistory?.undoStack[0]?.elements).toEqual(elements)
    expect(stored?.editHistory?.redoStack).toEqual([])
  })

  it('round-trips the last session through IndexedDB', async () => {
    const elements: DrawElement[] = [
      { type: 'text', value: 'Hello', x: 10, y: 20 },
    ]

    await writeSessionToDb({
      name: 'Kitchen tag',
      canvas: {
        width: 400,
        height: 300,
        rotation: 90,
        accentMode: 'yellow',
        previewDitherMode: 2,
      },
      service: { background: 'white', rotate: 0 },
      elements,
    })

    const stored = await readSessionFromDb()
    expect(stored?.id).toBe(SESSION_ROW_ID)
    expect(stored?.name).toBe('Kitchen tag')
    expect(stored?.canvas).toEqual({
      width: 400,
      height: 300,
      rotation: 90,
      accentMode: 'yellow',
      previewDitherMode: 2,
    })
    expect(stored?.service).toEqual({ background: 'white', rotate: 0 })
    expect(stored?.elements).toEqual(elements)
    expect(stored?.updatedAt).toBeTypeOf('number')
  })

  it('returns null when no session is stored', async () => {
    expect(await readSessionFromDb()).toBeNull()
  })

  it('parseSessionSnapshot rejects invalid payloads', () => {
    expect(parseSessionSnapshot(null)).toBeNull()
    expect(parseSessionSnapshot({ name: '', canvas: {}, elements: [] })).toBeNull()
    expect(
      parseSessionSnapshot({
        name: 'Ok',
        canvas: { width: 100, height: 100, rotation: 0, accentMode: 'red' },
        elements: [{ not: 'an element' }],
      }),
    ).toBeNull()
  })

  it('overwrites the single session row on subsequent writes', async () => {
    await writeSessionToDb({
      name: 'First',
      canvas: {
        width: 384,
        height: 184,
        rotation: 0,
        accentMode: 'red',
        previewDitherMode: 0,
      },
      elements: [],
    })
    await writeSessionToDb({
      name: 'Second',
      canvas: {
        width: 800,
        height: 480,
        rotation: 180,
        accentMode: 'yellow',
        previewDitherMode: 0,
      },
      elements: [{ type: 'circle', x: 0, y: 0, radius: 10 }],
    })

    const stored = await readSessionFromDb()
    expect(stored?.name).toBe('Second')
    expect(stored?.canvas.width).toBe(800)
    expect(stored?.elements).toHaveLength(1)
  })
})
