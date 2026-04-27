/**
 * Recall ambient adapter — surfaces session-history hits as ambient
 * events when the active conversation mentions a noun that has prior
 * session context.
 *
 * **Status: stub.** The full surface needs:
 *
 *   1. A "rare token" extractor on each tool surface (read file path,
 *      tool result text, etc.) — needs a stable hook point in
 *      controller.ts that adapters can subscribe to. Today the controller
 *      doesn't expose a per-turn token stream.
 *   2. Recall query integration — `@bearly/recall` exposes `recall(...)`
 *      from `vendor/bearly/plugins/recall/src/history/search.ts`. Wiring
 *      it as a workspace dep requires editing `apps/silvercode/package.json`,
 *      which Phase 6.b explicitly defers ("DO NOT modify package.json. Flag
 *      if you need a dep and skip that adapter.").
 *
 * The shape stubbed here is the public API the real implementation will
 * use: `registerRecallAmbientAdapter(opts)` returning a disposer. Tests
 * exercise the *trigger* path (`triggerRecallProbe`) so the rest of the
 * pipeline (sanitize → debounce → enqueue) is verified end-to-end with a
 * mock query function.
 *
 * Tracking: `km-silvercode.ambient-phase-6-adapters` (Phase 6.b) — once
 * the controller exposes a token stream + we add the recall workspace
 * dep, this stub turns into the real subscription.
 *
 * Per `ambient-context-safety.md` § 3, every payload still passes through
 * Layer 2 (`sanitizeAmbient`) — the recall plugin's own envelope scrub
 * (Layer 0, `vendor/bearly/plugins/recall/src/lib/...`) is in addition to
 * this, not in place of it.
 */

import createDebug from "debug"
import type { AmbientAdapterCtx } from "./types.ts"
import { createDebouncedEmit, makeAmbientEventId } from "./types.ts"

const dRecall = createDebug("silvercode:ambient:recall")

const SOURCE = "recall" as const

/**
 * One recall hit summarized for ambient display. Mirrors the fields the
 * eventual real recall query result will carry, narrowed to what an
 * ambient row needs to render.
 */
export type RecallHit = {
  readonly token: string
  readonly summary: string
  readonly sessionId?: string
}

/** Async fn that performs a recall query against a token. Test-injectable. */
export type RecallQueryFn = (token: string) => Promise<readonly RecallHit[]>

export type RecallAdapterOptions = AmbientAdapterCtx & {
  /**
   * Source of rare tokens to probe. The real implementation subscribes
   * to a controller-level token stream; this stub exposes a manual
   * `triggerRecallProbe(adapter, token)` for tests + future wiring.
   */
  readonly query?: RecallQueryFn
}

type RecallHandle = {
  /** Public disposer — invoked by the index barrel + scope.defer. */
  readonly dispose: () => void
  /**
   * Probe a token against the (test-injected or real) recall surface and
   * emit one ambient event per hit. Surface for tests; the real path
   * will call this from a token-stream subscription.
   */
  readonly probe: (token: string) => Promise<number>
}

/**
 * Register the recall adapter. In Phase 6.b this is a stub — it wires up
 * the dispatch path but doesn't subscribe to a token stream. Returns a
 * disposer; the test-only `probe` handle is exposed via the
 * `triggerRecallProbe` helper below.
 */
export function registerRecallAmbientAdapter(opts: RecallAdapterOptions): () => void {
  return registerRecallAmbientAdapterHandle(opts).dispose
}

/**
 * Variant that returns the full handle (with `probe`). Tests use this
 * directly; production code calls `registerRecallAmbientAdapter`.
 */
export function registerRecallAmbientAdapterHandle(opts: RecallAdapterOptions): RecallHandle {
  const emit = createDebouncedEmit(opts)
  const query = opts.query ?? defaultRecallQuery
  let disposed = false

  async function probe(token: string): Promise<number> {
    if (disposed) return 0
    let hits: readonly RecallHit[]
    try {
      hits = await query(token)
    } catch (err) {
      dRecall("query failed for %s: %s", token, err)
      return 0
    }
    let emitted = 0
    for (const hit of hits) {
      const ok = emit({
        id: makeAmbientEventId(SOURCE),
        source: SOURCE,
        timestamp: Date.now(),
        content: `[recall ${hit.token}] ${hit.summary}`,
        meta: { kind: "recall-hit", token: hit.token, fromSessionId: hit.sessionId },
      })
      if (ok) emitted++
    }
    return emitted
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
  }
  opts.scope.defer(dispose)
  return { dispose, probe }
}

/**
 * Default recall query — currently returns no hits. The real
 * implementation will dispatch to `@bearly/recall`'s `recall(...)` once
 * we add the workspace dep. Until then, `RecallAdapterOptions.query` is
 * how tests inject a query fn, and how a future controller hook can
 * provide one.
 */
function defaultRecallQuery(_token: string): Promise<readonly RecallHit[]> {
  return Promise.resolve([])
}

/**
 * Test-only: probe a token through a freshly-registered adapter.
 * Returns the number of hits actually enqueued (some may be debounced).
 */
export async function triggerRecallProbe(opts: RecallAdapterOptions, token: string): Promise<number> {
  const handle = registerRecallAmbientAdapterHandle(opts)
  try {
    return await handle.probe(token)
  } finally {
    handle.dispose()
  }
}
