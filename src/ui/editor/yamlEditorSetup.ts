import type { BasicSetupOptions } from '@uiw/codemirror-extensions-basic-setup'

export const YAML_EDITOR_BASIC_SETUP: BasicSetupOptions = {
  lineNumbers: true,
  foldGutter: false,
  highlightActiveLine: false,
  highlightActiveLineGutter: false,
  highlightSelectionMatches: false,
  syntaxHighlighting: false,
  drawSelection: false,
  autocompletion: false,
  closeBrackets: false,
}
