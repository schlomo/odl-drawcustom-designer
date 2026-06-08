import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { beforeEach } from 'vitest'
import { clearAllStores } from '../../src/storage'
import { loadBundledTestFont } from '../core/renderer/font-test-utils'

loadBundledTestFont('ppb.ttf')

function createLocalStorage(): Storage {
  const storage = new Map<string, string>()

  return {
    get length() {
      return storage.size
    },
    clear() {
      storage.clear()
    },
    getItem(key: string) {
      return storage.get(key) ?? null
    },
    key(index: number) {
      return [...storage.keys()][index] ?? null
    },
    removeItem(key: string) {
      storage.delete(key)
    },
    setItem(key: string, value: string) {
      storage.set(key, String(value))
    },
  }
}

const localStorageMock = createLocalStorage()

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  configurable: true,
})

beforeEach(async () => {
  localStorageMock.clear()
  await clearAllStores()
})
