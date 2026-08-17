import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HOST_ASSET_RETRY_DELAY_MS,
  hasHostAssetResolver,
  hasHostSuppliedAsset,
  installHostAssetResolver,
  resetHostAssetResolvers,
  resolveHostAsset,
} from '../../../src/core'

function fontBlob(): Blob {
  return new Blob(['font bytes'], { type: 'font/ttf' })
}

describe('host asset resolver tier (issue #138)', () => {
  afterEach(() => {
    resetHostAssetResolvers()
    vi.useRealTimers()
  })

  it('reports absent — and never calls a host — when no resolver is installed', async () => {
    expect(hasHostAssetResolver()).toBe(false)
    await expect(resolveHostAsset('font', 'Ubuntu-R.ttf')).resolves.toEqual({ status: 'absent' })
  })

  it('passes kind and name through to the installed resolver and returns its blob', async () => {
    const blob = fontBlob()
    const calls: Array<[string, string]> = []
    installHostAssetResolver(async (kind, name) => {
      calls.push([kind, name])
      return blob
    })

    await expect(resolveHostAsset('font', 'Ubuntu-R.ttf')).resolves.toEqual({
      status: 'blob',
      blob,
    })
    expect(calls).toEqual([['font', 'Ubuntu-R.ttf']])
  })

  it('accepts a URL string as the resolved asset', async () => {
    installHostAssetResolver(async () => '/local/media/logo.png')

    await expect(resolveHostAsset('image', 'logo.png')).resolves.toEqual({
      status: 'url',
      url: '/local/media/logo.png',
    })
  })

  it('treats null as the host declining to supply that asset', async () => {
    installHostAssetResolver(async () => null)

    await expect(resolveHostAsset('image', 'nope.png')).resolves.toEqual({ status: 'declined' })
  })

  it('turns a rejection into a failed resolution carrying the reason', async () => {
    installHostAssetResolver(async () => {
      throw new Error('media store offline')
    })

    await expect(resolveHostAsset('font', 'Ubuntu-R.ttf')).resolves.toEqual({
      status: 'failed',
      message: 'media store offline',
    })
  })

  it('rejects an unsupported return value instead of pretending it resolved', async () => {
    // @ts-expect-error deliberately out of contract
    installHostAssetResolver(async () => 42)

    const resolution = await resolveHostAsset('image', 'weird.png')
    expect(resolution.status).toBe('failed')
  })

  it('caches a resolved asset per (kind, name) — a second render costs the host nothing', async () => {
    const resolver = vi.fn(async () => fontBlob())
    installHostAssetResolver(resolver)

    await resolveHostAsset('font', 'Ubuntu-R.ttf')
    await resolveHostAsset('font', 'Ubuntu-R.ttf')
    await resolveHostAsset('image', 'Ubuntu-R.ttf')

    // Same name, different kind is a different asset: two calls, not one or three.
    expect(resolver).toHaveBeenCalledTimes(2)
  })

  it('shares one in-flight call between concurrent requests for the same asset', async () => {
    const resolver = vi.fn(async () => fontBlob())
    installHostAssetResolver(resolver)

    await Promise.all([
      resolveHostAsset('font', 'Ubuntu-R.ttf'),
      resolveHostAsset('font', 'Ubuntu-R.ttf'),
      resolveHostAsset('font', 'Ubuntu-R.ttf'),
    ])

    expect(resolver).toHaveBeenCalledTimes(1)
  })

  it('caches a failed resolution briefly, then retries it', async () => {
    vi.useFakeTimers({ now: 0 })
    const resolver = vi.fn(async () => null)
    installHostAssetResolver(resolver)

    await resolveHostAsset('image', 'nope.png')
    await resolveHostAsset('image', 'nope.png')
    expect(resolver).toHaveBeenCalledTimes(1)

    vi.setSystemTime(HOST_ASSET_RETRY_DELAY_MS + 1)
    await resolveHostAsset('image', 'nope.png')
    expect(resolver).toHaveBeenCalledTimes(2)
  })

  it('answers the synchronous probe only for assets the host actually supplied', async () => {
    installHostAssetResolver(async (_kind, name) => (name === 'logo.png' ? fontBlob() : null))

    expect(hasHostSuppliedAsset('logo.png')).toBe(false)

    await resolveHostAsset('image', 'logo.png')
    await resolveHostAsset('image', 'nope.png')

    expect(hasHostSuppliedAsset('logo.png')).toBe(true)
    expect(hasHostSuppliedAsset('nope.png')).toBe(false)
  })

  it('serves the most recently installed resolver and restores the previous one on dispose', async () => {
    const first = vi.fn(async () => '/first.png')
    const second = vi.fn(async () => '/second.png')

    installHostAssetResolver(first)
    const disposeSecond = installHostAssetResolver(second)

    await expect(resolveHostAsset('image', 'logo.png')).resolves.toEqual({
      status: 'url',
      url: '/second.png',
    })

    disposeSecond()

    await expect(resolveHostAsset('image', 'logo.png')).resolves.toEqual({
      status: 'url',
      url: '/first.png',
    })
  })

  it('forgets everything a disposed mount cached, so a remount starts clean', async () => {
    const resolver = vi.fn(async () => fontBlob())
    const dispose = installHostAssetResolver(resolver)

    await resolveHostAsset('font', 'Ubuntu-R.ttf')
    expect(hasHostSuppliedAsset('Ubuntu-R.ttf')).toBe(true)

    dispose()
    expect(hasHostAssetResolver()).toBe(false)
    expect(hasHostSuppliedAsset('Ubuntu-R.ttf')).toBe(false)

    installHostAssetResolver(resolver)
    expect(hasHostSuppliedAsset('Ubuntu-R.ttf')).toBe(false)
    await resolveHostAsset('font', 'Ubuntu-R.ttf')
    expect(resolver).toHaveBeenCalledTimes(2)
  })
})
