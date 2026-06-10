import { useCallback, useState } from 'react'
import { hasTemplateSyntax, isTemplateStoredValue } from '../../../core'

interface UseDeferredTemplateEditOptions {
  value: unknown
  onChange: (value: unknown) => void
  onBeginEdit?: () => void
  onEndEdit?: () => void
}

function shouldRevertFromTemplateMode(raw: string): boolean {
  const trimmed = raw.trim()
  return trimmed.length === 0 || !hasTemplateSyntax(trimmed)
}

/** Keep in-progress template edits local until blur — avoids crashing preview/YAML mid-typing. */
export function useDeferredTemplateEdit({
  value,
  onChange,
  onBeginEdit,
  onEndEdit,
}: UseDeferredTemplateEditOptions) {
  const storedTemplate = typeof value === 'string' && isTemplateStoredValue(value)
  const [pendingTemplate, setPendingTemplate] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)

  const inTemplateMode = storedTemplate || pendingTemplate
  const displayValue = draft ?? (value == null ? '' : String(value))

  const beginTemplate = useCallback(
    (starter: string) => {
      setPendingTemplate(true)
      setDraft(starter)
      onBeginEdit?.()
    },
    [onBeginEdit],
  )

  const focusTemplate = useCallback(() => {
    onBeginEdit?.()
    setDraft(displayValue)
  }, [displayValue, onBeginEdit])

  const commitTemplateBlur = useCallback(
    (raw: string, commitScalar: (raw: string) => void) => {
      const trimmed = raw.trim()
      if (shouldRevertFromTemplateMode(raw)) {
        commitScalar(raw)
      } else if (hasTemplateSyntax(trimmed)) {
        onChange(trimmed)
      } else if (!trimmed) {
        onChange(undefined)
      } else {
        commitScalar(raw)
      }
      setPendingTemplate(false)
      setDraft(null)
      onEndEdit?.()
    },
    [onChange, onEndEdit],
  )

  const updateTemplateDraft = useCallback((raw: string) => {
    setDraft(raw)
  }, [])

  const cancelTemplate = useCallback(() => {
    setPendingTemplate(false)
    setDraft(null)
  }, [])

  return {
    storedTemplate,
    pendingTemplate,
    inTemplateMode,
    displayValue,
    draft,
    setDraft,
    beginTemplate,
    focusTemplate,
    commitTemplateBlur,
    updateTemplateDraft,
    cancelTemplate,
  }
}
