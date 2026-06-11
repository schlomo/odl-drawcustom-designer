export const LOAD_DEMO_CONFIRM_MESSAGE =
  'Replace the current design with the showcase demo? Unsaved changes will be lost.'

export function shouldConfirmLoadDemo(elementCount: number): boolean {
  return elementCount > 0
}

export function requestLoadDemoConfirm(): boolean {
  return window.confirm(LOAD_DEMO_CONFIRM_MESSAGE)
}
