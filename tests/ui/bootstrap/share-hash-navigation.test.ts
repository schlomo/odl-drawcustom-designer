import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  shouldHandleShareHashNavigation,
  subscribeShareHashNavigation,
} from '../../../src/ui/bootstrap/shareHashNavigation'

describe('share hash navigation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('detects share hash fragments', () => {
    expect(shouldHandleShareHashNavigation('#d=abc')).toBe(true)
    expect(shouldHandleShareHashNavigation('#other=1')).toBe(false)
    expect(shouldHandleShareHashNavigation('')).toBe(false)
  })

  it('runs bootstrap again when hashchange adds a new #d= link', () => {
    const listeners = new Map<string, EventListener>()
    const onNavigate = vi.fn()
    const location = { hash: '#d=first' }

    vi.stubGlobal('window', {
      location,
      addEventListener: (type: string, listener: EventListener) => {
        listeners.set(type, listener)
      },
      removeEventListener: (type: string) => {
        listeners.delete(type)
      },
    })

    const unsubscribe = subscribeShareHashNavigation(onNavigate)
    location.hash = '#d=second'
    listeners.get('hashchange')?.(new Event('hashchange'))

    expect(onNavigate).toHaveBeenCalledTimes(1)

    location.hash = ''
    listeners.get('hashchange')?.(new Event('hashchange'))
    expect(onNavigate).toHaveBeenCalledTimes(1)

    unsubscribe()
    location.hash = '#d=third'
    listeners.get('hashchange')?.(new Event('hashchange'))
    expect(onNavigate).toHaveBeenCalledTimes(1)
  })
})
