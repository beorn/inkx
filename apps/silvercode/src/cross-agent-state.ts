/**
 * Cross-agent state — silvercode-owned coordination store across N parallel
 * ACP sessions.
 *
 * Architectural rule: agents don't talk to each other. Silvercode is the
 * orchestrator. Each session sees its own ACP conversation; silvercode owns
 * the cross-session coordination data (file claims, handoffs, peer activity)
 * and projects relevant slices into each agent's prompt.
 *
 * This module is the **store**. It is signal-backed (so silvery components
 * subscribe via `useSignal` for live updates) and purely in-memory — a
 * silvercode restart drops the state, which is the correct behaviour
 * (agents should not assume coordination state survives a host restart).
 *
 * Conflict-mediation policy: first claim wins. When a session asks for an
 * exclusive claim on a path another session already holds exclusively, the
 * call returns `{ ok: false, conflictWith }` — the agent decides what to do
 * (handoff, wait, abandon). No automatic mediation. Documented here because
 * the policy is enforced in `claimFile` below.
 *
 * See `hub/silvery/future/ai-terminal/10-agent-router-landscape.md`
 * § "Cross-agent cooperation" + § "How OpenClaw does it".
 */

import { signal } from "alien-signals"
import type { Scope } from "@silvery/scope"

// ───── Types ──────────────────────────────────────────────────────────────

/** Session identity used by every cross-agent record. Free-form string keyed by silvercode controller. */
export type CrossAgentSessionId = string

/**
 * One file claim. `path` is the canonical filesystem path (already resolved
 * relative to the session's cwd). `exclusive: true` is a hard claim — only
 * one session may hold it; another exclusive claim on the same path returns
 * conflict. `exclusive: false` is advisory — multiple sessions may hold
 * advisory claims on the same path concurrently (read-coordination only).
 */
export type FileClaim = {
  readonly path: string
  readonly sessionId: CrossAgentSessionId
  readonly claimedAt: number
  readonly exclusive: boolean
}

/** Status of a cross-session handoff proposal. */
export type HandoffStatus = "pending" | "accepted" | "rejected"

export type HandoffId = string

export type Handoff = {
  readonly id: HandoffId
  readonly fromSessionId: CrossAgentSessionId
  readonly toSessionId: CrossAgentSessionId
  readonly content: string
  readonly status: HandoffStatus
  readonly proposedAt: number
  readonly resolvedAt?: number
}

export type SessionStatus = "spawning" | "idle" | "thinking" | "waiting" | "ended"

export type SessionInfo = {
  readonly sessionId: CrossAgentSessionId
  readonly name: string
  readonly model?: string
  readonly status: SessionStatus
  readonly startedAt: number
}

/**
 * One peer broadcast (mirrored from the channel-queue). Stored as a ring
 * buffer of the last N events so cross-agent prompt slices have a recent-
 * activity window without unbounded growth.
 */
export type TribeEvent = {
  readonly id: string
  readonly source: string
  readonly fromSessionId?: CrossAgentSessionId
  readonly content: string
  readonly timestamp: number
}

// ───── Result types ───────────────────────────────────────────────────────

export type ClaimResult =
  | { readonly ok: true; readonly claim: FileClaim }
  | { readonly ok: false; readonly conflictWith: CrossAgentSessionId }

// ───── Public surface ─────────────────────────────────────────────────────

/**
 * Read-mostly signal contract. Components subscribe via `useSignal` (or
 * `effect`); the signal value is replaced (not mutated) on every change so
 * alien-signals' reference-equality dirty check fires reliably.
 *
 * alien-signals' `signal<T>(v)` returns a callable that doubles as getter
 * (zero args) and setter (one arg). The store exposes only the getter
 * shape externally — internal code uses the full read/write callable.
 */
export type ReadSignal<T> = () => T

export type CrossAgentState = {
  /** Live list of file claims, signal-backed. Replaced on every mutation. */
  readonly claims: ReadSignal<readonly FileClaim[]>
  /** Live list of all (pending + resolved) handoffs. */
  readonly handoffs: ReadSignal<readonly Handoff[]>
  /** Live list of active sessions. */
  readonly activeSessions: ReadSignal<readonly SessionInfo[]>
  /** Recent broadcasts (ring buffer, default cap 50). Newest last. */
  readonly recentBroadcasts: ReadSignal<readonly TribeEvent[]>

  /**
   * Attempt to claim a file. Policy: first exclusive claim wins. Adding a
   * second exclusive claim on a path with an existing exclusive claim from
   * a different session returns `{ ok: false, conflictWith: <holder> }`.
   * Re-claiming the same path from the same session is idempotent.
   */
  claimFile(opts: { sessionId: CrossAgentSessionId; path: string; exclusive?: boolean }): ClaimResult
  /** Release a claim. No-op if the (sessionId, path) pair has no claim. */
  releaseFile(opts: { sessionId: CrossAgentSessionId; path: string }): void

  /** Propose a handoff. Returns the new handoffId. */
  proposeHandoff(opts: {
    fromSessionId: CrossAgentSessionId
    toSessionId: CrossAgentSessionId
    content: string
  }): HandoffId
  /** Accept a pending handoff. No-op if not pending. */
  acceptHandoff(handoffId: HandoffId): void
  /** Reject a pending handoff. No-op if not pending. */
  rejectHandoff(handoffId: HandoffId): void

  /** Add a session. Idempotent — re-adding by sessionId updates name/model/status. */
  addSession(info: SessionInfo): void
  /** Remove a session and release any claims it held. */
  removeSession(sessionId: CrossAgentSessionId): void
  /** Update one session's status (e.g. idle → thinking). No-op if unknown. */
  updateSessionStatus(sessionId: CrossAgentSessionId, status: SessionStatus): void

  /** Append a broadcast to the ring buffer. Oldest is evicted at cap. */
  recordBroadcast(event: TribeEvent): void
}

// ───── Implementation ─────────────────────────────────────────────────────

const DEFAULT_BROADCAST_CAP = 50

export type CreateCrossAgentStateOptions = {
  /** Ring-buffer capacity for `recentBroadcasts`. Default 50. */
  broadcastCap?: number
  /** Clock for tests. Default `Date.now`. */
  now?: () => number
}

let nextHandoffSeq = 1

/**
 * Build a cross-agent state store bound to `scope`. Disposing the scope
 * clears all internal lists. The store itself owns no async resources —
 * the scope binding is purely for clean teardown.
 */
export function createCrossAgentState(scope: Scope, opts: CreateCrossAgentStateOptions = {}): CrossAgentState {
  const broadcastCap = opts.broadcastCap ?? DEFAULT_BROADCAST_CAP
  const now = opts.now ?? Date.now

  // Internal mutable backing arrays. We replace the value on each signal
  // write so consumers see fresh references — alien-signals uses === for
  // dirty-checking. Internal arrays stay mutable so we can splice in place.
  let claims: FileClaim[] = []
  let handoffs: Handoff[] = []
  let sessions: SessionInfo[] = []
  let broadcasts: TribeEvent[] = []
  let disposed = false

  const claimsSignal = signal<readonly FileClaim[]>(claims)
  const handoffsSignal = signal<readonly Handoff[]>(handoffs)
  const sessionsSignal = signal<readonly SessionInfo[]>(sessions)
  const broadcastsSignal = signal<readonly TribeEvent[]>(broadcasts)

  scope.defer(() => {
    disposed = true
    claims = []
    handoffs = []
    sessions = []
    broadcasts = []
    claimsSignal(claims)
    handoffsSignal(handoffs)
    sessionsSignal(sessions)
    broadcastsSignal(broadcasts)
  })

  function publishClaims(): void {
    claims = claims.slice()
    claimsSignal(claims)
  }
  function publishHandoffs(): void {
    handoffs = handoffs.slice()
    handoffsSignal(handoffs)
  }
  function publishSessions(): void {
    sessions = sessions.slice()
    sessionsSignal(sessions)
  }
  function publishBroadcasts(): void {
    broadcasts = broadcasts.slice()
    broadcastsSignal(broadcasts)
  }

  function findClaim(path: string, sessionId?: CrossAgentSessionId): FileClaim | undefined {
    return claims.find((c) => c.path === path && (sessionId == null || c.sessionId === sessionId))
  }

  return {
    claims: claimsSignal as ReadSignal<readonly FileClaim[]>,
    handoffs: handoffsSignal as ReadSignal<readonly Handoff[]>,
    activeSessions: sessionsSignal as ReadSignal<readonly SessionInfo[]>,
    recentBroadcasts: broadcastsSignal as ReadSignal<readonly TribeEvent[]>,

    claimFile({ sessionId, path, exclusive = true }): ClaimResult {
      if (disposed) return { ok: false, conflictWith: sessionId }

      // Re-claim by same session is idempotent — return the existing claim
      // (with the existing claimedAt + exclusive). No-op write so we don't
      // burn signal subscribers.
      const own = findClaim(path, sessionId)
      if (own && own.exclusive === exclusive) return { ok: true, claim: own }

      // Conflict: another session holds an exclusive claim. Policy: first
      // exclusive wins. Only exclusive ⇄ exclusive collisions conflict;
      // advisory claims may stack on the same path (e.g. multiple readers).
      if (exclusive) {
        const other = claims.find((c) => c.path === path && c.sessionId !== sessionId && c.exclusive)
        if (other) return { ok: false, conflictWith: other.sessionId }
      }

      // Replace any prior claim from this session on this path (e.g.
      // upgrading advisory → exclusive when no other holder exists).
      claims = claims.filter((c) => !(c.path === path && c.sessionId === sessionId))
      const claim: FileClaim = { path, sessionId, exclusive, claimedAt: now() }
      claims.push(claim)
      publishClaims()
      return { ok: true, claim }
    },

    releaseFile({ sessionId, path }): void {
      if (disposed) return
      const idx = claims.findIndex((c) => c.path === path && c.sessionId === sessionId)
      if (idx < 0) return
      claims.splice(idx, 1)
      publishClaims()
    },

    proposeHandoff({ fromSessionId, toSessionId, content }): HandoffId {
      const id: HandoffId = `h-${nextHandoffSeq++}-${now()}`
      if (disposed) return id
      const handoff: Handoff = {
        id,
        fromSessionId,
        toSessionId,
        content,
        status: "pending",
        proposedAt: now(),
      }
      handoffs.push(handoff)
      publishHandoffs()
      return id
    },

    acceptHandoff(handoffId): void {
      if (disposed) return
      const idx = handoffs.findIndex((h) => h.id === handoffId)
      if (idx < 0) return
      const h = handoffs[idx]
      if (h?.status !== "pending") return
      handoffs[idx] = { ...h, status: "accepted", resolvedAt: now() }
      publishHandoffs()
    },

    rejectHandoff(handoffId): void {
      if (disposed) return
      const idx = handoffs.findIndex((h) => h.id === handoffId)
      if (idx < 0) return
      const h = handoffs[idx]
      if (h?.status !== "pending") return
      handoffs[idx] = { ...h, status: "rejected", resolvedAt: now() }
      publishHandoffs()
    },

    addSession(info): void {
      if (disposed) return
      const idx = sessions.findIndex((s) => s.sessionId === info.sessionId)
      const prev = idx >= 0 ? sessions[idx] : undefined
      if (prev) {
        // Update in place — preserve startedAt unless caller supplies one.
        sessions[idx] = { ...prev, ...info, startedAt: prev.startedAt }
      } else {
        sessions.push(info)
      }
      publishSessions()
    },

    removeSession(sessionId): void {
      if (disposed) return
      const before = sessions.length
      sessions = sessions.filter((s) => s.sessionId !== sessionId)
      const heldClaims = claims.length
      claims = claims.filter((c) => c.sessionId !== sessionId)
      if (sessions.length !== before) publishSessions()
      if (claims.length !== heldClaims) publishClaims()
    },

    updateSessionStatus(sessionId, status): void {
      if (disposed) return
      const idx = sessions.findIndex((s) => s.sessionId === sessionId)
      if (idx < 0) return
      const prev = sessions[idx]
      if (!prev || prev.status === status) return
      sessions[idx] = { ...prev, status }
      publishSessions()
    },

    recordBroadcast(event): void {
      if (disposed) return
      broadcasts.push(event)
      // Ring-buffer eviction: drop the oldest until we're under the cap.
      while (broadcasts.length > broadcastCap) broadcasts.shift()
      publishBroadcasts()
    },
  }
}
