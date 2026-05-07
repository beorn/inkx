/**
 * Notification adapters — barrel + `registerAllNotificationAdapters`.
 *
 * Phase 6.b of the notification-context-excellence epic — wires the real
 * source adapters (tribe, recall, sub-agent, CI, filewatch) into the
 * controller-owned `ChannelQueue`. See
 * `apps/silvercode/docs/channels.md` § 3 for the layered
 * safety stack each adapter participates in.
 *
 * Architecture:
 *
 *   - Each adapter is a small, scope-bound subscriber under
 *     `apps/silvercode/src/notification-adapters/<source>.ts`.
 *   - `registerAllNotificationAdapters(opts)` is the convenience wirer the
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
 *   subagent   — Task/Agent tool lifecycle events from the session stream
 *
 * Ambient sources still go through `sanitizeNotification` + per-source
 * debounce. Task/Agent lifecycle events are not debounced because dropping a
 * state transition leaves the UI with stale active subagents.
 */

import type { Scope } from "@silvery/scope"
import type { ChannelQueue } from "../channel-queue.ts"
import { registerCiNotificationAdapter, type CiAdapterOptions } from "./ci.ts"
import { registerFilewatchNotificationAdapter, type FilewatchAdapterOptions } from "./filewatch.ts"
import { registerRecallNotificationAdapter, type RecallAdapterOptions } from "./recall.ts"
import {
  registerSubagentNotificationAdapterHandle,
  type SubagentAdapterOptions,
  type SubagentHandle,
} from "./subagent.ts"
import { registerTribeNotificationAdapter, type TribeAdapterOptions } from "./tribe.ts"

export { registerTribeNotificationAdapter, emitTribeLineForTest } from "./tribe.ts"
export type { TribeAdapterOptions } from "./tribe.ts"

export { registerFilewatchNotificationAdapter, classifyFilewatchPath } from "./filewatch.ts"
export type { FilewatchAdapterOptions } from "./filewatch.ts"

export { registerCiNotificationAdapter, probeCiOnce, diffCi, DEFAULT_CI_POLL_MS } from "./ci.ts"
export type { CiAdapterOptions } from "./ci.ts"

export {
  registerRecallNotificationAdapter,
  registerRecallNotificationAdapterHandle,
  triggerRecallProbe,
} from "./recall.ts"
export type { RecallAdapterOptions, RecallHit, RecallQueryFn } from "./recall.ts"

export {
  registerSubagentNotificationAdapter,
  registerSubagentNotificationAdapterHandle,
  emitSubagentEventForTest,
} from "./subagent.ts"
export type {
  SubagentAdapterOptions,
  SubagentEvent,
  SubagentEventKind,
  SubagentHandle,
  TaskToolUseInput,
  TaskToolResultInput,
} from "./subagent.ts"

export type { NotificationSource } from "./types.ts"
export { MIN_INTER_EVENT_MS, makeNotificationEventId } from "./types.ts"

export type RegisterAllNotificationAdaptersOptions = {
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
 * Result of `registerAllNotificationAdapters`. The base call signature is the
 * disposer (kept for back-compat with existing call sites that did
 * `const dispose = registerAllNotificationAdapters(...)`); per-source handles
 * hang off it for the controller to drive (e.g., feeding `tool-use` /
 * `tool-result` events to the subagent adapter).
 */
export type RegisterAllNotificationAdaptersResult = (() => void) & {
  /** Subagent adapter handle — `undefined` when `disable.subagent` is set. */
  readonly subagent?: SubagentHandle
}

/**
 * Wire every available adapter onto `queue` against `scope`. Returns a
 * disposer fn (also exposing per-source handles as properties); disposing
 * the scope also disposes every adapter.
 *
 * Idempotent per scope — call once per session. Sources that aren't yet
 * wired (recall stub) become no-ops and don't error.
 */
export function registerAllNotificationAdapters(
  opts: RegisterAllNotificationAdaptersOptions,
): RegisterAllNotificationAdaptersResult {
  const disable = opts.disable ?? {}
  const disposers: Array<() => void> = []
  let subagentHandle: SubagentHandle | undefined

  if (!disable.tribe) {
    disposers.push(
      registerTribeNotificationAdapter({
        scope: opts.scope,
        queue: opts.queue,
        ...opts.tribe,
      }),
    )
  }
  if (!disable.filewatch) {
    disposers.push(
      registerFilewatchNotificationAdapter({
        scope: opts.scope,
        queue: opts.queue,
        cwd: opts.cwd,
        ...opts.filewatch,
      }),
    )
  }
  if (!disable.ci) {
    disposers.push(
      registerCiNotificationAdapter({
        scope: opts.scope,
        queue: opts.queue,
        cwd: opts.cwd,
        ...opts.ci,
      }),
    )
  }
  if (!disable.recall) {
    disposers.push(
      registerRecallNotificationAdapter({
        scope: opts.scope,
        queue: opts.queue,
        ...opts.recall,
      }),
    )
  }
  if (!disable.subagent) {
    subagentHandle = registerSubagentNotificationAdapterHandle({
      scope: opts.scope,
      queue: opts.queue,
      ...opts.subagent,
    })
    disposers.push(subagentHandle.dispose)
  }

  let disposed = false
  const dispose = (): void => {
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
  // Attach per-source handles so the controller can drive them.
  // Casting through unknown is the standard "function with attached
  // properties" pattern; the public type is `RegisterAllNotificationAdaptersResult`.
  const result = dispose as RegisterAllNotificationAdaptersResult
  Object.defineProperty(result, "subagent", { value: subagentHandle, enumerable: true })
  return result
}
