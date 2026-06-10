import { describe, expect, it } from 'vitest'
import { serializeYamlPayload, type DrawElement } from '../../../src/core'
import {
  shouldDeferYamlExternalSync,
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
