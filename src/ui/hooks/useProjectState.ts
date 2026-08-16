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
import {
  type CanvasRotation,
  type DisplayConfig,
} from '../preferences/displayConfig'
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
  hostStatesEqual,
  hostStatesToMockData,
  mergeMockAttributes,
  mockStatesEqual,
} from '../../embed/hostContract'
import type { DesignerHost } from '../../embed/host'
import { hostActionsEqual, NO_HOST_ACTIONS } from '../../embed/hostActions'
import { findHostTarget, hostTargetsEqual, NO_HOST_TARGETS } from '../../embed/hostTargets'
import type { HostAction, HostStates, HostTarget } from '../../embed/types'
import { useTemplatePreviewClock } from './useTemplatePreviewClock'

export type { AddElementResult } from '../lib/add-element-guards'
export type { CanvasRotation } from '../preferences/displayConfig'
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

type MockEntityAttributes = NonNullable<HaMockContext['attributes']>

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
  // Host-defined display (issue #70): the canvas config the embedding host
  // pushed via capabilities. Presence enables the display lock; re-locking
  // restores these values.
  const [hostDisplay, setHostDisplay] = useState<CanvasConfig | null>(
    bootstrap.hostDisplay ?? null,
  )
  // `hostDisplayLocked: false` seeds an unlocked "virtual display" (issue #70
  // follow-up) — the host-pushed values still land on the canvas, but the
  // controls start enabled until the user locks back onto them.
  const [displayLocked, setDisplayLocked] = useState(
    bootstrap.hostDisplay != null && (bootstrap.hostDisplayLocked ?? true),
  )
  // Host-registered action buttons (issue #108, ADR-018). Seeded from the
  // adapter — the `actions` mount option is defined as an initial push, so it
  // must be on the first painted frame — and replaced wholesale by later
  // `setActions()` pushes.
  const [hostActions, setHostActions] = useState<readonly HostAction[]>(
    host.actions ?? NO_HOST_ACTIONS,
  )
  // Host-pushed display targets (issue #106, ADR-018). Seeded from the adapter
  // for the same reason as `actions` — the `targets` mount option is an initial
  // push — and replaced wholesale by later `setTargets()` pushes.
  const [hostTargets, setHostTargets] = useState<readonly HostTarget[]>(
    host.targets ?? NO_HOST_TARGETS,
  )
  // The target the user picked, remembered with its label so a target the host
  // later removes can still be named in the picker (keep-and-mark-stale
  // ruling). Never set by a push: only an explicit pick selects a target, and
  // an anonymous `capabilities` push clears it (see `applyCapabilities`).
  const [selectedTarget, setSelectedTarget] = useState<{ id: string; label: string } | null>(null)
  const [assetRevision, setAssetRevision] = useState(0)
  const [snapGrid, setSnapGrid] = useState<SnapGridPrefs>(() => readSnapGridPrefs())
  const [showHiddenHints, setShowHiddenHints] = useState(() => readShowHiddenHintsPrefs().enabled)
  const mockStatesRef = useRef(mockStates)
  const mockAttributesRef = useRef(mockAttributes)
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
  const elementsRef = useRef(elements)
  const canvasRef = useRef(canvas)
  const hostDisplayRef = useRef(hostDisplay)
  const displayLockedRef = useRef(displayLocked)
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
    const next = typeof value === 'function' ? value(elementsRef.current) : value
    elementsRef.current = next
    setElements(next)
  }, [])

  const commitCanvas = useCallback((value: CanvasConfig | ((current: CanvasConfig) => CanvasConfig)) => {
    const next = typeof value === 'function' ? value(canvasRef.current) : value
    canvasRef.current = next
    setCanvas(next)
  }, [])

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
      const nextSelection = clampSelectedIndices(snapshot.selectedIndices, snapshot.elements.length)
      selectedIndicesRef.current = nextSelection
      setSelectedIndices(nextSelection)
      setSelectionSource('ui')
    },
    [],
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
  }, [captureSnapshot])

  const endEditCoalesce = useCallback(() => {
    historyRef.current!.endCoalesce(captureSnapshot())
    syncHistoryUi()
  }, [captureSnapshot, syncHistoryUi])

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
        // integration re-sends its full entity registry up to 4x/s) must
        // cost nothing beyond this structural scan — no conversion, no
        // setState, no re-render, no template re-evaluation.
        if (lastHostStatesRef.current !== null && hostStatesEqual(lastHostStatesRef.current, states)) {
          return
        }
        lastHostStatesRef.current = states
        const mock = hostStatesToMockData(states)
        // Functional updaters: bail per-part when that half of the push
        // didn't actually change (e.g. only attributes moved), and reuse
        // each unaffected entity's attribute object (bounded churn, issue
        // #110) rather than replacing the whole map wholesale.
        setMockStates((current) => (mockStatesEqual(current, mock.states) ? current : mock.states))
        setMockAttributes((current) => mergeMockAttributes(current, mock.attributes))
      },
      applyCapabilities: (capabilities, options) => {
        // The host (re-)defined the display: adopt it, and by default lock
        // the display config controls to it. `options.lock === false` seeds
        // an unlocked "virtual display" instead (issue #70 follow-up) — the
        // controls stay enabled, but the lock icon still shows so the user
        // can lock back onto these values later.
        const next = capabilitiesToCanvas(capabilities, canvasRef.current)
        const lock = options?.lock ?? true
        commitCanvas(next)
        hostDisplayRef.current = next
        setHostDisplay(next)
        displayLockedRef.current = lock
        setDisplayLocked(lock)
        // Precedence between the two display channels (issue #106): a bare
        // `capabilities` push is an *anonymous* display — it carries no target
        // id, so nothing about it identifies the named target the user may
        // have picked. The canvas is now that unnamed display, and the picker
        // says so ("Host display") rather than keeping a selection the pushed
        // values need not match. Last write wins; the channels never merge.
        setSelectedTarget(null)
      },
      applyActions: (actions) => {
        // Re-pushable by contract (ADR-018): hosts re-push the whole list to
        // flip a `disabledReason` or relabel a button. Returning `current`
        // for an unchanged list makes React bail out of the render entirely,
        // and keeps the list identity stable for downstream memoization —
        // same diff-before-setState shape as `applyStates` above.
        setHostActions((current) => (hostActionsEqual(current, actions) ? current : actions))
      },
      applyTargets: (targets) => {
        // Re-pushable by contract (ADR-018): a display the host learns about
        // appears in the picker without a reload. Same diff-before-setState
        // shape as `applyStates`/`applyActions` above.
        setHostTargets((current) => (hostTargetsEqual(current, targets) ? current : targets))
        // Keep-and-mark-stale (maintainer ruling 2026-08-16): a push that drops
        // the selected target changes *nothing* else — not the canvas, not the
        // lock, not the selection. The picker derives "unavailable" from the
        // selection no longer being in the list, so it heals by itself if the
        // host pushes the display back. All this does is keep the remembered
        // label current while the target is still there, so a later removal
        // names it the way the host last did.
        setSelectedTarget((current) => {
          const pushed = findHostTarget(targets, current?.id ?? null)
          if (!current || !pushed || pushed.label === current.label) {
            return current
          }
          return { id: current.id, label: pushed.label }
        })
      },
      applyPayload: (nextElements) => {
        // The parent replaced the payload wholesale — undo history from the
        // previous payload no longer applies, and neither does a YAML edit the
        // user typed before the push: invalidate that draft *first*, in this
        // same synchronous path, so the commit below cannot be undone later by
        // its debounce flush (issue #104 review).
        yamlDiscardPendingRef?.current?.()
        resetEditHistory()
        commitElements(structuredClone(nextElements))
        commitSelectedIndices([])
      },
    })
  }, [
    host,
    commitCanvas,
    commitElements,
    commitSelectedIndices,
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

  const applyResolution = useCallback(
    (width: number, height: number) => {
      commitCanvas((current) => ({ ...current, width, height }))
    },
    [commitCanvas],
  )

  const setColorMode = useCallback(
    (colorMode: TagColorMode) => {
      commitCanvas((current) => ({ ...current, colorMode }))
    },
    [commitCanvas],
  )

  const setCanvasSize = useCallback(
    (width: number, height: number) => {
      commitCanvas((current) => ({ ...current, width, height }))
    },
    [commitCanvas],
  )

  const setRotation = useCallback(
    (rotation: CanvasRotation) => {
      commitCanvas((current) => ({ ...current, rotation }))
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
    const nextLocked = !displayLockedRef.current
    displayLockedRef.current = nextLocked
    setDisplayLocked(nextLocked)
    const hostConfig = hostDisplayRef.current
    if (nextLocked && hostConfig) {
      // Re-locking returns to the host-pushed values; the preview dither mode
      // is a designer-only setting and survives (issue #70).
      commitCanvas((current) => ({
        ...hostConfig,
        previewDitherMode: current.previewDitherMode,
      }))
    }
  }, [commitCanvas])

  /**
   * Display picker choice (issue #106): a target id, or `null` for the
   * virtual display.
   *
   * Selecting a target adopts its capabilities through the *same*
   * `capabilitiesToCanvas` pipeline a `capabilities` push uses — there is no
   * second display pipeline — and locks the display config onto it.
   * "Virtual display" is exactly the lock's open state, and the selection
   * survives it so re-locking returns to the selected target.
   */
  const selectDisplayTarget = useCallback(
    (targetId: string | null) => {
      if (targetId === null) {
        displayLockedRef.current = false
        setDisplayLocked(false)
        return
      }
      const target = findHostTarget(hostTargets, targetId)
      if (!target) {
        // An id the current list no longer offers (a stale entry, a list the
        // host replaced mid-interaction): nothing to adopt, so change nothing.
        return
      }
      const next = capabilitiesToCanvas(target.capabilities, canvasRef.current)
      commitCanvas(next)
      hostDisplayRef.current = next
      setHostDisplay(next)
      displayLockedRef.current = true
      setDisplayLocked(true)
      setSelectedTarget({ id: target.id, label: target.label })
    },
    [commitCanvas, hostTargets],
  )

  // The target the design is actually pinned to — what the host is told, and
  // what `onAction` carries. An unlocked display config *is* the virtual
  // display, whatever selection the picker remembers for re-locking.
  const activeTargetId = displayLocked ? (selectedTarget?.id ?? null) : null
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
    onTargetSelected?.(activeTargetId)
  }, [activeTargetId, onTargetSelected])

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
    // Seed the mock context the showcase templates rely on, so the demo renders
    // its state/attribute/variable examples without manual Simulator setup.
    // Invalidate the host-push cache (issue #110 follow-up): this is a local
    // mock mutation, same as the Simulator setters above.
    lastHostStatesRef.current = null
    const simulator = cloneShowcaseSimulator()
    setMockStates(simulator.states)
    setMockAttributes(simulator.attributes)
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

  return {
    sessionName,
    setSessionName,
    service,
    setService: commitService,
    elements,
    setElements: setElementsWithHistory,
    getElementsSnapshot,
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
    applyResolution,
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
