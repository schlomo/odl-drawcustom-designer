import { useCallback, useState } from 'react'
import {
  readYamlSelectionCoupling,
  writeYamlSelectionCoupling,
} from '../preferences/yamlSelectionCoupling'

export function useYamlSelectionCoupling() {
  const [couplingEnabled, setCouplingEnabled] = useState(() => readYamlSelectionCoupling())

  const toggleCoupling = useCallback(() => {
    setCouplingEnabled((current) => {
      const next = !current
      writeYamlSelectionCoupling(next)
      return next
    })
  }, [])

  return { couplingEnabled, toggleCoupling }
}
