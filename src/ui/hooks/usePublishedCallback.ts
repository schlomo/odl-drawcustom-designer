import { useLayoutEffect, type RefObject } from 'react'

/**
 * Keep a parent-owned ref pointed at the live callback while mounted, and
 * release it on unmount without stomping a newer owner.
 *
 * `useLayoutEffect`, not `useEffect` (issue #115/#116 commit-window class):
 * every current caller reads this ref from a commit-time push applier or a
 * `MountHandle` method (`getPayload()`, `getPngBlob()`), so publication must
 * not lag behind at passive-effect timing either.
 *
 * Shared by `YamlPanel` (flush/discard the pending YAML debounce) and
 * `DesignerCanvas` (the designer's own PNG-export source, issue #109 review)
 * — same parent-owns-a-ref, child-publishes-the-live-closure shape either
 * way.
 */
export function usePublishedCallback<T extends (...args: never[]) => unknown>(
  ref: RefObject<T | null> | undefined,
  callback: T,
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
