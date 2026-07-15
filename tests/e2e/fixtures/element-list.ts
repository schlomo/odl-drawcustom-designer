import type { Page } from '@playwright/test'

/** Element list row (src/ui/components/ElementList.tsx) matching a type label. */
export function elementListRow(page: Page, typeLabel: string) {
  return page.getByTestId('element-list-row').filter({ hasText: typeLabel })
}
