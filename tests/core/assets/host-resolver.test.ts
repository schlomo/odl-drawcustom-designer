import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HOST_ASSET_RETRY_DELAY_MS,
  HOST_ASSET_TIMEOUT_MS,
  hasHostAssetResolver,
  hasHostSuppliedAsset,
  installHostAssetResolver,
  registerHostAssetEvictor,
  resetHostAssetResolvers,
  resolveHostAsset,
  type AssetKind,
} from '../../../src/core'

function fontBlob(): Blob {
  return new Blob(['font bytes'], { type: 'font/ttf' })
}

/** A promise that never settles — a host that took the call and went away. */
function neverSettles(): Promise<never> {
  return new Promise<never>(() => {})
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

  it('keys the cache on the pair, not a joined string a name could forge', async () => {
    // The joiner must not be forgeable: two different (kind, name) pairs that
    // a naive `${kind}<sep>${name}` concatenation could collapse into the same
    // string must stay separate cache entries. A resolver that answers per
    // name proves it — a collision would serve one answer for both.
    const resolver = vi.fn(async (kind: AssetKind, name: string) => `/${kind}/${name}`)
    installHostAssetResolver(resolver)

    await expect(resolveHostAsset('font', 'a"],["image')).resolves.toEqual({
      status: 'url',
      url: '/font/a"],["image',
    })
    await expect(resolveHostAsset('image', 'a"],["image')).resolves.toEqual({
      status: 'url',
      url: '/image/a"],["image',
    })
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

  it('settles a host that never answers as failed, and applies the retry window from there', async () => {
    // A host that takes the call and never comes back must not leave the
    // designer waiting forever with no error on screen (no AbortSignal in this
    // layer — the timeout is the whole mechanism, issue #138 layer 1).
    vi.useFakeTimers({ now: 0 })
    let hang = true
    const resolver = vi.fn(async () => (hang ? await neverSettles() : '/late.png'))
    installHostAssetResolver(resolver)

    const pending = resolveHostAsset('image', 'hung.png')
    await vi.advanceTimersByTimeAsync(HOST_ASSET_TIMEOUT_MS)

    await expect(pending).resolves.toEqual({
      status: 'failed',
      message: expect.stringContaining('did not respond'),
    })

    // Settled failure ⇒ cached for the retry window, counted from the settle.
    await resolveHostAsset('image', 'hung.png')
    expect(resolver).toHaveBeenCalledTimes(1)

    hang = false
    vi.setSystemTime(HOST_ASSET_TIMEOUT_MS + HOST_ASSET_RETRY_DELAY_MS + 1)
    await expect(resolveHostAsset('image', 'hung.png')).resolves.toEqual({
      status: 'url',
      url: '/late.png',
    })
    expect(resolver).toHaveBeenCalledTimes(2)
  })

  it('answers the synchronous probe only for the (kind, name) the host actually supplied', async () => {
    installHostAssetResolver(async (kind, name) =>
      kind === 'image' && name === 'logo.png' ? fontBlob() : null,
    )

    expect(hasHostSuppliedAsset('image', 'logo.png')).toBe(false)

    await resolveHostAsset('image', 'logo.png')
    await resolveHostAsset('image', 'nope.png')
    await resolveHostAsset('font', 'logo.png')

    expect(hasHostSuppliedAsset('image', 'logo.png')).toBe(true)
    expect(hasHostSuppliedAsset('image', 'nope.png')).toBe(false)
    // The host declined the FONT called logo.png; an image answer must not
    // vouch for it (nor the other way round).
    expect(hasHostSuppliedAsset('font', 'logo.png')).toBe(false)
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

  it('keeps the sync probe consistent with most-recent-serves across two live mounts', async () => {
    // Two mounts, two resolvers, one page-wide tier (docs/embedding.md): the
    // newest resolver answers NEW requests, but an asset either mount already
    // supplied stays host-supplied — otherwise the older mount's canvas would
    // prune an image it is currently painting the moment a second mount
    // appears.
    const disposeFirst = installHostAssetResolver(async (_kind, name) =>
      name === 'first-only.png' ? '/first-only.png' : null,
    )
    await resolveHostAsset('image', 'first-only.png')
    expect(hasHostSuppliedAsset('image', 'first-only.png')).toBe(true)

    const disposeSecond = installHostAssetResolver(async (_kind, name) =>
      name === 'second-only.png' ? '/second-only.png' : null,
    )

    // New resolutions go to the newest resolver…
    await expect(resolveHostAsset('image', 'second-only.png')).resolves.toEqual({
      status: 'url',
      url: '/second-only.png',
    })
    // …and nothing the first mount already painted is disowned.
    expect(hasHostSuppliedAsset('image', 'first-only.png')).toBe(true)

    disposeSecond()
    expect(hasHostSuppliedAsset('image', 'second-only.png')).toBe(false)
    expect(hasHostSuppliedAsset('image', 'first-only.png')).toBe(true)

    disposeFirst()
    expect(hasHostSuppliedAsset('image', 'first-only.png')).toBe(false)
  })

  it('forgets everything a disposed mount cached, so a remount starts clean', async () => {
    const resolver = vi.fn(async () => fontBlob())
    const dispose = installHostAssetResolver(resolver)

    await resolveHostAsset('font', 'Ubuntu-R.ttf')
    expect(hasHostSuppliedAsset('font', 'Ubuntu-R.ttf')).toBe(true)

    dispose()
    expect(hasHostAssetResolver()).toBe(false)
    expect(hasHostSuppliedAsset('font', 'Ubuntu-R.ttf')).toBe(false)

    installHostAssetResolver(resolver)
    expect(hasHostSuppliedAsset('font', 'Ubuntu-R.ttf')).toBe(false)
    await resolveHostAsset('font', 'Ubuntu-R.ttf')
    expect(resolver).toHaveBeenCalledTimes(2)
  })

  it('tells registered caches exactly which host-supplied assets to drop on dispose', async () => {
    // The module-level caches downstream of this tier (parsed opentype fonts,
    // the core font registry, the CSS font-family map) outlive a mount, so
    // dispose has to name what came from the host — otherwise a second host on
    // the same page inherits the first host's bytes.
    const evicted: Array<[AssetKind, string]> = []
    const unregister = registerHostAssetEvictor((kind, name) => {
      evicted.push([kind, name])
    })
    const dispose = installHostAssetResolver(async (_kind, name) =>
      name === 'declined.ttf' ? null : fontBlob(),
    )

    await resolveHostAsset('font', 'supplied.ttf')
    await resolveHostAsset('image', 'supplied.png')
    await resolveHostAsset('font', 'declined.ttf')
    expect(evicted).toEqual([])

    dispose()

    // Only what the host actually supplied; the declined name cached nothing.
    expect(evicted.sort()).toEqual([
      ['font', 'supplied.ttf'],
      ['image', 'supplied.png'],
    ])
    // The record is gone before the eviction runs, so a cache asking "is this
    // still host-supplied?" gets the truth.
    expect(hasHostSuppliedAsset('font', 'supplied.ttf')).toBe(false)

    unregister()
  })
})
