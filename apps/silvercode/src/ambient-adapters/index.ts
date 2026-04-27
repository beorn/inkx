/**
 * Ambient adapters — barrel + `registerAllAmbientAdapters`.
 *
 * Phase 6.b of the ambient-context-excellence epic — wires the real
 * source adapters (tribe, recall, sub-agent, CI, filewatch) into the
 * controller-owned `ChannelQueue`. See
 * `hub/silvercode/design/ambient-context-safety.md` § 3 for the layered
 * safety stack each adapter participates in.
 *
 * Architecture:
 *
 *   - Each adapter is a small, scope-bound subscriber under
 *     `apps/silvercode/src/ambient-adapters/<source>.ts`.
 *   - `registerAllAmbientAdapters(opts)` is the convenience wirer the
 *     controller calls once per session start. Returns a disposer that
 *     unregisters every wired adapter — disposing the scope also covers
 *     this, but the explicit disposer is convenient when a session ends
 *     before the controller scope.
 *   - Per-source disable is supported via `opts.disable` so tests +
 *     sessions that don't want a particular source can opt out without
 *     also opting out of the rest.
 *
 * Adapters today:
 *
 *   tribe      — peer broadcasts / DMs from the bearly tribe activity log
 *   filewatch  — fs.watch on session cwd (debounced)
 *   ci         — gh-api poll for current branch CI state
 *   recall     — STUB (needs a controller-level token stream + a recall
 *                workspace dep that Phase 6.b can't add per its own
 *                "DO NOT modify package.json" constraint)
 *   subagent   — STUB (needs a structured sub-agent event stream from the
 *                harness — `Task` tool currently returns final results only)
 *
 * Stubs still go through `sanitizeAmbient` + the per-source debounce —
 * the wiring is real, only the upstream signal is missing.
 */

import type { Scope } from "@silvery/scope"
import type { ChannelQueue } from "../channel-queue.ts"
import { registerCiAmbientAdapter, type CiAdapterOptions } from "./ci.ts"
import { registerFilewatchAmbientAdapter, type FilewatchAdapterOptions } from "./filewatch.ts"
import { registerRecallAmbientAdapter, type RecallAdapterOptions } from "./recall.ts"
import { registerSubagentAmbientAdapter, type SubagentAdapterOptions } from "./subagent.ts"
import { registerTribeAmbientAdapter, type TribeAdapterOptions } from "./tribe.ts"

export { registerTribeAmbientAdapter, emitTribeLineForTest } from "./tribe.ts"
export type { TribeAdapterOptions } from "./tribe.ts"

export { registerFilewatchAmbientAdapter, classifyFilewatchPath } from "./filewatch.ts"
export type { FilewatchAdapterOptions } from "./filewatch.ts"

export { registerCiAmbientAdapter, probeCiOnce, diffCi, DEFAULT_CI_POLL_MS } from "./ci.ts"
export type { CiAdapterOptions } from "./ci.ts"

export { registerRecallAmbientAdapter, registerRecallAmbientAdapterHandle, triggerRecallProbe } from "./recall.ts"
export type { RecallAdapterOptions, RecallHit, RecallQueryFn } from "./recall.ts"

export {
  registerSubagentAmbientAdapter,
  registerSubagentAmbientAdapterHandle,
  emitSubagentEventForTest,
} from "./subagent.ts"
export type { SubagentAdapterOptions, SubagentEvent, SubagentEventKind } from "./subagent.ts"

export type { AmbientSource } from "./types.ts"
export { MIN_INTER_EVENT_MS, makeAmbientEventId } from "./types.ts"

export type RegisterAllAmbientAdaptersOptions = {
  readonly scope: Scope
  readonly queue: ChannelQueue
  /** Session cwd — required for filewatch + CI adapters. */
  readonly cwd: string
  /**
   * Disable individual sources by name. Useful for tests and for
   * sessions that don't need (or want) a specific feed.
   */
  readonly disable?: Partial<Record<"tribe" | "filewatch" | "ci" | "recall" | "subagent", boolean>>
  /** Per-adapter overrides — keyed by source name. */
  readonly tribe?: Omit<TribeAdapterOptions, "scope" | "queue">
  readonly filewatch?: Omit<FilewatchAdapterOptions, "scope" | "queue" | "cwd">
  readonly ci?: Omit<CiAdapterOptions, "scope" | "queue">
  readonly recall?: Omit<RecallAdapterOptions, "scope" | "queue">
  readonly subagent?: Omit<SubagentAdapterOptions, "scope" | "queue">
}

/**
 * Wire every available adapter onto `queue` against `scope`. Returns a
 * synchronous disposer; disposing the scope also disposes every adapter.
 *
 * Idempotent per scope — call once per session. Sources that aren't yet
 * wired (recall, subagent stubs) become no-ops and don't error.
 */
export function registerAllAmbientAdapters(opts: RegisterAllAmbientAdaptersOptions): () => void {
  const disable = opts.disable ?? {}
  const disposers: Array<() => void> = []

  if (!disable.tribe) {
    disposers.push(
      registerTribeAmbientAdapter({
        scope: opts.scope,
        queue: opts.queue,
        ...opts.tribe,
      }),
    )
  }
  if (!disable.filewatch) {
    disposers.push(
      registerFilewatchAmbientAdapter({
        scope: opts.scope,
        queue: opts.queue,
        cwd: opts.cwd,
        ...opts.filewatch,
      }),
    )
  }
  if (!disable.ci) {
    disposers.push(
      registerCiAmbientAdapter({
        scope: opts.scope,
        queue: opts.queue,
        cwd: opts.cwd,
        ...opts.ci,
      }),
    )
  }
  if (!disable.recall) {
    disposers.push(
      registerRecallAmbientAdapter({
        scope: opts.scope,
        queue: opts.queue,
        ...opts.recall,
      }),
    )
  }
  if (!disable.subagent) {
    disposers.push(
      registerSubagentAmbientAdapter({
        scope: opts.scope,
        queue: opts.queue,
        ...opts.subagent,
      }),
    )
  }

  let disposed = false
  return (): void => {
    if (disposed) return
    disposed = true
    for (const fn of disposers) {
      try {
        fn()
      } catch {
        /* one disposer's failure must not block others */
      }
    }
  }
}
