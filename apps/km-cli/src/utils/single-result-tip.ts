/**
 * Session-counter for the single-result-tip suggestion.
 *
 * When `km task list` (or one of its presets — `ready`, `blocked`, etc.)
 * returns exactly one task, we show a tip line:
 *
 *     Tip: use `km task show <id>` for full detail.
 *
 * After the tip has been shown enough times that the user "got it", we
 * stop. The threshold is on-disk so it survives across CLI invocations
 * (which is the whole point — a per-process counter is useless for a
 * one-shot CLI). State lives at:
 *
 *     ~/.local/state/km/single-result-tip-count
 *
 * Contents: a single base-10 integer (the times-shown count). The file
 * is created on first show, incremented on each subsequent show, and
 * read by every list command before deciding whether to render the tip.
 *
 * Failure modes are non-fatal: if we can't read or write the counter,
 * the tip is shown (better to over-show than to silently break). The
 * impact of a single accidental re-show is one extra line of output.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

/** How many times the tip is shown before being suppressed. */
export const SINGLE_RESULT_TIP_THRESHOLD = 3

function counterFilePath(): string {
  // Honor XDG_STATE_HOME when set (Linux / overrides), else default to
  // `~/.local/state/km/`. Hard-coded `home/.local/state` matches the bead
  // spec — the file is one level deep so we ensure the dir exists.
  const xdg = process.env.XDG_STATE_HOME?.trim()
  const base = xdg && xdg.length > 0 ? xdg : join(homedir(), ".local", "state")
  return join(base, "km", "single-result-tip-count")
}

function readCounter(path: string): number {
  if (!existsSync(path)) return 0
  try {
    const raw = readFileSync(path, "utf8").trim()
    const n = parseInt(raw, 10)
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

function writeCounter(path: string, value: number): void {
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${value}\n`, "utf8")
  } catch {
    // Best-effort — over-showing the tip once is harmless.
  }
}

/**
 * Should we show the single-result tip on this invocation?
 *
 * Reads the counter file; returns `true` if the user has seen it less
 * than {@link SINGLE_RESULT_TIP_THRESHOLD} times. Side-effect: when
 * `true`, increments the counter so the next call returns `false`
 * after threshold is reached.
 *
 * Tests can override the counter file via `path` (used to keep the
 * suite hermetic — no writes to the user's home dir from CI).
 */
export function shouldShowSingleResultTip(path: string = counterFilePath()): boolean {
  const current = readCounter(path)
  if (current >= SINGLE_RESULT_TIP_THRESHOLD) return false
  writeCounter(path, current + 1)
  return true
}

/** Inspect the current counter without mutating. Useful for tests. */
export function readSingleResultTipCount(path: string = counterFilePath()): number {
  return readCounter(path)
}

/** Reset the counter. Useful for tests. */
export function resetSingleResultTipCount(path: string = counterFilePath()): void {
  writeCounter(path, 0)
}
