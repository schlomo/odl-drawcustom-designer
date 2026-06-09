import { ELEMENT_TOOLBAR_ITEM_SELECTOR } from '../lib/element-toolbar-layout'
import { useToolbarLabels } from './useToolbarLabels'

/** Hide labels when the add-element toolbar is too narrow for a single labeled row. */
export function useElementToolbarLabels() {
  return useToolbarLabels(ELEMENT_TOOLBAR_ITEM_SELECTOR)
}
