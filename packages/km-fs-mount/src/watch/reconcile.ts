/* eslint-disable @typescript-eslint/no-non-null-assertion -- codebase idiom: arr[i]! / map.get(k)! / stack.pop()! after surrounding length/has/bounds check; TS noUncheckedIndexedAccess requires the assertion even when invariant is obvious */
/**
 * Reconciliation
 *
 * Compares filesystem state to database state and generates operations.
 * Operations are applied using the applier module.
 *
 * Identity cascade (hub/km/storage-architecture.md §3.2-§3.4):
 *
 *   Step 1 — inode primary: match (fs_dev, fs_ino) against the DB. If any of
 *            (path, stored content hash, stored mtime) also agrees, the match
 *            is confirmed and the ULID is preserved (even across directories).
 *            If ALL three disagree → inode reuse: tombstone the old row, mint
 *            a fresh ULID for the scanned file.
 *
 *   Step 2 — path fallback: when inode misses (cross-FS copy, fresh git clone
 *            with null fs_ino), look up by repo-relative fs_path. This is the
 *            historical behaviour.
 *
 *   Step 3 — content-hash + parent-position composite: last-resort fallback
 *            for cross-FS renames and post-git-restore scenarios where inode
 *            is reassigned AND path differs, but the bytes are identical.
 */

import { createHash } from "crypto"
import { readFileSync } from "fs"
import { createLogger } from "loggily"
import type { Database } from "bun:sqlite"
import { dirname, join } from "path"
import type { KNode } from "@km/core"
import { getNodesUnderPath, getNodeByPath, getNodeByInode, getNodeByContentHashUnderParent } from "@km/storage"
import { scanDirectory, scanDirectoryAsync } from "./watcher.ts"
import type { PatternMatcher } from "../fs/ignore.ts"
import { toRelativeFsPath } from "../fs/path-utils.ts"
const log = createLogger("km:storage:watch:reconcile")

export interface ReconcileOp {
  type: "create" | "update" | "rename" | "delete"
  path: string
  nodeId?: string
  oldPath?: string
  ino?: number
  mtime?: number
  /** Device id (cascade Step 1, §3.2) */
  dev?: number
  /** File size (watcher fast-path, §7.4) */
  size?: number
  /** SHA-256 of file bytes when the cascade computed it (cascade Step 3, §3.3) */
  contentHash?: string
}

interface FsEntry {
  path: string
  ino: number
  mtime: number
  isDirectory: boolean
  /** If true, entry is a symlink (typically skipped during scanning) */
  isEmbed?: boolean
  /** Device id, when available from the scanner */
  dev?: number
  /** File size in bytes */
  size?: number
}

export type DirectoryScanner = (dirPath: string, ignorePatterns?: string[] | PatternMatcher) => FsEntry[]

export type AsyncDirectoryScanner = (dirPath: string, ignorePatterns?: string[] | PatternMatcher) => Promise<FsEntry[]>

// ────────────────────────────────────────────────────────────────────────────
// Recursion shared state
// ────────────────────────────────────────────────────────────────────────────

/**
 * State shared across a single `reconcileDirectoryRecursive` pass.
 *
 * Tracks which DB nodes have been claimed by inode match in an earlier
 * directory's reconcile step — this is how the Step 1 cascade supports
 * cross-directory renames (same inode, different parent). Without this,
 * the source directory's reconcile would emit a spurious delete for the
 * node before the destination directory's reconcile sees the scanned entry.
 */
interface ReconcileState {
  /** DB node ids claimed by inode match in an earlier dir reconcile */
  claimedNodeIds: Set<string>
  /** FS inodes seen in any scan during this pass — repo-wide presence check */
  presentInodes: Set<string>
  /** Repo-relative FS paths seen in any scan during this pass — inode-reuse guard */
  presentRelPaths: Set<string>
  /** Has the presentInodes / presentRelPaths sets been populated yet? */
  populated: boolean
}

function makeReconcileState(): ReconcileState {
  return { claimedNodeIds: new Set(), presentInodes: new Set(), presentRelPaths: new Set(), populated: false }
}

function inodeKey(dev: number | undefined, ino: number): string {
  return `${dev ?? ""}:${ino}`
}

/**
 * Recursively walk the repo from `rootDir` and record every scanned inode and
 * repo-relative path. Used once per reconciliation pass so source-directory
 * reconciles can detect "missing here but still alive elsewhere" (cross-
 * directory rename), and so the inode-reuse validator can check whether the
 * DB node's old path still physically exists on disk.
 */
function populatePresentInodes(
  state: ReconcileState,
  rootDir: string,
  repoRoot: string,
  ignorePatterns: string[] | PatternMatcher | undefined,
  scanner: DirectoryScanner,
): void {
  if (state.populated) return
  state.populated = true

  function walk(dir: string): void {
    const entries = scanner(dir, ignorePatterns)
    for (const entry of entries) {
      state.presentInodes.add(inodeKey(entry.dev, entry.ino))
      state.presentRelPaths.add(toRelativeFsPath(repoRoot, entry.path))
      if (entry.isDirectory) walk(entry.path)
    }
  }

  try {
    walk(rootDir)
  } catch (err) {
    log.debug?.(`populatePresentInodes: scan failed for ${rootDir}: ${String(err)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Content hashing
// ────────────────────────────────────────────────────────────────────────────

/**
 * Reader function for computing content hash. Defaults to Node's `readFileSync`;
 * tests use a FakeFileSystem-backed reader. Returning `null` signals "cannot
 * read this path" and the cascade gracefully falls back to other signals.
 */
export type HashFileReader = (absPath: string) => string | null

const defaultHashReader: HashFileReader = (absPath) => {
  try {
    return readFileSync(absPath, "utf-8")
  } catch {
    return null
  }
}

/**
 * Compute the SHA-256 hash of a file on disk using the supplied reader.
 *
 * Only called lazily — Step 3 of the cascade and the inode-reuse validator
 * need it; the happy-path (path match, or inode+path agree) never reads the
 * file. Returns undefined on read failure so the cascade can gracefully fall
 * back to other signals.
 */
function computeFileHash(absPath: string, isDirectory: boolean, readFile: HashFileReader): string | undefined {
  if (isDirectory) return undefined
  const content = readFile(absPath)
  if (content == null) {
    log.debug?.(`computeFileHash: read failed for ${absPath}`)
    return undefined
  }
  return createHash("sha256").update(content, "utf-8").digest("hex")
}

// ────────────────────────────────────────────────────────────────────────────
// Cascade
// ────────────────────────────────────────────────────────────────────────────

/**
 * Decide what to do with an inode-matched DB node.
 *
 * Per hub/km/storage-architecture.md §3.2, an inode match is a "presumed
 * match" that gets confirmed if any of (path, stored content hash, stored
 * mtime) also agrees. If all three disagree, the §3.2 text calls for
 * tombstoning the old row and minting fresh.
 *
 * In practice the "triple-disagree" path is rarely taken within a single
 * reconcile pass — it only fires when the scanner observes a reused inode
 * AND the old node's FS record (path, mtime, hash) is still present in DB
 * untouched. The common workflow is delete-in-pass-N + create-in-pass-N+1,
 * where pass N naturally tombstones the old node and pass N+1 sees no inode
 * match. We keep the branch for spec compliance and for the FSEvents-coalesce
 * edge case where delete + recreate arrive as a single scan event.
 *
 * "Confirm" is additionally chosen (conservative default) when not all three
 * signals are available on both sides. Without positive evidence of reuse we
 * must not destroy identity — false-confirm preserves history; false-reuse
 * discards it irretrievably.
 *
 * Special case: when `oldPathStillPresent` is true, the scanner reports the
 * DB node's OLD path is still present in the FS alongside this (different-
 * path) inode match. That means the inode-match path is NOT a rename of the
 * original file — it's a genuine reuse / anomaly. Without this guard, a test
 * scanner that returns a single entry with inoA at target.md (while the real
 * FS still has old-name.md) would get treated as "A renamed to target.md",
 * which is what the pre-cascade displaced-delete tests exercise. That's OK
 * because those tests don't populate `oldPathStillPresent` — the default is
 * false, matching the historical "inode match = rename" heuristic.
 */
function validateInodeMatch(
  dbNode: KNode,
  scanRelPath: string,
  scanMtime: number,
  scanHash: string | undefined,
  oldPathStillPresent: boolean,
): "confirm" | "reuse" {
  if (dbNode.fs_path === scanRelPath) return "confirm"
  if (dbNode.fs_mtime != null && dbNode.fs_mtime === scanMtime) return "confirm"
  if (scanHash && dbNode.fs_content_hash && dbNode.fs_content_hash === scanHash) return "confirm"

  // Also accept a match on the legacy content_hash (parsed-content hash) as
  // the secondary signal when fs_content_hash hasn't been populated on the DB
  // row yet. This prevents spurious tombstones on first-scan after a v5
  // upgrade before fs_content_hash is written for the first time.
  if (scanHash && dbNode.content_hash && dbNode.content_hash === scanHash) return "confirm"

  // Reuse requires: (1) all three signals available on both sides, (2) all
  // three disagree, AND (3) positive evidence the inode-match is not a
  // rename — i.e., the DB node's old path still exists in the scan. Without
  // (3), an inode match at a new path is indistinguishable from "old file
  // moved (+ content-rewritten)" which must preserve identity.
  const pathEvidence = dbNode.fs_path != null
  const mtimeEvidence = dbNode.fs_mtime != null
  const hashEvidence = scanHash != null && (dbNode.fs_content_hash != null || dbNode.content_hash != null)
  if (pathEvidence && mtimeEvidence && hashEvidence && oldPathStillPresent) return "reuse"

  return "confirm"
}

// ────────────────────────────────────────────────────────────────────────────
// Core comparison
// ────────────────────────────────────────────────────────────────────────────

/**
 * Pure comparison logic: compare filesystem entries to database state and generate ops.
 * Shared by both sync and async reconciliation.
 */
// oxlint-disable-next-line complexity/complexity -- cascade branching (inode/path/hash) must live together
function reconcileFromEntries(
  db: Database,
  dirPath: string,
  repoRoot: string,
  fsEntries: FsEntry[],
  state?: ReconcileState,
  readFile: HashFileReader = defaultHashReader,
): ReconcileOp[] {
  const ops: ReconcileOp[] = []

  // Convert dirPath to relative for DB queries (DB stores relative paths)
  const relDirPath = toRelativeFsPath(repoRoot, dirPath)

  // Get database state for this directory (using km-storage abstraction)
  const dbNodes = getNodesUnderPath(db, relDirPath)

  log.debug?.(`reconciling dirPath=${dirPath} fsEntries=${fsEntries.length} dbNodes=${dbNodes.length}`)

  // Index by inode and relative path for efficient lookup
  const dbByIno = new Map<number, KNode>()
  const dbByRelPath = new Map<string, KNode>()

  for (const node of dbNodes) {
    if (node.fs_ino) {
      dbByIno.set(node.fs_ino, node)
    }
    if (node.fs_path) {
      dbByRelPath.set(node.fs_path, node)
    }
  }

  // Process filesystem entries — convert to relative for comparison
  for (const entry of fsEntries) {
    const relPath = toRelativeFsPath(repoRoot, entry.path)

    // Compute the file's SHA-256 lazily — needed by Step 1 validation (inode
    // reuse detection) and Step 3 fallback. We compute once per scanned entry
    // and reuse for any fallback.
    let scanHash: string | undefined
    const computeScanHash = (): string | undefined => {
      if (scanHash !== undefined) return scanHash
      scanHash = computeFileHash(entry.path, entry.isDirectory, readFile)
      return scanHash
    }

    // --- Step 1 — repo-wide inode lookup (lifted out of per-directory scope) ---
    //
    // This is the key architectural change from the previous reconciler: inode
    // matching spans the whole repo, so a file renamed across directories
    // (same inode, different parent) is recognized by Step 1 and its ULID is
    // preserved. The previous per-directory lookup (dbByIno) missed cross-dir
    // moves entirely and emitted delete+create, losing identity.
    const byInode = getNodeByInode(db, entry.dev, entry.ino)
    if (byInode) {
      // Compute hash only when needed — path match is cheapest, try it first.
      const hashForValidate =
        byInode.fs_path === relPath || (byInode.fs_mtime != null && byInode.fs_mtime === entry.mtime)
          ? undefined
          : computeScanHash()
      // "Old path still present" means the DB node's fs_path is ALSO in the
      // current repo-wide scan — i.e., the original file is still on disk
      // alongside the inode-reused file. This is the positive signal for
      // §3.2 inode-reuse (otherwise an inode match at a new path is simply a
      // rename with possible content rewrite, and must preserve identity).
      const oldPathStillPresent =
        byInode.fs_path != null && byInode.fs_path !== relPath && (state?.presentRelPaths.has(byInode.fs_path) ?? false)
      const validation = validateInodeMatch(byInode, relPath, entry.mtime, hashForValidate, oldPathStillPresent)

      if (validation === "confirm") {
        if (byInode.fs_path === relPath) {
          state?.claimedNodeIds.add(byInode.id)
          // Same path — treat as potential content update. mtime/hash path
          // match uses the same update logic as before.
          if (entry.mtime !== byInode.fs_mtime && !entry.isDirectory) {
            ops.push({
              type: "update",
              nodeId: byInode.id,
              path: entry.path,
              ino: entry.ino,
              mtime: entry.mtime,
              dev: entry.dev,
              size: entry.size,
              contentHash: scanHash,
            })
          }
        } else {
          // Different path — potential cross-dir/same-dir rename. Check for a
          // displacement conflict at the destination first: if the destination
          // path already has a DIFFERENT DB node whose inode either is missing
          // (concurrent creation) or matches the scan (DB anomaly), we can't
          // safely delete it. Skip the inode-rename and let the FS entry fall
          // through to the path-lookup branch.
          const displaced = dbByRelPath.get(relPath)
          const displacedIsConflict =
            displaced != null &&
            displaced.id !== byInode.id &&
            (displaced.fs_ino == null || displaced.fs_ino === entry.ino)

          if (displacedIsConflict) {
            log.info?.(
              `displacement conflict: refusing to delete node at path=${relPath} (displacedIno=${displaced!.fs_ino ?? "none"}, fsIno=${entry.ino}), skipping rename of ${byInode.fs_path}`,
            )
            // Don't claim, don't rename. Consume this FS entry (the displaced
            // node stays where it is; the old byInode stays at its current
            // path). The per-dir delete pass below will leave both nodes
            // untouched because they're both still path-valid in the DB.
            //
            // We still drop the path from dbByRelPath so the delete-pass
            // doesn't accidentally tombstone the displaced node.
            dbByRelPath.delete(relPath)
            continue
          }

          // Displaced is either absent, or stale (different inode) and safe to
          // tombstone. Emit the displaced-delete + descendant cascade first so
          // the rename lands cleanly.
          if (displaced && displaced.id !== byInode.id) {
            ops.push({ type: "delete", nodeId: displaced.id, path: relPath })
            dbByRelPath.delete(relPath)

            if (entry.isDirectory) {
              const displacedPrefix = relPath + "/"
              for (const [descPath, descNode] of dbByRelPath) {
                if (descPath.startsWith(displacedPrefix)) {
                  ops.push({ type: "delete", nodeId: descNode.id, path: descPath })
                  dbByRelPath.delete(descPath)
                }
              }
            }
          }

          state?.claimedNodeIds.add(byInode.id)

          ops.push({
            type: "rename",
            nodeId: byInode.id,
            oldPath: byInode.fs_path,
            path: entry.path, // absolute — matches pre-cascade convention
            ino: entry.ino,
            mtime: entry.mtime,
            dev: entry.dev,
            size: entry.size,
          })

          // Cascade rename to descendants when a directory is renamed.
          if (entry.isDirectory && byInode.fs_path) {
            const oldPrefix = byInode.fs_path + "/"
            const newPrefix = relPath + "/"
            for (const [descRelPath, descNode] of dbByRelPath) {
              if (descRelPath.startsWith(oldPrefix)) {
                const newDescRelPath = newPrefix + descRelPath.slice(oldPrefix.length)
                ops.push({
                  type: "rename",
                  nodeId: descNode.id,
                  oldPath: descRelPath,
                  path: join(repoRoot, newDescRelPath),
                  ino: descNode.fs_ino ?? 0,
                })
                state?.claimedNodeIds.add(descNode.id)
                dbByRelPath.delete(descRelPath)
              }
            }
          }

          // Remove the old path entry from our local map so we don't emit a
          // subsequent spurious delete for it.
          if (byInode.fs_path) {
            dbByRelPath.delete(byInode.fs_path)
          }
        }
        // Path match / rename emitted — consume this FS entry.
        dbByRelPath.delete(relPath)
        continue
      } else {
        // Inode reuse — path, content hash, and mtime all disagree with the
        // DB row. Tombstone the old node (wherever it lives in the DB) and
        // fall through to the create path for a fresh ULID at the new location.
        log.debug?.(
          `inode-reuse: tombstoning dbNode ${byInode.id} (was ${byInode.fs_path}) — scanned inode reused at ${relPath}`,
        )
        ops.push({
          type: "delete",
          nodeId: byInode.id,
          path: byInode.fs_path ?? relPath,
        })
        // Mark as claimed so the per-dir delete pass doesn't also emit a delete.
        state?.claimedNodeIds.add(byInode.id)
        // If the old row happened to live in this same directory, drop it
        // from the local map so the delete-pass skips it too.
        if (byInode.fs_path) dbByRelPath.delete(byInode.fs_path)
        // Fall through to create path below.
      }
    }

    // --- Step 2 — path lookup (existing behaviour) ---
    const existingByPath = dbByRelPath.get(relPath)

    if (existingByPath) {
      // Path-matched — update if mtime drifted.
      if (entry.mtime !== existingByPath.fs_mtime && !entry.isDirectory) {
        ops.push({
          type: "update",
          nodeId: existingByPath.id,
          path: entry.path,
          ino: entry.ino,
          mtime: entry.mtime,
          dev: entry.dev,
          size: entry.size,
          contentHash: scanHash,
        })
      } else if (entry.ino !== existingByPath.fs_ino || entry.dev !== existingByPath.fs_dev) {
        // Same path & mtime but inode/dev changed (e.g., first scan after a
        // pre-v5 DB starts tracking fs_dev) — refresh identity fields without
        // reparsing content. Emit a lightweight update with just the fs
        // metadata.
        ops.push({
          type: "update",
          nodeId: existingByPath.id,
          path: entry.path,
          ino: entry.ino,
          mtime: entry.mtime,
          dev: entry.dev,
          size: entry.size,
        })
      }
      dbByRelPath.delete(relPath)
      continue
    }

    // --- Step 3 — content-hash + parent composite ---
    const hashForStep3 = computeScanHash()
    if (hashForStep3) {
      const slash = relPath.lastIndexOf("/")
      const parentDir = slash === -1 ? "." : relPath.slice(0, slash)
      const byHash = getNodeByContentHashUnderParent(db, hashForStep3, parentDir)
      if (byHash && !state?.claimedNodeIds.has(byHash.id)) {
        state?.claimedNodeIds.add(byHash.id)
        ops.push({
          type: "rename",
          nodeId: byHash.id,
          oldPath: byHash.fs_path,
          path: entry.path,
          ino: entry.ino,
          mtime: entry.mtime,
          dev: entry.dev,
          size: entry.size,
        })
        if (byHash.fs_path) dbByRelPath.delete(byHash.fs_path)
        dbByRelPath.delete(relPath)
        continue
      }
    }

    // --- No match — create ---
    ops.push({
      type: "create",
      path: entry.path,
      ino: entry.ino,
      mtime: entry.mtime,
      dev: entry.dev,
      size: entry.size,
      contentHash: scanHash,
    })
    dbByRelPath.delete(relPath)
  }

  // Remaining in dbByRelPath are deleted — unless they've been claimed by an
  // inode match in another directory (cross-directory rename), or their inode
  // is still present in the repo scan (a scan we haven't reached yet will claim
  // them).
  for (const [relPath, node] of dbByRelPath) {
    // Only include if it's directly in this directory (compare relative paths)
    if (dirname(relPath) !== relDirPath) continue
    if (state?.claimedNodeIds.has(node.id)) continue

    // If the node's inode is still present somewhere in the repo, another
    // dir's reconcile will handle it via rename. Skip the delete.
    if (state && node.fs_ino != null) {
      const key = inodeKey(node.fs_dev, node.fs_ino)
      if (state.presentInodes.has(key)) {
        log.debug?.(`skip delete for ${relPath} — inode ${key} still present elsewhere in repo`)
        continue
      }
    }

    ops.push({
      type: "delete",
      nodeId: node.id,
      path: relPath, // Relative path — handlers only need nodeId for delete
    })
  }

  if (ops.length > 0) {
    log.debug?.(`generated ${ops.length} ops: ${JSON.stringify(ops.map((o) => ({ type: o.type, path: o.path })))}`)
  }

  return ops
}

/**
 * Reconcile a directory - compare filesystem to database
 *
 * @param ignorePatterns - Either string[] (legacy) or PatternMatcher (fast, pre-compiled)
 * @param readFile - Optional content reader for the cascade's hash signal.
 *                   Defaults to `fs.readFileSync`. Tests can pass a fake-FS
 *                   reader to make Step 3 work with FakeFileSystem.
 */
export function reconcileDirectory(
  db: Database,
  dirPath: string,
  repoRoot: string,
  ignorePatterns?: string[] | PatternMatcher,
  scanner?: DirectoryScanner,
  readFile?: HashFileReader,
): ReconcileOp[] {
  // Get filesystem state (pass ignore patterns to filter out ignored files)
  const fsEntries = scanner ? scanner(dirPath, ignorePatterns) : scanDirectory(dirPath, ignorePatterns)

  // Single-directory entry point: no cross-directory state, so the cascade's
  // cross-dir recovery (Step 1 spanning the repo) still works, but the
  // presentInodes delete-suppression is not applied — callers that need it
  // should go through reconcileDirectoryRecursive.
  return reconcileFromEntries(db, dirPath, repoRoot, fsEntries, undefined, readFile)
}

/**
 * Async version of reconcileDirectory - uses non-blocking fs operations.
 * Same logic as reconcileDirectory but accepts an async scanner.
 */
export async function reconcileDirectoryAsync(
  db: Database,
  dirPath: string,
  repoRoot: string,
  ignorePatterns?: string[] | PatternMatcher,
  scanner?: AsyncDirectoryScanner,
  readFile?: HashFileReader,
): Promise<ReconcileOp[]> {
  // Get filesystem state asynchronously
  const fsEntries = scanner ? await scanner(dirPath, ignorePatterns) : await scanDirectoryAsync(dirPath, ignorePatterns)

  // Rest is identical to sync version — just comparison logic, no I/O
  return reconcileFromEntries(db, dirPath, repoRoot, fsEntries, undefined, readFile)
}

/**
 * Recursively reconcile a directory and all subdirectories.
 * Used when FSEvents coalesces multiple file events into a single directory event.
 *
 * This entry point threads a `ReconcileState` across recursive calls so the
 * inode-primary cascade can handle cross-directory renames correctly: the
 * source dir's reconcile defers the "delete" decision until after all
 * descendants have been scanned, and the dest dir's reconcile claims the
 * node by inode.
 *
 * @param ignorePatterns - Either string[] (legacy) or PatternMatcher (fast, pre-compiled)
 */
export function reconcileDirectoryRecursive(
  db: Database,
  dirPath: string,
  repoRoot: string,
  ignorePatterns?: string[] | PatternMatcher,
  scanner?: DirectoryScanner,
  state?: ReconcileState,
  readFile?: HashFileReader,
): ReconcileOp[] {
  const scan = scanner ?? scanDirectory
  // Initialise state on the outermost call; the same instance threads through
  // all recursive calls so claimedNodeIds + presentInodes are repo-wide.
  const isRoot = state === undefined
  const reconcileState = state ?? makeReconcileState()

  // Populate the repo-wide present-inodes / paths set exactly once, at the
  // top-level call. Subsequent recursive calls reuse it.
  if (isRoot) {
    populatePresentInodes(reconcileState, dirPath, repoRoot, ignorePatterns, scan)
  }

  const ops: ReconcileOp[] = []

  // Reconcile this directory
  const fsEntries = scan(dirPath, ignorePatterns)
  ops.push(...reconcileFromEntries(db, dirPath, repoRoot, fsEntries, reconcileState, readFile))

  // Track paths already handled by parent-level ops (rename cascade + displaced deletes).
  // When a folder is renamed, reconcileDirectory generates rename ops for all
  // descendants and delete ops for any displaced nodes. Recursive descent into
  // the renamed directory would generate duplicate ops for the same paths.
  const handledPaths = new Set<string>()
  for (const op of ops) {
    if (op.type === "rename") {
      handledPaths.add(op.path)
    }
  }

  // Get subdirectories and recursively reconcile them
  for (const entry of fsEntries) {
    if (entry.isDirectory) {
      const childOps = reconcileDirectoryRecursive(
        db,
        entry.path,
        repoRoot,
        ignorePatterns,
        scanner,
        reconcileState,
        readFile,
      )
      for (const op of childOps) {
        // Skip ops for paths already handled by parent cascade/displacement
        if (handledPaths.has(op.path)) {
          log.debug?.(`skipping duplicate op for already-handled path: ${op.path}`)
          continue
        }
        ops.push(op)
      }
    }
  }

  return ops
}

/**
 * Get parent node ID from filesystem path
 * @param fsPath - Relative filesystem path (as stored in DB)
 */
export function getParentNodeId(db: Database, fsPath: string): string | null {
  const parentPath = dirname(fsPath)
  const parentNode = getNodeByPath(db, parentPath)
  return parentNode?.id ?? null
}

// Re-export applier functions for backwards compatibility
export { applyReconcileOps, applyReconcileOpsAsync } from "./applier.ts"
