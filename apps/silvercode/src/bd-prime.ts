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
 */

import { execSync } from "node:child_process"

export type BdActiveState = {
  beadId?: string
  title?: string
  worktree?: string
}

/** Cached once per process — bd prime output rarely changes within a session. */
let cached: string | null = null

export function bdPrimeOutput(cwd: string): string {
  if (cached !== null) return cached
  try {
    const out = execSync("bd prime --silent 2>/dev/null || bd prime 2>/dev/null || true", {
      cwd,
      timeout: 3000,
      encoding: "utf8",
    })
    cached = typeof out === "string" ? out.trim() : ""
  } catch {
    cached = ""
  }
  return cached
}

export function readActiveBead(cwd: string): BdActiveState {
  try {
    const out = execSync("bd list --status=in_progress --limit=1 --json 2>/dev/null || true", {
      cwd,
      timeout: 2000,
      encoding: "utf8",
    })
    if (!out) return {}
    const parsed = JSON.parse(out) as Array<{ id?: string; title?: string; worktree?: string }>
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
