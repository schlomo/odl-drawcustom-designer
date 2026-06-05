import { useCallback, useState } from 'react'
import {
  readYamlFontSize,
  stepYamlFontSize,
  writeYamlFontSize,
} from '../preferences/yamlFontSize'

export function useYamlFontSize() {
  const [fontSize, setFontSize] = useState(() => readYamlFontSize())

  const increase = useCallback(() => {
    setFontSize((current) => {
      const next = stepYamlFontSize(current, 1)
      writeYamlFontSize(next)
      return next
    })
  }, [])

  const decrease = useCallback(() => {
    setFontSize((current) => {
      const next = stepYamlFontSize(current, -1)
      writeYamlFontSize(next)
      return next
    })
  }, [])

  return { fontSize, increase, decrease }
}
