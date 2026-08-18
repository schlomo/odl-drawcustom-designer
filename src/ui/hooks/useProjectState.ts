import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  applyPlotPropertyUpdate,
  BUNDLED_SHOWCASE_IMAGE_KEY,
  resolveAsset,
  type DrawElement,
  type HaMockContext,
  type ServiceOptions,
} from '../../core'
import type { AssetKind, AssetUploadResult, RenderContext, TagColorMode } from '../../core'
import {
  applyTemplateContextToElement,
  elementHasTemplates,
  resolvePreviewClockInterval,
  scanPayloadForTemplates,
} from '../../core'
import {
  persistAsset,
  removePersistedAsset,
} from '../../storage'
import type { AppBootstrap } from '../bootstrap/appBootstrap'
import type { PersistedEditHistory, SessionEditSnapshot } from '../../storage'
import { SHOWCASE_CANVAS, cloneShowcaseElements, cloneShowcaseSimulator } from '../data/showcase'
import { alignElementsInUnion, canAlignSelection, type ElementAlign } from '../lib/align-elements'
import { applyElementUpdates, nudgeElementsAtIndices } from '../lib/batch-element-updates'
import {
  canAddElementType,
  DEBUG_GRID_ONCE_MESSAGE,
  elementsWithAddedElement,
  type AddElementResult,
} from '../lib/add-element-guards'
import { storedPropertyValueUnchanged } from '../lib/property-field-meta'
import { createElementFromTemplate } from '../lib/create-element-from-template'
import { moveElementInArray } from '../lib/element-geometry'
import {
  clearDemoMockAttributes,
  clearDemoMockStates,
  clearDemoVariables,
} from '../lib/clear-demo-data'
import { elementsSequenceEqual } from '../editor/yamlElementsSync'
import { reorderSelectionBlock } from '../lib/reorder-selection'
import { isElementCanvasSelectable, resolveElementHitBounds } from '../lib/hidden-element-hints'
import { boundsFullyEnclosedInRect } from '../lib/marquee-selection'
import type { ElementBounds } from '../lib/primitive-bounds'
import {
  cloneEditSnapshot,
  EditHistory,
  snapshotsEqual,
  type EditSnapshot,
} from '../lib/edit-history'
import {
  clampSelectedIndices,
  indicesAfterBringToFront,
  indicesAfterSendToBack,
  remapIndicesAfterMove,
} from '../lib/selection-remap'
import { verifyAndValidateAssetUpload } from '../lib/verify-asset-upload'
import { reorientCanvasSize, type CanvasRotation } from '../lib/canvas-orientation'
import type { DisplayConfig } from '../preferences/displayConfig'
import type { MockEntityAttributes } from '../preferences/mockStates'
import { isValidVariableName } from '../preferences/variables'
import type { StoredVariables } from '../../storage'
import { allowShowcaseBundledForDemo, suppressShowcaseBundled } from '../preferences/showcaseAsset'
import { readSnapGridPrefs, writeSnapGridPrefs, type SnapGridPrefs } from '../preferences/snapGrid'
import {
  readShowHiddenHintsPrefs,
  writeShowHiddenHintsPrefs,
} from '../preferences/hiddenHints'
import {
  capabilitiesToCanvas,
  hostStateNamesEqual,
  hostStatesEqual,
  hostStatesToMockData,
  hostStatesToNames,
  mergeMockAttributes,
  mockStatesEqual,
  NO_HOST_STATE_NAMES,
  type HostStateCatalog,
  type HostStateNames,
} from '../../embed/hostContract'
import type { DesignerHost } from '../../embed/host'
import { hostActionsEqual, NO_HOST_ACTIONS } from '../../embed/hostActions'
import {
  autoAdoptedHostTarget,
  findHostTarget,
  hostCapabilitiesEqual,
  hostTargetsEqual,
  NO_HOST_TARGETS,
} from '../../embed/hostTargets'
import type { HostAction, HostStates, HostTarget } from '../../embed/types'
import { useTemplatePreviewClock } from './useTemplatePreviewClock'

export type { AddElementResult } from '../lib/add-element-guards'
export type { CanvasRotation } from '../lib/canvas-orientation'
export type SelectionSource = 'ui' | 'yaml'

export interface SelectElementOptions {
  additive?: boolean
  source?: SelectionSource
}

function normalizeSelectOptions(
  options?: SelectElementOptions | SelectionSource,
): SelectElementOptions {
  if (options === 'ui' || options === 'yaml') {
    return { source: options }
  }
  return options ?? {}
}

function sortIndices(indices: number[]): number[] {
  return [...indices].sort((left, right) => left - right)
}

function sessionSnapshotToEdit(snapshot: SessionEditSnapshot): EditSnapshot {
  return {
    elements: snapshot.elements,
    canvas: { ...snapshot.canvas },
    service: snapshot.service,
    selectedIndices: [...snapshot.selectedIndices],
  }
}

function editSnapshotToSession(snapshot: EditSnapshot): SessionEditSnapshot {
  return {
    elements: snapshot.elements,
    canvas: { ...snapshot.canvas },
    service: snapshot.service,
    selectedIndices: [...snapshot.selectedIndices],
  }
}

function createEditHistory(editHistory?: PersistedEditHistory): EditHistory {
  const history = new EditHistory()
  if (editHistory) {
    history.loadStacks({
      undoStack: editHistory.undoStack.map(sessionSnapshotToEdit),
      redoStack: editHistory.redoStack.map(sessionSnapshotToEdit),
    })
  }
  return history
}

function snapshotEditHistory(history: EditHistory): PersistedEditHistory {
  const stacks = history.exportStacks()
  return {
    undoStack: stacks.undoStack.map(editSnapshotToSession),
    redoStack: stacks.redoStack.map(editSnapshotToSession),
  }
}

/** Alias of `DisplayConfig` (`../preferences/displayConfig`) — same shape, kept
 * under this name for the hook's existing consumers. */
export type CanvasConfig = DisplayConfig

/**
 * The display target the design is pinned to (issue #106): the id echoed back
 * to the host, plus the label and capabilities *as last pushed*. Both copies
 * outlive the host's list on purpose — a display the host drops keeps its name
 * in the picker and its values under the lock (keep-and-mark-stale), and the
 * stored capabilities are what a later push is compared against to notice the
 * host re-defined this display.
 */
type SelectedTarget = Pick<HostTarget, 'id' | 'label' | 'capabilities'>

function buildEffectiveMockContext(
  templateEntityIds: readonly string[],
  mockStates: HaMockContext['states'],
  mockAttributes: MockEntityAttributes,
  variables: StoredVariables,
): HaMockContext {
  const states = { ...mockStates }

  for (const entityId of templateEntityIds) {
    if (!(entityId in states)) {
      states[entityId] = 'unknown'
    }
  }

  return { states, attributes: mockAttributes, variables }
}

/**
 * `getStatus()`'s edit-tracking half (issue #133): the two fields
 * `commitElements`/`restoreSnapshot` maintain and `App` combines with
 * YAML-validity and selection state to build a {@link DesignerStatus}.
 */
export interface ProjectEditStatus {
  /** Epoch ms of the last user-originated element change, or `null`. */
  lastEditAt: number | null
  /** Monotonic counter, incremented once per committed element change. */
  payloadRevision: number
}

export interface ProjectStateEditorHooks {
  /**
   * Points at `YamlPanel`'s `discardPendingYamlEdit` (issue #104 review): a
   * host payload push is authoritative, so the push applier below invalidates
   * any debounced YAML draft before committing the pushed elements. A ref, not
   * a callback prop, so the shell can hand it over before the panel mounts and
   * the push registration never re-runs because of it.
   */
  yamlDiscardPendingRef?: RefObject<(() => void) | null>
}

export function useProjectState(
  bootstrap: AppBootstrap,
  host: DesignerHost,
  { yamlDiscardPendingRef }: ProjectStateEditorHooks = {},
) {
  const [sessionName, setSessionName] = useState(bootstrap.sessionName)
  const [elements, setElements] = useState<DrawElement[]>(bootstrap.elements)
  const [selectedIndices, setSelectedIndices] = useState<number[]>([])
  const [selectionSource, setSelectionSource] = useState<SelectionSource>('ui')
  const [canvas, setCanvas] = useState<CanvasConfig>(bootstrap.canvas)
  const [service, setService] = useState<ServiceOptions | undefined>(bootstrap.service)
  const [mockStates, setMockStates] = useState<HaMockContext['states']>(bootstrap.mockStates)
  const [mockAttributes, setMockAttributes] = useState<MockEntityAttributes>(
    bootstrap.mockAttributes,
  )
  const [variables, setVariables] = useState<StoredVariables>(bootstrap.variables)
  // Host-fed states (issue #107, ADR-018 state catalog): does a host own the
  // states? Seeded from the adapter — the `states` mount option is an initial
  // push, so the very first painted frame must already show the read-only
  // referenced-states panel instead of the Simulator — and latched by the first
  // `setStates()` push. It never goes back: a host that has fed states once
  // owns them for the life of the mount.
  const [hostStatesFed, setHostStatesFed] = useState(host.states != null)
  // The friendly names the last push supplied (issue #107): presentation only,
  // deliberately not part of the mock/template context, so no payload can read
  // a label as data.
  const [hostStateNames, setHostStateNames] = useState<HostStateNames>(() =>
    host.states ? hostStatesToNames(host.states) : NO_HOST_STATE_NAMES,
  )
  // Host-defined display (issue #70): the canvas config of the display target
  // the design is pinned to. Presence enables the display lock; re-locking
  // restores these values.
  const [hostDisplay, setHostDisplay] = useState<CanvasConfig | null>(
    bootstrap.hostDisplay ?? null,
  )
  // An adopted host display starts locked — adopting a display and locking onto
  // it are one act (issue #70, issue #121). Unlocking is the user's move.
  const [displayLocked, setDisplayLocked] = useState(bootstrap.hostDisplay != null)
  // Host-registered action buttons (issue #108, ADR-018). Seeded from the
  // adapter — the `actions` mount option is defined as an initial push, so it
  // must be on the first painted frame — and replaced wholesale by later
  // `setActions()` pushes.
  const [hostActions, setHostActions] = useState<readonly HostAction[]>(
    host.actions ?? NO_HOST_ACTIONS,
  )
  // Host-pushed display targets (issue #106, ADR-018) — the one display
  // channel. Seeded from the adapter for the same reason as `actions` — the
  // `targets` mount option is an initial push — and replaced wholesale by later
  // `setTargets()` pushes.
  const [hostTargets, setHostTargets] = useState<readonly HostTarget[]>(
    host.targets ?? NO_HOST_TARGETS,
  )
  // The display the design is pinned to, remembered with its label and
  // capabilities so a target the host later removes can still be named in the
  // picker and re-locked onto (keep-and-mark-stale ruling), and so a re-push
  // carrying new capabilities for it can be recognised as such.
  //
  // Set either by an explicit pick or by a **single-target push** adopting the
  // only display on offer (issue #121) — the adapter has already resolved the
  // mount option's half of that, and `applyTargets` does the same for a later
  // push. A list the user could choose between never selects anything.
  const [selectedTarget, setSelectedTarget] = useState<SelectedTarget | null>(
    () => autoAdoptedHostTarget(host.targets ?? NO_HOST_TARGETS),
  )
  const [assetRevision, setAssetRevision] = useState(0)
  const [snapGrid, setSnapGrid] = useState<SnapGridPrefs>(() => readSnapGridPrefs())
  const [showHiddenHints, setShowHiddenHints] = useState(() => readShowHiddenHintsPrefs().enabled)
  const mockStatesRef = useRef(mockStates)
  const mockAttributesRef = useRef(mockAttributes)
  // Is a host feeding states right now (issue #107)? Read inside `loadDemo`,
  // which must load the demo *payload only* under a host-fed adapter — never a
  // render dependency, so the Load Demo callback keeps its identity.
  const hostStatesFedRef = useRef(hostStatesFed)
  // Last raw host `states` payload actually applied (issue #110): compared
  // structurally against each new push so an unchanged tick (the upstream
  // OpenDisplay HA integration re-sends its full entity registry up to 4x/s)
  // costs one cheap scan instead of a setState + re-render + template
  // re-evaluation. Set synchronously inside `applyStates` itself, never from
  // an effect — the same ref-paired-with-setter convention `commitElements`
  // et al. use elsewhere in this file.
  //
  // Aliases the caller's pushed object — this holds the same reference the
  // host passed to `setStates()`, not a clone (cloning would cost what the
  // diff is meant to save). That makes mutate-and-repush unsupported: a host
  // that mutates this same object in place and re-pushes it gets a false
  // "unchanged" from `hostStatesEqual` below, since the mutation already
  // happened to the retained reference before the comparison runs. Ownership
  // contract documented for hosts in docs/embedding.md (`states` section)
  // and on `HostStates` in src/embed/types.ts — construct a fresh object per
  // push instead.
  const lastHostStatesRef = useRef<HostStates | null>(null)
  // Observability read state (issue #133, ADR-018's observability clause):
  // `payloadRevisionRef` is bumped once per committed element change,
  // whoever committed it; `lastEditAtRef` only for a **user**-originated one —
  // `applyingHostPayloadRef` is the guard `applyPayload` below sets around its
  // own `commitElements` call so a host `setPayload()` push cannot count as
  // "the user doing something". Refs, not state: `getStatus()` reads them
  // synchronously (the same "pull, don't push" shape `getElementsSnapshot`
  // uses), and a state flip here would just be a render nothing consumes.
  //
  // `editStatusVersion` is the one authoritative reactivity signal for these
  // refs (issue #133 review round 2 tried leaning on `elements` instead, and
  // review round 3 found the gap: `endEditCoalesce` bumps the refs on a
  // gesture's end without ever calling `setElements` — a coalesced drag or
  // property edit produced a real revision bump `App`'s notify effect could
  // not see, so it rode along on incidental churn again, the exact class
  // round 2 was fixing). `bumpEditStatus` below is the **only** place that
  // increments these refs, and it always bumps this counter in the same
  // call — one bump site, one signal, no other path can silently diverge.
  const payloadRevisionRef = useRef(0)
  const lastEditAtRef = useRef<number | null>(null)
  const applyingHostPayloadRef = useRef(false)
  const [editStatusVersion, setEditStatusVersion] = useState(0)
  /**
   * The one and only place `payloadRevisionRef`/`lastEditAtRef` change (issue
   * #133 review round 3) — `commitElements`, `endEditCoalesce` and
   * `restoreSnapshot` all funnel through this instead of touching the refs
   * directly, so `editStatusVersion` can never bump without them, or vice
   * versa. `isUserEdit` is `false` only for a host `setPayload()` push
   * (`applyPayload` guards it via `applyingHostPayloadRef`); every other
   * caller passes `true`.
   */
  const bumpEditStatus = useCallback((isUserEdit: boolean) => {
    payloadRevisionRef.current += 1
    if (isUserEdit) {
      lastEditAtRef.current = Date.now()
    }
    setEditStatusVersion((version) => version + 1)
  }, [])
  // The `elements` reference at the start of the coalesced gesture currently
  // open (issue #133 MINOR 5), or `null` outside one. `commitElements` skips
  // its own revision/edit bump while `historyRef.current!.isCoalescing()` is
  // true — a canvas drag or a property-panel drag can call it once per
  // pointermove — and `endEditCoalesce` below bumps exactly once for the
  // whole gesture, comparing against this to also skip a gesture that started
  // and ended without net change (matching the no-op guard
  // `EditHistory.endCoalesce` already applies to the undo stack — NIT 7's
  // out-of-range-index guard is the other no-op case, handled in
  // `commitElements` itself). Reuses the existing undo-coalescing signal
  // rather than the YAML-editor drag-suspension one (AGENTS.md: those are a
  // separate contract — `elements` → editor text — not to be touched here).
  const coalesceStartElementsRef = useRef<DrawElement[] | null>(null)
  const elementsRef = useRef(elements)
  const canvasRef = useRef(canvas)
  const hostDisplayRef = useRef(hostDisplay)
  const displayLockedRef = useRef(displayLocked)
  const selectedTargetRef = useRef(selectedTarget)
  // Rotation is outside the lock's scope (maintainer ruling 2026-08-16): the
  // user may repoint a locked display's rotation freely (portrait mounting),
  // so a re-apply of the *same* selected target's capabilities must not clobber
  // it. This tracks "has the user touched rotation since the last pick" —
  // cleared on every pick (including re-picking the same id), set on every
  // manual rotation change. A ref, not state: read only inside the push
  // appliers below and `selectDisplayTarget`, never a render dependency.
  const rotationOverriddenSincePickRef = useRef(false)
  // Has the user made a display choice of their own — picked a target, picked
  // the virtual display, or worked the lock? Until they have, a single-target
  // push is adopted as "the display" (issue #121); afterwards nothing but a
  // pick moves the canvas, so a host re-pushing its inventory on a timer can
  // never drag the user back onto hardware they deliberately left. A ref, not
  // state: read only inside the push applier, never a render dependency.
  const userChoseDisplayRef = useRef(false)
  // Re-entrancy guard for the targets push/notify cycle (maintainer ruling
  // 2026-08-16). Answering `onTargetSelected` with another `setTargets()` is a
  // pattern the contract teaches (docs/embedding.md), so a push can arrive
  // while this cycle is still in flight — applying it there would re-enter
  // apply → adopt → notify → apply on the same stack, once per push, with no
  // bound. True while a push is being applied or a selection is out with the
  // host; a push arriving then is parked below instead. Refs, not state: this
  // is control flow inside the appliers, and a state flip would re-trigger the
  // very effects it guards.
  const targetsCycleInFlightRef = useRef(false)
  // The parked push, coalesced to the latest one — `setTargets()` replaces the
  // whole list, so an older parked push carries nothing a newer one does not.
  const deferredTargetsRef = useRef<readonly HostTarget[] | null>(null)
  const serviceRef = useRef(service)
  const selectedIndicesRef = useRef(selectedIndices)
  const [editHistory] = useState(() => createEditHistory(bootstrap.editHistory))
  const historyRef = useRef(editHistory)
  const [historyUi, setHistoryUi] = useState(() => ({
    canUndo: editHistory.canUndo,
    canRedo: editHistory.canRedo,
    undoDepth: editHistory.undoDepth,
  }))

  useEffect(() => {
    mockStatesRef.current = mockStates
  }, [mockStates])

  useEffect(() => {
    mockAttributesRef.current = mockAttributes
  }, [mockAttributes])

  const commitElements = useCallback((value: DrawElement[] | ((current: DrawElement[]) => DrawElement[])) => {
    const current = elementsRef.current
    const next = typeof value === 'function' ? value(current) : value
    elementsRef.current = next
    setElements(next)
    // Issue #133 NIT 7: a no-op commit (e.g. `updateElement`'s out-of-range
    // guard returning `current` unchanged) is not a payload revision or an
    // edit — the updater said nothing changed by returning the same
    // reference back.
    if (next === current) {
      return
    }
    // Issue #133 MINOR 5: while a drag or a property-panel drag gesture is
    // coalescing (`beginEditCoalesce`/`endEditCoalesce`), each intermediate
    // pointermove still commits here for live canvas feedback, but the
    // gesture as a whole counts as ONE payload revision — bumped once, at
    // `endEditCoalesce`, not once per move.
    if (historyRef.current!.isCoalescing()) {
      return
    }
    // Every commit is a payload revision, whoever made it; only a commit
    // *not* wrapped by `applyingHostPayloadRef` (i.e. not a host
    // `setPayload()` push) counts as a user edit.
    bumpEditStatus(!applyingHostPayloadRef.current)
  }, [bumpEditStatus])

  const commitCanvas = useCallback((value: CanvasConfig | ((current: CanvasConfig) => CanvasConfig)) => {
    const next = typeof value === 'function' ? value(canvasRef.current) : value
    canvasRef.current = next
    setCanvas(next)
  }, [])

  // Ref-paired setter, like `commitCanvas` above: the push appliers read the
  // current selection synchronously (a `setTargets` push may arrive before
  // React has re-rendered the previous one) and must never do their canvas work
  // from inside a functional state updater.
  const commitSelectedTarget = useCallback((value: SelectedTarget | null) => {
    selectedTargetRef.current = value
    setSelectedTarget(value)
  }, [])

  /**
   * Pin the design to a display target: adopt its capabilities, lock the
   * display config onto them, and remember the selection (issue #106).
   *
   * Every adoption the *running* designer makes goes through here — the user's
   * pick and a single-target push alike (issue #121) — so both land the same
   * canvas, the same lock state and the same fresh rotation baseline.
   *
   * The one adoption that does not is the mount option's: `targets: [display]`
   * is adopted while building the bootstrap (`buildEmbedBootstrap`,
   * `src/embed/embeddedHost.ts`), because it has to be in the first painted
   * frame — before this hook's state exists. The two stay equivalent by both
   * resolving the canvas through `capabilitiesToCanvas` and by treating a
   * present `hostDisplay` as locked (see the `displayLocked` initializer);
   * `tests/embed/host-targets.test.tsx` pins the option and the push against
   * each other so the equivalence cannot drift silently.
   */
  const adoptDisplayTarget = useCallback(
    (target: SelectedTarget) => {
      // Adopting is a fresh rotation baseline (maintainer ruling 2026-08-16):
      // whatever the user did to rotation before this no longer counts as
      // "since the pick".
      rotationOverriddenSincePickRef.current = false
      const next = capabilitiesToCanvas(
        target.capabilities,
        canvasRef.current.previewDitherMode,
      )
      commitCanvas(next)
      hostDisplayRef.current = next
      setHostDisplay(next)
      displayLockedRef.current = true
      setDisplayLocked(true)
      commitSelectedTarget({
        id: target.id,
        label: target.label,
        capabilities: target.capabilities,
      })
    },
    [commitCanvas, commitSelectedTarget],
  )

  const commitService = useCallback(
    (value: ServiceOptions | undefined | ((current: ServiceOptions | undefined) => ServiceOptions | undefined)) => {
      const next = typeof value === 'function' ? value(serviceRef.current) : value
      serviceRef.current = next
      setService(next)
    },
    [],
  )

  const commitSelectedIndices = useCallback((value: number[] | ((current: number[]) => number[])) => {
    const next = typeof value === 'function' ? value(selectedIndicesRef.current) : value
    selectedIndicesRef.current = next
    setSelectedIndices(next)
  }, [])

  const syncHistoryUi = useCallback(() => {
    const history = historyRef.current!
    setHistoryUi({
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      undoDepth: history.undoDepth,
    })
  }, [])

  const resetEditHistory = useCallback(() => {
    historyRef.current!.clear()
    syncHistoryUi()
  }, [syncHistoryUi])

  const captureSnapshot = useCallback((): EditSnapshot => {
    return cloneEditSnapshot({
      elements: elementsRef.current,
      canvas: canvasRef.current,
      service: serviceRef.current,
      selectedIndices: selectedIndicesRef.current,
    })
  }, [])

  const restoreSnapshot = useCallback(
    (snapshot: EditSnapshot) => {
      const nextElements = structuredClone(snapshot.elements)
      elementsRef.current = nextElements
      setElements(nextElements)
      // Issue #133: undo/redo bypasses `commitElements`, but it is still a
      // user-originated change (the user pressed undo/redo).
      bumpEditStatus(true)
      const nextSelection = clampSelectedIndices(snapshot.selectedIndices, snapshot.elements.length)
      selectedIndicesRef.current = nextSelection
      setSelectedIndices(nextSelection)
      setSelectionSource('ui')
    },
    [bumpEditStatus],
  )

  const dispatchHistory = useCallback(
    (mutate: () => void) => {
      const before = captureSnapshot()
      mutate()
      const after = captureSnapshot()
      if (snapshotsEqual(before, after)) {
        return
      }
      historyRef.current!.recordBefore(before)
      syncHistoryUi()
    },
    [captureSnapshot, syncHistoryUi],
  )

  const beginEditCoalesce = useCallback(() => {
    historyRef.current!.beginCoalesce(captureSnapshot())
    // Issue #133 MINOR 5: the gesture's start point, so `endEditCoalesce`
    // below can tell whether it changed anything at all.
    coalesceStartElementsRef.current = elementsRef.current
  }, [captureSnapshot])

  const endEditCoalesce = useCallback(() => {
    const wasCoalescing = historyRef.current!.isCoalescing()
    historyRef.current!.endCoalesce(captureSnapshot())
    syncHistoryUi()
    // Issue #133 MINOR 5: `commitElements` skipped its own bump for every
    // pointermove this gesture made while coalescing was active — this is the
    // one point that counts the gesture as a single committed change, and
    // only if it actually changed anything (a drag that starts and ends
    // without net movement must not bump either, matching the no-op guard
    // `EditHistory.endCoalesce` itself just applied to the undo stack above).
    // `wasCoalescing` guards a stray `endEditCoalesce()` call with no matching
    // `beginEditCoalesce()` (mirrors `EditHistory.endCoalesce`'s own guard).
    if (
      wasCoalescing &&
      coalesceStartElementsRef.current !== null &&
      elementsRef.current !== coalesceStartElementsRef.current
    ) {
      // Issue #133 review round 3 (MAJOR N5): this bump has no `setElements`
      // call of its own to ride along on — `commitElements` already applied
      // every intermediate move to `elements` while coalescing was active, so
      // by now `elements` is already settled and won't change again. Without
      // `bumpEditStatus`'s own `editStatusVersion` counter, this revision
      // bump would be invisible to anything that only reacts to `elements`
      // changing (exactly the gap round 2's `elements`-dependency fix left
      // open: a gesture bump landing here rode on incidental churn instead of
      // ever being genuinely observable).
      bumpEditStatus(true)
    }
    coalesceStartElementsRef.current = null
  }, [captureSnapshot, syncHistoryUi, bumpEditStatus])

  const undo = useCallback(() => {
    const restored = historyRef.current!.undo(captureSnapshot())
    if (restored) {
      restoreSnapshot(restored)
      syncHistoryUi()
    }
  }, [captureSnapshot, restoreSnapshot, syncHistoryUi])

  const redo = useCallback(() => {
    const restored = historyRef.current!.redo(captureSnapshot())
    if (restored) {
      restoreSnapshot(restored)
      syncHistoryUi()
    }
  }, [captureSnapshot, restoreSnapshot, syncHistoryUi])

  // Persistence is host policy (ADR-017): the standalone adapter supplies the
  // IndexedDB writers, an embedding host supplies none — then the parent owns
  // the payload (ADR-010), and host-pushed states/variables never overwrite
  // the standalone Simulator's persisted mocks. Read through a ref so the
  // debounce effects keep depending on a stable boolean.
  const persistenceRef = useRef(host.persistence)
  const persistLocally = host.persistence != null

  useEffect(() => {
    persistenceRef.current = host.persistence
  }, [host.persistence])

  useEffect(() => {
    if (!persistLocally) {
      return
    }
    const timer = window.setTimeout(() => {
      persistenceRef.current?.writeMocks({ states: mockStates, attributes: mockAttributes })
    }, 250)
    return () => {
      window.clearTimeout(timer)
    }
  }, [persistLocally, mockStates, mockAttributes])

  useEffect(() => {
    if (!persistLocally) {
      return
    }
    const timer = window.setTimeout(() => {
      persistenceRef.current?.writeVariables(variables)
    }, 250)
    return () => {
      window.clearTimeout(timer)
    }
  }, [persistLocally, variables])

  useEffect(() => {
    if (!persistLocally) {
      return
    }
    const timer = window.setTimeout(() => {
      persistenceRef.current?.writeSession({
        name: sessionName,
        canvas,
        service,
        elements,
        editHistory: snapshotEditHistory(historyRef.current!),
      })
    }, 250)
    return () => {
      window.clearTimeout(timer)
    }
  }, [persistLocally, canvas, elements, historyUi, service, sessionName])

  /**
   * Apply one `setTargets()` push (issue #106, #121): everything a pushed
   * display list does to designer state.
   *
   * Never runs re-entrantly — `pushHostTargets` below parks a push that arrives
   * while another push, or a selection notification, is still in flight.
   */
  const applyHostTargets = useCallback(
    (targets: readonly HostTarget[]) => {
      // Re-pushable by contract (ADR-018): a display the host learns about
      // appears in the picker without a reload. Same diff-before-setState
      // shape as `applyStates`/`applyActions` below.
      setHostTargets((current) => (hostTargetsEqual(current, targets) ? current : targets))

      const selected = selectedTargetRef.current
      // A single pushed display is not a choice, it *is* the display (issue
      // #121, the 2.0 subsumption of the `capabilities` channel): adopt and
      // lock onto it, exactly as the mount option does. Only while the user
      // has made no display choice of their own — after that this channel
      // goes back to offering displays, never moving the canvas. A re-push of
      // the display already adopted falls through to the re-apply rules
      // below, which is where a relabel or a redefinition belongs.
      if (!userChoseDisplayRef.current) {
        const adopted = autoAdoptedHostTarget(targets)
        if (adopted && adopted.id !== selected?.id) {
          adoptDisplayTarget(adopted)
          return
        }
      }

      const pushed = findHostTarget(targets, selected?.id ?? null)
      // Keep-and-mark-stale (maintainer ruling 2026-08-16): a push that drops
      // the selected target changes *nothing* here — not the canvas, not the
      // lock, not the remembered selection. The picker derives "unavailable"
      // from the selection no longer being in the list, so it heals by itself
      // if the host pushes the display back.
      if (!selected || !pushed) {
        return
      }
      const redefined = !hostCapabilitiesEqual(selected.capabilities, pushed.capabilities)
      if (pushed.label === selected.label && !redefined) {
        return
      }
      // Keep the remembered label and capabilities current while the target
      // is still there, so a later removal names it the way the host last did
      // and re-locking uses the values the host last stated.
      commitSelectedTarget({
        id: selected.id,
        label: pushed.label,
        capabilities: pushed.capabilities,
      })
      if (!redefined) {
        return
      }
      // The host re-defined the very display the design is pinned to, so the
      // designer re-asserts it (maintainer ruling 2026-08-16). Locked, the
      // canvas follows it and stays locked; unlocked, the user owns the
      // canvas, so this only updates what re-locking will apply. Rotation is
      // carved out of that follow (lock scope, maintainer ruling
      // 2026-08-16): a user who repointed rotation since picking this target
      // keeps it; only an untouched rotation adopts what the target now
      // declares.
      // `next` is one adoption: its dimensions and its rotation arrived
      // together, so it is the oriented surface every re-orientation below
      // measures from (issue #139 review — the pair is never split).
      const next = capabilitiesToCanvas(
        pushed.capabilities,
        canvasRef.current.previewDitherMode,
      )
      hostDisplayRef.current = next
      setHostDisplay(next)
      if (displayLockedRef.current) {
        const heldRotation = canvasRef.current.rotation
        commitCanvas(
          rotationOverriddenSincePickRef.current
            ? {
                ...next,
                // The surviving rotation orients the re-pushed panel (issue
                // #139) — same two dimensions, the user's way round.
                ...reorientCanvasSize(next, heldRotation),
                rotation: heldRotation,
              }
            : next,
        )
      }
    },
    [adoptDisplayTarget, commitCanvas, commitSelectedTarget],
  )

  /**
   * Run one leg of the targets push/notify cycle — applying a push, or handing
   * a selection to the host — and then apply whatever the host pushed while
   * that leg was in flight.
   *
   * The drain is a loop, never a recursion: a parked push is applied *after*
   * the leg that parked it returns, so the stack never grows with the number
   * of pushes. It terminates because applying a push runs no host code, so
   * nothing can park another one from inside the loop. A leg raised while the
   * cycle is already in flight (a notification the drain itself provokes) runs
   * inline and leaves the drain to the outermost leg.
   */
  const runTargetsCycle = useCallback(
    (leg: () => void) => {
      if (targetsCycleInFlightRef.current) {
        // Already inside the cycle (a notification the drain below provoked):
        // run the leg inline and leave the drain to the outermost cycle.
        leg()
        return
      }
      targetsCycleInFlightRef.current = true
      try {
        leg()
      } finally {
        targetsCycleInFlightRef.current = false
        // Apply whatever the host pushed while the leg was in flight — also
        // when the leg *threw*: a leg is host code (`onTargetSelected`), and a
        // push it made before throwing was already accepted at the handle.
        while (deferredTargetsRef.current !== null) {
          const deferred = deferredTargetsRef.current
          deferredTargetsRef.current = null
          targetsCycleInFlightRef.current = true
          try {
            applyHostTargets(deferred)
          } finally {
            targetsCycleInFlightRef.current = false
          }
        }
      }
    },
    [applyHostTargets],
  )

  /**
   * The `applyTargets` push entry point: apply the push now, or park it when
   * the cycle is already in flight so it lands the moment this one settles.
   * Latest wins, and nothing is dropped.
   */
  const pushHostTargets = useCallback(
    (targets: readonly HostTarget[]) => {
      if (targetsCycleInFlightRef.current) {
        deferredTargetsRef.current = targets
        return
      }
      runTargetsCycle(() => applyHostTargets(targets))
    },
    [applyHostTargets, runTargetsCycle],
  )

  // Host pushes: register the appliers with the mount lifecycle's bridge (it
  // owns the pre-registration queue, so adapters never implement this). Each
  // applier runs from a MountHandle setter call — an external host event,
  // which is exactly where React wants external-state-driven setState to live.
  //
  // A *layout* effect, deliberately (issue #115): this is the shell's
  // imperative handle to the host, and like `useImperativeHandle` it has to
  // exist the moment the DOM does. Registering it passively left a window
  // between the commit and React's passive-effect flush — a whole macrotask
  // wide, and much wider under CPU contention — in which a host push already
  // sitting in the mount's pre-registration queue was neither applied nor
  // visible. The host then paints a frame of default, unlocked display config
  // before the pushed capabilities land. Registering at commit time drains the
  // queue synchronously, so the first frame the host can observe already
  // reflects everything it pushed.
  useLayoutEffect(() => {
    if (!host.registerPushTarget) {
      return
    }
    return host.registerPushTarget({
      applyStates: (states) => {
        // Issue #110: an unchanged push (the upstream OpenDisplay HA
        // integration re-sends its whole state map up to 4x/s) must cost
        // nothing beyond this structural scan — no conversion, no setState,
        // no re-render, no template re-evaluation.
        if (lastHostStatesRef.current !== null && hostStatesEqual(lastHostStatesRef.current, states)) {
          return
        }
        // Convert first, latch second (maintainer ruling 2026-08-17). Pushes are
        // pre-validated at the handle boundary (`assertHostStates`), so nothing
        // here is expected to throw — but the *order* is what makes a push
        // all-or-nothing: anything that did throw mid-conversion would otherwise
        // leave the host-fed latch set and this reference retained, and the
        // identical re-push would then be deduped as "unchanged" instead of
        // failing again (the reviewer's wedge on PR #142).
        const mock = hostStatesToMockData(states)
        const names = hostStatesToNames(states)
        lastHostStatesRef.current = states
        // A host that feeds states owns them (issue #107): the Simulator is off
        // and the referenced-states panel takes its tab from here on. Latching
        // it inside the push keeps the mount option and a later push identical
        // in effect (ADR-018 seam grammar), and re-latching an already-fed
        // designer is a no-op React bails out of.
        hostStatesFedRef.current = true
        setHostStatesFed(true)
        // Functional updaters: bail per-part when that half of the push
        // didn't actually change (e.g. only attributes moved), and reuse the
        // attribute object of every state key the push left alone (bounded
        // churn, issue #110) rather than replacing the whole map wholesale.
        setMockStates((current) => (mockStatesEqual(current, mock.states) ? current : mock.states))
        setMockAttributes((current) => mergeMockAttributes(current, mock.attributes))
        setHostStateNames((current) => (hostStateNamesEqual(current, names) ? current : names))
      },
      applyActions: (actions) => {
        // Re-pushable by contract (ADR-018): hosts re-push the whole list to
        // flip a `disabledReason` or relabel a button. Returning `current`
        // for an unchanged list makes React bail out of the render entirely,
        // and keeps the list identity stable for downstream memoization —
        // same diff-before-setState shape as `applyStates` above.
        setHostActions((current) => (hostActionsEqual(current, actions) ? current : actions))
      },
      // Guarded entry point (maintainer ruling 2026-08-16): a push made from
      // inside `onTargetSelected` is parked and applied once that notification
      // settles, so this channel can never re-enter itself.
      applyTargets: pushHostTargets,
      applyPayload: (nextElements) => {
        // The parent replaced the payload wholesale — undo history from the
        // previous payload no longer applies, and neither does a YAML edit the
        // user typed before the push: invalidate that draft *first*, in this
        // same synchronous path, so the commit below cannot be undone later by
        // its debounce flush (issue #104 review).
        //
        // Issue #133 review round 3 (MAJOR N9): this must run **before** the
        // dedupe check below, unconditionally — a push is authoritative over
        // any in-flight draft regardless of whether it changes anything. The
        // previous ordering returned out of the dedupe branch before ever
        // reaching this call, so a host re-pushing the payload the user was
        // mid-typing an *different* edit into (identical to what's already
        // committed, not to the draft) silently no-opped, the draft's own
        // 80ms debounce fired later undisturbed, and `getPayload()` reported
        // the user's typed text instead of the payload just pushed —
        // breaking `setPayload()`'s core guarantee ("afterwards, the payload
        // is exactly what I pushed") specifically in the deduped path.
        yamlDiscardPendingRef?.current?.()

        // Issue #133 MINOR 6: dedupe before committing anything else, the
        // same full-bail pattern `applyStates` uses (issue #110) — a host
        // that re-sends the identical payload (an unconditional heartbeat
        // push, a reconnect resync) costs nothing beyond the discard above:
        // no revision bump, no reset undo history, no cleared selection.
        if (elementsSequenceEqual(elementsRef.current, nextElements)) {
          return
        }
        resetEditHistory()
        // Issue #133: a host push is not "the user doing something" — guard
        // `commitElements`'s `lastEditAt` bump for the duration of this one
        // synchronous call. The payload revision still bumps (a host push is
        // a committed change too), since `resetEditHistory()` above already
        // cleared `isCoalescing()` back to false.
        applyingHostPayloadRef.current = true
        try {
          commitElements(structuredClone(nextElements))
        } finally {
          applyingHostPayloadRef.current = false
        }
        commitSelectedIndices([])
      },
    })
  }, [
    host,
    commitElements,
    commitSelectedIndices,
    pushHostTargets,
    resetEditHistory,
    yamlDiscardPendingRef,
  ])

  useEffect(() => {
    writeSnapGridPrefs(snapGrid)
  }, [snapGrid])

  useEffect(() => {
    writeShowHiddenHintsPrefs({ enabled: showHiddenHints })
  }, [showHiddenHints])

  const previewClockInterval = useMemo(
    () => resolvePreviewClockInterval(elements),
    [elements],
  )

  const previewNow = useTemplatePreviewClock(previewClockInterval)

  // The entity ids the payload's templates reference, as a list whose IDENTITY
  // only changes when the referenced set does (issue #124). `mockContext` seeds
  // an `unknown` state for each of them, so keyed on `elements` it churned on
  // every canvas pointermove — and through it `previewElements`, which reuses
  // its previous evaluation only while the context is unchanged. Geometry
  // edits cannot change which entities are referenced. Signature-string
  // technique as in `useStableAssetKeys`.
  const templateEntityIdSignature = useMemo(
    () => JSON.stringify(scanPayloadForTemplates(elements).entityIds),
    [elements],
  )
  const templateEntityIds = useMemo(
    () => JSON.parse(templateEntityIdSignature) as string[],
    [templateEntityIdSignature],
  )

  const mockContext = useMemo(
    () => buildEffectiveMockContext(templateEntityIds, mockStates, mockAttributes, variables),
    [templateEntityIds, mockStates, mockAttributes, variables],
  )

  const previewMockContext = useMemo(
    (): HaMockContext => ({ ...mockContext, now: previewNow }),
    [mockContext, previewNow],
  )

  const renderContext: RenderContext = useMemo(
    () => ({
      width: canvas.width,
      height: canvas.height,
      colorMode: canvas.colorMode,
      ditherMode: canvas.previewDitherMode,
      paletteOverrides: canvas.paletteOverrides,
      showHiddenHints,
    }),
    [
      canvas.width,
      canvas.height,
      canvas.colorMode,
      canvas.previewDitherMode,
      canvas.paletteOverrides,
      showHiddenHints,
    ],
  )

  // Only the templated elements cost anything to evaluate (issue #124): every
  // canvas pointermove ran the whole payload through the evaluator — a
  // nunjucks compile per templated field, a deep clone of every element — to
  // move the geometry of one. The signature below is scoped to just the
  // templated slots (a template-free element folds to `null` regardless of
  // its content, the identity-stabilising technique of `useStableAssetKeys`),
  // so moving a template-free element never touches it and this map stays
  // cached across that move; `previewElements` below passes such elements
  // straight through.
  //
  // This is ONE combined signature over ALL templated slots together, not a
  // per-element cache: editing any templated element's own content changes
  // the whole signature string, so the recompute below re-evaluates EVERY
  // templated element, not just the one that changed. A drag of a templated
  // element (e.g. an icon with a templated `size`) does not get the same
  // per-move win a template-free drag does — an accepted, subset-bounded
  // trade rather than per-slot caching. A context change — Simulator edit,
  // host states push, preview clock tick — always re-evaluates every
  // templated element regardless.
  const templatedSlotsSignature = useMemo(
    () =>
      JSON.stringify(elements.map((element) => (elementHasTemplates(element) ? element : null))),
    [elements],
  )

  const templatedPreviews = useMemo(() => {
    const slots = JSON.parse(templatedSlotsSignature) as (DrawElement | null)[]
    const previews = new Map<number, DrawElement>()
    slots.forEach((element, index) => {
      if (element != null) {
        previews.set(index, applyTemplateContextToElement(element, previewMockContext))
      }
    })
    return previews
  }, [previewMockContext, templatedSlotsSignature])

  // Slots without a precomputed preview are the template-free ones, for which
  // evaluation is the element itself (normalized) — so this stays correct
  // whatever the map holds, and the dragged geometry flows through untouched.
  const previewElements = useMemo(
    () =>
      elements.map(
        (element, index) =>
          templatedPreviews.get(index) ?? applyTemplateContextToElement(element, previewMockContext),
      ),
    [elements, previewMockContext, templatedPreviews],
  )

  const extraEntityIds = useMemo(() => Object.keys(mockContext.states).sort(), [mockContext.states])

  // The host's state catalog, or null when the designer owns its states
  // (issue #107, ADR-018). One value carries both the panel's data and the
  // Simulator-off policy, so there is no way for the two to disagree. Its
  // identity only moves when one of the pushed maps does — every one of them is
  // identity-stable across an unchanged push (issue #110), so a 4x/s
  // full-registry re-push still re-renders nothing.
  const hostStateCatalog = useMemo<HostStateCatalog | null>(
    () =>
      hostStatesFed
        ? { values: mockStates, attributes: mockAttributes, names: hostStateNames }
        : null,
    [hostStatesFed, mockStates, mockAttributes, hostStateNames],
  )

  const selectedIndex = selectedIndices.length > 0 ? selectedIndices[selectedIndices.length - 1]! : null

  const selectElement = useCallback((index: number | null, options?: SelectElementOptions | SelectionSource) => {
    const { additive = false, source = 'ui' } = normalizeSelectOptions(options)
    setSelectionSource(source)
    if (index == null) {
      commitSelectedIndices([])
      return
    }
    if (additive) {
      commitSelectedIndices((current) => {
        if (current.includes(index)) {
          const next = current.filter((entry) => entry !== index)
          return next.length > 0 ? next : []
        }
        return sortIndices([...current, index])
      })
      return
    }
    commitSelectedIndices([index])
  }, [commitSelectedIndices])

  const clearSelection = useCallback(() => {
    setSelectionSource('ui')
    commitSelectedIndices([])
  }, [commitSelectedIndices])

  const selectAllInRect = useCallback(
    (bounds: ElementBounds, additive = false) => {
      const enclosed = previewElements.flatMap((element, index) => {
        if (!isElementCanvasSelectable(element, renderContext)) {
          return []
        }
        const hitBounds = resolveElementHitBounds(element, renderContext)
        return hitBounds && boundsFullyEnclosedInRect(hitBounds, bounds) ? [index] : []
      })
      setSelectionSource('ui')
      if (additive) {
        commitSelectedIndices((current) => sortIndices([...new Set([...current, ...enclosed])]))
        return
      }
      commitSelectedIndices(sortIndices(enclosed))
    },
    [commitSelectedIndices, previewElements, renderContext],
  )

  const setColorMode = useCallback(
    (colorMode: TagColorMode) => {
      commitCanvas((current) => ({ ...current, colorMode }))
    },
    [commitCanvas],
  )

  /**
   * Set the canvas dimensions **literally** — the single sizing entry point
   * (issue #139 F3, review Q1: this and the former `applyResolution` were
   * byte-identical). Orientation is not this function's business: a resolution
   * quick-pick is oriented to the canvas before it gets here
   * (`applyResolutionSelectValue`), and the manual W/H inputs are explicit
   * intent — typed numbers land as typed.
   */
  const setCanvasSize = useCallback(
    (width: number, height: number) => {
      commitCanvas((current) => ({ ...current, width, height }))
    },
    [commitCanvas],
  )

  const setRotation = useCallback(
    (rotation: CanvasRotation) => {
      // Outside the lock's scope (maintainer ruling 2026-08-16): rotation is
      // the user's mounting choice, so this never checks — let alone flips —
      // the lock, and never touches the target selection. It does mark the
      // rotation as touched since the last pick, so a later re-apply of that
      // target's capabilities preserves it instead of overwriting it.
      rotationOverriddenSincePickRef.current = true
      // Choosing an orientation re-orients the logical drawing surface itself
      // (issue #139) — the canvas is always presented upright, so a quarter
      // turn is a W/H swap and nothing else.
      commitCanvas((current) => ({
        ...current,
        ...reorientCanvasSize(current, rotation),
        rotation,
      }))
    },
    [commitCanvas],
  )

  const setMockState = useCallback((entityId: string, value: string) => {
    // Issue #110 follow-up: a local Simulator edit must invalidate the
    // last-applied-host-push cache, or a later host push structurally
    // identical to the one *before* this edit gets short-circuited by
    // `hostStatesEqual` and never reconciles the Simulator back to host
    // truth. Ref update lives in the same synchronous callback as the
    // setter, same convention as `commitElements` et al.
    lastHostStatesRef.current = null
    setMockStates((current) => ({
      ...current,
      [entityId]: value,
    }))
  }, [])

  const addMockEntity = useCallback((entityId: string, value: string) => {
    lastHostStatesRef.current = null
    setMockStates((current) => ({
      ...current,
      [entityId]: value,
    }))
  }, [])

  const removeMockEntity = useCallback((entityId: string) => {
    lastHostStatesRef.current = null
    setMockStates((current) => {
      if (!(entityId in current)) {
        return current
      }
      const next = { ...current }
      delete next[entityId]
      return next
    })
    setMockAttributes((current) => {
      if (!(entityId in current)) {
        return current
      }
      const next = { ...current }
      delete next[entityId]
      return next
    })
  }, [])

  const setMockAttribute = useCallback(
    (entityId: string, attribute: string, value: unknown) => {
      lastHostStatesRef.current = null
      setMockAttributes((current) => ({
        ...current,
        [entityId]: { ...(current[entityId] ?? {}), [attribute]: value },
      }))
    },
    [],
  )

  const renameMockAttribute = useCallback(
    (entityId: string, previousName: string, nextName: string) => {
      const trimmed = nextName.trim()
      if (trimmed === previousName) {
        return
      }
      lastHostStatesRef.current = null
      setMockAttributes((current) => {
        const entity = current[entityId]
        if (!entity || !(previousName in entity)) {
          return current
        }
        const nextEntity: Record<string, unknown> = {}
        for (const [key, attrValue] of Object.entries(entity)) {
          if (key === previousName) {
            if (trimmed) {
              nextEntity[trimmed] = attrValue
            }
          } else {
            nextEntity[key] = attrValue
          }
        }
        return { ...current, [entityId]: nextEntity }
      })
    },
    [],
  )

  const removeMockAttribute = useCallback((entityId: string, attribute: string) => {
    lastHostStatesRef.current = null
    setMockAttributes((current) => {
      const entity = current[entityId]
      if (!entity || !(attribute in entity)) {
        return current
      }
      const nextEntity = { ...entity }
      delete nextEntity[attribute]
      const next = { ...current }
      if (Object.keys(nextEntity).length > 0) {
        next[entityId] = nextEntity
      } else {
        delete next[entityId]
      }
      return next
    })
  }, [])

  const setVariable = useCallback((name: string, value: string) => {
    if (!isValidVariableName(name)) {
      return
    }
    setVariables((current) => ({ ...current, [name]: value }))
  }, [])

  const addVariable = useCallback((name: string, value: string) => {
    if (!isValidVariableName(name)) {
      return
    }
    setVariables((current) => ({ ...current, [name]: value }))
  }, [])

  const renameVariable = useCallback((previousName: string, nextName: string) => {
    if (!isValidVariableName(nextName)) {
      return
    }
    setVariables((current) => {
      if (!(previousName in current) || previousName === nextName) {
        return current
      }
      const next: StoredVariables = {}
      for (const [name, value] of Object.entries(current)) {
        next[name === previousName ? nextName : name] = value
      }
      return next
    })
  }, [])

  const removeVariable = useCallback((name: string) => {
    setVariables((current) => {
      if (!(name in current)) {
        return current
      }
      const next = { ...current }
      delete next[name]
      return next
    })
  }, [])

  const uploadAsset = useCallback(
    async (key: string, kind: AssetKind, file: File): Promise<AssetUploadResult> => {
      const result = await verifyAndValidateAssetUpload(kind, file, key)
      if (!result.ok) {
        return result
      }

      try {
        await persistAsset(key, {
          blob: file,
          mime: result.mime,
        })
        setAssetRevision((revision) => revision + 1)
        return result
      } catch {
        return {
          ok: false,
          message: 'Could not save the file locally. Try reloading the page.',
        }
      }
    },
    [],
  )

  const clearAsset = useCallback(async (key: string) => {
    if (key === BUNDLED_SHOWCASE_IMAGE_KEY) {
      if (resolveAsset(key).status === 'resolved') {
        await removePersistedAsset(key)
      }
      suppressShowcaseBundled()
      setAssetRevision((revision) => revision + 1)
      return
    }

    await removePersistedAsset(key)
    setAssetRevision((revision) => revision + 1)
  }, [])

  const updateElementsBatch = useCallback(
    (updates: ReadonlyMap<number, DrawElement>) => {
      if (!historyRef.current!.isCoalescing()) {
        dispatchHistory(() => {
          commitElements((current) => applyElementUpdates(current, updates))
        })
        return
      }
      commitElements((current) => applyElementUpdates(current, updates))
    },
    [commitElements, dispatchHistory],
  )

  const updateElement = useCallback(
    (index: number, nextElement: DrawElement) => {
      if (!historyRef.current!.isCoalescing()) {
        dispatchHistory(() => {
          commitElements((current) => {
            if (index < 0 || index >= current.length) {
              return current
            }
            const next = [...current]
            next[index] = nextElement
            return next
          })
        })
        return
      }
      commitElements((current) => {
        if (index < 0 || index >= current.length) {
          return current
        }
        const next = [...current]
        next[index] = nextElement
        return next
      })
    },
    [commitElements, dispatchHistory],
  )

  const updateElementProperty = useCallback(
    (index: number, key: string, value: unknown) => {
      const mutate = () => {
        commitElements((current) => {
          if (index < 0 || index >= current.length) {
            return current
          }
          const element = current[index]
          if (element.type !== 'plot' && storedPropertyValueUnchanged(element, key, value)) {
            return current
          }
          const next = [...current]
          if (element.type === 'plot') {
            next[index] = applyPlotPropertyUpdate(element, key, value)
            return next
          }
          if (value === undefined) {
            const nextElement = { ...element } as Record<string, unknown>
            delete nextElement[key]
            next[index] = nextElement as DrawElement
          } else {
            next[index] = { ...element, [key]: value } as DrawElement
          }
          return next
        })
      }

      if (historyRef.current!.isCoalescing()) {
        mutate()
        return
      }
      dispatchHistory(mutate)
    },
    [commitElements, dispatchHistory],
  )

  const updateSelectedProperty = useCallback(
    (key: string, value: unknown) => {
      const mutate = () => {
        commitElements((current) => {
          let next = current
          for (const index of selectedIndicesRef.current) {
            if (index < 0 || index >= next.length) {
              continue
            }
            const element = next[index]!
            if (element.type !== 'plot' && storedPropertyValueUnchanged(element, key, value)) {
              continue
            }
            const updated = [...next]
            if (element.type === 'plot') {
              updated[index] = applyPlotPropertyUpdate(element, key, value)
            } else if (value === undefined) {
              const nextElement = { ...element } as Record<string, unknown>
              delete nextElement[key]
              updated[index] = nextElement as DrawElement
            } else {
              updated[index] = { ...element, [key]: value } as DrawElement
            }
            next = updated
          }
          return next
        })
      }

      if (historyRef.current!.isCoalescing()) {
        mutate()
        return
      }
      dispatchHistory(mutate)
    },
    [commitElements, dispatchHistory],
  )

  const deleteElement = useCallback(
    (index: number) => {
      dispatchHistory(() => {
        commitElements((current) => {
          if (index < 0 || index >= current.length) {
            return current
          }
          return current.filter((_, i) => i !== index)
        })
        commitSelectedIndices((current) =>
          current
            .filter((entry) => entry !== index)
            .map((entry) => (entry > index ? entry - 1 : entry)),
        )
      })
    },
    [commitElements, commitSelectedIndices, dispatchHistory],
  )

  const deleteSelectedElements = useCallback(() => {
    dispatchHistory(() => {
      commitElements((current) => {
        const toDelete = new Set(selectedIndicesRef.current)
        return current.filter((_, index) => !toDelete.has(index))
      })
      commitSelectedIndices([])
    })
  }, [commitElements, commitSelectedIndices, dispatchHistory])

  const addElement = useCallback(
    (type: DrawElement['type']): AddElementResult => {
      if (!canAddElementType(elements, type)) {
        return { ok: false, message: DEBUG_GRID_ONCE_MESSAGE }
      }
      const element = createElementFromTemplate(type)
      const { nextElements, index } = elementsWithAddedElement(elements, element)
      dispatchHistory(() => {
        commitSelectedIndices([index])
        setSelectionSource('ui')
        commitElements(nextElements)
      })
      return { ok: true, index }
    },
    [commitElements, commitSelectedIndices, dispatchHistory, elements],
  )

  const clearElements = useCallback(() => {
    resetEditHistory()
    commitElements([])
    commitSelectedIndices([])
    // Strip only the unmodified demo-seeded simulator entries; mocks, attributes
    // and variables the user added or changed are preserved (persisted via the
    // debounced writes). This gives a clean slate without deleting user data.
    // Invalidate the host-push cache (issue #110 follow-up): this is a local
    // mock mutation, same as the Simulator setters above.
    lastHostStatesRef.current = null
    setMockStates((current) => clearDemoMockStates(current))
    setMockAttributes((current) => clearDemoMockAttributes(current))
    setVariables((current) => clearDemoVariables(current))
  }, [commitElements, commitSelectedIndices, resetEditHistory])

  const toggleDisplayLock = useCallback(() => {
    // Working the lock is a display choice: it is how the user leaves a display
    // for the virtual one and back (issue #106). From here on no push adopts a
    // display on its own (issue #121).
    userChoseDisplayRef.current = true
    const nextLocked = !displayLockedRef.current
    displayLockedRef.current = nextLocked
    setDisplayLocked(nextLocked)
    const hostConfig = hostDisplayRef.current
    if (nextLocked && hostConfig) {
      // Re-locking returns to the host-pushed dimensions/color mode/palette;
      // the preview dither mode is a designer-only setting and survives
      // (issue #70). Rotation is outside the lock's scope (maintainer ruling
      // 2026-08-16) — it was never lock-owned, so re-locking keeps whatever
      // it currently is rather than snapping back to the host's declared
      // value, and the restored panel is oriented to it (issue #139): the
      // host's two dimensions, the user's way round. `hostConfig` is the
      // oriented surface as adopted — its dimensions and the rotation they were
      // declared in, together — so this turn can never measure from a rotation
      // that belonged to a different adoption (issue #139 review).
      commitCanvas((current) => ({
        ...hostConfig,
        ...reorientCanvasSize(hostConfig, current.rotation),
        rotation: current.rotation,
        previewDitherMode: current.previewDitherMode,
      }))
    }
  }, [commitCanvas])

  /**
   * Display picker choice (issue #106): a target id, or `null` for the
   * virtual display.
   *
   * Picking a display adopts its capabilities over the **canonical defaults**
   * rather than the canvas in front of the user (`capabilitiesToCanvas`):
   * picking a display *is* the display, so the same target must land the same
   * canvas whatever was picked before it. Locking the display config onto it is
   * part of the same act; "Virtual display" is exactly the lock's open state,
   * and the selection survives it so re-locking returns to the selected target.
   */
  const selectDisplayTarget = useCallback(
    (targetId: string | null) => {
      if (targetId === null) {
        // Picking the virtual display *is* a display choice: from here on the
        // user owns which display the design is pinned to, and no later push
        // adopts one on its own (issue #121). It is also a fresh rotation
        // baseline (maintainer ruling 2026-08-16): whatever the user did to
        // rotation before this no longer counts as "since the pick".
        userChoseDisplayRef.current = true
        rotationOverriddenSincePickRef.current = false
        displayLockedRef.current = false
        setDisplayLocked(false)
        return
      }
      const target = findHostTarget(hostTargets, targetId)
      if (!target) {
        // An id the current list no longer offers (the stale entry, a list the
        // host replaced mid-interaction) is a **no-op, not a user choice**
        // (maintainer ruling 2026-08-16): it adopts nothing, so it must not
        // latch auto-adoption off either, and it leaves the rotation baseline
        // alone. Everything below the lookup is the choice.
        return
      }
      // From here on the user owns which display the design is pinned to.
      userChoseDisplayRef.current = true
      adoptDisplayTarget(target)
    },
    [adoptDisplayTarget, hostTargets],
  )

  // The target the design is actually pinned to — what the host is told, and
  // what `onAction` carries. An unlocked display config *is* the virtual
  // display, whatever selection the picker remembers for re-locking; and a
  // selection the host's current list no longer offers is not an id the host
  // can act on, so the designer never hands back an id absent from that list
  // (maintainer ruling 2026-08-16). The *label* stays on screen either way —
  // that is for the user, not the host.
  const activeTargetId =
    displayLocked && selectedTarget != null && findHostTarget(hostTargets, selectedTarget.id) != null
      ? selectedTarget.id
      : null
  const onTargetSelected = host.onTargetSelected
  const notifiedTargetRef = useRef<string | null>(null)

  useEffect(() => {
    // Fires on *change* only, so the initial target-less state is not reported
    // and a `setTargets` push that leaves the selection alone (including the
    // stale case) tells the host nothing new.
    if (notifiedTargetRef.current === activeTargetId) {
      return
    }
    notifiedTargetRef.current = activeTargetId
    // Inside the cycle guard: a host that answers this notification with
    // `setTargets()` — the reaction pattern docs/embedding.md teaches — gets
    // that push parked and applied the moment this call returns, instead of
    // re-entering the push applier from inside the notification it caused.
    runTargetsCycle(() => onTargetSelected?.(activeTargetId))
  }, [activeTargetId, onTargetSelected, runTargetsCycle])

  const loadDemo = useCallback(() => {
    allowShowcaseBundledForDemo()
    resetEditHistory()
    // While the display is locked to a host-defined config, Load Demo keeps
    // it (issue #70) — the demo payload loads, the display does not change.
    if (!(displayLockedRef.current && hostDisplayRef.current)) {
      commitCanvas({ ...SHOWCASE_CANVAS })
    }
    commitElements(cloneShowcaseElements())
    commitSelectedIndices([])
    const simulator = cloneShowcaseSimulator()
    // Under a host-fed adapter, Load Demo loads the **payload only** (maintainer
    // ruling 2026-08-16, issue #107): the demo's states are Simulator data, and
    // the Simulator is off here. Seeding them would flash values the very next
    // host push wholesale-overwrites to unknown (observed on the demo page's
    // ticker, PR #137). The host stays authoritative, and the demo's own states
    // show honestly as "not supplied" in the referenced-states panel.
    if (!hostStatesFedRef.current) {
      // Seed the mock context the showcase templates rely on, so the demo
      // renders its state/attribute examples without manual Simulator setup.
      // Invalidate the host-push cache (issue #110 follow-up): this is a local
      // mock mutation, same as the Simulator setters above.
      lastHostStatesRef.current = null
      setMockStates(simulator.states)
      setMockAttributes(simulator.attributes)
    }
    // Variables are not a host channel — no push can supply or clobber them —
    // so the demo's own variables seed in either mode.
    setVariables(simulator.variables)
  }, [commitCanvas, commitElements, commitSelectedIndices, resetEditHistory])

  const nudgeElement = useCallback(
    (index: number, dx: number, dy: number) => {
      dispatchHistory(() => {
        commitElements((current) =>
          nudgeElementsAtIndices(current, [index], dx, dy, {
            canvas: {
              width: canvasRef.current.width,
              height: canvasRef.current.height,
            },
            snapGrid,
            resolveBounds: (element) => resolveElementHitBounds(element, renderContext),
          }),
        )
      })
    },
    [commitElements, dispatchHistory, renderContext, snapGrid],
  )

  const nudgeSelectedElements = useCallback(
    (dx: number, dy: number) => {
      dispatchHistory(() => {
        commitElements((current) =>
          nudgeElementsAtIndices(current, selectedIndicesRef.current, dx, dy, {
            canvas: {
              width: canvasRef.current.width,
              height: canvasRef.current.height,
            },
            snapGrid,
            resolveBounds: (element) => resolveElementHitBounds(element, renderContext),
          }),
        )
      })
    },
    [commitElements, dispatchHistory, renderContext, snapGrid],
  )

  const applyLayerMove = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= elements.length) {
        return
      }
      if (toIndex < 0 || toIndex >= elements.length) {
        return
      }
      dispatchHistory(() => {
        commitSelectedIndices((selected) => remapIndicesAfterMove(selected, fromIndex, toIndex))
        setSelectionSource('ui')
        commitElements((current) => moveElementInArray(current, fromIndex, toIndex))
      })
    },
    [commitElements, commitSelectedIndices, dispatchHistory, elements.length],
  )

  const moveSelectionLayer = useCallback(
    (direction: 'up' | 'down') => {
      if (selectedIndices.length === 0) {
        return
      }
      const sorted =
        direction === 'up'
          ? [...selectedIndices].sort((left, right) => right - left)
          : [...selectedIndices].sort((left, right) => left - right)

      dispatchHistory(() => {
        let nextElements = elementsRef.current
        let nextIndices = [...selectedIndicesRef.current]
        for (const index of sorted) {
          const partner = direction === 'up' ? index + 1 : index - 1
          if (partner < 0 || partner >= nextElements.length) {
            continue
          }
          nextElements = moveElementInArray(nextElements, index, partner)
          nextIndices = remapIndicesAfterMove(nextIndices, index, partner)
        }
        commitElements(nextElements)
        commitSelectedIndices(nextIndices)
        setSelectionSource('ui')
      })
    },
    [commitElements, commitSelectedIndices, dispatchHistory, selectedIndices],
  )

  const bringSelectionToFront = useCallback(() => {
    if (selectedIndices.length === 0) {
      return
    }
    const selected = new Set(selectedIndices)
    dispatchHistory(() => {
      commitElements((current) => {
        const kept = current.filter((_, index) => !selected.has(index))
        const picked = sortIndices(selectedIndicesRef.current).map((index) => current[index]!)
        return [...kept, ...picked]
      })
      commitSelectedIndices(indicesAfterBringToFront(selectedIndicesRef.current, elementsRef.current.length))
      setSelectionSource('ui')
    })
  }, [commitElements, commitSelectedIndices, dispatchHistory, selectedIndices])

  const sendSelectionToBack = useCallback(() => {
    if (selectedIndices.length === 0) {
      return
    }
    const selected = new Set(selectedIndices)
    dispatchHistory(() => {
      commitElements((current) => {
        const kept = current.filter((_, index) => !selected.has(index))
        const picked = sortIndices(selectedIndicesRef.current).map((index) => current[index]!)
        return [...picked, ...kept]
      })
      commitSelectedIndices(indicesAfterSendToBack(selectedIndicesRef.current))
      setSelectionSource('ui')
    })
  }, [commitElements, commitSelectedIndices, dispatchHistory, selectedIndices])

  const reorderSelection = useCallback(
    (indices: readonly number[], dropIndex: number) => {
      if (indices.length === 0) {
        return
      }
      dispatchHistory(() => {
        const { elements: next, indices: nextIndices } = reorderSelectionBlock(
          elementsRef.current,
          [...indices],
          dropIndex,
        )
        commitElements(next)
        commitSelectedIndices(nextIndices)
        setSelectionSource('ui')
      })
    },
    [commitElements, commitSelectedIndices, dispatchHistory],
  )

  const moveElementLayer = useCallback(
    (fromIndex: number, toIndex: number) => {
      applyLayerMove(fromIndex, toIndex)
    },
    [applyLayerMove],
  )

  const bringToFront = useCallback(
    (index: number) => {
      if (index < 0 || index >= elements.length - 1) {
        return
      }
      applyLayerMove(index, elements.length - 1)
    },
    [applyLayerMove, elements.length],
  )

  const sendToBack = useCallback(
    (index: number) => {
      if (index <= 0 || index >= elements.length) {
        return
      }
      applyLayerMove(index, 0)
    },
    [applyLayerMove, elements.length],
  )

  const moveLayerUp = useCallback(
    (index: number) => {
      if (index >= elements.length - 1) {
        return
      }
      applyLayerMove(index, index + 1)
    },
    [applyLayerMove, elements.length],
  )

  const moveLayerDown = useCallback(
    (index: number) => {
      if (index <= 0) {
        return
      }
      applyLayerMove(index, index - 1)
    },
    [applyLayerMove],
  )

  const reorderElement = moveElementLayer

  const alignSelection = useCallback(
    (align: ElementAlign, boundsByIndex: Map<number, ElementBounds>) => {
      if (selectedIndices.length < 2) {
        return
      }
      dispatchHistory(() => {
        commitElements((current) => {
          if (!canAlignSelection(current, selectedIndicesRef.current)) {
            return current
          }
          return alignElementsInUnion(current, selectedIndicesRef.current, boundsByIndex, align, {
            width: canvasRef.current.width,
            height: canvasRef.current.height,
          })
        })
      })
    },
    [commitElements, dispatchHistory, selectedIndices],
  )

  const togglePreviewDither = useCallback(() => {
    commitCanvas((current) => ({
      ...current,
      previewDitherMode: current.previewDitherMode === 2 ? 0 : 2,
    }))
  }, [commitCanvas])

  const toggleSnapGrid = useCallback(() => {
    setSnapGrid((current) => ({ ...current, enabled: !current.enabled }))
  }, [])

  const toggleShowHiddenHints = useCallback(() => {
    setShowHiddenHints((current) => !current)
  }, [])

  const setSnapGridSize = useCallback((size: number) => {
    setSnapGrid((current) => ({ ...current, size: Math.max(1, size) }))
  }, [])

  const applyYamlSelection = useCallback(
    (indices: number[]) => {
      setSelectionSource('yaml')
      commitSelectedIndices(sortIndices(indices))
    },
    [commitSelectedIndices],
  )

  const selectedElements = useMemo(
    () =>
      selectedIndices
        .map((index) => elements[index])
        .filter((element): element is DrawElement => element != null),
    [elements, selectedIndices],
  )

  const selectedElement = selectedIndex != null ? (elements[selectedIndex] ?? null) : null

  const setElementsWithHistory = useCallback(
    (next: DrawElement[] | ((current: DrawElement[]) => DrawElement[])) => {
      dispatchHistory(() => {
        commitElements(next)
      })
    },
    [commitElements, dispatchHistory],
  )

  // Synchronous accessor onto `elementsRef` (issue #104): `commitElements`
  // updates the ref before the React state setter, so this is always the
  // latest committed elements even mid-callback, before a re-render — what
  // `MountHandle.getPayload()` needs to read immediately after forcing a
  // flush of any pending YAML-editor debounce.
  const getElementsSnapshot = useCallback(() => elementsRef.current, [])

  // Synchronous accessor onto the edit-tracking refs above (issue #133) — the
  // same "read a ref, not a render dependency" shape as `getElementsSnapshot`,
  // since `getStatus()` must answer with the value at the instant it is
  // called, not the value as of the last render.
  const getEditStatus = useCallback(
    (): ProjectEditStatus => ({
      lastEditAt: lastEditAtRef.current,
      payloadRevision: payloadRevisionRef.current,
    }),
    [],
  )

  return {
    sessionName,
    setSessionName,
    service,
    setService: commitService,
    elements,
    setElements: setElementsWithHistory,
    getElementsSnapshot,
    getEditStatus,
    /**
     * The one authoritative reactivity signal for `getEditStatus()`'s values
     * (issue #133 review round 3, MAJOR N5) — bumped by `bumpEditStatus`
     * every time `payloadRevision`/`lastEditAt` change, and only then. `App`
     * depends on this (not `elements`) to know when to re-check whether an
     * `onStatusChange` notification is due; the number itself carries no
     * meaning beyond "changed since last render".
     */
    editStatusVersion,
    previewElements,
    selectedIndices,
    selectedIndex,
    selectionSource,
    selectedElement,
    selectedElements,
    selectElement,
    clearSelection,
    selectAllInRect,
    applyYamlSelection,
    canvas,
    renderContext,
    setColorMode,
    setCanvasSize,
    setRotation,
    /** 'locked' | 'unlocked' when the host defined the display; null standalone (issue #70). */
    displayLock: hostDisplay
      ? displayLocked
        ? ('locked' as const)
        : ('unlocked' as const)
      : null,
    toggleDisplayLock,
    /** Host-pushed display targets, newest push wins (issue #106). */
    hostTargets,
    /** The remembered picker selection — kept while unlocked, and while stale. */
    selectedTargetId: selectedTarget?.id ?? null,
    /** The selected target's last-known label; names it once the host drops it. */
    selectedTargetLabel: selectedTarget?.label ?? null,
    selectDisplayTarget,
    /** The target the design is pinned to right now (null = virtual display). */
    activeTargetId,
    /** Host-registered action buttons, newest push wins (issue #108). */
    hostActions,
    mockContext,
    previewMockContext,
    /**
     * The host's read-only state catalog (issue #107), or `null` when the
     * designer owns its states. Non-null replaces the Simulator tab with the
     * referenced-states panel.
     */
    hostStateCatalog,
    setMockState,
    addMockEntity,
    removeMockEntity,
    setMockAttribute,
    renameMockAttribute,
    removeMockAttribute,
    variables,
    setVariable,
    addVariable,
    renameVariable,
    removeVariable,
    extraEntityIds,
    assetRevision,
    uploadAsset,
    clearAsset,
    updateElement,
    updateElementsBatch,
    updateElementProperty,
    updateSelectedProperty,
    deleteElement,
    deleteSelectedElements,
    addElement,
    clearElements,
    loadDemo,
    nudgeElement,
    nudgeSelectedElements,
    bringToFront,
    sendToBack,
    moveLayerUp,
    moveLayerDown,
    bringSelectionToFront,
    sendSelectionToBack,
    moveSelectionLayer,
    alignSelection,
    reorderElement,
    reorderSelection,
    snapGrid,
    toggleSnapGrid,
    showHiddenHints,
    toggleShowHiddenHints,
    setSnapGridSize,
    togglePreviewDither,
    undo,
    redo,
    canUndo: historyUi.canUndo,
    canRedo: historyUi.canRedo,
    historyUndoDepth: historyUi.undoDepth,
    beginEditCoalesce,
    endEditCoalesce,
  }
}
