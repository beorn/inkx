/**
 * Link Resolution Module
 *
 * Consolidated link resolution for both sync and async modes.
 * Uses parameterized yielding to support generator and promise-based callers.
 *
 * Architecture:
 *   resolveLinksGen()      ← Generator wrapper for sync progress
 *   resolveLinksAsync()    ← Async wrapper for background resolution
 *   applyResolvedLinks()   ← Database writes (shared)
 */

// Node.js/Bun global for yielding to event loop
// eslint-disable-next-line promise/prefer-await-to-callbacks -- Type declaration, not actual callback
declare function setImmediate(callback: (value?: unknown) => void): unknown

import { createLogger } from "loggily"
import type { Database } from "bun:sqlite"
import { createLinkResolver } from "./link-resolver.ts"
import type { StepYield, PendingLink, LoadError } from "../repo/loader.ts"

const log = createLogger("km:storage:link-resolution")

// ============================================================================
// TYPES
// ============================================================================

/** Resolved link data for database insertion */
export interface LinkData {
  source_id: string
  target_name: string
  target_id: string | null
  section: string | null
  block_id: string | null
  alias: string | null
  embedded: boolean
  relationship: string | null
}

/** Embedded link update for batch UPDATE */
export interface EmbeddedUpdate {
  source_id: string
  target_id: string
  alias: string | null
}

/** Result from link resolution */
interface LinkResolutionResult {
  linksToInsert: LinkData[]
  embeddedUpdates: EmbeddedUpdate[]
  resolvedCount: number
}

// ============================================================================
// CORE RESOLUTION LOGIC
// ============================================================================

/**
 * Apply resolved links to database.
 * Single transaction for all inserts and updates.
 *
 * @param db - Database for writing
 * @param result - Resolution result from resolvePendingLinks
 */
function applyResolvedLinks(db: Database, result: LinkResolutionResult): void {
  const { linksToInsert, embeddedUpdates } = result

  if (linksToInsert.length === 0) return

  const now = Date.now()

  db.run("BEGIN IMMEDIATE")
  try {
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO links
      (source_id, target_name, target_id, section, block_id, alias, embedded, relationship, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const link of linksToInsert) {
      insertStmt.run(
        link.source_id,
        link.target_name,
        link.target_id,
        link.section,
        link.block_id,
        link.alias,
        link.embedded ? 1 : 0,
        link.relationship,
        now,
      )
    }

    // Batch UPDATE for embedded links — set symlink_to on the source node.
    // Node type stays as-is (p, h, etc.) — symlink_to is orthogonal to type.
    if (embeddedUpdates.length > 0) {
      const updateStmt = db.prepare(`
        UPDATE nodes SET symlink_to = ?, name = ?, updated_at = ? WHERE id = ?
      `)
      for (const update of embeddedUpdates) {
        updateStmt.run(update.target_id, update.alias, now, update.source_id)
      }
    }

    db.run("COMMIT")
  } catch (error) {
    db.run("ROLLBACK")
    throw error
  }
}

// ============================================================================
// SYNC GENERATOR WRAPPER
// ============================================================================

/**
 * Resolve links with generator-based progress.
 * Used by loadRepo() for sync loading with progress updates.
 *
 * @param db - Database for resolution and writing
 * @param pendingLinks - Links to resolve
 * @param errors - Errors accumulator
 * @yields Progress updates
 * @returns Number of resolved links
 */
export function* resolveLinksGen(
  db: Database,
  pendingLinks: PendingLink[],
  errors: LoadError[],
): Generator<StepYield, number, unknown> {
  const total = pendingLinks.length
  if (total === 0) return 0

  yield "Resolving links"
  yield { current: 0, total }

  try {
    // Phase 1: Build link data (with progress)
    const resolver = createLinkResolver(db)
    const linksToInsert: LinkData[] = []
    const embeddedUpdates: EmbeddedUpdate[] = []
    let resolved = 0

    for (const [i, { nodeId, link, relationship }] of pendingLinks.entries()) {
      let targetId: string | null = null

      // Prefer block_id resolution (stable across content edits)
      if (link.blockId) {
        targetId = resolver.resolveBlockId(link.blockId)
      }

      if (!targetId) {
        targetId = resolver.resolveTarget(link.target)
        if (targetId && link.section) {
          const sectionId = resolver.resolveSection(targetId, link.section)
          if (sectionId) {
            targetId = sectionId
          }
        }
      }

      linksToInsert.push({
        source_id: nodeId,
        target_name: link.target,
        target_id: targetId,
        section: link.section ?? null,
        block_id: link.blockId ?? null,
        alias: link.alias ?? null,
        embedded: link.embedded ?? false,
        relationship: relationship ?? null,
      })

      if (link.embedded && targetId) {
        embeddedUpdates.push({
          source_id: nodeId,
          target_id: targetId,
          alias: link.alias ?? null,
        })
      }

      if (targetId) {
        resolved++
      }

      // Yield progress every 100 links (building phase)
      if (i % 100 === 0) {
        yield { current: Math.floor(i / 2), total } // First half is building
      }
    }

    // Phase 2: Apply to database
    applyResolvedLinks(db, {
      linksToInsert,
      embeddedUpdates,
      resolvedCount: resolved,
    })

    yield { current: total, total }
    return resolved
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    errors.push({ phase: "resolve", message })
    return 0
  }
}

// ============================================================================
// ASYNC WRAPPER
// ============================================================================

/**
 * Resolve pending links asynchronously (after board renders).
 * Yields to event loop between batches to keep UI responsive.
 *
 * @param db - Database for resolution and writing
 * @param pendingLinks - Links to resolve
 * @param onProgress - Optional callback for progress updates
 * @returns Number of successfully resolved links
 */
export async function resolveLinksAsync(
  db: Database,
  pendingLinks: PendingLink[],
  onProgress?: (current: number, total: number) => void,
): Promise<number> {
  const total = pendingLinks.length
  if (total === 0) return 0

  log.debug?.(`resolveLinksAsync: starting ${total} links`)

  // Use shared LinkResolver for O(1) lookups
  const resolver = createLinkResolver(db)

  const linksToInsert: LinkData[] = []
  const embeddedUpdates: EmbeddedUpdate[] = []
  let resolved = 0
  const BATCH_SIZE = 50

  // Phase 1: Build link data, yielding periodically
  for (const [i, { nodeId, link, relationship }] of pendingLinks.entries()) {
    let targetId: string | null = null

    // Prefer block_id resolution (stable across content edits)
    if (link.blockId) {
      targetId = resolver.resolveBlockId(link.blockId)
    }

    if (!targetId) {
      targetId = resolver.resolveTarget(link.target)
      if (targetId && link.section) {
        const sectionId = resolver.resolveSection(targetId, link.section)
        if (sectionId) {
          targetId = sectionId
        }
      }
    }

    linksToInsert.push({
      source_id: nodeId,
      target_name: link.target,
      target_id: targetId,
      section: link.section ?? null,
      block_id: link.blockId ?? null,
      alias: link.alias ?? null,
      embedded: link.embedded ?? false,
      relationship: relationship ?? null,
    })

    if (link.embedded && targetId) {
      embeddedUpdates.push({
        source_id: nodeId,
        target_id: targetId,
        alias: link.alias ?? null,
      })
    }

    if (targetId) {
      resolved++
    }

    // Yield to event loop periodically to keep UI responsive
    if (i % BATCH_SIZE === 0) {
      onProgress?.(i, total)
      await new Promise((resolve) => {
        setImmediate(resolve)
      })
    }
  }

  // Phase 2: Apply to database
  applyResolvedLinks(db, {
    linksToInsert,
    embeddedUpdates,
    resolvedCount: resolved,
  })

  onProgress?.(total, total)
  log.debug?.(`resolveLinksAsync: completed, ${resolved} resolved`)
  return resolved
}
