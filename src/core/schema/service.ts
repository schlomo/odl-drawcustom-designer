import { z } from 'zod'
import { boolSchema, colorSchema } from './common'

export const serviceOptionsSchema = z
  .object({
    background: colorSchema.optional(),
    rotate: z.number().optional(),
    dither: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
    ttl: z.number().optional(),
    'dry-run': boolSchema.optional(),
  })
  .strict()

export type ServiceOptions = z.infer<typeof serviceOptionsSchema>

export const SERVICE_OPTION_KEYS = [
  'background',
  'rotate',
  'dither',
  'ttl',
  'dry-run',
] as const
