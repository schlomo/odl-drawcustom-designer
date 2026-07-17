import { describe, expect, it } from 'vitest'
import { serializeYamlPayload, type DrawElement } from '../../../src/core'
import {
  shouldDeferYamlExternalSync,
  shouldScrollLinkedElementOnSync,
  yamlTextForExternalSync,
} from '../../../src/ui/editor/yamlExternalSync'

const circle = (y: number | string): DrawElement => ({
  type: 'circle',
  x: 244,
  y,
  radius: 34,
  fill: 'red',
  outline: 'black',
  width: 2,
})

describe('yamlExternalSync', () => {
  describe('shouldDeferYamlExternalSync', () => {
    it('defers while a property panel field is focused', () => {
      expect(
        shouldDeferYamlExternalSync({
          propertyEditing: true,
          canvasDragging: false,
          couplingEnabled: true,
        }),
      ).toBe(true)
    })

    it('defers canvas drag when YAML coupling is off', () => {
      expect(
        shouldDeferYamlExternalSync({
          propertyEditing: false,
          canvasDragging: true,
          couplingEnabled: false,
        }),
      ).toBe(true)
    })

    it('does not defer canvas drag when YAML coupling is on', () => {
      expect(
        shouldDeferYamlExternalSync({
          propertyEditing: false,
          canvasDragging: true,
          couplingEnabled: true,
        }),
      ).toBe(false)
    })
  })

  // Issue #37: a canvas pointerdown on an *already-selected* element (e.g.
  // grabbing it to drag) toggles `canvasDragging` without ever changing
  // `selectionSource` away from 'yaml' — clicking on a paper hit that is
  // already the current selection short-circuits the app's reselect call
  // (DesignerCanvas.tsx's `wasSelected` guard), so `selectionSource` stays
  // whatever it was before (e.g. 'yaml', if the element was last selected via
  // a YAML cursor move). The old gate (`selectionSource !== 'yaml'` alone)
  // then never signals a canvas-driven scroll for this drag.
  describe('shouldScrollLinkedElementOnSync', () => {
    it('scrolls when canvas dragging starts even if selectionSource is still yaml', () => {
      expect(
        shouldScrollLinkedElementOnSync({
          couplingEnabled: true,
          canvasDragging: true,
          selectionSource: 'yaml',
        }),
      ).toBe(true)
    })

    it('scrolls when selection came from ui and there is no drag', () => {
      expect(
        shouldScrollLinkedElementOnSync({
          couplingEnabled: true,
          canvasDragging: false,
          selectionSource: 'ui',
        }),
      ).toBe(true)
    })

    it('does not scroll while editing YAML with no canvas drag in progress', () => {
      expect(
        shouldScrollLinkedElementOnSync({
          couplingEnabled: true,
          canvasDragging: false,
          selectionSource: 'yaml',
        }),
      ).toBe(false)
    })

    it('never scrolls when coupling is disabled', () => {
      expect(
        shouldScrollLinkedElementOnSync({
          couplingEnabled: false,
          canvasDragging: true,
          selectionSource: 'ui',
        }),
      ).toBe(false)
    })
  })

  describe('yamlTextForExternalSync', () => {
    it('uses live serialized YAML after templated property blur, not stale pending', () => {
      const before = serializeYamlPayload([circle(204)])
      const after = serializeYamlPayload([circle('{{ 10 }}')])

      // Simulates pending queued while propertyEditing was true with pre-blur elements.
      const pendingFromDuringEdit = before
      void pendingFromDuringEdit

      expect(yamlTextForExternalSync(after)).toBe(after)
      expect(yamlTextForExternalSync(after)).toContain('{{ 10 }}')
      expect(yamlTextForExternalSync(after)).not.toContain('y: 204')
    })

    it('applies external sync when property editing ends', () => {
      let yamlText = serializeYamlPayload([circle(204)])
      let propertyEditing = true

      const committed = [circle('{{ 10 }}')]
      const serializedAfterCommit = serializeYamlPayload(committed)

      // While editing: defer (yamlText unchanged).
      if (
        !shouldDeferYamlExternalSync({
          propertyEditing,
          canvasDragging: false,
          couplingEnabled: true,
        })
      ) {
        yamlText = yamlTextForExternalSync(serializedAfterCommit)
      }
      expect(yamlText).toContain('y: 204')

      // Blur commits elements and ends editing in one batch.
      propertyEditing = false
      if (
        !shouldDeferYamlExternalSync({
          propertyEditing,
          canvasDragging: false,
          couplingEnabled: true,
        })
      ) {
        yamlText = yamlTextForExternalSync(serializedAfterCommit)
      }

      expect(yamlText).toBe(serializedAfterCommit)
      expect(yamlText).toContain('{{ 10 }}')
    })
  })
})
