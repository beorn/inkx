/**
 * CI ambient adapter — polls `gh api repos/:owner/:repo/commits/<sha>/check-runs`
 * for the current branch every 30s and emits `source: "ci"` ambient
 * events on state change.
 *
 * The poller is intentionally simple: we shell out to `gh` (already in
 * the user's path — silvercode is dogfooded on a developer workstation),
 * parse JSON, and compare the most-recent check conclusion to the
 * previous tick. State transitions (e.g. queued → in_progress, success →
 * failure) are observable; static states emit nothing.
 *
 * Failure modes:
 *
 *   - `gh` not authenticated → `gh` exits non-zero with a stderr blob.
 *     We catch it, log to the silvercode debug namespace, and emit
 *     nothing. The next tick retries — transient failures self-heal.
 *   - No remote / not on a github branch → first probe yields no commits;
 *     we set the adapter to a quiet idle state (still ticks but never
 *     emits) until the situation changes.
 *   - User exits the network → same as auth failure. Quiet retry.
 *
 * The 30s interval is a default, not a contract. Tests pass `pollMs:
 * <small>` and a `now()` function; they then drive ticks manually via the
 * exported `tickCiForTest` helper instead of waiting for real timers.
 */

import { spawn } from "node:child_process"
import createDebug from "debug"
import type { AmbientAdapterCtx } from "./types.ts"
import { createDebouncedEmit, makeAmbientEventId } from "./types.ts"

const dCi = createDebug("silvercode:ambient:ci")

const SOURCE = "ci" as const

export const DEFAULT_CI_POLL_MS = 30_000

export type CiAdapterOptions = AmbientAdapterCtx & {
  /** Repo cwd; default `process.cwd()`. */
  readonly cwd?: string
  /** Poll interval in ms; default 30s. */
  readonly pollMs?: number
  /**
   * Override the gh runner — used by tests so we don't fork a real `gh`
   * subprocess. Returns `{stdout, code}`; non-zero `code` is treated as
   * a transient failure.
   */
  readonly runGh?: (args: readonly string[], cwd: string) => Promise<{ stdout: string; code: number }>
  /**
   * Override `git rev-parse` for tests. Returns the current branch name +
   * head sha; empty string for unknown.
   */
  readonly gitState?: (cwd: string) => Promise<{ branch: string; sha: string }>
}

type CheckConclusion =
  | "success"
  | "failure"
  | "neutral"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | "stale"
  | ""
type CheckStatus = "queued" | "in_progress" | "completed" | ""

type CheckRun = {
  readonly name: string
  readonly status: CheckStatus
  readonly conclusion: CheckConclusion
}

type CheckRunsResponse = {
  readonly check_runs?: readonly Partial<CheckRun>[]
}

function defaultRunGh(args: readonly string[], cwd: string): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn("gh", [...args], { cwd, stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    child.stdout?.on("data", (b: Buffer) => {
      stdout += b.toString("utf8")
    })
    child.on("error", () => resolve({ stdout: "", code: 127 }))
    child.on("close", (code) => resolve({ stdout, code: code ?? 0 }))
  })
}

function defaultGitState(cwd: string): Promise<{ branch: string; sha: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd, stdio: ["ignore", "pipe", "ignore"] })
    let branch = ""
    child.stdout?.on("data", (b: Buffer) => {
      branch += b.toString("utf8")
    })
    child.on("close", () => {
      const child2 = spawn("git", ["rev-parse", "HEAD"], { cwd, stdio: ["ignore", "pipe", "ignore"] })
      let sha = ""
      child2.stdout?.on("data", (b: Buffer) => {
        sha += b.toString("utf8")
      })
      child2.on("error", () => resolve({ branch: branch.trim(), sha: "" }))
      child2.on("close", () => resolve({ branch: branch.trim(), sha: sha.trim() }))
    })
    child.on("error", () => resolve({ branch: "", sha: "" }))
  })
}

/**
 * One concrete tick: returns the parsed check-run summary for the current
 * head sha, or null if we couldn't get one. Pure-ish — only side effects
 * are the runGh/gitState calls the caller injects.
 */
export async function probeCiOnce(opts: {
  cwd: string
  runGh: NonNullable<CiAdapterOptions["runGh"]>
  gitState: NonNullable<CiAdapterOptions["gitState"]>
}): Promise<{ branch: string; sha: string; runs: readonly CheckRun[] } | null> {
  const { branch, sha } = await opts.gitState(opts.cwd)
  if (!sha) return null
  // `gh api` for check-runs at the head sha — this is what the GH UI uses
  // for the branch checks badge.
  const { stdout, code } = await opts.runGh(
    ["api", `repos/{owner}/{repo}/commits/${sha}/check-runs`, "--jq", ".check_runs"],
    opts.cwd,
  )
  if (code !== 0) {
    dCi("gh failed code=%d", code)
    return { branch, sha, runs: [] }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return { branch, sha, runs: [] }
  }
  const arr = Array.isArray(parsed)
    ? (parsed as readonly Partial<CheckRun>[])
    : ((parsed as CheckRunsResponse)?.check_runs ?? [])
  const runs: CheckRun[] = []
  for (const r of arr) {
    runs.push({
      name: typeof r.name === "string" ? r.name : "",
      status: (typeof r.status === "string" ? r.status : "") as CheckStatus,
      conclusion: (typeof r.conclusion === "string" ? r.conclusion : "") as CheckConclusion,
    })
  }
  return { branch, sha, runs }
}

/**
 * Compare two probe snapshots and produce a one-line content for any
 * notable transition. Returns null when nothing changed worth surfacing.
 */
export function diffCi(
  prev: { sha: string; runs: readonly CheckRun[] } | null,
  next: { sha: string; runs: readonly CheckRun[] },
): string | null {
  if (next.runs.length === 0) return null
  // Aggregate state: failure if any conclusion is failure/cancelled/timed_out;
  // success if all completed and all conclusions are success;
  // pending otherwise.
  const aggregate = (runs: readonly CheckRun[]): "failure" | "success" | "pending" => {
    let allCompleted = true
    let anyFailure = false
    for (const r of runs) {
      if (r.status !== "completed") allCompleted = false
      if (
        r.conclusion === "failure" ||
        r.conclusion === "cancelled" ||
        r.conclusion === "timed_out" ||
        r.conclusion === "action_required"
      ) {
        anyFailure = true
      }
    }
    if (anyFailure) return "failure"
    if (allCompleted) return "success"
    return "pending"
  }
  const prevAgg = prev ? aggregate(prev.runs) : null
  const nextAgg = aggregate(next.runs)
  if (prev && prev.sha === next.sha && prevAgg === nextAgg) return null
  const failed = next.runs.filter((r) => r.conclusion === "failure" || r.conclusion === "cancelled")
  const sha7 = next.sha.slice(0, 7)
  if (nextAgg === "failure") {
    const names = failed
      .map((r) => r.name)
      .filter(Boolean)
      .slice(0, 3)
      .join(", ")
    return `[ci ${sha7}] failure${names ? `: ${names}` : ""}`
  }
  if (nextAgg === "success") return `[ci ${sha7}] all checks passing`
  return `[ci ${sha7}] checks pending (${next.runs.length})`
}

/**
 * Register the CI adapter. Returns a synchronous disposer; the scope's
 * AbortSignal cancels the next scheduled tick.
 */
export function registerCiAmbientAdapter(opts: CiAdapterOptions): () => void {
  const cwd = opts.cwd ?? process.cwd()
  const pollMs = opts.pollMs ?? DEFAULT_CI_POLL_MS
  const runGh = opts.runGh ?? defaultRunGh
  const gitState = opts.gitState ?? defaultGitState
  const emit = createDebouncedEmit(opts)
  let prev: { sha: string; runs: readonly CheckRun[] } | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  async function tick(): Promise<void> {
    if (disposed) return
    try {
      const next = await probeCiOnce({ cwd, runGh, gitState })
      if (!next) {
        dCi("no head sha — skipping tick")
      } else {
        const content = diffCi(prev, next)
        if (content) {
          emit({
            id: makeAmbientEventId(SOURCE),
            source: SOURCE,
            timestamp: Date.now(),
            content,
            meta: { kind: "ci-state", branch: next.branch, sha: next.sha },
          })
        }
        prev = { sha: next.sha, runs: next.runs }
      }
    } catch (err) {
      dCi("tick error: %s", err)
    }
    if (!disposed) timer = setTimeout(runTick, pollMs)
  }

  // setTimeout expects a void-returning fn; wrap so we don't leak the
  // promise (and so eslint's no-misused-promises stays happy).
  const runTick = (): void => {
    void tick()
  }

  // Kick off the first tick on the next event-loop turn — keeps the
  // register call non-blocking. Production paths don't await this.
  timer = setTimeout(runTick, 0)

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    if (timer) clearTimeout(timer)
    timer = null
  }
  opts.scope.defer(dispose)
  return dispose
}
