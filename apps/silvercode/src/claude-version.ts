/**
 * Probe `claude --version` asynchronously, once per process.
 *
 * Why async: `claude --version` typically returns in ~30ms but has been
 * observed at >2s when the active Claude config dir's OAuth refresh token
 * is stale (the CLI does a network refresh during `--version`). A
 * synchronous spawn at module-load blocks the JS event loop and starves
 * silvery's first paint, leaving the alt-screen blank until the probe
 * resolves.
 *
 * Shape: `getClaudeVersion()` returns a cached `Promise<string | null>`.
 * Callers consume it via React 19's `use(...)` inside a `<Suspense>`
 * boundary so the rest of the UI mounts immediately and the version
 * row is the only thing waiting on the probe.
 *
 * The output format is `2.1.119 (Claude Code)`; the first
 * whitespace-separated token is the semver. Returns `null` if the binary
 * isn't found, the spawn errors, or the output doesn't match the expected
 * shape — `use(...)` will then resolve to `null` and the caller renders
 * its placeholder.
 *
 * Test injection
 * --------------
 * Tests inject a fake version via `setVersionFactoryOverride()` (preferred,
 * type-safe) or by setting `SILVERCODE_FAKE_CLAUDE_VERSION=<string>` before
 * the module is imported. Both bypass the spawn so visual tests don't read
 * the host's installed CLI.
 */

import { spawn } from "node:child_process"
import { createLogger } from "loggily"

const log = createLogger("silvercode:claude-version")

/** Test-only override. When set, replaces the spawn-based probe entirely. */
let versionOverride: (() => string | null) | null = null

/**
 * Test-only: install a fake version probe. Pass `null` to clear. Also
 * resets the cached promise so the next `getClaudeVersion()` call picks
 * up the override.
 *
 * Production callers MUST NOT use this.
 */
export function setVersionFactoryOverride(factory: (() => string | null) | null): void {
  versionOverride = factory
  cachedPromise = null
}

let cachedPromise: Promise<string | null> | null = null

/**
 * Returns a cached promise resolving to the installed `claude` semver,
 * or `null` if the probe failed. Safe to call from any number of
 * components — the first call kicks off the spawn, subsequent calls
 * reuse the same promise.
 *
 * Suitable for `use(...)` inside a `<Suspense>` boundary.
 */
export function getClaudeVersion(): Promise<string | null> {
  if (cachedPromise) return cachedPromise
  cachedPromise = probeAsync()
  return cachedPromise
}

async function probeAsync(): Promise<string | null> {
  if (versionOverride) return versionOverride()
  const envFake = process.env.SILVERCODE_FAKE_CLAUDE_VERSION
  if (typeof envFake === "string" && envFake.length > 0) return envFake
  const t0 = Date.now()
  try {
    const out = await runClaudeVersion()
    const elapsed = Date.now() - t0
    const m = out.match(/^(\d+\.\d+\.\d+\S*)/)
    const version = m?.[1] ?? null
    log.debug?.("probed", { elapsedMs: elapsed, version })
    return version
  } catch (err) {
    log.debug?.("probeFailed", {
      elapsedMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

function runClaudeVersion(): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["--version"], { stdio: ["ignore", "pipe", "ignore"] })
    let out = ""
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill("SIGKILL")
      reject(new Error("timeout"))
    }, 2000)
    ;(timer as unknown as { unref?: () => void }).unref?.()
    child.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8")
    })
    child.on("error", (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })
    child.on("close", (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0) reject(new Error(`exit ${code}`))
      else resolve(out.trim())
    })
  })
}
