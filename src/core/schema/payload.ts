import { z } from 'zod'
import { drawElementSchema } from './elements'
import { serviceOptionsSchema } from './service'

export const payloadSchema = z.array(drawElementSchema)

export type Payload = z.infer<typeof payloadSchema>

export const projectPayloadSchema = z.object({
  service: serviceOptionsSchema.optional(),
  elements: payloadSchema,
})

export type ProjectPayload = z.infer<typeof projectPayloadSchema>
