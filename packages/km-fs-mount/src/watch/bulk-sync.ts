/**
 * BulkSync — standalone bulk sync operations (FS<->DB)
 *
 * Standalone bulk sync operations, usable from both TUI (via withSync)
 * and CLI (directly, without watcher lifecycle).
 *
 * BulkSync.fromFs: scan filesystem, reconcile into DB, evaluate rules.
 * BulkSync.toFs: write all DB file nodes to disk.
 */

import { createLogger } from "loggily"
import { dirname } from "path"
import { readFileSync } from "fs"
import { hashContent } from "../fs/cas.ts"
// readFileSync used at line ~268 for sync_state baseline observation.
import type { Database } from "bun:sqlite"
import { toAbsoluteFsPath } from "../fs/path-utils.ts"
import { scanDirectoryRecursiveGen, type ScanEntry } from "./watcher.ts"
import { reconcileDirectory, applyReconcileOps, createSharedReconcileState, type ReconcileOp } from "./reconcile.ts"
import { createIgnoreMatcher } from "../fs/ignore.ts"
import {
  type Emitter,
  type EmitOptions,
  createLinkResolver,
  getAllNodes,
  getSubtree,
  getTagsByHostId,
  nodesToMarkdown,
  buildNodeLookup,
  evaluateAllRules,
  evaluateAffectedRules,
  extractChangedAttrs,
  createRuleContext,
  type StepYield,
} from "@km/storage"
import type { WriteQueue } from "./writequeue.ts"
import type { OwnershipTracker } from "./ownership-tracker.ts"

const log = createLogger("km:storage:watch:bulk-sync")

/** Progress info for sync operations */
export interface SyncProgress {
  phase: string
  current: number
  total: number
}

/** Callback for sync progress reporting */
export type SyncProgressCallback = (info: SyncProgress) => void

/** Result from fromFs */
export interface SyncFromFsResult {
  processed: number
  directories: number
  duration: number
}

/**
 * Anchor assigner — assigns anchor literals (`^abc`) during serialization.
 * Post-v6 the anchor is written to `.name` (storage-architecture §2.3);
 * `rewriteSourceFiles` propagates the new anchor to source files.
 */
export interface AnchorAssigner {
  assign: (nodeId: string, anchor: string) => void
  rewriteSourceFiles: (excludeFileId?: string) => void
}

/** Dependencies for BulkSync operations */
export interface BulkSyncDeps {
  db: Database
  repoPath: string
  writeQueue: WriteQueue
  emitter: Emitter
  createAnchorAssigner: (eventId: string) => AnchorAssigner
  /**
   * OwnershipTracker for recording sync_state baselines after reconciliation.
   * When provided, BulkSync.fromFs records the hash of each file it reconciles
   * so future writes can detect external edits via hash-based conflict check.
   * Optional for backwards compatibility.
   */
  tracker?: OwnershipTracker
}

/**
 * Wrap an emitter so all apply() calls use commit() (no filesystem save).
 * Used for FS-origin reconciliation to prevent echo loops by construction:
 * FS change -> DB update -> commit (no save) -> no write back to FS.
 *
 * This is the structural loop break: reconciliation never saves.
 */
export function wrapEmitterForReconcile(emitter: Emitter): Emitter {
  return {
    ...emitter,
    apply(change: Parameters<Emitter["apply"]>[0], options: EmitOptions = {}) {
      // Use commit() directly — structurally prevents echo loops
      return emitter.commit(change, options)
    },
  }
}

/**
 * BulkSync — namespace for standalone bulk sync operations.
 */
export const BulkSync = {
  /**
   * Sync from filesystem to DB with optional progress callback.
   * Wraps fromFsWithProgress into a simple async call.
   */
  async fromFs(deps: BulkSyncDeps, onProgress?: SyncProgressCallback): Promise<SyncFromFsResult> {
    const gen = BulkSync.fromFsWithProgress(deps)
    let result = await gen.next()
    let currentPhase = "Syncing"
    while (!result.done) {
      const value = result.value
      if (typeof value === "string") {
        currentPhase = value
        onProgress?.({ phase: value, current: 0, total: 0 })
      } else if ("current" in value || "total" in value) {
        onProgress?.({
          phase: currentPhase,
          current: value.current ?? 0,
          total: value.total ?? 0,
        })
      }
      result = await gen.next()
    }
    return result.value
  },

  /**
   * Sync from filesystem to DB as an async generator (3-phase: scan, reconcile, rules).
   * Yields progress updates as StepYield values.
   */
  // oxlint-disable-next-line complexity/complexity -- 3-phase sync generator: scan (ignore matching, file discovery), reconcile (per-file parse + DB upsert, anchor assignment, echo guard), rules (projection, emit); each phase has independent error paths — splitting would lose the yielded progress contract
  async *fromFsWithProgress(deps: BulkSyncDeps): AsyncGenerator<StepYield, SyncFromFsResult> {
    const { db, repoPath, writeQueue, emitter, createAnchorAssigner, tracker } = deps
    log.debug?.(`fromFs: scanning ${repoPath}`)
    const start = Date.now()

    const ignoreMatcher = createIgnoreMatcher(repoPath)

    yield { declare: ["Scanning", "Reconciling", "Rules"] }

    // Phase 1: Scanning
    yield "Scanning"

    const entries: ScanEntry[] = []
    const dirToFiles = new Map<string, ScanEntry[]>()
    let scanCount = 0

    for (const entry of scanDirectoryRecursiveGen(repoPath, (path) => path.endsWith(".md"), ignoreMatcher)) {
      entries.push(entry)
      const dir = dirname(entry.path)
      const files = dirToFiles.get(dir) ?? []
      files.push(entry)
      dirToFiles.set(dir, files)

      // Ensure all ancestor directories up to (but not including) repoPath are reconciled.
      // Without this, directories that don't directly contain .md files are never
      // discovered (e.g., empty sibling folders, intermediate parent directories).
      let ancestor = dirname(dir)
      while (ancestor.length >= repoPath.length && !dirToFiles.has(ancestor)) {
        dirToFiles.set(ancestor, [])
        ancestor = dirname(ancestor)
      }

      scanCount++
      if (scanCount % 25 === 0) {
        yield { current: scanCount, total: 0 }
      }
    }

    // Always reconcile the repo root to discover top-level directories/files
    if (!dirToFiles.has(repoPath)) {
      dirToFiles.set(repoPath, [])
    }

    const totalFiles = entries.length
    log.debug?.(`fromFs: found ${totalFiles} files`)
    yield { current: totalFiles, total: totalFiles }

    // Phase 2: Reconciling
    yield "Reconciling"

    // Build shared reconcile state once: pre-populate the repo-wide
    // DB node index + present-inodes set so per-directory reconciles
    // skip their O(N) SQL scans and per-fs-entry `getNodeByInode`
    // queries. On a 5000-file vault those dominated `km sync` runtime
    // (~90 s for a no-op sync on ~/Bear/Vault).
    //
    // Pre-populate `presentInodes` / `presentRelPaths` from the scan
    // we already ran in Phase 1 — avoids the recursive walk
    // `populatePresentInodes` would otherwise do (we already paid that
    // cost via scanDirectoryRecursiveGen).
    const sharedState = createSharedReconcileState(db)
    for (const entries of dirToFiles.values()) {
      for (const entry of entries) {
        sharedState.presentInodes.add(`${entry.dev ?? ""}:${entry.ino}`)
        sharedState.presentRelPaths.add(
          entry.path.startsWith(repoPath + "/") ? entry.path.slice(repoPath.length + 1) : entry.path,
        )
      }
    }
    sharedState.populated = true

    const allOps: ReconcileOp[] = []
    for (const dir of dirToFiles.keys()) {
      const ops = reconcileDirectory(db, dir, repoPath, ignoreMatcher, undefined, undefined, sharedState)
      allOps.push(...ops)
    }

    // De-duplicate cross-directory rename + delete pairs (the post-hoc
    // filter — needed because the per-directory reconcile loop doesn't
    // share `claimedNodeIds` for the rename-vs-delete tiebreak).
    const renamedNodeIds = new Set<string>()
    for (const op of allOps) {
      if (op.type === "rename" && op.nodeId) renamedNodeIds.add(op.nodeId)
    }
    if (renamedNodeIds.size > 0) {
      const filtered: ReconcileOp[] = []
      for (const op of allOps) {
        if (op.type === "delete" && op.nodeId && renamedNodeIds.has(op.nodeId)) {
          log.debug?.(`bulk-sync: dropping delete op for renamed node ${op.nodeId} (path=${op.path})`)
          continue
        }
        filtered.push(op)
      }
      allOps.length = 0
      allOps.push(...filtered)
    }

    const BATCH_SIZE = 25
    const totalOps = allOps.length || 1
    let opsProcessed = 0
    const reconcileEmitter = wrapEmitterForReconcile(emitter)

    // Build the link resolver once and share across batches. Without this,
    // applyReconcileOps rebuilds it (O(N) name index scan) for every
    // 25-op batch, turning a 5000-file sync into ~200 redundant scans.
    // Each created file is announced into the resolver via `addFile`
    // inside the create handler, so subsequent batches see prior files.
    const sharedResolver = createLinkResolver(db)

    // Pre-state snapshot of changed-node attributes — captured BEFORE the
    // apply transaction so we can detect lost tags / mentions on
    // update/delete (the post-state has them removed). Unioned with
    // post-state below to drive the incremental rule-eval triage.
    const affectedNodeIds = new Set<string>()
    for (const op of allOps) {
      if (op.nodeId) affectedNodeIds.add(op.nodeId)
    }
    const preStateAttrs = affectedNodeIds.size > 0 ? extractChangedAttrs(db, affectedNodeIds) : null

    db.run("BEGIN IMMEDIATE")
    try {
      for (let i = 0; i < allOps.length; i += BATCH_SIZE) {
        const batch = allOps.slice(i, i + BATCH_SIZE)
        applyReconcileOps({
          db,
          ops: batch,
          repoRoot: repoPath,
          emitter: reconcileEmitter,
          resolver: sharedResolver,
        })
        opsProcessed += batch.length
        yield { current: opsProcessed, total: totalOps }
      }
      db.run("COMMIT")
    } catch (error) {
      db.run("ROLLBACK")
      throw error
    }

    // Record sync_state baselines so future writes can detect external edits
    // via hash-based conflict detection. Done outside the transaction since
    // sync_state is a separate concern from node tree state.
    if (tracker) {
      for (const op of allOps) {
        try {
          if (op.type === "create" || op.type === "update") {
            const content = readFileSync(op.path, "utf-8")
            tracker.recordObservation(op.path, content, op.nodeId)
          } else if (op.type === "rename" && op.oldPath) {
            tracker.renamePath(op.oldPath, op.path)
          } else if (op.type === "delete") {
            tracker.removePath(op.path)
          }
        } catch (err) {
          log.debug?.(`recordObservation failed path=${op.path}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }

    if (allOps.length === 0) {
      yield { current: 1, total: 1 }
    }

    // Phase 3: Rules
    yield "Rules"

    // Skip rule eval entirely when nothing has changed since the last
    // pass. The rule outputs (embed children, derived structures) are a
    // pure function of the node tree; if no ops landed AND no journal
    // events were applied since the last rules pass, the result is
    // identical to last time. Track via `meta.last_rules_eval` against
    // `meta.last_event`.
    //
    // First-run / forced-rebuild semantics: when the cursor isn't set,
    // we always run. When it equals last_event, skip. We update the
    // cursor only after a clean pass, so a partial pass never leaves
    // the cursor ahead of the actual state.
    const lastEventRow = db.prepare("SELECT value FROM meta WHERE key = ?").get("last_event") as
      | { value: string }
      | undefined
    const lastRulesEvalRow = db.prepare("SELECT value FROM meta WHERE key = ?").get("last_rules_eval") as
      | { value: string }
      | undefined
    const ranAnyOps = allOps.length > 0
    const lastEvent = lastEventRow?.value ?? null
    const lastRulesEval = lastRulesEvalRow?.value ?? null
    const skipRules = !ranAnyOps && lastEvent != null && lastEvent === lastRulesEval

    const ruleCtx = createRuleContext()
    if (!skipRules) {
      // Incremental rule eval: when this sync had a prior rules-eval cursor
      // (we know the last clean state) AND ops are localized, derive the
      // changed-attribute signature from `allOps` and re-eval only rules
      // whose query domain intersects. Falls back to full eval when
      // (a) we have no prior cursor (first run / forced rebuild) or
      // (b) no nodes were touched.
      //
      // Correctness note: the signature unions pre-state + post-state
      // attrs. Pre-state catches "tag removed" cases (the rule that
      // watched the removed tag must re-eval to drop its embed); post-
      // state catches the symmetric "tag added" case. Without that
      // union, an `update` that strips a tag would silently leave
      // stale embeds.
      const haveCleanBaseline = lastRulesEval != null && lastRulesEval !== ""
      const incrementalEligible = haveCleanBaseline && ranAnyOps
      let changedAttrs = null
      if (incrementalEligible && affectedNodeIds.size > 0) {
        const postStateAttrs = extractChangedAttrs(db, affectedNodeIds)
        // Union pre + post.
        if (preStateAttrs) {
          for (const t of preStateAttrs.tags) postStateAttrs.tags.add(t)
          for (const m of preStateAttrs.mentions) postStateAttrs.mentions.add(m)
          for (const p of preStateAttrs.projects) postStateAttrs.projects.add(p)
          for (const fp of preStateAttrs.paths) postStateAttrs.paths.add(fp)
        }
        changedAttrs = postStateAttrs
      }

      const ruleGen = changedAttrs ? evaluateAffectedRules(db, ruleCtx, changedAttrs) : evaluateAllRules(db, ruleCtx)
      for (const progress of ruleGen) {
        yield { current: progress.current, total: progress.total }
      }
      // Park the cursor at the head event we evaluated against. On a
      // fresh DB with no events the cursor is set to '' (empty string)
      // — still distinct from `null`, so the next no-op sync skips.
      db.run(
        "INSERT INTO meta (key, value) VALUES ('last_rules_eval', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [lastEvent ?? ""],
      )
    } else {
      log.debug?.(`fromFs: rules skipped — last_rules_eval matches last_event (${lastEvent})`)
      yield { current: 1, total: 1 }
    }

    const pendingFiles = Array.from(ruleCtx.pendingWriteBack)
    if (pendingFiles.length > 0) {
      log.debug?.(`fromFs: writing back ${pendingFiles.length} files after rule evaluation`)
      // Fetch the full node list ONCE for the writeback loop. Previous
      // implementation called `getAllNodes` per pending file (for the
      // fs_path lookup) AND a second time inside `nodesToMarkdown` —
      // that's 2× N×M behaviour on a 5,000-file vault. Build a path-keyed
      // map up front, then reuse.
      const allNodesForWriteback = getAllNodes(db)
      const nodesByPath = new Map<string, (typeof allNodesForWriteback)[number]>()
      for (const n of allNodesForWriteback) {
        if (n.fs_path) nodesByPath.set(n.fs_path, n)
      }
      // Pre-build the lookup once. Without this, `nodesToMarkdown` rebuilt
      // a 740k-entry Map on every file write — for 38 files that's 28M
      // wasted Map insertions plus a fresh `existingBlockIds` Set scan.
      const writebackLookup = buildNodeLookup(allNodesForWriteback)
      // Reconstruct YAML `tags:` from outgoing km:%23* link rows on
      // serialize. collectSigilLinks deletes `data.tags` after extraction;
      // without this, authored YAML tags drop after one round-trip.
      writebackLookup.tagsByHostId = getTagsByHostId(db)

      let written = 0
      let skippedIdentical = 0
      for (const filePath of pendingFiles) {
        if (!filePath.endsWith(".md")) {
          log.debug?.(`fromFs: SKIPPING non-.md file in write-back filePath=${filePath}`)
          continue
        }

        const fileNode = nodesByPath.get(filePath)
        if (!fileNode) continue

        const anchors = createAnchorAssigner("rule-evaluation")
        const absPath = toAbsoluteFsPath(repoPath, filePath)
        const subtree = getSubtree(db, fileNode.id)
        const content = nodesToMarkdown(subtree, writebackLookup, anchors.assign)

        // CAS-skip: if the rendered content's hash matches the DB's
        // `fs_content_hash` (last-known on-disk hash), the rule eval
        // produced a no-op write — skip the queue. Hashing avoids a
        // readFileSync on multi-MB files; we trust fs_content_hash as
        // the canonical "what's on disk now" reference because the
        // reconcile pass we just ran updated it for any file whose
        // mtime/inode changed.
        const newHash = hashContent(content)
        if (fileNode.fs_content_hash && fileNode.fs_content_hash === newHash) {
          skippedIdentical++
          anchors.rewriteSourceFiles(fileNode.id)
          continue
        }

        writeQueue.queue({
          path: absPath,
          content,
          sourceEventId: "rule-evaluation",
        })
        anchors.rewriteSourceFiles(fileNode.id)
        written++
      }
      log.debug?.(`fromFs: writeback queued=${written} skipped-identical=${skippedIdentical}`)
      await writeQueue.forceFlush()
    }

    const duration = Date.now() - start
    const dirCount = dirToFiles.size
    log.debug?.(`fromFs: processed ${opsProcessed} ops in ${dirCount} dirs in ${duration}ms`)
    return { processed: opsProcessed, directories: dirCount, duration }
  },

  /**
   * Sync from DB to filesystem — write file nodes whose rendered content
   * differs from the DB's `fs_content_hash` baseline.
   *
   * Two scoping rules apply (see @km/storage/fs-writer-stale-hash-revert):
   *
   * 1. **Skip unparsed stubs**: discovery creates stub nodes
   *    (`data._stub: true`) for every .md file before deferred parsing
   *    populates them. A stub's `nodesToMarkdown(getSubtree(...))` renders
   *    as `---\n_stub: true\n---\n\n` — projecting that to disk would
   *    overwrite the actual file content. Stubs are never the source of
   *    truth; they're a placeholder for "we know this file exists, the
   *    parser hasn't gotten to it yet". The CAS guard alone is not
   *    sufficient because a stale-but-disk-aligned `fs_content_hash`
   *    (set by reconcile before the parser runs) lets the guard pass and
   *    the stub render gets written.
   *
   * 2. **CAS-skip on no-op writes**: when the rendered content's hash
   *    already matches `fs_content_hash`, queueing a write is a no-op
   *    AND can trigger spurious `safe-write conflict` events when the
   *    user externally edited the file before we got here. Mirror the
   *    sibling skip in `BulkSync.fromFs` (the rule-evaluation writeback
   *    path) so the toFs side is symmetric.
   */
  async toFs(deps: BulkSyncDeps): Promise<{ written: number }> {
    const { db, repoPath, writeQueue, createAnchorAssigner } = deps
    log.debug?.("toFs: starting")
    const start = Date.now()

    const nodes = getAllNodes(db)
    const fileNodes = nodes.filter(
      (n) => n.type === "h" && n.item && n.fstype === "mdfile" && n.fs_path?.endsWith(".md"),
    )

    log.debug?.(`toFs: considering ${fileNodes.length} files`)

    // Pre-build lookup with tagsByHostId so the serializer can reconstruct
    // YAML `tags:` from outgoing km:%23* link rows. See nodes2md.ts +
    // @km/all/dissolve-data-tags-to-links/yaml-tags-round-trip-loss.
    const lookup = buildNodeLookup(nodes)
    lookup.tagsByHostId = getTagsByHostId(db)

    let written = 0
    let skippedStub = 0
    let skippedIdentical = 0
    for (const fileNode of fileNodes) {
      if (!fileNode.fs_path) continue

      // (1) Stub guard — never project an unparsed stub back to disk.
      if (isUnparsedStub(fileNode)) {
        skippedStub++
        continue
      }

      const anchors = createAnchorAssigner("sync-to-fs")
      const absPath = toAbsoluteFsPath(repoPath, fileNode.fs_path)
      const subtree = getSubtree(db, fileNode.id)
      const content = nodesToMarkdown(subtree, lookup, anchors.assign)

      // (2) CAS-skip — symmetric with the fromFs writeback path
      // (see line ~410 of this file). When the rendered content's hash
      // already matches the DB's `fs_content_hash` baseline, queueing a
      // write is at best a no-op and at worst a spurious conflict event
      // (when the user externally edited the file and the safe-write
      // CAS guard refuses the overwrite). Skip outright; the file on
      // disk already represents what we'd write, give-or-take a user
      // edit we shouldn't be touching anyway.
      const newHash = hashContent(content)
      if (fileNode.fs_content_hash && fileNode.fs_content_hash === newHash) {
        skippedIdentical++
        anchors.rewriteSourceFiles(fileNode.id)
        continue
      }

      writeQueue.queue({
        path: absPath,
        content,
        sourceEventId: "sync-to-fs",
      })
      anchors.rewriteSourceFiles(fileNode.id)
      written++
    }

    await writeQueue.forceFlush()

    log.debug?.(
      `toFs: queued=${written} skipped-stub=${skippedStub} skipped-identical=${skippedIdentical} in ${Date.now() - start}ms`,
    )
    return { written }
  },
}

/**
 * True when the node is an unparsed stub created by discovery — its
 * subtree is a placeholder, not the actual file content. Projecting it
 * to disk would render `---\n_stub: true\n---\n\n` and overwrite the
 * real file. See `BulkSync.toFs` rule (1).
 */
function isUnparsedStub(node: { parsed?: number; data?: unknown }): boolean {
  if (node.parsed === 1) return false
  const data = node.data as Record<string, unknown> | undefined
  return data?._stub === true
}
