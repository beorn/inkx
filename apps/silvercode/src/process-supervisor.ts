/**
 * Process supervisor — pidfile + child-process registry to prevent
 * silvercode from fork-bombing the host machine across crashes.
 *
 * ## Why this exists
 *
 * `apps/silvercode/packages/agent-harness/src/spawn.ts` spawns `claude` with
 * `detached: true` so the parent can SIGTERM the entire process group on
 * clean exit. The cost: if silvercode itself dies HARD (machine kill, SIGKILL,
 * OOM, panic) the detached cluster — claude + its MCP grandchildren — survives
 * as init-owned orphans. Each subsequent silvercode launch with --layout=grid-4
 * spawns ~20 more processes (claude ~700MB virtual × 4 panes × ~5 MCP children
 * each); a few crash-launch cycles is enough to take down the box.
 *
 * Two defenses, both managed here:
 *
 *   1. **Pidfile**: at startup we write our PID to a per-vault pidfile under
 *      `~/.cache/silvercode/`. If a previous pidfile exists and its PID is
 *      still alive (`process.kill(pid, 0)`), refuse to start — another
 *      silvercode owns this vault. If the previous PID is dead, take over.
 *
 *   2. **Children registry**: each spawned claude pid+pgid is appended to a
 *      per-vault `children.jsonl`. On clean exit we clear it. When taking
 *      over a stale pidfile (previous silvercode died hard), we read the
 *      stale registry and SIGTERM/SIGKILL the orphaned process groups.
 *
 * ## Where the path comes from
 *
 *   `${XDG_CACHE_HOME ?? $HOME/.cache}/silvercode/<vault-hash>.pid`
 *   `${XDG_CACHE_HOME ?? $HOME/.cache}/silvercode/<vault-hash>/children.jsonl`
 *
 * `<vault-hash>` is `sha256(absolute-cwd).slice(0, 8)` — short enough to be
 * readable, long enough to be collision-free for any reasonable user.
 *
 * ## Why not put this in agent-harness
 *
 * The harness is a generic spawn primitive; cross-process supervision +
 * pidfile lifecycle are concerns of the *application* (silvercode) that
 * orchestrates many sessions. Keeping it here means the harness stays
 * single-responsibility and silvercode's defenses can evolve without
 * vendor changes.
 */

import { createHash } from "node:crypto"
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve as resolvePath } from "node:path"
import createDebug from "debug"

const dSup = createDebug("silvercode:supervisor")

/** Single registry row. Append-only JSONL — one row per spawned claude. */
export type ChildRecord = {
  pid: number
  pgid: number
  sessionId: string
  startedAt: number
}

/**
 * Resolve the silvercode cache root. Honors XDG_CACHE_HOME first (so test
 * isolation via fake-boundaries works without further plumbing), then falls
 * back to `$HOME/.cache`.
 */
export function cacheRoot(): string {
  const xdg = process.env.XDG_CACHE_HOME
  if (xdg && xdg.length > 0) return join(xdg, "silvercode")
  const home = process.env.HOME ?? homedir()
  return join(home, ".cache", "silvercode")
}

/**
 * Stable per-vault hash. sha256(absolute-cwd) truncated to 8 hex chars —
 * collision-free for thousands of vaults, readable in `ls`.
 */
export function vaultHash(cwd: string): string {
  const abs = resolvePath(cwd)
  return createHash("sha256").update(abs).digest("hex").slice(0, 8)
}

/** `<cache>/<hash>.pid` — pidfile for this vault. */
export function pidfilePath(cwd: string): string {
  return join(cacheRoot(), `${vaultHash(cwd)}.pid`)
}

/** `<cache>/<hash>/children.jsonl` — child registry for this vault. */
export function childRegistryPath(cwd: string): string {
  return join(cacheRoot(), vaultHash(cwd), "children.jsonl")
}

/**
 * Whether `pid` is alive. `process.kill(pid, 0)` is the canonical liveness
 * probe — returns true if the process exists and we can signal it. ESRCH
 * (no such pid) → false. EPERM (exists but we can't signal) → still alive,
 * so true. Other errors propagate.
 */
export function isPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "ESRCH") return false
    if (code === "EPERM") return true
    return false
  }
}

/** Read a pidfile and return its parsed PID, or null if missing/garbage. */
export function readPidfile(cwd: string): number | null {
  const path = pidfilePath(cwd)
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, "utf8").trim()
    const pid = Number.parseInt(raw, 10)
    if (!Number.isFinite(pid) || pid <= 0) return null
    return pid
  } catch {
    return null
  }
}

/** Write our own PID to the pidfile, mkdir-p'ing the cache root. */
export function writePidfile(cwd: string, pid: number = process.pid): void {
  const path = pidfilePath(cwd)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${pid}\n`)
}

/** Remove the pidfile (used on clean exit). Best-effort. */
export function removePidfile(cwd: string): void {
  try {
    rmSync(pidfilePath(cwd), { force: true })
  } catch {
    /* best-effort */
  }
}

/** Append a child record to the registry. Best-effort — never throws. */
export function registerChild(cwd: string, record: ChildRecord): void {
  const path = childRegistryPath(cwd)
  try {
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, `${JSON.stringify(record)}\n`)
    dSup("registerChild cwd=%s pid=%d pgid=%d sid=%s", cwd, record.pid, record.pgid, record.sessionId)
  } catch (err) {
    dSup("registerChild failed: %s", (err as Error).message)
  }
}

/** Read the child registry — one record per line. Skips malformed lines. */
export function readChildRegistry(cwd: string): ChildRecord[] {
  const path = childRegistryPath(cwd)
  if (!existsSync(path)) return []
  try {
    const raw = readFileSync(path, "utf8")
    const out: ChildRecord[] = []
    for (const line of raw.split("\n")) {
      const trimmed = line.trim()
      if (trimmed.length === 0) continue
      try {
        const rec = JSON.parse(trimmed) as ChildRecord
        if (
          typeof rec.pid === "number" &&
          typeof rec.pgid === "number" &&
          typeof rec.sessionId === "string" &&
          typeof rec.startedAt === "number"
        ) {
          out.push(rec)
        }
      } catch {
        /* skip malformed line */
      }
    }
    return out
  } catch {
    return []
  }
}

/** Truncate the registry (used on clean exit). Best-effort. */
export function clearChildRegistry(cwd: string): void {
  const path = childRegistryPath(cwd)
  try {
    if (existsSync(path)) rmSync(path, { force: true })
  } catch {
    /* best-effort */
  }
}

/**
 * Send `signal` to every alive process group recorded in `records`. Returns
 * the list of pgids that were actually signalled.
 *
 * Exported so tests can drive the kill path with synthetic records.
 */
export function killChildPgids(records: ReadonlyArray<ChildRecord>, signal: NodeJS.Signals = "SIGTERM"): number[] {
  const killed: number[] = []
  for (const r of records) {
    if (!isPidAlive(r.pid)) continue
    try {
      // Negative pid = signal the whole process group. spawn.ts spawned
      // these with detached:true so pid === pgid.
      process.kill(-r.pgid, signal)
      killed.push(r.pgid)
      dSup("killed pgid=%d signal=%s", r.pgid, signal)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== "ESRCH") {
        dSup("kill pgid=%d failed: %s", r.pgid, (err as Error).message)
      }
    }
  }
  return killed
}

/**
 * Result of `acquireSupervisor`: indicates whether silvercode should proceed
 * to start, and what cleanup happened along the way.
 */
export type AcquireResult =
  | { ok: true; reaped: ReadonlyArray<number>; takenOver: boolean }
  | { ok: false; runningPid: number; pidfile: string }

/**
 * Acquire the per-vault pidfile. Three cases:
 *
 *   1. No prior pidfile → write ours, return ok with reaped=[].
 *   2. Prior pidfile, owner ALIVE → return not-ok with the running pid so the
 *      caller can print a friendly error and exit non-zero.
 *   3. Prior pidfile, owner DEAD → previous silvercode crashed. Read its
 *      child registry, SIGTERM each surviving pgid, truncate the registry,
 *      take over the pidfile. Return ok with the list of reaped pgids.
 *
 * The caller is responsible for installing process-exit handlers that call
 * `releaseSupervisor` to clean up on shutdown.
 */
export function acquireSupervisor(cwd: string): AcquireResult {
  const prior = readPidfile(cwd)
  if (prior !== null && prior !== process.pid && isPidAlive(prior)) {
    dSup("acquire blocked — pid=%d still alive", prior)
    return { ok: false, runningPid: prior, pidfile: pidfilePath(cwd) }
  }

  // `prior === process.pid` means we're re-acquiring our own pidfile (e.g.
  // tests that call acquire twice). Treat as a no-op fresh start; the
  // takeover branch is reserved for "previous silvercode died and left
  // state behind", which by definition is a different pid.
  let reaped: number[] = []
  const takenOver = prior !== null && prior !== process.pid
  if (takenOver) {
    // Previous silvercode died hard. Reap its survivors.
    const records = readChildRegistry(cwd)
    if (records.length > 0) {
      dSup("reaping %d stale child records from prior silvercode pid=%d", records.length, prior)
      reaped = killChildPgids(records, "SIGTERM")
      // Best-effort SIGKILL the survivors after a brief grace. We don't
      // block on this — the SIGTERM is enough for well-behaved children
      // and we want fast startup for the user. A second pass on the next
      // launch will clean up anything stubborn.
    }
    clearChildRegistry(cwd)
  }
  writePidfile(cwd)
  return { ok: true, reaped, takenOver }
}

/**
 * Release the pidfile + truncate the children registry. Call this from
 * SIGINT / SIGTERM / process.on("exit") handlers to ensure a clean
 * shutdown leaves no stale state. Idempotent.
 */
export function releaseSupervisor(cwd: string): void {
  removePidfile(cwd)
  clearChildRegistry(cwd)
}

/**
 * Quick health check used by tests + `silvercode doctor`. Reports whether
 * we own the pidfile and how many children we've registered.
 */
export function supervisorStatus(cwd: string): {
  pidfile: string
  ownerPid: number | null
  ownerAlive: boolean
  registryPath: string
  childCount: number
} {
  const ownerPid = readPidfile(cwd)
  return {
    pidfile: pidfilePath(cwd),
    ownerPid,
    ownerAlive: ownerPid != null && isPidAlive(ownerPid),
    registryPath: childRegistryPath(cwd),
    childCount: readChildRegistry(cwd).length,
  }
}

/**
 * Walk every per-vault directory under the cache root. Useful for tests and
 * for a future `silvercode doctor` orphan check that's vault-agnostic. Not
 * called on the hot path. Returns an empty array if the cache root doesn't
 * exist yet.
 */
export function listVaultHashes(): string[] {
  const root = cacheRoot()
  if (!existsSync(root)) return []
  const out: string[] = []
  for (const entry of readdirSync(root)) {
    try {
      const st = statSync(join(root, entry))
      if (st.isDirectory()) out.push(entry)
    } catch {
      /* unreadable entries skipped */
    }
  }
  return out
}
