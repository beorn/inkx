/**
 * Fake AcpSession — Layer 1 of the ACP fake (`km-silvercode.acp-fake`).
 *
 * `createFakeAcpSession({ script })` returns an `AgentSession` whose
 * `subscribe(handler)` emits a scripted sequence of `AgentEvent`s. The shape
 * is identical to what `spawnClaude` returns, so it is drop-in for
 * `createSessionStore({ session })` and any other consumer of `AgentSession`.
 *
 * Two driver modes:
 *
 * - **async** (default): events fire via `setTimeout` honoring each step's
 *   `delayMs`. Real wall-clock time; pair with `vi.useFakeTimers()` for
 *   deterministic timing assertions in tests.
 * - **manual** (`{ manual: true }`): no timers; the returned object exposes
 *   `tick()` (fire next event synchronously) and `drain()` (fire all
 *   remaining synchronously). Ideal for fixture-replay tests.
 *
 * Permission policy controls how a `permission-request` event is auto-handled.
 * The fake emits a synthesized `permission-decision` after the policy resolves;
 * scripts can also include explicit `permission-decision` steps and skip the
 * policy by setting `permissionPolicy: undefined`.
 *
 * Fixtures live in `./fake-fixtures/*.json` (arrays of `ScriptStep`). Use
 * `loadFixture(name)` to load them by name.
 *
 * Layer 2 (`silvercode-acp-fake` standalone binary that wraps Layer 1 in
 * `AgentSideConnection` over stdio) is a separate bead — out of scope here.
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { AgentEvent, AgentSession, PermissionRequestId, SessionId, TurnId } from "./events.ts"

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ScriptStep = {
  /** Wall-clock delay (ms) before this event fires in async mode. Ignored in manual mode. */
  delayMs?: number
  event: AgentEvent
}

export type ScriptedDecisions = { decisions: Record<string, boolean> }
export type PermissionPolicyFn = (req: {
  requestId: PermissionRequestId
  tool: string
  args: unknown
}) => Promise<boolean> | boolean

export type PermissionPolicy = "auto-approve" | "always-deny" | ScriptedDecisions | PermissionPolicyFn

export type FakeOpts = {
  /** Scripted sequence of events. Played in order. */
  script: ScriptStep[]
  /**
   * How to handle `permission-request` events emitted by the script. The fake
   * synthesizes a `permission-decision` event with the policy's verdict.
   * Omit (or set to `undefined`) to disable auto-decisions; the script must
   * include explicit `permission-decision` steps in that case.
   */
  permissionPolicy?: PermissionPolicy
  /**
   * If true, return a manual driver — no timers, caller drives via `tick()`/
   * `drain()`. If false (default), events fire asynchronously via setTimeout
   * honoring `delayMs`.
   */
  manual?: boolean
  /** Override the default sessionId. */
  sessionId?: SessionId
}

/**
 * Manual driver extension. Returned only when `opts.manual === true`.
 *
 * `tick()` fires the next pending step synchronously. Returns `true` if more
 * steps remain (i.e. another `tick()` would do work), `false` if the script
 * is exhausted.
 *
 * `drain()` fires all remaining steps synchronously, including any synthesized
 * `permission-decision` events from the policy (resolved synchronously when
 * the policy returns a boolean; async functions are awaited if returned, but
 * `drain()` returns synchronously after firing literal steps — async policies
 * are best paired with the async driver).
 */
export type ManualFakeSession = AgentSession & {
  tick(): boolean
  drain(): void
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const DEFAULT_SESSION_ID = "fake-session" as SessionId

/**
 * Resolve a permission policy synchronously when possible. Returns either a
 * boolean (sync) or a promise (async function policy).
 */
function resolvePermissionPolicy(
  policy: PermissionPolicy,
  req: { requestId: PermissionRequestId; tool: string; args: unknown },
): boolean | Promise<boolean> {
  if (policy === "auto-approve") return true
  if (policy === "always-deny") return false
  if (typeof policy === "function") return policy(req)
  // ScriptedDecisions
  const decision = policy.decisions[req.requestId as unknown as string]
  return decision ?? false
}

export function createFakeAcpSession(opts: FakeOpts & { manual: true }): ManualFakeSession
export function createFakeAcpSession(opts: FakeOpts): AgentSession
export function createFakeAcpSession(opts: FakeOpts): AgentSession | ManualFakeSession {
  const { script, permissionPolicy, manual = false } = opts
  const sessionId = opts.sessionId ?? DEFAULT_SESSION_ID

  const subscribers = new Set<(event: AgentEvent) => void>()
  const pending: ScriptStep[] = [...script]
  let closed = false
  const timers = new Set<ReturnType<typeof setTimeout>>()

  function emit(event: AgentEvent): void {
    if (closed) return
    // Iterate over a snapshot so handlers can unsubscribe themselves safely.
    for (const handler of Array.from(subscribers)) {
      handler(event)
    }
    // Auto-handle permission-request via policy.
    if (event.kind === "permission-request" && permissionPolicy !== undefined) {
      const verdict = resolvePermissionPolicy(permissionPolicy, {
        requestId: event.requestId,
        tool: event.tool,
        args: event.args,
      })
      const fire = (approved: boolean): void => {
        if (closed) return
        const decision: AgentEvent = {
          kind: "permission-decision",
          sessionId: event.sessionId,
          requestId: event.requestId,
          approved,
          ts: Date.now(),
        }
        for (const handler of Array.from(subscribers)) handler(decision)
      }
      if (typeof verdict === "boolean") fire(verdict)
      else void verdict.then(fire)
    }
  }

  function fireNextStep(): boolean {
    if (closed) return false
    const step = pending.shift()
    if (!step) return false
    emit(step.event)
    return pending.length > 0
  }

  function scheduleAsync(): void {
    if (closed) return
    const step = pending[0]
    if (!step) return
    const delay = step.delayMs ?? 0
    const timer = setTimeout(() => {
      timers.delete(timer)
      // Re-check the head — `close()` may have run while the timer was queued.
      if (closed) return
      pending.shift()
      emit(step.event)
      scheduleAsync()
    }, delay)
    timers.add(timer)
  }

  function clearAllTimers(): void {
    for (const t of timers) clearTimeout(t)
    timers.clear()
  }

  const session: AgentSession = {
    sessionId,
    send(text: string): void {
      if (closed) return
      const turnId = `fake-turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` as TurnId
      const event: AgentEvent = {
        kind: "user-message",
        sessionId,
        turnId,
        text,
        ts: Date.now(),
      }
      // user-message goes to subscribers but bypasses the script queue.
      for (const handler of Array.from(subscribers)) handler(event)
    },
    respondToPermission(requestId: PermissionRequestId, approved: boolean): void {
      if (closed) return
      const event: AgentEvent = {
        kind: "permission-decision",
        sessionId,
        requestId,
        approved,
        ts: Date.now(),
      }
      for (const handler of Array.from(subscribers)) handler(event)
    },
    subscribe(handler: (event: AgentEvent) => void): () => void {
      subscribers.add(handler)
      return () => {
        subscribers.delete(handler)
      }
    },
    close(): Promise<void> {
      if (closed) return Promise.resolve()
      closed = true
      clearAllTimers()
      pending.length = 0
      // Mirror the real spawn surface: emit nothing here. Tests asserting
      // session-end should script it explicitly.
      return Promise.resolve()
    },
    [Symbol.asyncDispose](): Promise<void> {
      return this.close()
    },
    get closed(): boolean {
      return closed
    },
  }

  if (manual) {
    const manualSession: ManualFakeSession = Object.assign(session, {
      tick(): boolean {
        return fireNextStep()
      },
      drain(): void {
        while (!closed && pending.length > 0) fireNextStep()
      },
    })
    return manualSession
  }

  // Async: arm the first timer immediately. The first step's `delayMs` (or 0)
  // is the only delay before its emission, so subscribers added synchronously
  // after the factory returns are guaranteed to see the first event provided
  // they subscribe before the timer fires (true even at delayMs=0 since the
  // setTimeout callback is deferred to the next macrotask).
  scheduleAsync()
  return session
}

// ---------------------------------------------------------------------------
// Fixture loader
// ---------------------------------------------------------------------------

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fake-fixtures")

/** Available fixture names (file basenames, no extension). */
export type FakeFixtureName =
  | "minimal-prompt"
  | "tool-call-with-permission"
  | "multi-tool-with-fs"
  | "rejection-flow"
  | "error-flow"
  | "streaming-text"

/**
 * Load a fixture script by name. Fixtures are JSON arrays of `ScriptStep`
 * objects matching the silvercode `AgentEvent` schema.
 */
export function loadFixture(name: FakeFixtureName): ScriptStep[] {
  const path = join(FIXTURE_DIR, `${name}.json`)
  const raw = readFileSync(path, "utf8")
  const parsed = JSON.parse(raw) as ScriptStep[]
  if (!Array.isArray(parsed)) {
    throw new Error(`fixture ${name} did not parse to an array`)
  }
  return parsed
}
