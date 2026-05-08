import { useSyncExternalStore } from "react"
import type { SessionState, SessionStore } from "@km/agent-harness"

/** Subscribe a React component to a SessionStore. */
export function useStoreSignal(store: SessionStore): SessionState {
  return useSyncExternalStore(
    (onStoreChange) => store.state.subscribe(() => onStoreChange()),
    () => store.state.get(),
    () => store.state.get(),
  )
}
