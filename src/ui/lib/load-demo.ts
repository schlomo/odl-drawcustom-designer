export const LOAD_DEMO_CONFIRM_MESSAGE =
  'Replace the current design with the showcase demo? Unsaved changes will be lost.'

export function shouldConfirmLoadDemo(options: {
  elementCount: number
  canUndo: boolean
  canRedo: boolean
}): boolean {
  const { elementCount, canUndo, canRedo } = options
  return elementCount > 0 && (canUndo || canRedo)
}

export function requestLoadDemoConfirm(): boolean {
  return window.confirm(LOAD_DEMO_CONFIRM_MESSAGE)
}
