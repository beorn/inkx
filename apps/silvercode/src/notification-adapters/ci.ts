/**
 * CI notification adapter — polls `gh api repos/:owner/:repo/commits/<sha>/check-runs`
 * for the current branch every 30s and emits `source: "ci"` notification
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
import type { NotificationAdapterCtx } from "./types.ts"
import { createDebouncedEmit, makeNotificationEventId } from "./types.ts"

const dCi = createDebug("silvercode:notification:ci")

const SOURCE = "ci" as const

export const DEFAULT_CI_POLL_MS = 30_000

export type CiAdapterOptions = NotificationAdapterCtx & {
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
  readonly htmlUrl?: string
  readonly detailsUrl?: string
  readonly output?: {
    readonly title?: string
    readonly summary?: string
    readonly text?: string
  }
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
      htmlUrl:
        typeof (r as { html_url?: unknown }).html_url === "string" ? (r as { html_url: string }).html_url : undefined,
      detailsUrl:
        typeof (r as { details_url?: unknown }).details_url === "string"
          ? (r as { details_url: string }).details_url
          : undefined,
      output: parseCheckOutput((r as { output?: unknown }).output),
    })
  }
  return { branch, sha, runs }
}

function parseCheckOutput(value: unknown): CheckRun["output"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const output = {
    title: typeof record["title"] === "string" ? record["title"] : undefined,
    summary: typeof record["summary"] === "string" ? record["summary"] : undefined,
    text: typeof record["text"] === "string" ? record["text"] : undefined,
  }
  return output.title || output.summary || output.text ? output : undefined
}

function aggregateCi(runs: readonly CheckRun[]): "failure" | "success" | "pending" {
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

function failedRuns(runs: readonly CheckRun[]): CheckRun[] {
  return runs.filter(
    (r) =>
      r.conclusion === "failure" ||
      r.conclusion === "cancelled" ||
      r.conclusion === "timed_out" ||
      r.conclusion === "action_required",
  )
}

function firstRunHref(runs: readonly CheckRun[]): string | undefined {
  for (const run of runs) {
    if (run.htmlUrl) return run.htmlUrl
    if (run.detailsUrl) return run.detailsUrl
  }
  return undefined
}

function formatRunDetails(run: CheckRun): string {
  const lines = [`- ${run.name || "unnamed check"}: ${run.conclusion || run.status || "unknown"}`]
  if (run.output?.title) lines.push(`  ${run.output.title}`)
  if (run.output?.summary) lines.push(`  ${run.output.summary}`)
  if (run.output?.text) lines.push(`  ${run.output.text}`)
  if (run.htmlUrl) lines.push(`  ${run.htmlUrl}`)
  if (run.detailsUrl && run.detailsUrl !== run.htmlUrl) lines.push(`  ${run.detailsUrl}`)
  return lines.join("\n")
}

function ciDetails(runs: readonly CheckRun[]): string | undefined {
  if (runs.length === 0) return undefined
  return runs.map(formatRunDetails).join("\n")
}

export type CiDiffEvent = {
  readonly content: string
  readonly meta?: Readonly<Record<string, unknown>>
}

/**
 * Compare two probe snapshots and produce a one-line content for any
 * notable transition. Returns null when nothing changed worth surfacing.
 */
export function diffCi(
  prev: { sha: string; runs: readonly CheckRun[] } | null,
  next: { sha: string; runs: readonly CheckRun[] },
): string | null {
  return diffCiEvent(prev, next)?.content ?? null
}

export function diffCiEvent(
  prev: { sha: string; runs: readonly CheckRun[] } | null,
  next: { sha: string; runs: readonly CheckRun[] },
): CiDiffEvent | null {
  if (next.runs.length === 0) return null
  const prevAgg = prev ? aggregateCi(prev.runs) : null
  const nextAgg = aggregateCi(next.runs)
  if (prev && prev.sha === next.sha && prevAgg === nextAgg) return null
  const failed = failedRuns(next.runs)
  const sha7 = next.sha.slice(0, 7)
  if (nextAgg === "failure") {
    const names = failed
      .map((r) => r.name)
      .filter(Boolean)
      .slice(0, 3)
      .join(", ")
    const href = firstRunHref(failed)
    const details = ciDetails(failed)
    return {
      content: `[ci ${sha7}] failure${names ? `: ${names}` : ""}`,
      meta: {
        kind: "ci-state",
        sha: next.sha,
        href,
        details,
        failedChecks: failed.map((r) => r.name).filter(Boolean),
      },
    }
  }
  if (nextAgg === "success") {
    return {
      content: `[ci ${sha7}] all checks passing`,
      meta: { kind: "ci-state", sha: next.sha, href: firstRunHref(next.runs), details: ciDetails(next.runs) },
    }
  }
  return {
    content: `[ci ${sha7}] checks pending (${next.runs.length})`,
    meta: { kind: "ci-state", sha: next.sha, href: firstRunHref(next.runs), details: ciDetails(next.runs) },
  }
}

/**
 * Register the CI adapter. Returns a synchronous disposer; the scope's
 * AbortSignal cancels the next scheduled tick.
 */
export function registerCiNotificationAdapter(opts: CiAdapterOptions): () => void {
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
        const diff = diffCiEvent(prev, next)
        if (diff) {
          emit({
            id: makeNotificationEventId(SOURCE),
            source: SOURCE,
            timestamp: Date.now(),
            content: diff.content,
            meta: { ...diff.meta, kind: "ci-state", branch: next.branch, sha: next.sha },
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
