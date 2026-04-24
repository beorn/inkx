import { useEffect, useState } from "react"
import type { SessionState, SessionStore } from "@km/agent-harness"

/** Subscribe a React component to a SessionStore. */
export function useStoreSignal(store: SessionStore): SessionState {
  const [state, setState] = useState<SessionState>(() => store.state.get())
  useEffect(() => store.state.subscribe((s) => setState(s)), [store])
  return state
}
