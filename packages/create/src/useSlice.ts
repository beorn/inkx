/**
 * useSlice — React hook that reads a {@link SliceHandle}'s live state.
 *
 * The read-side companion to {@link withSlice}, mirroring {@link useStore}
 * (which binds `definePlugin` handles). Where `useStore` returns
 * `{ state, dispatch }`, `useSlice` returns just the state: a slice has no
 * dispatch of its own — components dispatch through the shared `app.dispatch`
 * (typically reached via `createAppContext`). This matches how bossi's
 * `BossiApp` reads its view slice via `useSyncExternalStore(app.subscribe,
 * app.getView, …)` and dispatches through `app.dispatch` separately.
 *
 * ```tsx
 * const app = pipe(createBaseApp(), withSlice({ name: "counter", initial, handlers }))
 * function Counter() {
 *   const { n } = useSlice(app.counter)
 *   return <Text>{n}</Text>
 * }
 * ```
 *
 * Uses `useSyncExternalStore` with the handle's stable `getState` — the slice
 * preserves `===` on no-op dispatches, so React skips the commit automatically.
 */
import { useCallback, useSyncExternalStore } from "react"
import type { SliceHandle } from "./withSlice"

/**
 * Subscribe a React component to a slice's state. Re-renders only when the
 * slice state changes identity.
 */
export function useSlice<S>(slice: SliceHandle<S>): S {
  const subscribe = useCallback((listener: () => void) => slice.subscribe(listener), [slice])
  return useSyncExternalStore(subscribe, slice.getState, slice.getState)
}
