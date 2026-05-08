/**
 * Recall notification adapter — surfaces session-history hits as notification
 * events when the active conversation lands on tokens that have prior
 * session context.
 *
 * Pipeline (per probe):
 *
 *   1. The controller calls `probe(query)` after every Nth assistant
 *      `turn-end` (see `controller.ts` — `RECALL_PROBE_TURN_INTERVAL`).
 *      The query is the most recent user-message text verbatim.
 *   2. Self rate-limit: at most one query per adapter per
 *      `MIN_RECALL_INTERVAL_MS` (60s). Recall queries are expensive
 *      (FTS5 + multiple subprocess hops); we self-limit at the source
 *      so the global breaker doesn't have to absorb the spike.
 *   3. Real query path: spawn `bun vendor/bearly/tools/recall.ts <q>
 *      --raw --json --limit 5 --timeout 3000` from the repo root, parse
 *      the JSON output. The `query` option is test-injectable; tests
 *      bypass the subprocess entirely.
 *   4. Digest emission: one notification event per probe batch, not per hit.
 *      Format: `[recall] N prior sessions discussed "<query>": …`.
 *      This pairs with the per-source debounce (`createDebouncedEmit`)
 *      and the global breaker so the agent gets one tidy hint instead
 *      of N noisy rows.
 *   5. Sanitize: every payload still passes through Layer 2
 *      (`sanitizeNotification`) via `createDebouncedEmit`. Recall content
 *      can include indexed transcripts that themselves contain
 *      role-prefix bytes — the sanitizer neutralizes those colons.
 *
 * Tracking: `km-silvercode.notification-recall-real` (parent
 * `km-silvercode.notification-context-excellence`).
 *
 * Per `apps/silvercode/docs/channels.md` § 3, every payload still passes
 * through Layer 2 (`sanitizeNotification`) — the recall plugin's own
 * envelope scrub (Layer 0) is in addition to this, not in place of it.
 */

import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"
import createDebug from "debug"
import { containsRejectedSignal, hasSalience, LONG_PROMPT_BYPASS_LENGTH } from "@bearly/recall"
import type { Scope } from "@silvery/scope"
import type { NotificationAdapterCtx } from "./types.ts"
import { createDebouncedEmit, makeNotificationEventId } from "./types.ts"

const dRecall = createDebug("silvercode:notification:recall")

const SOURCE = "recall" as const

/**
 * Self-rate-limit: minimum gap between successive recall queries from
 * the same adapter. Recall is expensive (FTS5 + multiple subprocess
 * hops) so we cap aggressively at the source. The global circuit
 * breaker (`notification-circuit-breaker.ts`) layers on top.
 */
export const MIN_RECALL_INTERVAL_MS = 60_000

/** Default subprocess timeout for the recall CLI. */
const RECALL_QUERY_TIMEOUT_MS = 5_000
/** Default `--limit` passed to the recall CLI. */
const RECALL_QUERY_LIMIT = 5
/**
 * How many hits to summarize inline in the digest body.
 *
 * V2 lowered this from 3 → 1: dogfooding the inject-delta V2 gates
 * showed multi-hit emits dilute the perceived signal (one strong hit +
 * tangential extras drags the useful-rate down). Same lesson applies
 * to the notification digest. The full hit count is still surfaced via the
 * `+N more` suffix and `meta.hitCount`.
 */
const RECALL_DIGEST_HITS = 1

/**
 * One recall hit summarized for notification display. Mirrors the fields
 * returned by `bun recall <q> --raw --json`, narrowed to what an
 * notification row needs to render.
 */
export type RecallHit = {
  readonly token: string
  readonly summary: string
  readonly sessionId?: string
}

/** Async fn that performs a recall query against a token. Test-injectable. */
export type RecallQueryFn = (token: string) => Promise<readonly RecallHit[]>

export type RecallAdapterOptions = NotificationAdapterCtx & {
  /**
   * Test-injectable query fn. When provided, the adapter calls this
   * instead of spawning the recall CLI. Production code leaves it
   * undefined → falls through to `runRecallCli`.
   */
  readonly query?: RecallQueryFn
  /**
   * Repo root for the recall CLI subprocess. Defaults to the nearest
   * ancestor of `process.cwd()` containing `vendor/bearly/tools/recall.ts`.
   * Set explicitly for tests or non-default deployments.
   */
  readonly repoRoot?: string
  /**
   * Override the rate-limit window. Tests use a small value to verify
   * the limit fires; production uses `MIN_RECALL_INTERVAL_MS`.
   */
  readonly minQueryIntervalMs?: number
}

type RecallHandle = {
  /** Public disposer — invoked by the index barrel + scope.defer. */
  readonly dispose: () => void
  /**
   * Probe a query string against the recall surface and emit at most
   * one notification digest event for the whole batch. Returns the number
   * of events actually enqueued (0 or 1; >1 is impossible by design).
   * Returns 0 when the rate-limit window blocks the call, the query
   * fails, or there are no hits.
   */
  readonly probe: (query: string) => Promise<number>
}

/**
 * Register the recall adapter onto the channel queue. Returns a
 * synchronous disposer. The registered handle's `probe` is exposed
 * via `triggerRecallProbe` for tests + the controller token-stream
 * subscription.
 */
export function registerRecallNotificationAdapter(opts: RecallAdapterOptions): () => void {
  return registerRecallNotificationAdapterHandle(opts).dispose
}

/**
 * Variant that returns the full handle (with `probe`). Tests use this
 * directly; production code calls `registerRecallNotificationAdapter` and
 * obtains `probe` via the controller wiring.
 */
export function registerRecallNotificationAdapterHandle(opts: RecallAdapterOptions): RecallHandle {
  const emit = createDebouncedEmit(opts)
  const query = opts.query ?? defaultRecallQuery(opts.scope, opts.repoRoot)
  const now = opts.now ?? ((): number => Date.now())
  const rateLimitMs = opts.minQueryIntervalMs ?? MIN_RECALL_INTERVAL_MS
  let disposed = false
  let lastQueryAt = 0

  async function probe(rawQuery: string): Promise<number> {
    if (disposed) return 0
    const trimmed = rawQuery.trim()
    if (trimmed.length === 0) return 0
    // V2 salience gate: short prompts without recallable identifiers are
    // meta-questions ("how should we improve?") that produce only
    // tangential token-overlap matches. Mirrors the inject-delta V2
    // gate in @bearly/recall — same logic, applied at the silvercode
    // notification layer so we don't waste a CLI subprocess.
    if (trimmed.length < LONG_PROMPT_BYPASS_LENGTH && !hasSalience(trimmed)) {
      dRecall("low-salience query skipped: %s", trimmed.slice(0, 40))
      return 0
    }
    const t = now()
    // lastQueryAt === 0 means we've never queried yet — always admit
    // the first probe regardless of how the test clock starts.
    if (lastQueryAt !== 0 && t - lastQueryAt < rateLimitMs) {
      dRecall("rate-limited %s (last=%d, now=%d, gap=%d)", trimmed.slice(0, 40), lastQueryAt, t, t - lastQueryAt)
      return 0
    }
    // Reserve the window BEFORE awaiting the query so concurrent
    // probes can't slip through. If the query fails we still consume
    // the window — failures are usually transient (daemon down, db
    // locked) and retrying immediately would not help.
    lastQueryAt = t

    let hits: readonly RecallHit[]
    try {
      hits = await query(trimmed)
    } catch (err) {
      dRecall("query failed for %s: %s", trimmed.slice(0, 40), err)
      return 0
    }
    if (hits.length === 0) {
      dRecall("no hits for %s", trimmed.slice(0, 40))
      return 0
    }
    // V2 content gate: drop hits whose summary signals its own
    // irrelevance — stored verdicts ("orthogonal"/"incidental"),
    // SUPERSEDED/REJECTED outcomes. Mirrors the inject-delta V2 body
    // pattern. Conservative — requires the keyword in a labeled
    // position (e.g., `"verdict": "orthogonal"`).
    const filtered = hits.filter((h) => !containsRejectedSignal(h.summary))
    if (filtered.length === 0) {
      dRecall("all hits filtered by rejected-signal gate for %s", trimmed.slice(0, 40))
      return 0
    }
    const content = formatDigest(trimmed, filtered)
    if (content.length === 0) return 0
    const ok = emit({
      id: makeNotificationEventId(SOURCE),
      source: SOURCE,
      timestamp: Date.now(),
      content,
      meta: {
        kind: "recall-digest",
        query: trimmed,
        hitCount: filtered.length,
        sessionIds: filtered.map((h) => h.sessionId).filter((s): s is string => typeof s === "string"),
      },
    })
    return ok ? 1 : 0
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
  }
  opts.scope.defer(dispose)
  return { dispose, probe }
}

/**
 * Build a one-line digest body summarizing the top recall hits. Format:
 *
 *   `[recall] N prior sessions discussed "<query>": <session abc> — <summary>; <session def> — <summary>; …`
 *
 * Trimmed to the top `RECALL_DIGEST_HITS` entries; remaining hits get
 * a `+N more` suffix. Each hit's summary is single-line-folded so a
 * multi-line transcript snippet doesn't blow up the row.
 */
function formatDigest(query: string, hits: readonly RecallHit[]): string {
  const top = hits.slice(0, RECALL_DIGEST_HITS)
  const parts = top.map((h) => {
    const sid = h.sessionId ? `session ${shortSession(h.sessionId)}` : "session"
    const summary = h.summary.replace(/\s+/g, " ").trim().slice(0, 120)
    return `${sid} — ${summary}`
  })
  const more = hits.length > top.length ? `; +${hits.length - top.length} more` : ""
  return `[recall] ${hits.length} prior session${hits.length === 1 ? "" : "s"} discussed "${query}": ${parts.join("; ")}${more}`
}

function shortSession(id: string): string {
  // Session ids in the recall output are full UUIDs; an 8-char prefix
  // is enough to disambiguate within a typical day's worth of history.
  return id.slice(0, 8)
}

// ────────────────────────────────────────────────────────────────────
// Real recall query — subprocess fallback
// ────────────────────────────────────────────────────────────────────

/**
 * Build the production query fn. Spawns `bun
 * vendor/bearly/tools/recall.ts <query> --raw --json` against
 * `repoRoot` (auto-detected from `process.cwd()` if not provided).
 * Returns an empty array on any failure — recall is a best-effort
 * signal, never blocks the conversation.
 */
function defaultRecallQuery(scope: Scope, repoRootHint?: string): RecallQueryFn {
  return async (query: string): Promise<readonly RecallHit[]> => {
    const root = repoRootHint ?? findRepoRoot(process.cwd())
    if (!root) {
      dRecall("no repo root found — recall unavailable")
      return []
    }
    return runRecallCli(scope, query, root)
  }
}

/**
 * Walk up from `start` looking for an ancestor that contains
 * `vendor/bearly/tools/recall.ts`. Returns the absolute repo root
 * path, or `null` if we hit `/` without finding it.
 */
function findRepoRoot(start: string): string | null {
  let dir = start
  for (let i = 0; i < 16; i++) {
    if (existsSync(join(dir, "vendor/bearly/tools/recall.ts"))) return dir
    const parent = join(dir, "..")
    if (parent === dir) return null
    dir = parent
  }
  return null
}

/**
 * Spawn the recall CLI and parse its JSON output. The CLI prints a
 * banner to stderr (`Searching: "..." last 30d`) and the JSON object
 * to stdout. We tolerate stderr noise and a missing `results` key.
 */
async function runRecallCli(scope: Scope, query: string, cwd: string): Promise<readonly RecallHit[]> {
  return new Promise((resolve) => {
    const args = [
      "vendor/bearly/tools/recall.ts",
      query,
      "--raw",
      "--json",
      "--limit",
      String(RECALL_QUERY_LIMIT),
      "--timeout",
      String(RECALL_QUERY_TIMEOUT_MS),
    ]
    const child = spawn("bun", args, { cwd, stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    child.stdout?.on("data", (b: Buffer) => {
      stdout += b.toString("utf8")
    })
    // We don't care about stderr — the CLI uses it for logs.
    child.stderr?.on("data", () => undefined)
    let cancelKillTimer = (): void => {}
    child.on("error", (err) => {
      cancelKillTimer()
      dRecall("spawn error: %s", err.message)
      resolve([])
    })
    cancelKillTimer = scope.timeout(() => {
      try {
        child.kill()
      } catch {
        /* ignore */
      }
    }, RECALL_QUERY_TIMEOUT_MS + 2_000)
    child.on("close", () => {
      cancelKillTimer()
      resolve(parseRecallStdout(stdout))
    })
  })
}

/**
 * Parse the recall CLI stdout. Tolerant of leading/trailing
 * non-JSON noise — we extract the first balanced `{...}` block.
 */
export function parseRecallStdout(stdout: string): readonly RecallHit[] {
  const json = extractFirstJsonObject(stdout)
  if (!json) return []
  try {
    const parsed = JSON.parse(json) as {
      results?: Array<{
        sourceId?: string
        sessionId?: string
        snippet?: string
        title?: string | null
      }>
    }
    const results = parsed.results
    if (!Array.isArray(results)) return []
    const hits: RecallHit[] = []
    for (const r of results) {
      const summary = r.snippet ?? r.title ?? ""
      if (!summary || typeof summary !== "string") continue
      hits.push({
        token: "recall",
        summary,
        sessionId:
          typeof r.sessionId === "string" ? r.sessionId : typeof r.sourceId === "string" ? r.sourceId : undefined,
      })
    }
    return hits
  } catch (err) {
    dRecall("json parse failed: %s", (err as Error).message)
    return []
  }
}

function extractFirstJsonObject(s: string): string | null {
  const start = s.indexOf("{")
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === "{") depth++
    else if (ch === "}") {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

/**
 * Test + controller surface: probe a query through a freshly-registered
 * adapter. Returns the number of events actually enqueued (0 or 1).
 *
 * The controller wires this up by calling
 * `triggerRecallProbe({ scope, queue, ... }, query)` from its
 * per-session message-emit hook. Tests call it with an injected `query`
 * fn so the subprocess never runs.
 */
export async function triggerRecallProbe(opts: RecallAdapterOptions, query: string): Promise<number> {
  const handle = registerRecallNotificationAdapterHandle(opts)
  try {
    return await handle.probe(query)
  } finally {
    handle.dispose()
  }
}
