import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  buildSharePayload,
  buildShareUrl,
  clearShareHashFromLocation,
  encodeShareHash,
} from '../share'
import type { AppBootstrap } from './bootstrap/appBootstrap'
import { DesignerCanvas } from './components/DesignerCanvas'
import { ElementToolbar } from './components/ElementToolbar'
import { PropertyPanel } from './components/PropertyPanel'
import { Sidebar } from './components/Sidebar'
import { StatusBanner } from './components/StatusBanner'
import { ThemeToggle } from './components/ThemeToggle'
import { YamlPanel } from './components/YamlPanel'
import { remapSelectedIndex } from './editor/yamlElementsSync'
import { collectKnownFontKeys } from './lib/known-font-keys'
import { copyTextToClipboard } from './lib/export-download'
import { requestLoadDemoConfirm, shouldConfirmLoadDemo } from './lib/load-demo'
import { toolbarGroupRow, toolbarGroupsRow } from './lib/export-action-feedback'
import { getMissingAssetMessages } from './lib/missing-asset-messages'
import { summarizeStatusMessages, type StatusMessage } from './lib/status-messages'
import {
  DISPLAY_PREVIEW_YAML_BLOCKED_REASON,
  useDisplayPreview,
} from './hooks/useDisplayPreview'
import { useExportActionFeedback } from './hooks/useExportActionFeedback'
import { useProjectState } from './hooks/useProjectState'
import { useElementSize } from './hooks/useElementSize'
import { useThemePreference } from './hooks/useThemePreference'
import { useYamlBlockedVisibility } from './hooks/useYamlBlockedVisibility'
import { useYamlSelectionCoupling } from './hooks/useYamlSelectionCoupling'
import { ExportIconButton } from './components/ExportIconButton'
import { HostActionButtons } from './components/HostActionButtons'
import { TextButton } from './components/TextButton'
import { shell } from './styles/shell'
import { hostSuppliedTheme, type DesignerHost } from '../embed/host'
import type { DesignerStatus } from '../embed/types'
import { serializeYamlPayload, type DrawElement } from '../core'
import type { AddElementResult } from './hooks/useProjectState'
import {
  APP_GITHUB_REPO_URL,
  APP_GIT_BRANCH,
  APP_GIT_MERGE_REVISION,
  APP_GIT_PR_NUMBER,
  APP_GIT_REVISION,
  APP_HEADER_LEGAL_HTML,
  APP_PRIVACY_HEADLINE,
  APP_PRIVACY_NOTE,
  APP_TITLE,
  formatGitBranchLabel,
  formatGitRevisionLabel,
  formatRevisionTooltip,
  githubBranchUrl,
  githubCommitUrl,
} from '../core'
import { logoUrl } from '../assets/bundled-urls'
import { toolIconPath } from './lib/mdi-tool-icons'

/**
 * Debounce window for `onStatusChange` notifications (issue #133): long
 * enough that a burst of keystrokes (each committed on the YAML editor's own
 * 80ms sync debounce) or a canvas drag's per-frame updates coalesce into one
 * call, short enough that a host's "edited N seconds ago" indicator still
 * feels immediate.
 */
const STATUS_CHANGE_DEBOUNCE_MS = 300

/**
 * `yamlErrorSummary` documents itself as one line (issue #133 MINOR 4), but a
 * raw YAML parse error's message can carry a multi-line caret diagram (e.g.
 * `"Implicit keys need to be on a single line at line 1, column 3:\n\n- type
 * text\n  ^\n"`) — truncate to the first line so the doc promise holds.
 */
function firstLineOf(text: string): string {
  const newlineIndex = text.indexOf('\n')
  return newlineIndex === -1 ? text : text.slice(0, newlineIndex)
}

interface AppProps {
  bootstrap: AppBootstrap
  /**
   * The host adapter this designer runs under (issue #72, ADR-017): theme
   * ownership, persistence, save channel and chrome policy. Standalone SPA,
   * embedded host page and (M4) the HA panel are adapters — the shell has no
   * mode of its own.
   */
  host: DesignerHost
}

export function App({ bootstrap, host }: AppProps) {
  const columnRef = useRef<HTMLDivElement>(null)
  const canvasAllocationRef = useRef<HTMLDivElement>(null)
  const canvasAllocationSize = useElementSize(canvasAllocationRef)
  // A host-supplied theme is fixed and scoped to the mount; otherwise the
  // designer owns the preference and applies it to the document.
  const hostTheme = hostSuppliedTheme(host)
  const themePreference = useThemePreference({ applyToDocument: hostTheme == null })
  const { mode, cycleMode } = themePreference
  const resolvedTheme = hostTheme ?? themePreference.resolvedTheme
  const { couplingEnabled } = useYamlSelectionCoupling()
  const [entityScrollRequest, setEntityScrollRequest] = useState<{
    entityId: string
    token: string
  } | null>(null)
  // Canvas click on the already-selected element: neither the selection nor
  // the document changes, so this fresh-token request is the only signal that
  // re-scrolls the YAML pane to the element (maintainer expectation: a canvas
  // element click always brings its YAML into view while coupling is on).
  const [elementScrollRequest, setElementScrollRequest] = useState<{
    elementIndex: number
    token: string
  } | null>(null)
  const [yamlStatusMessages, setYamlStatusMessages] = useState<StatusMessage[]>([])
  const [canvasDragging, setCanvasDragging] = useState(false)
  const [propertyEditing, setPropertyEditing] = useState(false)
  const [yamlBlocked, setYamlBlocked] = useState(false)
  const yamlBlockedVisible = useYamlBlockedVisibility(yamlBlocked)
  const [elementAddNotice, setElementAddNotice] = useState<StatusMessage | null>(null)
  const { flashSuccess, flashError, getFeedback, getFeedbackMessage } = useExportActionFeedback()
  // The two handles on YamlPanel's debounced edit (issue #104), published by
  // the panel and called from outside it:
  // - flush: `getPayload()` forces the same commit a blur or the 80ms timer
  //   would, so a host read never lags text the user already typed;
  // - discard: a host payload push overrules a draft typed before it, so the
  //   push applier drops that draft instead of letting a later flush commit it
  //   back over the pushed payload.
  const yamlFlushPendingRef = useRef<(() => void) | null>(null)
  const yamlDiscardPendingRef = useRef<(() => void) | null>(null)
  const {
    sessionName,
    service,
    elements,
    getElementsSnapshot,
    getEditStatus,
    previewElements,
    selectedIndices,
    selectedIndex,
    selectionSource,
    selectedElements,
    selectElement,
    applyYamlSelection,
    canvas,
    renderContext,
    setColorMode,
    setCanvasSize,
    setRotation,
    displayLock,
    toggleDisplayLock,
    hostTargets,
    selectedTargetId,
    selectedTargetLabel,
    selectDisplayTarget,
    activeTargetId,
    hostActions,
    setElements,
    mockContext,
    previewMockContext,
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
    deleteSelectedElements,
    addElement,
    clearElements,
    loadDemo,
    nudgeSelectedElements,
    selectAllInRect,
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
    togglePreviewDither,
    undo,
    redo,
    canUndo,
    canRedo,
    beginEditCoalesce,
    endEditCoalesce,
  } = useProjectState(bootstrap, host, { yamlDiscardPendingRef })

  const elementsRef = useRef(elements)

  useEffect(() => {
    elementsRef.current = elements
  }, [elements])

  // The one payload read the designer hands outward (issue #104, #108): the
  // pending YAML-editor debounce is flushed first, so a read never lags text
  // the user already typed, and both host channels — `getPayload()` and an
  // action click — report the very same string from the very same serializer.
  const readCurrentPayload = useCallback(() => {
    yamlFlushPendingRef.current?.()
    return serializeYamlPayload(getElementsSnapshot())
  }, [getElementsSnapshot])

  // useLayoutEffect, not useEffect (issue #115/#116 commit-window fix): this
  // is the read-side mirror of `registerPushTarget` (useProjectState), which
  // is committed synchronously at layout time (PR #117). A passive effect
  // here would flush after that — a real window where a host push already
  // applied live (pushTarget registered) while `getPayload()` still fell back
  // to the stale bootstrap (payloadSource not yet registered). Registering at
  // layout time is safe even before #117 lands: this effect only *installs* a
  // pure read callback, touches no DOM and schedules no state update, so
  // running it earlier cannot misorder anything — it only closes the window.
  useLayoutEffect(() => {
    if (!host.registerPayloadSource) {
      return
    }
    return host.registerPayloadSource(readCurrentPayload)
  }, [host, readCurrentPayload])

  // The designer's own PNG-export read channel (issue #109 review,
  // maintainer-ruled demo fix): DesignerCanvas publishes its current
  // rasterizer into this parent-owned ref (fonts/assets live there, not
  // here), and this registers that live closure with the host the same way
  // `readCurrentPayload` above registers the payload read — same
  // commit-time (`useLayoutEffect`) reasoning applies.
  const pngBlobSourceRef = useRef<(() => Promise<Blob>) | null>(null)
  const getCurrentDesignPngBlob = useCallback((): Promise<Blob> => {
    const source = pngBlobSourceRef.current
    if (!source) {
      return Promise.reject(new Error('The designer canvas is not ready yet'))
    }
    return source()
  }, [])
  useLayoutEffect(() => {
    if (!host.registerRenderSource) {
      return
    }
    return host.registerRenderSource(getCurrentDesignPngBlob)
  }, [host, getCurrentDesignPngBlob])

  // The designer's derived status snapshot (issue #133, ADR-018's
  // observability clause): "is the YAML good, what did the user just do, how
  // much has changed" — never designer internals. Combines YAML validity
  // (`yamlBlocked`/`yamlStatusMessages`, lifted from `YamlPanel`) with the
  // edit-tracking half `useProjectState` maintains (`getEditStatus`) and the
  // current selection. Frozen: a later status is always a new object, never a
  // mutation of one a host already holds.
  //
  // Deliberately does NOT flush a pending debounced YAML edit — see
  // `getDesignerStatus` below for the flushing wrapper and why the two must
  // stay separate (issue #133 review, MAJOR 3).
  const buildDesignerStatus = useCallback((): DesignerStatus => {
    const { lastEditAt, payloadRevision } = getEditStatus()
    const base = {
      yamlValid: !yamlBlocked,
      lastEditAt,
      payloadRevision,
      selectedElementCount: selectedIndices.length,
    }
    if (!yamlBlocked) {
      return Object.freeze(base)
    }
    const summary = summarizeStatusMessages(yamlStatusMessages) ?? 'YAML document is invalid'
    return Object.freeze({ ...base, yamlErrorSummary: firstLineOf(summary) })
  }, [getEditStatus, selectedIndices.length, yamlBlocked, yamlStatusMessages])

  // Host-facing read (issue #133 review, MAJOR 3): flushes a pending
  // debounced YAML edit first, exactly like `readCurrentPayload` does for
  // `getPayload()` — two handle reads must never disagree about whether
  // there is unsaved, uncommitted text. This is what `registerStatusSource`
  // registers and what a settled `onStatusChange` debounce delivers below.
  //
  // The internal notify effect's own per-render bookkeeping intentionally
  // calls the non-flushing `buildDesignerStatus` instead: it runs on every
  // render that could plausibly matter (including a mid-keystroke one, since
  // `yamlBlocked`/`yamlStatusMessages` update on every keystroke, well before
  // the YAML editor's own 80ms elements-sync debounce fires) — flushing there
  // would force-commit every keystroke immediately, defeating that debounce.
  const getDesignerStatus = useCallback((): DesignerStatus => {
    yamlFlushPendingRef.current?.()
    return buildDesignerStatus()
  }, [buildDesignerStatus])

  // Read channel (issue #133): the same commit-time (`useLayoutEffect`)
  // registration as `readCurrentPayload`/`getCurrentDesignPngBlob` above —
  // `MountHandle.getStatus()` must never answer from a stale registration.
  useLayoutEffect(() => {
    if (!host.registerStatusSource) {
      return
    }
    return host.registerStatusSource(getDesignerStatus)
  }, [host, getDesignerStatus])

  // Latest-`getDesignerStatus` mirror (issue #133 review, BLOCKER 2): the
  // debounce timer below is scheduled during one render but fires as an
  // unrelated macrotask, by which time several more renders — and possibly
  // several more transitions, including one that reverts the very one that
  // scheduled it — may have happened. Reading through this ref instead of the
  // closed-over function from the scheduling render is what keeps the
  // delivered snapshot live rather than stale. A layout effect with no
  // dependency array updates it after every commit, well before any 300ms
  // timer could possibly fire.
  const getDesignerStatusRef = useRef(getDesignerStatus)
  useLayoutEffect(() => {
    getDesignerStatusRef.current = getDesignerStatus
  })

  // Change notification (issue #133): fires only on a *transition* — a YAML
  // validity flip or a payload-revision change — never for a selection change
  // alone, and debounced so a burst of keystrokes or drag updates yields one
  // call, not one per commit. A passive effect, not a layout one: this
  // schedules a notification rather than registering a read/push channel a
  // host could race the commit window on.
  const lastNotifiedStatusRef = useRef<{ yamlValid: boolean; payloadRevision: number } | null>(
    null,
  )
  const statusChangeTimerRef = useRef<number | null>(null)
  const clearStatusChangeTimer = useCallback(() => {
    if (statusChangeTimerRef.current != null) {
      window.clearTimeout(statusChangeTimerRef.current)
      statusChangeTimerRef.current = null
    }
  }, [])
  useEffect(() => {
    if (!host.onStatusChange) {
      return
    }
    const status = buildDesignerStatus()
    const transitionKey = { yamlValid: status.yamlValid, payloadRevision: status.payloadRevision }
    const last = lastNotifiedStatusRef.current
    if (last == null) {
      // Baseline for this mount: getStatus() already answers this value
      // synchronously, and onStatusChange documents itself as firing on a
      // transition, not on first observation.
      lastNotifiedStatusRef.current = transitionKey
      return
    }
    if (
      last.yamlValid === transitionKey.yamlValid &&
      last.payloadRevision === transitionKey.payloadRevision
    ) {
      // Either nothing changed since the last delivered/baseline status, or a
      // flip-flop inside the debounce window landed back on it (issue #133
      // review, BLOCKER 2) — cancel whatever is still pending rather than let
      // it later deliver a now-stale snapshot `getStatus()` would no longer
      // agree with. This is also what keeps the equality path from leaking a
      // timer: the previous version returned here without touching one.
      clearStatusChangeTimer()
      return
    }
    clearStatusChangeTimer()
    statusChangeTimerRef.current = window.setTimeout(() => {
      statusChangeTimerRef.current = null
      // Read live through the ref, not the scheduling render's closed-over
      // function (issue #133 review, BLOCKER 2) — flushes on read (MAJOR 3),
      // so a host's `onStatusChange` sees exactly what `getStatus()` would
      // answer if called right now, never what was true 300ms ago.
      const delivered = getDesignerStatusRef.current()
      lastNotifiedStatusRef.current = {
        yamlValid: delivered.yamlValid,
        payloadRevision: delivered.payloadRevision,
      }
      host.onStatusChange?.(delivered)
    }, STATUS_CHANGE_DEBOUNCE_MS)
    // `elements` is a deliberate extra dependency (issue #133 review,
    // BLOCKER 1): `buildDesignerStatus` reads `payloadRevision`/`lastEditAt`
    // through refs (`getEditStatus`), which change on every committed edit
    // without necessarily changing any of `buildDesignerStatus`'s own listed
    // dependencies (`yamlBlocked`/`selectedIndices`/`yamlStatusMessages`) at
    // the moment the edit actually commits — a single keystroke's validity
    // flag updates immediately, well before its 80ms debounce commits the
    // edit itself, so by commit time nothing else has changed to re-run this
    // effect. `elements` is exactly that missing signal: every commit gives
    // it a new array reference.
  }, [host, buildDesignerStatus, elements, clearStatusChangeTimer])

  // Unmount-only cleanup for the debounce timer above — `clearStatusChangeTimer`
  // has a stable identity, so this effect runs once (mount) and cleans up
  // once (unmount); the notify effect above cancels/reschedules the same
  // timer inline on every relevant re-run, so this is not that cleanup.
  useEffect(() => clearStatusChangeTimer, [clearStatusChangeTimer])

  /**
   * The surface a host render must be produced at: the oriented logical canvas
   * the payload's coordinates live in (issue #139). Memoized because the hook
   * takes it as an effect dependency — a fresh object per render would
   * re-request the preview forever.
   */
  const previewDisplayGeometry = useMemo(
    () => ({ width: canvas.width, height: canvas.height, rotation: canvas.rotation }),
    [canvas.height, canvas.rotation, canvas.width],
  )
  // Host-rendered display preview (issue #109, ADR-018 preview seam). It reads
  // the same payload every other host channel does, so the image the user sees
  // is a render of exactly what an action would send.
  const displayPreview = useDisplayPreview({
    renderPreview: host.renderPreview,
    readPayload: readCurrentPayload,
    ditherMode: canvas.previewDitherMode,
    display: previewDisplayGeometry,
    targetId: activeTargetId ?? undefined,
    // Entering a preview of a broken document is refused rather than explained
    // by an error overlay over the host render (maintainer ruling 2026-08-17).
    blockedReason: yamlBlocked ? DISPLAY_PREVIEW_YAML_BLOCKED_REASON : null,
    payloadRevision: elements,
  })
  /**
   * Nothing may edit the design while the host's own render is on screen
   * (maintainer ruling): a server render cannot follow an edit, so every
   * mutating affordance is disabled exactly as it is while the YAML doc is
   * blocked (issue #35) — one disabled-mutation concept, two reasons for it.
   * The YAML-error overlays stay tied to `yamlBlocked` alone: preview mode is
   * not an error state and must not be explained as one.
   */
  const mutationBlocked = yamlBlocked || displayPreview.active

  useEffect(() => {
    if (bootstrap.importSource === 'hash') {
      clearShareHashFromLocation()
    }
  }, [bootstrap.importSource])

  const fontKeys = useMemo(() => {
    void assetRevision
    return collectKnownFontKeys(elements)
  }, [assetRevision, elements])

  const hashImportMessages = useMemo(() => {
    if (bootstrap.importSource !== 'hash') {
      return []
    }
    return getMissingAssetMessages(elements)
  }, [bootstrap.importSource, elements])

  const handleAddElement = useCallback(
    (type: DrawElement['type']): AddElementResult => {
      const result = addElement(type)
      if (!result.ok) {
        setElementAddNotice({
          severity: 'info',
          title: 'Cannot add element',
          summary: result.message,
        })
      }
      return result
    },
    [addElement],
  )

  useEffect(() => {
    if (elementAddNotice == null) {
      return
    }
    const timer = window.setTimeout(() => setElementAddNotice(null), 4000)
    return () => window.clearTimeout(timer)
  }, [elementAddNotice])

  const handleLoadDemo = useCallback(() => {
    if (shouldConfirmLoadDemo(elements.length) && !requestLoadDemoConfirm()) {
      return
    }
    loadDemo()
  }, [elements.length, loadDemo])

  // Host-registered action clicked (issue #108): the designer reports the id,
  // the current payload and the opaque id of the display the design is pinned
  // to (issue #106) — nothing else; meaning, auth and the actual call are
  // host-side (ADR-018). `targetId` is absent while no target is selected,
  // which is the same thing `onTargetSelected(null)` last reported.
  const handleHostAction = useCallback(
    (id: string) => {
      host.onAction?.(id, readCurrentPayload(), { targetId: activeTargetId ?? undefined })
    },
    [activeTargetId, host, readCurrentPayload],
  )

  const handleShare = useCallback(async () => {
    const payload = buildSharePayload({
      name: sessionName,
      canvas,
      service,
      elements,
    })
    const url = buildShareUrl(encodeShareHash(payload), {
      origin: window.location.origin,
      pathname: window.location.pathname,
    })
    const copied = await copyTextToClipboard(url)
    if (copied.ok) {
      flashSuccess('share-link')
    } else {
      flashError('share-link', copied.reason)
    }
  }, [canvas, elements, flashError, flashSuccess, service, sessionName])

  const handleYamlElementsChange = useCallback(
    (next: typeof elements) => {
      const previous = elementsRef.current
      const remapped = selectedIndices
        .map((index) => remapSelectedIndex(previous, next, index))
        .filter((index): index is number => index != null)
      setElements(next)
      if (remapped.length > 0) {
        const unchanged =
          remapped.length === selectedIndices.length &&
          remapped.every((index, offset) => index === selectedIndices[offset])
        if (!unchanged) {
          applyYamlSelection(remapped)
        }
        return
      }
      const nextIndex = remapSelectedIndex(previous, next, selectedIndex)
      if (nextIndex != null) {
        if (nextIndex !== selectedIndex) {
          selectElement(nextIndex, { source: 'yaml' })
        }
        return
      }
      if (
        selectedIndex != null &&
        next.length === previous.length &&
        selectedIndex < next.length &&
        next[selectedIndex]?.type === previous[selectedIndex]?.type
      ) {
        return
      }
      selectElement(null, { source: 'yaml' })
    },
    [applyYamlSelection, selectedIndex, selectedIndices, selectElement, setElements],
  )

  const handleDeleteSelected = useCallback(() => {
    deleteSelectedElements()
  }, [deleteSelectedElements])

  const handleNudgeSelected = useCallback(
    (dx: number, dy: number) => {
      if (selectedIndices.length === 0) {
        return
      }
      nudgeSelectedElements(dx, dy)
    },
    [nudgeSelectedElements, selectedIndices.length],
  )

  const handleBeginPropertyEdit = useCallback(() => {
    beginEditCoalesce()
    setPropertyEditing(true)
  }, [beginEditCoalesce])

  const handleEndPropertyEdit = useCallback(() => {
    endEditCoalesce()
    setPropertyEditing(false)
  }, [endEditCoalesce])

  const handlePropertyChange = useCallback(
    (key: string, value: unknown) => {
      if (selectedIndices.length === 1) {
        updateElementProperty(selectedIndices[0]!, key, value)
        return
      }
      if (selectedIndices.length > 1) {
        updateSelectedProperty(key, value)
      }
    },
    [selectedIndices, updateElementProperty, updateSelectedProperty],
  )

  const handleUploadFont = useCallback(
    (file: File) => uploadAsset(file.name, 'font', file),
    [uploadAsset],
  )

  const handleUploadImageForUrl = useCallback(
    (urlKey: string, file: File) => uploadAsset(urlKey, 'image', file),
    [uploadAsset],
  )

  const handleReorderElement = useCallback(
    (fromIndex: number, toIndex: number, movingIndices?: readonly number[]) => {
      const indices =
        movingIndices ??
        (selectedIndices.includes(fromIndex) && selectedIndices.length > 1
          ? selectedIndices
          : [fromIndex])
      if (indices.length > 1) {
        reorderSelection(indices, toIndex)
        return
      }
      reorderElement(fromIndex, toIndex)
    },
    [reorderElement, reorderSelection, selectedIndices],
  )

  const handleSimulatorEntityFocus = useCallback(
    (entityId: string) => {
      if (!couplingEnabled) {
        return
      }
      setEntityScrollRequest({ entityId, token: `sim:${entityId}:${Date.now()}` })
    },
    [couplingEnabled],
  )

  const handleSelectedElementPointerDown = useCallback(
    (elementIndex: number) => {
      if (!couplingEnabled) {
        return
      }
      setElementScrollRequest({ elementIndex, token: `canvas:${elementIndex}:${Date.now()}` })
    },
    [couplingEnabled],
  )

  // Drop the request as soon as the selection moves on (render-time state
  // adjustment): a stale request must never shadow a later navigation's
  // scroll command, nor re-fire when the selection later returns to its
  // element via a YAML cursor move.
  if (elementScrollRequest && elementScrollRequest.elementIndex !== selectedIndex) {
    setElementScrollRequest(null)
  }

  return (
    <div className={host.fill === 'viewport' ? shell.app : shell.appEmbedded}>
      <header className={`${shell.header} flex items-center gap-4`}>
        <div className="flex shrink-0 items-center gap-2.5">
          <a
            href={APP_GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            aria-label="Open ODL/OEPL Drawcustom Designer on GitHub"
          >
            <img
              src={logoUrl}
              alt=""
              className="h-7 w-auto"
              width={792}
              height={603}
            />
          </a>
          <h1 className="truncate text-lg font-semibold tracking-tight">{APP_TITLE}</h1>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5">
          <div
            data-testid="header-meta-row"
            className={`flex w-full min-w-0 items-center justify-center gap-1 text-xs ${shell.muted}`}
          >
            <span className="truncate" title={APP_PRIVACY_NOTE}>
              {APP_PRIVACY_HEADLINE}
            </span>
            <span aria-hidden="true" className="shrink-0">
              {' · '}
            </span>
            <a
              href={APP_GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 underline-offset-2 hover:underline"
            >
              GitHub
            </a>
            <span aria-hidden="true" className="shrink-0">
              {' · '}
            </span>
            <a
              href={githubBranchUrl(APP_GIT_BRANCH)}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 font-mono underline-offset-2 hover:underline"
              title={
                APP_GIT_PR_NUMBER > 0
                  ? `PR #${APP_GIT_PR_NUMBER} · Branch: ${APP_GIT_BRANCH}`
                  : `Branch: ${APP_GIT_BRANCH}`
              }
            >
              {formatGitBranchLabel(APP_GIT_BRANCH)}
            </a>
            <span aria-hidden="true" className="shrink-0">
              {' · '}
            </span>
            <a
              href={githubCommitUrl(APP_GIT_REVISION)}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 font-mono underline-offset-2 hover:underline"
              title={formatRevisionTooltip(APP_GIT_REVISION, APP_GIT_MERGE_REVISION)}
            >
              {formatGitRevisionLabel(APP_GIT_REVISION)}
            </a>
          </div>
          {APP_HEADER_LEGAL_HTML ? (
            <div
              data-testid="header-legal-subline"
              className={`w-full text-center text-xs ${shell.muted} [&_a]:underline-offset-2 [&_a]:hover:underline`}
              // Build-time HTML from VITE_HEADER_LEGAL_HTML (trusted deploy config only).
              dangerouslySetInnerHTML={{ __html: APP_HEADER_LEGAL_HTML }}
            />
          ) : null}
        </div>
        <div className={`${toolbarGroupsRow} shrink-0`}>
          <div className={toolbarGroupRow} role="group" aria-label="Session">
            <TextButton variant="destructive" onClick={clearElements} disabled={mutationBlocked}>
              Clear all
            </TextButton>
          </div>
          <div className={toolbarGroupRow} role="group" aria-label="Demo">
            <TextButton onClick={handleLoadDemo} disabled={mutationBlocked}>
              Load Demo
            </TextButton>
          </div>
          {/* Save and send are host actions (ADR-018, issue #121): the designer
              has no save channel of its own, so it renders no Save button —
              a host registers one and owns what it means. */}
          {hostActions.length > 0 ? (
            <div className={toolbarGroupRow} role="group" aria-label="Actions">
              <HostActionButtons
                actions={hostActions}
                designerDisabledReason={
                  yamlBlocked ? 'Fix the YAML errors before running this action' : null
                }
                onAction={handleHostAction}
              />
            </div>
          ) : null}
          {/* Share links and the theme toggle are host policy: an embedding
              parent owns the payload and the page theme (#20, ADR-017). */}
          {host.shareLink ? (
            <div className={toolbarGroupRow} role="group" aria-label="Copy share link">
              <ExportIconButton
                actionId="share-link"
                feedback={getFeedback('share-link')}
                feedbackMessage={getFeedbackMessage('share-link')}
                iconPath={toolIconPath('share')}
                tooltip="Copy share link"
                label="Copy share link"
                onClick={() => void handleShare()}
              />
            </div>
          ) : null}
          {hostTheme == null ? (
            <div className={toolbarGroupRow} role="group" aria-label="Appearance">
              <ThemeToggle mode={mode} resolvedTheme={resolvedTheme} onCycle={cycleMode} />
            </div>
          ) : null}
        </div>
      </header>

      {elementAddNotice != null ? (
        <StatusBanner message={elementAddNotice} />
      ) : null}

      {hashImportMessages.map((message, index) => (
        <StatusBanner key={`hash-import-${message.title}-${index}`} message={message} />
      ))}

      <div className="flex min-h-0 flex-1">
        <Sidebar
          elements={elements}
          previewElements={previewElements}
          selectedIndices={selectedIndices}
          canvas={canvas}
          mockContext={mockContext}
          hostStateCatalog={hostStateCatalog}
          assetRevision={assetRevision}
          onSelectElement={selectElement}
          onCanvasSizeChange={setCanvasSize}
          onColorModeChange={setColorMode}
          onRotationChange={setRotation}
          displayLock={displayLock}
          onToggleDisplayLock={toggleDisplayLock}
          targets={hostTargets}
          selectedTargetId={selectedTargetId}
          selectedTargetLabel={selectedTargetLabel}
          onSelectDisplayTarget={selectDisplayTarget}
          onSetMockState={setMockState}
          onAddMockEntity={addMockEntity}
          onRemoveMockEntity={removeMockEntity}
          onSetMockAttribute={setMockAttribute}
          onRenameMockAttribute={renameMockAttribute}
          onRemoveMockAttribute={removeMockAttribute}
          variables={variables}
          onSetVariable={setVariable}
          onAddVariable={addVariable}
          onRenameVariable={renameVariable}
          onRemoveVariable={removeVariable}
          onUploadAsset={uploadAsset}
          onClearAsset={clearAsset}
          onReorderElement={handleReorderElement}
          onFocusSimulatorEntity={handleSimulatorEntityFocus}
          yamlBlocked={mutationBlocked}
        />

        <div ref={columnRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ElementToolbar
            elements={elements}
            onAddElement={handleAddElement}
            blocked={mutationBlocked}
          />
          <div
            ref={canvasAllocationRef}
            data-canvas-allocation
            className="flex min-h-0 min-w-0 flex-1 flex-col"
          >
            <DesignerCanvas
              elements={previewElements}
              editElements={elements}
              renderContext={renderContext}
              selectedIndices={selectedIndices}
              assetRevision={assetRevision}
              sessionName={sessionName}
              allocationSize={canvasAllocationSize}
              snapGrid={snapGrid}
              showHiddenHints={showHiddenHints}
              onToggleShowHiddenHints={toggleShowHiddenHints}
              extraStatusMessages={yamlStatusMessages}
              onSelectElement={selectElement}
              onSelectAllInRect={selectAllInRect}
              onAlignSelection={alignSelection}
              onUpdateElement={updateElement}
              onUpdateElementsBatch={updateElementsBatch}
              onBringSelectionToFront={bringSelectionToFront}
              onSendSelectionToBack={sendSelectionToBack}
              onMoveSelectionLayer={moveSelectionLayer}
              elementCount={elements.length}
              onDeleteSelected={handleDeleteSelected}
              onNudgeSelected={handleNudgeSelected}
              onToggleSnap={toggleSnapGrid}
              previewDitherMode={canvas.previewDitherMode}
              onTogglePreviewDither={togglePreviewDither}
              onDragActiveChange={setCanvasDragging}
              onSelectedElementPointerDown={handleSelectedElementPointerDown}
              onBeginEditCoalesce={beginEditCoalesce}
              onEndEditCoalesce={endEditCoalesce}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={undo}
              onRedo={redo}
              blocked={mutationBlocked}
              blockedVisible={yamlBlockedVisible}
              displayPreview={displayPreview}
              pngBlobSourceRef={pngBlobSourceRef}
            />
          </div>
          <YamlPanel
            colorScheme={resolvedTheme}
            containerRef={columnRef}
            elements={elements}
            sessionName={sessionName}
            extraEntityIds={extraEntityIds}
            mockContext={previewMockContext}
            hostStatesFed={hostStateCatalog != null}
            onElementsChange={handleYamlElementsChange}
            onSelectElement={selectElement}
            onStatusMessagesChange={setYamlStatusMessages}
            onYamlBlockedChange={setYamlBlocked}
            selectedIndex={selectedIndex}
            selectionSource={selectionSource}
            entityScrollRequest={entityScrollRequest}
            elementScrollRequest={elementScrollRequest}
            canvasDragging={canvasDragging}
            propertyEditing={propertyEditing}
            flushPendingRef={yamlFlushPendingRef}
            discardPendingRef={yamlDiscardPendingRef}
            readOnly={displayPreview.active}
          />
        </div>

        <PropertyPanel
          elements={selectedElements}
          indices={selectedIndices}
          elementCount={elements.length}
          fontKeys={fontKeys}
          onPropertyChange={handlePropertyChange}
          onUploadFont={handleUploadFont}
          onUploadImageForUrl={handleUploadImageForUrl}
          onBeginPropertyEdit={handleBeginPropertyEdit}
          onEndPropertyEdit={handleEndPropertyEdit}
          onDelete={handleDeleteSelected}
          onBringToFront={bringSelectionToFront}
          onSendToBack={sendSelectionToBack}
          onMoveUp={() => moveSelectionLayer('up')}
          onMoveDown={() => moveSelectionLayer('down')}
          blocked={mutationBlocked}
          blockedVisible={yamlBlockedVisible}
        />
      </div>
    </div>
  )
}
