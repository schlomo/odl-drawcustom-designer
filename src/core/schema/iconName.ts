import { z } from 'zod'
import { isKnownMdiIconName } from '../renderer/mdi-icons'
import { hasTemplateSyntax } from '../templates/patterns'

/** Literal MDI icon names; Jinja templates are accepted without lookup. */
export const iconNameSchema = z.string().refine(
  (value) => hasTemplateSyntax(value) || isKnownMdiIconName(value),
  { message: 'Unknown Material Design icon name' },
)
