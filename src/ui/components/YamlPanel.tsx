import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  resolveCursorSelection,
  serializeYamlPayload,
  type DrawElement,
  type HaMockContext,
} from '../../core'
import {
  elementsSequenceEqual,
  isYamlDocBlocked,
  shouldApplyExternalYamlSync,
  tryParseYamlElements,
} from '../editor/yamlElementsSync'
import {
  shouldDeferYamlExternalSync,
  shouldScrollLinkedElementOnSync,
  yamlTextForExternalSync,
} from '../editor/yamlExternalSync'
import { getYamlStatusMessages } from '../lib/yaml-status-messages'
import { YamlEditor } from '../editor/YamlEditor'
import {
  createYamlScrollCommand,
  createEntityScrollCommand,
  mergeYamlScrollCommands,
  type ElementScrollRequest,
} from '../editor/yamlScrollCommand'
import {
  MIN_CANVAS_PREVIEW_HEIGHT,
  useResizablePanelHeight,
} from '../hooks/useResizablePanelHeight'
import type { SelectionSource } from '../hooks/useProjectState'
import { useYamlFontSize } from '../hooks/useYamlFontSize'
import { useYamlSelectionCoupling } from '../hooks/useYamlSelectionCoupling'
import { useYamlTemplatePreview } from '../hooks/useYamlTemplatePreview'
import type { ResolvedTheme } from '../preferences/theme'
import { YAML_PANEL_HEIGHT_STORAGE_KEY } from '../preferences/keys'
import type { StatusMessage } from '../lib/status-messages'
import { shell } from '../styles/shell'
import { YamlHeaderToolbar } from './YamlHeaderToolbar'
import {
  buildYamlDownloadFilename,
  copyTextToClipboard,
  createYamlDownloadBlob,
  triggerBlobDownload,
} from '../lib/export-download'
import { YAML_TOOLBAR_ITEM_SELECTOR } from '../lib/yaml-toolbar-layout'
import { toolbarHeaderSlotWidth } from '../lib/toolbar-header-slot'
import { useExportActionFeedback } from '../hooks/useExportActionFeedback'
import { useElementSize } from '../hooks/useElementSize'
import { useToolbarLabels } from '../hooks/useToolbarLabels'

const MIN_YAML_PANEL_HEIGHT = 120

interface YamlPanelProps {
  elements: DrawElement[]
  sessionName: string
  selectedIndex: number | null
  selectionSource: SelectionSource
  onSelectElement: (index: number | null, source?: SelectionSource) => void
  onElementsChange: (elements: DrawElement[]) => void
  colorScheme: ResolvedTheme
  containerRef: RefObject<HTMLDivElement | null>
  extraEntityIds?: readonly string[]
  entityScrollRequest?: { entityId: string; token: string } | null
  /** Canvas click on the already-selected element — re-scroll to it (fresh token per click). */
  elementScrollRequest?: ElementScrollRequest | null
  onStatusMessagesChange?: (messages: StatusMessage[]) => void
  /** True while the canvas is in an active pointer drag (move/resize). */
  canvasDragging?: boolean
  /** True while a property panel field has focus (typing). */
  propertyEditing?: boolean
  mockContext?: HaMockContext
  /**
   * True when a host owns the states (issue #107) — the inline template-preview
   * toggle then explains its values as the host's, not the State Simulator's,
   * which does not exist in that mode.
   */
  hostStatesFed?: boolean
  /**
   * Reports whether the live editor document currently fails to parse or
   * validate (issue #35) — the parent uses this to block canvas/property
   * panel interactions while true.
   */
  onYamlBlockedChange?: (blocked: boolean) => void
  /**
   * Kept pointed at the current `flushYamlElementsSync` (issue #104): lets
   * the parent force a flush of a pending debounced valid edit — e.g. before
   * `MountHandle.getPayload()` reads `elements` — the same flush that
   * normally runs on the editor's own blur or an 80ms timer.
   */
  flushPendingRef?: RefObject<(() => void) | null>
  /**
   * Kept pointed at the current `discardPendingYamlEdit` (issue #104 review):
   * an external payload push is authoritative, so the parent calls this in the
   * same synchronous path — *before* it commits the pushed elements — to
   * invalidate any debounced draft typed before the push.
   */
  discardPendingRef?: RefObject<(() => void) | null>
  /**
   * The document is shown but not editable (issue #109): the host display
   * preview is on, so the design must not move under a render that cannot
   * follow it. Read-only rather than hidden or disabled — the YAML stays
   * selectable, scrollable and copyable, which is half of why a user opens the
   * preview in the first place.
   */
  readOnly?: boolean
}

/**
 * Keep a parent-owned ref pointed at the live callback while mounted, and
 * release it on unmount without stomping a newer owner.
 *
 * useLayoutEffect, not useEffect (issue #115/#116 commit-window class):
 * `flushPendingRef`/`discardPendingRef` are read by `getPayload()` and by the
 * `applyPayload` push applier (both now commit-time, see App.tsx and
 * useProjectState.ts), so this publication must not lag behind at passive
 * timing either. No YAML draft can exist at the very first commit (the
 * editor has not mounted yet), so today this is benign — but co-timing it
 * now closes the same class of window before a future caller relies on it
 * being available any earlier than a real Save/push.
 */
function usePublishedCallback(
  ref: RefObject<(() => void) | null> | undefined,
  callback: () => void,
): void {
  useLayoutEffect(() => {
    if (!ref) {
      return
    }
    ref.current = callback
    return () => {
      if (ref.current === callback) {
        ref.current = null
      }
    }
  }, [callback, ref])
}

export function YamlPanel({
  elements,
  sessionName,
  selectedIndex,
  selectionSource,
  onSelectElement,
  onElementsChange,
  colorScheme,
  containerRef,
  extraEntityIds = [],
  entityScrollRequest = null,
  elementScrollRequest = null,
  onStatusMessagesChange,
  canvasDragging = false,
  propertyEditing = false,
  mockContext,
  hostStatesFed = false,
  onYamlBlockedChange,
  flushPendingRef,
  discardPendingRef,
  readOnly = false,
}: YamlPanelProps) {
  // Serializing the payload happens inside the external-sync effect below, its
  // only consumer — never during render (issue #124). A drag suspends that
  // effect, so re-serializing the whole payload per pointermove, for text
  // nothing would read until the gesture ends, is work that simply never runs.
  const [yamlText, setYamlText] = useState(() => serializeYamlPayload(elements))
  // Whether the *current* yamlText was pushed in while a canvas-driven scroll
  // to the linked element was intended. Decided once, alongside setYamlText,
  // in the same external-sync effect run — not re-derived later from live
  // `canvasDragging`/`selectionSource`, which can already have reverted (e.g.
  // pointerup ending the drag) by the time YamlEditor's doc-sync effect
  // actually observes the new text.
  const [scrollLinkedElementOnSync, setScrollLinkedElementOnSync] = useState(false)
  const yamlBlocked = useMemo(() => isYamlDocBlocked(yamlText), [yamlText])
  const yamlBlockedRef = useRef(yamlBlocked)
  const skipExternalSyncRef = useRef(false)
  /**
   * Set while a canvas drag suspends the external sync (issue #124), read and
   * cleared by the run that finally performs it. A ref, not state — like every
   * other flag this effect reads, a flip of it must never re-trigger the sync.
   */
  const dragSuspendedSyncRef = useRef(false)
  /** Parse of the live doc awaiting the debounced flush — set/cleared by handleYamlChange. */
  const pendingParsedRef = useRef<DrawElement[] | null>(null)
  const syncTimerRef = useRef<number | null>(null)
  const yamlSelectionRef = useRef({ anchor: 0, head: 0 })
  const yamlScrollRef = useRef(0)
  const { fontSize, increase, decrease } = useYamlFontSize()
  const { couplingEnabled, toggleCoupling } = useYamlSelectionCoupling()
  const { templatePreviewEnabled, toggleTemplatePreview } = useYamlTemplatePreview()
  const { flashSuccess, flashError, getFeedback, getFeedbackMessage } = useExportActionFeedback()
  const headerRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const headerSize = useElementSize(headerRef)
  const titleSize = useElementSize(titleRef)
  const toolbarSlotWidth = toolbarHeaderSlotWidth(headerSize.width, titleSize.width)
  const { toolbarRef: yamlToolbarRef, showLabels: showYamlLabels } = useToolbarLabels(
    YAML_TOOLBAR_ITEM_SELECTOR,
    {
      fitWidth: toolbarSlotWidth,
      measureRef,
    },
  )
  const { height: panelHeight, startResize } = useResizablePanelHeight({
    storageKey: YAML_PANEL_HEIGHT_STORAGE_KEY,
    minHeight: MIN_YAML_PANEL_HEIGHT,
    minSiblingHeight: MIN_CANVAS_PREVIEW_HEIGHT,
    containerRef,
  })

  useEffect(() => {
    yamlBlockedRef.current = yamlBlocked
    onYamlBlockedChange?.(yamlBlocked)
  }, [onYamlBlockedChange, yamlBlocked])

  useEffect(() => {
    if (shouldDeferYamlExternalSync({ propertyEditing, canvasDragging })) {
      if (canvasDragging) {
        // The gesture will end with one sync, and that sync must be
        // unconditional (issue #124). Consume the self-echo suppression here:
        // a canvas pointerdown blurs the editor, so a debounced draft's flush
        // — which arms the flag — commits in the very batch that starts the
        // drag. Left armed, it would swallow the drag-end sync and strand the
        // editor on pre-drag geometry. Whatever it was suppressing is already
        // superseded by the drag's own element commits.
        skipExternalSyncRef.current = false
        dragSuspendedSyncRef.current = true
      }
      return
    }

    // Never rewrite newer editor text (issue #35 and follow-up):
    // - while the live doc is broken, `elements` is frozen at last-valid, so
    //   re-serializing it here would revert the user's in-progress edit;
    // - while a parse is pending the 80ms debounce, the editor is *ahead* of
    //   `elements`, so the echo would clobber freshly typed text.
    // Both are read via refs — NOT effect dependencies — because their flips
    // must never re-trigger this effect: the blocked->unblocked transition
    // mid-typing previously fired the echo with a stale serialization right
    // after the doc turned valid again (typing `30` over `y: 0` became `00`).
    if (yamlBlockedRef.current || pendingParsedRef.current != null) {
      // A drag that ended while the doc is blocked/pending can't land its
      // sync here — but `dragSuspendedSyncRef` must not survive past this
      // point either, or a LATER, wholly unrelated sync (once the doc
      // unblocks) would misread it as canvas-originated and wrongly request
      // a scroll-to-linked-element for a drag that is long over.
      dragSuspendedSyncRef.current = false
      return
    }

    // A drag's single sync runs at drag END, when `canvasDragging` is already
    // false — so the drag-originated scroll decision (issue #37) reads this
    // ref instead, set while the suspension was in force.
    const canvasDrag = canvasDragging || dragSuspendedSyncRef.current
    dragSuspendedSyncRef.current = false

    if (shouldApplyExternalYamlSync(skipExternalSyncRef.current)) {
      setYamlText(yamlTextForExternalSync(serializeYamlPayload(elements)))
      // canvasDrag is the signal that *this* sync originates from a canvas
      // interaction — capture it now, since the gesture is already over by the
      // time YamlEditor's doc-sync effect reacts to the new text a render or
      // two later.
      setScrollLinkedElementOnSync(
        shouldScrollLinkedElementOnSync({ couplingEnabled, canvasDragging: canvasDrag, selectionSource }),
      )
    }
    skipExternalSyncRef.current = false
    // selectionSource is read but deliberately not a dep: it only matters at
    // the moment of an actual text push (already triggered by the deps
    // below), not as its own trigger for extra runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasDragging, couplingEnabled, elements, propertyEditing])

  const elementsRef = useRef(elements)

  useEffect(() => {
    elementsRef.current = elements
  }, [elements])

  const scrollCommand = useMemo(
    () =>
      mergeYamlScrollCommands(
        createYamlScrollCommand(couplingEnabled, selectedIndex, selectionSource, elementScrollRequest),
        createEntityScrollCommand(couplingEnabled, entityScrollRequest),
      ),
    [couplingEnabled, elementScrollRequest, entityScrollRequest, selectedIndex, selectionSource],
  )

  const yamlStatusMessages = useMemo(() => getYamlStatusMessages(yamlText), [yamlText])

  useEffect(() => {
    onStatusMessagesChange?.(yamlStatusMessages)
  }, [onStatusMessagesChange, yamlStatusMessages])

  const handleCopyYaml = useCallback(async () => {
    const copied = await copyTextToClipboard(yamlText)
    if (copied.ok) {
      flashSuccess('copy-yaml')
    } else {
      flashError('copy-yaml', copied.reason)
    }
  }, [flashError, flashSuccess, yamlText])

  const handleDownloadYaml = useCallback(() => {
    triggerBlobDownload(createYamlDownloadBlob(yamlText), buildYamlDownloadFilename(sessionName))
    flashSuccess('download-yaml')
  }, [flashSuccess, sessionName, yamlText])

  const toolbarProps = {
    showLabels: showYamlLabels,
    getFeedback,
    getFeedbackMessage,
    onCopyYaml: () => void handleCopyYaml(),
    onDownloadYaml: handleDownloadYaml,
    templatePreviewEnabled,
    hostStatesFed,
    onToggleTemplatePreview: toggleTemplatePreview,
    couplingEnabled,
    onToggleCoupling: toggleCoupling,
    fontSize,
    onDecreaseFontSize: decrease,
    onIncreaseFontSize: increase,
  }

  const flushYamlElementsSync = useCallback(() => {
    if (syncTimerRef.current != null) {
      window.clearTimeout(syncTimerRef.current)
      syncTimerRef.current = null
    }
    const pending = pendingParsedRef.current
    pendingParsedRef.current = null
    if (pending == null || elementsSequenceEqual(elementsRef.current, pending)) {
      return
    }
    skipExternalSyncRef.current = true
    onElementsChange(pending)
  }, [onElementsChange])

  /**
   * Drop the debounced draft instead of committing it (issue #104 review): an
   * external payload push overrules whatever the user had typed before it, so
   * the parked parse must not survive to be flushed afterwards — by the 80ms
   * timer, by a blur, or by `MountHandle.getPayload()` forcing a flush.
   *
   * Cancels the timer *and* clears the parse, so a timer that somehow still
   * fires finds nothing to commit. Also clears the self-echo suppression: the
   * elements the sync effect is about to see come from the host, not from our
   * own flush, so the external sync must write them into the editor.
   *
   * Only refs are touched — no state, no render — so the caller can run this
   * synchronously right before committing the pushed elements.
   */
  const discardPendingYamlEdit = useCallback(() => {
    if (syncTimerRef.current != null) {
      window.clearTimeout(syncTimerRef.current)
      syncTimerRef.current = null
    }
    pendingParsedRef.current = null
    skipExternalSyncRef.current = false
  }, [])

  useEffect(
    () => () => {
      if (syncTimerRef.current != null) {
        window.clearTimeout(syncTimerRef.current)
      }
    },
    [],
  )

  // Publish the flush to the parent (issue #104): MountHandle.getPayload()
  // calls through it before reading `elements`, so it always forces the same
  // flush a real blur/timeout would.
  usePublishedCallback(flushPendingRef, flushYamlElementsSync)
  usePublishedCallback(discardPendingRef, discardPendingYamlEdit)

  const handleYamlChange = useCallback(
    (text: string) => {
      setYamlText(text)

      const parsed = tryParseYamlElements(text)
      if (parsed === null) {
        pendingParsedRef.current = null
        if (syncTimerRef.current != null) {
          window.clearTimeout(syncTimerRef.current)
          syncTimerRef.current = null
        }
        return
      }

      if (elementsSequenceEqual(elementsRef.current, parsed)) {
        pendingParsedRef.current = null
        if (syncTimerRef.current != null) {
          window.clearTimeout(syncTimerRef.current)
          syncTimerRef.current = null
        }
        return
      }

      pendingParsedRef.current = parsed
      if (syncTimerRef.current != null) {
        window.clearTimeout(syncTimerRef.current)
      }
      syncTimerRef.current = window.setTimeout(() => {
        syncTimerRef.current = null
        flushYamlElementsSync()
      }, 80)
    },
    [flushYamlElementsSync],
  )

  const handleCursorPosition = useCallback(
    (position: number, doc: string) => {
      if (!couplingEnabled) {
        return
      }

      const result = resolveCursorSelection(
        doc,
        position,
        elementsRef.current,
        pendingParsedRef.current,
      )

      if (result.shouldFlushPending) {
        flushYamlElementsSync()
      }

      if (result.index == null || result.index === selectedIndex) {
        return
      }

      onSelectElement(result.index, 'yaml')
    },
    [couplingEnabled, flushYamlElementsSync, onSelectElement, selectedIndex],
  )

  return (
    <section
      className={`flex shrink-0 flex-col border-t ${shell.panelBorder} ${shell.panel}`}
      style={{ height: panelHeight }}
    >
      <div
        role="separator"
        aria-label="Resize YAML panel"
        aria-orientation="horizontal"
        className="group flex h-1.5 shrink-0 cursor-ns-resize items-center justify-center bg-[var(--shell-border)] hover:bg-[var(--shell-hover)]"
        onMouseDown={startResize}
      >
        <div className="h-0.5 w-12 rounded-full bg-[var(--shell-muted)] group-hover:bg-[var(--shell-text)]" />
      </div>
      <div
        ref={headerRef}
        className={`relative flex shrink-0 items-center justify-between gap-2 border-b ${shell.panelBorder} px-4 py-2`}
      >
        <h2 ref={titleRef} className={`${shell.heading} shrink-0`}>
          YAML
        </h2>
        <div ref={yamlToolbarRef} className="shrink-0">
          <YamlHeaderToolbar {...toolbarProps} />
        </div>
        <div
          aria-hidden
          className="pointer-events-none invisible fixed top-0 -left-[10000px] h-0 overflow-hidden"
        >
          <div ref={measureRef} className="w-max whitespace-nowrap">
            <YamlHeaderToolbar {...toolbarProps} measureOnly />
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <YamlEditor
          className="h-full min-h-0 [&_.cm-editor]:h-full [&_.cm-scroller]:min-h-0"
          colorScheme={colorScheme}
          extraEntityIds={extraEntityIds}
          fontSizePx={fontSize}
          height="100%"
          mockContext={mockContext}
          templatePreviewEnabled={templatePreviewEnabled}
          scrollCommand={scrollCommand}
          preserveLinkedElementIndex={couplingEnabled ? selectedIndex : null}
          scrollLinkedElementOnSync={scrollLinkedElementOnSync}
          yamlSelectionRef={yamlSelectionRef}
          yamlScrollRef={yamlScrollRef}
          onCursorPositionChange={handleCursorPosition}
          onEditorBlur={flushYamlElementsSync}
          value={yamlText}
          onChange={handleYamlChange}
          readOnly={readOnly}
        />
      </div>
    </section>
  )
}
