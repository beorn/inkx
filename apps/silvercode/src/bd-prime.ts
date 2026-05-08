/**
 * `bd prime` replacement for silvercode sessions (M3).
 *
 * When the harness runs with `--bare`, the user's own bd prime SessionStart
 * hook doesn't fire inside the subprocess. This module invokes `bd prime`
 * (via subprocess) and returns its output so the harness can inject it as
 * an activeBead context reminder.
 *
 * Errors are swallowed — if bd isn't on PATH or no beads workspace exists,
 * the injector simply returns nothing instead of blocking the user's turn.
 *
 * Sync vs async
 * -------------
 * `bd prime` and `bd list` historically ran synchronously via `execSync`
 * with multi-second timeouts. The first call lives inside the spawn
 * factory's sync prologue (controller.ts → makeInjectors), which means a
 * cold `bd` invocation (Dolt server cold-start, slow shell) blocked the
 * silvery render flush — UI mount stalled for as long as `bd prime` took,
 * showing a blank alt-screen for up to 3 s (the timeout) and longer in
 * environments where the timeout fires after the underlying spawn is
 * already past it.
 *
 * Fix: expose async cached promises (`bdPrimeOutputAsync`,
 * `readActiveBeadAsync`) plus sync peeks (`bdPrimePeek`,
 * `readActiveBeadPeek`) that return the cached result if already
 * resolved, or `null` / empty otherwise. The controller pre-warms both
 * caches asynchronously after spawn so the first injector run usually
 * sees a fully populated cache without ever blocking the event loop.
 *
 * The legacy sync entry points (`bdPrimeOutput`, `readActiveBead`) are
 * kept for tests + non-startup callers that have no UI to stall.
 */

import { execSync, spawn } from "node:child_process"
import { createLogger } from "loggily"
import { createScope } from "@silvery/scope"

const log = createLogger("silvercode:bd-prime")

export type BdActiveState = {
  beadId?: string
  title?: string
  worktree?: string
}

/** Resolved bd prime output, populated by the async path. */
let cachedPrime: string | null = null
let primePromise: Promise<string> | null = null

/** Resolved active-bead state, populated by the async path. */
let cachedActive: BdActiveState | null = null
let activePromise: Promise<BdActiveState> | null = null

/**
 * Async, cached `bd prime` probe. First call kicks off the spawn;
 * subsequent calls share the same promise. Resolves to the trimmed
 * output, or `""` on failure / timeout.
 */
export function bdPrimeOutputAsync(cwd: string): Promise<string> {
  if (cachedPrime !== null) return Promise.resolve(cachedPrime)
  if (primePromise) return primePromise
  primePromise = runBdPrime(cwd).then((out) => {
    cachedPrime = out
    return out
  })
  return primePromise
}

/** Sync peek into the bd-prime cache. Returns "" if not yet resolved. */
export function bdPrimePeek(): string {
  return cachedPrime ?? ""
}

/**
 * Async, cached active-bead probe. Same shape as `bdPrimeOutputAsync`.
 */
export function readActiveBeadAsync(cwd: string): Promise<BdActiveState> {
  if (cachedActive !== null) return Promise.resolve(cachedActive)
  if (activePromise) return activePromise
  activePromise = runBdList(cwd).then((state) => {
    cachedActive = state
    return state
  })
  return activePromise
}

/** Sync peek into the active-bead cache. Returns `{}` if not yet resolved. */
export function readActiveBeadPeek(): BdActiveState {
  return cachedActive ?? {}
}

/**
 * Legacy sync `bd prime`. Avoid in startup-critical paths — use
 * `bdPrimeOutputAsync` + `bdPrimePeek` instead. Retained so tests and
 * non-UI callers (where blocking is acceptable) continue to work.
 */
export function bdPrimeOutput(cwd: string): string {
  if (cachedPrime !== null) return cachedPrime
  try {
    const out = execSync("bd prime --silent 2>/dev/null || bd prime 2>/dev/null || true", {
      cwd,
      timeout: 3000,
      encoding: "utf8",
    })
    cachedPrime = typeof out === "string" ? out.trim() : ""
  } catch {
    cachedPrime = ""
  }
  return cachedPrime
}

/**
 * Legacy sync active-bead. Avoid in startup-critical paths — use
 * `readActiveBeadAsync` + `readActiveBeadPeek` instead.
 */
export function readActiveBead(cwd: string): BdActiveState {
  if (cachedActive !== null) return cachedActive
  try {
    const out = execSync("bd list --status=in_progress --limit=1 --json 2>/dev/null || true", {
      cwd,
      timeout: 2000,
      encoding: "utf8",
    })
    if (!out) {
      cachedActive = {}
      return cachedActive
    }
    cachedActive = parseActive(out)
  } catch {
    cachedActive = {}
  }
  return cachedActive
}

/**
 * Test-only — clear caches so successive tests can re-probe.
 */
export function resetBdPrimeCacheForTests(): void {
  cachedPrime = null
  cachedActive = null
  primePromise = null
  activePromise = null
}

function runBdPrime(cwd: string): Promise<string> {
  const t0 = Date.now()
  return runShell(cwd, "bd prime --silent 2>/dev/null || bd prime 2>/dev/null || true", 3000)
    .then((raw) => {
      const trimmed = raw.trim()
      log.debug?.("primeReady", { elapsedMs: Date.now() - t0, bytes: trimmed.length })
      return trimmed
    })
    .catch((err) => {
      log.debug?.("primeFailed", {
        elapsedMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      })
      return ""
    })
}

function runBdList(cwd: string): Promise<BdActiveState> {
  const t0 = Date.now()
  return runShell(cwd, "bd list --status=in_progress --limit=1 --json 2>/dev/null || true", 2000)
    .then((raw) => {
      log.debug?.("activeReady", { elapsedMs: Date.now() - t0, bytes: raw.length })
      return raw.length === 0 ? {} : parseActive(raw)
    })
    .catch((err) => {
      log.debug?.("activeFailed", {
        elapsedMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      })
      return {}
    })
}

function parseActive(raw: string): BdActiveState {
  try {
    const parsed = JSON.parse(raw) as Array<{ id?: string; title?: string; worktree?: string }>
    if (!Array.isArray(parsed) || parsed.length === 0) return {}
    const first = parsed[0]
    return {
      beadId: first?.id,
      title: first?.title,
      worktree: first?.worktree,
    }
  } catch {
    return {}
  }
}

/**
 * Run a shell command asynchronously. Resolves on clean exit (any code)
 * with the captured stdout. Rejects only on spawn error or timeout.
 *
 * The shell wrapper preserves the original `|| true` fallback semantics
 * so a missing `bd` binary still resolves to "".
 */
function runShell(cwd: string, cmd: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const scope = createScope("bd-prime-shell")
    const child = spawn("sh", ["-c", cmd], {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
    })
    let out = ""
    let settled = false
    const cancelTimer = scope.timeout(
      () => {
        if (settled) return
        settled = true
        child.kill("SIGKILL")
        reject(new Error(`timeout after ${timeoutMs}ms`))
      },
      timeoutMs,
      { unref: true },
    )
    child.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8")
    })
    child.on("error", (err) => {
      if (settled) return
      settled = true
      cancelTimer()
      void scope[Symbol.asyncDispose]()
      reject(err)
    })
    child.on("close", () => {
      if (settled) return
      settled = true
      cancelTimer()
      void scope[Symbol.asyncDispose]()
      resolve(out)
    })
  })
}
