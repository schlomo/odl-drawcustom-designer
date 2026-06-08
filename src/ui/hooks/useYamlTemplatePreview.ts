import { useCallback, useState } from 'react'
import {
  readTemplatePreviewEnabled,
  writeTemplatePreviewEnabled,
} from '../preferences/templatePreview'

export function useYamlTemplatePreview() {
  const [templatePreviewEnabled, setTemplatePreviewEnabled] = useState(() =>
    readTemplatePreviewEnabled(),
  )

  const toggleTemplatePreview = useCallback(() => {
    setTemplatePreviewEnabled((current) => {
      const next = !current
      writeTemplatePreviewEnabled(next)
      return next
    })
  }, [])

  return { templatePreviewEnabled, toggleTemplatePreview }
}
