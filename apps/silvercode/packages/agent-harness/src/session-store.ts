/**
 * Reactive session store — thin runtime shim over the pure
 * {@link reduce} reducer in `./session-reducer.ts`.
 *
 * One store per session. The SessionUpdateList / TodoPanel / StatusLine /
 * ToolCall components subscribe via the returned signals.
 * `alien-signals` underpins the reactive layer so updates trigger minimal
 * re-renders (see `@silvery/signals`).
 *
 * **TEA shape**: this module owns the impure parts (subscriber notifications,
 * AgentSession binding); the reducer owns all state transitions and lives
 * entirely in pure data. See `session-reducer.ts` for rationale, including
 * the No-Parallel-Derivation regression that motivated the split.
 *
 * This module is deliberately dependency-light (alien-signals only) so tests
 * can exercise it without a full silvery runtime.
 */

import { signal } from "alien-signals"
import type { AgentEvent, AgentSession } from "./events.ts"
import {
  type Effect,
  type InternalSessionState,
  initialInternalState,
  publicView,
  reduce,
  runEffect,
} from "./session-reducer.ts"
import type { SessionState } from "./session-types.ts"

// Re-export the public type surface so existing consumers continue to
// import from `./session-store.ts` without touching their import paths.
export type {
  AgentPlan,
  AgentPlanEntry,
  AgentPlanEntryPriority,
  AgentPlanEntryStatus,
  AgentPlanSource,
  AgentPlanStatus,
  MessageEntry,
  MessageOp,
  RoleIndicator,
  SessionState,
  SessionStatus,
  Todo,
  ToolCallEntry,
  ToolResultEntry,
} from "./session-types.ts"

export type SessionStore = {
  state: { get(): SessionState; subscribe(fn: (s: SessionState) => void): () => void }
  apply(event: AgentEvent): void
  /** Convenience: subscribe an AgentSession's events directly. */
  bind(session: AgentSession): () => void
}

export function createSessionStore(): SessionStore {
  // Internal state carries the strip runtime; the public projection
  // (returned via `state.get()` and passed to subscribers) omits it.
  let internal: InternalSessionState = initialInternalState()
  const s = signal<SessionState>(publicView(internal))
  const subscribers = new Set<(state: SessionState) => void>()

  function getPublic(): SessionState {
    return s()
  }

  function notify(view: SessionState): void {
    s(view)
    for (const fn of subscribers) fn(view)
  }

  function apply(event: AgentEvent): void {
    const [nextInternal, effects]: [InternalSessionState, Effect[]] = reduce(internal, event)
    internal = nextInternal
    notify(publicView(internal))
    // Effect runner — pure no-op today (Effect is an empty union). Future
    // notify-bell / persist-event-log / dispatch-to-acp variants plug in
    // here without touching the reducer signature.
    for (const eff of effects) runEffect(eff)
  }

  return {
    state: {
      get: getPublic,
      subscribe(fn: (state: SessionState) => void): () => void {
        subscribers.add(fn)
        return () => subscribers.delete(fn)
      },
    },
    apply,
    bind(session: AgentSession): () => void {
      return session.subscribe((e) => apply(e))
    },
  }
}
