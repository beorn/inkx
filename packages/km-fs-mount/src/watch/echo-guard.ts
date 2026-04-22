/**
 * EchoGuard — watcher echo suppression (Phase A, §7.4)
 *
 * Filesystem writes we perform produce watcher events we don't want to
 * reconcile back into the DB (echoes). The guard is two-tier:
 *
 *   Fast-path  — compare (mtime, size) of the incoming event to what we
 *                recorded just before the write. If both match, the event
 *                is our own echo. Cheap — no file read, no hash.
 *
 *   Slow-path  — if (mtime, size) diverge (e.g. editor touched the file
 *                without changing bytes, or the FS reports a different
 *                mtime than we captured), fall back to sha256 of the
 *                current disk bytes. Match → echo. Miss → genuine change.
 *
 * Entries expire after ~5s. Echo events almost always arrive within 100ms;
 * the long expiration handles systems under load. The guard is stateless
 * in the failure direction — dropping an entry early just means we'll
 * reconcile our own write (correct but slower), not lose a user edit.
 *
 * Factory-only, no classes (per docs/principles.md).
 */

import { readFileSync, statSync } from "fs"
import { hashContent } from "../fs/cas.ts"

const DEFAULT_EXPIRY_MS = 5_000

interface Expectation {
  mtimeMs: number
  size: number
  hash: string
  expiresAt: number
}

export type EchoVerdict = "echo" | "external"

export interface EchoGuard {
  /**
   * Record that km just wrote `content` to `absPath` with the observed
   * (mtime, size). The next watcher event for this path that lines up
   * with this expectation (or whose current bytes hash to the same hash)
   * will be classified as "echo" and consumed.
   */
  expect(absPath: string, mtimeMs: number, size: number, contentOrHash: string, isHash?: boolean): void

  /**
   * Classify an incoming watcher event. Consumes the matching expectation
   * on "echo" so a subsequent event for the same path (e.g. a follow-up
   * external edit) is correctly classified as "external".
   *
   * `currentMtimeMs` / `currentSize` come from the watcher event (or a
   * fresh stat). When they match the expectation's stored values it's
   * the fast-path; otherwise we fall back to hashing the file.
   */
  consume(absPath: string, currentMtimeMs: number, currentSize: number): EchoVerdict

  /** Non-destructive check — useful for tests. */
  has(absPath: string): boolean

  /** Drop an expectation (e.g. after a rename invalidates the old path). */
  forget(absPath: string): void

  /** Discard everything. */
  clear(): void

  /** Number of pending expectations (post-purge). */
  readonly size: number
}

export interface EchoGuardOptions {
  /** Override for the per-entry TTL. Defaults to 5_000ms. */
  expiryMs?: number
  /**
   * Clock injection for tests. Defaults to `Date.now`. Keeping it pluggable
   * means we can exercise expiration deterministically without real sleeps.
   */
  now?: () => number
}

export function createEchoGuard(options: EchoGuardOptions = {}): EchoGuard {
  const expiryMs = options.expiryMs ?? DEFAULT_EXPIRY_MS
  const now = options.now ?? Date.now
  const entries = new Map<string, Expectation>()

  function purge(): void {
    const t = now()
    for (const [path, exp] of entries) {
      if (exp.expiresAt <= t) entries.delete(path)
    }
  }

  function getFresh(absPath: string): Expectation | null {
    const exp = entries.get(absPath)
    if (!exp) return null
    if (exp.expiresAt <= now()) {
      entries.delete(absPath)
      return null
    }
    return exp
  }

  return {
    expect(absPath, mtimeMs, size, contentOrHash, isHash = false) {
      // Size-based purge cap to prevent unbounded growth on pathological
      // workloads (tests that flood expectations without consuming). 1k is
      // well above any realistic km batch.
      if (entries.size > 1_000) purge()
      const hash = isHash ? contentOrHash : hashContent(contentOrHash)
      entries.set(absPath, {
        mtimeMs,
        size,
        hash,
        expiresAt: now() + expiryMs,
      })
    },

    consume(absPath, currentMtimeMs, currentSize): EchoVerdict {
      const exp = getFresh(absPath)
      if (!exp) return "external"

      // Fast path — (mtime, size) locked in. 99% of self-echoes.
      if (exp.mtimeMs === currentMtimeMs && exp.size === currentSize) {
        entries.delete(absPath)
        return "echo"
      }

      // Slow path — mtime/size drifted (FS coarsened mtime, editor touched
      // without content change, etc.). Final gate: does the current on-disk
      // hash still match what we expected?
      const actualHash = safeHashFile(absPath)
      if (actualHash !== null && actualHash === exp.hash) {
        entries.delete(absPath)
        return "echo"
      }

      // Genuine external edit. Leave the expectation in place — a future
      // (mtime, size)-matching event from within the same window could
      // still be the true echo. It'll expire naturally if not matched.
      return "external"
    },

    has(absPath) {
      return getFresh(absPath) !== null
    },

    forget(absPath) {
      entries.delete(absPath)
    },

    clear() {
      entries.clear()
    },

    get size() {
      purge()
      return entries.size
    },
  }
}

function safeHashFile(absPath: string): string | null {
  try {
    const stat = statSync(absPath)
    if (!stat.isFile()) return null
    return hashContent(readFileSync(absPath, "utf-8"))
  } catch {
    return null
  }
}
