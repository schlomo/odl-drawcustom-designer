/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { parseFont } from '../../../src/core'
import { drawCanvasStub } from '../../../src/ui/lib/draw-canvas-stubs'
import type { CanvasPrimitive } from '../../../src/core'

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../fixtures/fonts/InterVariable.ttf',
)

/**
 * Issue #10 (part 2 of the never-vanish fix): safeRenderElement() only
 * guards CORE's render (src/core/renderer/index.ts). The canvas PAINT stage
 * — drawCanvasStub() / drawTextLineContent() / drawOpentypeLine() /
 * computeOpentypeGlyphPositions() in src/ui/lib/draw-canvas-stubs.ts,
 * invoked from CanvasElementLayer's useEffect (and again, unguarded, from
 * canvas-png-export.ts) — was NOT guarded at all. A human manually testing
 * PR #51's preview found that uploading a variable TTF and immediately
 * assigning it to a text element (upload-then-immediately-use, no reload)
 * threw INSIDE that effect. Effect throws with no error boundary in the
 * tree unmount the whole React root — blank screen, not just a missing
 * element. Reproduced live in a real browser with the exact stack:
 *   Font.forEachGlyph -> computeOpentypeGlyphPositions (opentype-glyphs.ts)
 *   -> drawOpentypeLine -> drawTextLineContent -> drawCanvasStub
 *   -> CanvasElementLayer.tsx effect -> React commitPassiveMountOnFiber
 *   (uncaught, no boundary) -> app unmounts.
 *
 * drawCanvasStub() must never let a paint-time exception escape: it must
 * degrade to the same explicit render-error marker instead (never silently
 * draw nothing, and never throw).
 */
describe('drawCanvasStub — paint-time font failures never crash the canvas', () => {
  function makeMockCtx() {
    const calls: { strokeRect: unknown[][]; fillRect: unknown[][] } = {
      strokeRect: [],
      fillRect: [],
    }
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      bezierCurveTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      setLineDash: vi.fn(),
      fillRect: vi.fn((...args: unknown[]) => calls.fillRect.push(args)),
      strokeRect: vi.fn((...args: unknown[]) => calls.strokeRect.push(args)),
      fillText: vi.fn(),
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      font: '',
    } as unknown as CanvasRenderingContext2D
    return { ctx, calls }
  }

  function textStubPrimitive(fontKey: string, value: string): CanvasPrimitive {
    return {
      kind: 'text-stub',
      x: 5,
      y: 5,
      width: 100,
      height: 20,
      anchorX: 5,
      anchorY: 5,
      anchor: 'lt',
      value,
      drawLines: [{ text: value, visualText: value, x: 5, y: 20, width: 100, direction: 'ltr' }],
      color: 'black',
      defaultColor: 'black',
      parseColors: false,
      fontSize: 16,
      font: fontKey,
    }
  }

  it('degrades to an error marker instead of throwing when the font itself throws (generic, font-bug-independent)', () => {
    const { ctx, calls } = makeMockCtx()
    // Not a real opentype.Font — forces drawOpentypeLine's shaping call to throw,
    // independent of the specific Inter/GSUB bug (which PR #52 separately fixes).
    const brokenFont = {
      forEachGlyph: () => {
        throw new Error('synthetic shaping failure')
      },
    } as never

    expect(() => {
      drawCanvasStub(
        ctx,
        textStubPrimitive('broken.ttf', 'Hello World'),
        new Map(),
        new Map(),
        new Map([['broken.ttf', brokenFont]]),
      )
    }).not.toThrow()

    // An error marker was drawn (never silently nothing, never the crash).
    expect(calls.strokeRect.length).toBeGreaterThan(0)
  })

  // Inter exercises the real-font path end to end. Since the variable-font
  // Pillow-parity fix (PR #52) its shaping no longer throws — it paints real
  // glyphs via the naive fallback — so this test accepts either outcome
  // (real glyph paint, or the error marker if shaping ever regresses to
  // throwing). The `.not.toThrow()` is the invariant that must always hold.
  it('paints the real Inter variable font (or degrades to an error marker) without throwing', () => {
    const buffer = readFileSync(fixturePath)
    const font = parseFont(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    )
    const { ctx, calls } = makeMockCtx()

    expect(() => {
      drawCanvasStub(
        ctx,
        textStubPrimitive('InterVariable.ttf', 'Hello World'),
        new Map(),
        new Map(),
        new Map([['InterVariable.ttf', font]]),
      )
    }).not.toThrow()

    // Either real glyph paint happened (post-PR-#52 fallback) or the error
    // marker was drawn — never silently nothing.
    const fillCalls = (ctx.fill as ReturnType<typeof vi.fn>).mock.calls.length
    expect(fillCalls + calls.strokeRect.length).toBeGreaterThan(0)
  })
})
