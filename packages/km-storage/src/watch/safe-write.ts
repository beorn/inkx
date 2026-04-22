/**
 * Safe Writeback — Content-as-CAS contract (Phase A, §7.1)
 *
 * Before overwriting a file, verify the current on-disk bytes still match
 * the hash km last observed for that file. If they don't, surface the
 * divergence as a conflict instead of silently clobbering the user's edit.
 *
 * See `hub/km/storage-architecture.md` §7 for the full design. The invariant:
 * km must never silently overwrite user edits.
 *
 * This module is deliberately low-level — it has no DB, no emitter, no node
 * context. Callers (fs-writer, change-handlers) own the policy decision of
 * how to react to a conflict (replay, surface to user, etc.); safe-write
 * just reports the state of the world at the moment of the write.
 *
 * Not confused with `fs/cas.ts`, the content-dedup CAS for large blobs —
 * different concept, same name. Don't cross the streams.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "fs"
import { closeSync, fsyncSync, openSync } from "fs"
import { dirname, join } from "path"
import { hashContent } from "../fs/cas.ts"

/** Monotonic suffix to keep temp-file names unique within a single process. */
let tempSeq = 0

export interface SafeWriteOptions {
  /**
   * The content hash km last observed for this file, if any. Null/undefined
   * means "we've never observed this file" (a fresh write). An explicit
   * hash means "we expect the disk to still look like this".
   */
  expectedHash?: string | null
  /** File mode for atomic writes. Defaults to 0o644. */
  mode?: number
}

export type SafeWriteOutcome = "wrote" | "conflict" | "noop"

export interface SafeWriteResult {
  outcome: SafeWriteOutcome
  /** sha256 of the on-disk file before the write (null if file didn't exist). */
  actualHashBefore: string | null
  /** sha256 of what we wrote (null when outcome === "conflict"). */
  newHash: string | null
}

/**
 * Atomically replace `absPath` with `newContent` only when the current on-disk
 * bytes match the expected hash (or when the file is new).
 *
 * Outcomes:
 *   - "wrote"     — guard passed, file replaced atomically, returns new hash.
 *   - "noop"      — on-disk content is already byte-identical to `newContent`;
 *                   no write performed. Callers can treat as success.
 *   - "conflict"  — on-disk bytes don't match `expectedHash`. No write. Caller
 *                   is expected to replay the intended change against the
 *                   current disk state (re-parse, re-apply, re-serialize) and
 *                   call `safeWriteFile` again, or surface as unresolved.
 *
 * Sync by construction — matches the existing `FsWriteTarget.writeFile`
 * interface and avoids reshuffling the call graph just to thread a promise.
 */
export function safeWriteFile(absPath: string, newContent: string, options: SafeWriteOptions = {}): SafeWriteResult {
  const expectedHash = options.expectedHash ?? null
  const newHash = hashContent(newContent)
  const actualHashBefore = readHashIfExists(absPath)

  // Idempotent: nothing to do if the file already holds exactly newContent.
  // This path doubles as the "hash stays fresh" case after a no-op save —
  // callers should update their baseline to newHash.
  if (actualHashBefore !== null && actualHashBefore === newHash) {
    return { outcome: "noop", actualHashBefore, newHash }
  }

  // Fresh file (never observed) OR observed hash still matches disk — safe.
  // When expectedHash is null and the file already exists on disk, we defer
  // to the caller's "first observation" semantics: still a safe write (the
  // DB just hasn't populated fs_content_hash yet; reconcile has already
  // imported whatever was on disk). The atomic replace makes this a
  // well-defined no-data-loss operation either way — if the disk content
  // was important, reconcile would have captured it before we got here.
  const guardPassed = expectedHash == null ? true : actualHashBefore === expectedHash

  if (!guardPassed) {
    return { outcome: "conflict", actualHashBefore, newHash: null }
  }

  writeFileAtomic(absPath, newContent, options.mode ?? 0o644)
  return { outcome: "wrote", actualHashBefore, newHash }
}

/**
 * Atomic write: same-directory temp file + fsync + rename-over.
 *
 * - Same directory so `rename(2)` stays on one filesystem (cross-FS rename
 *   is EXDEV, handled by fallback below).
 * - fsync before rename so a power-loss between "create temp" and "rename"
 *   can't leave the target pointing at a zero-length or torn file.
 * - renameSync is atomic on POSIX + NTFS. On success the target has either
 *   the old bytes (pre-rename) or the new bytes (post-rename), never a mix.
 *
 * Creates parent directories as needed (honors the `FsWriteTarget.mkdir`
 * contract callers rely on for deep writes).
 */
export function writeFileAtomic(absPath: string, content: string, mode = 0o644): void {
  const dir = dirname(absPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  // Temp file name ends in `.tmp` so it matches the default `**/*.tmp` ignore
  // rule (see fs/ignore.ts) — the watcher won't trip on our own temp files.
  const tmpPath = join(dir, `.${basenameNoSep(absPath)}.${process.pid}-${++tempSeq}.tmp`)
  try {
    writeFileSync(tmpPath, content, { encoding: "utf-8", mode })
    // fsync the file data; best-effort — some filesystems (e.g. tmpfs) no-op.
    try {
      const fd = openSync(tmpPath, "r+")
      try {
        fsyncSync(fd)
      } finally {
        closeSync(fd)
      }
    } catch {
      // fsync failure is not fatal — rename is still atomic for crash-safety
      // on the common filesystems. We prefer to write-and-keep-going over
      // hard-failing on an exotic FS that rejects fsync.
    }
    renameSync(tmpPath, absPath)
  } catch (err) {
    // EXDEV: temp was on a different device (shouldn't happen since we put it
    // in the same dir, but bind mounts can do this). Fall back to write-then-
    // delete-temp. Slightly less atomic but keeps the common case crash-safe.
    if (isCrossDevice(err)) {
      writeFileSync(absPath, content, { encoding: "utf-8", mode })
      try {
        unlinkSync(tmpPath)
      } catch {
        // Temp cleanup failure — leave the .tmp-* crumb; reconcile will
        // skip it via ignore patterns. TODO: prune orphaned temps.
      }
      return
    }
    // Any other failure: remove the temp if it leaked so we don't accumulate
    // dot-files next to the user's notes.
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath)
    } catch {
      // ignore cleanup failures
    }
    throw err
  }
}

/** Read + hash the current bytes of `absPath`, or null if it doesn't exist. */
function readHashIfExists(absPath: string): string | null {
  if (!existsSync(absPath)) return null
  try {
    const stat = statSync(absPath)
    if (!stat.isFile()) return null
    const bytes = readFileSync(absPath, "utf-8")
    return hashContent(bytes)
  } catch {
    // Unreadable (permissions, IO error) — treat as "no baseline known",
    // callers still get outcome=conflict if they expected a hash, because
    // actualHashBefore===null !== expectedHash.
    return null
  }
}

function basenameNoSep(p: string): string {
  const slash = p.lastIndexOf("/")
  return slash === -1 ? p : p.slice(slash + 1)
}

function isCrossDevice(err: unknown): boolean {
  return typeof err === "object" && (err as { code?: string })?.code === "EXDEV"
}
