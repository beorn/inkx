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
import { normalizeLinkHref } from "@km/markdown"
import { createLinkResolver } from "./link-resolver.ts"
import type { StepYield, PendingLink, LoadError } from "../repo/loader.ts"

const log = createLogger("km:storage:link-resolution")

// ============================================================================
// TYPES
// ============================================================================

/** Resolved link data for database insertion (canonical 3-column schema). */
export interface LinkData {
  host_id: string
  href: string
  rel: "link" | "embed"
}

/** Embedded link update for batch UPDATE of nodes.embed_of. */
export interface EmbeddedUpdate {
  host_id: string
  embed_of: string
  alias: string | null
}

/** Result from link resolution */
interface LinkResolutionResult {
  linksToInsert: LinkData[]
  embeddedUpdates: EmbeddedUpdate[]
  resolvedCount: number
}

/**
 * Compute the canonical href for a PendingLink. Prefers any href already
 * attached (by the Phase 2 parser or upstream) and falls back to
 * normalizeLinkHref("wiki", …) otherwise, so old call sites don't break.
 */
function pendingLinkHref(pending: PendingLink): string {
  const preset = (pending as { href?: string }).href
  if (typeof preset === "string" && preset.length > 0) return preset
  const { link } = pending
  let label = link.target
  if (link.blockId) label += `^${link.blockId}`
  else if (link.section) label += `#${link.section}`
  return normalizeLinkHref("wiki", label)
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

  db.run("BEGIN IMMEDIATE")
  try {
    const insertStmt = db.prepare(`INSERT INTO links (host_id, href, rel) VALUES (?, ?, ?)`)
    for (const link of linksToInsert) {
      insertStmt.run(link.host_id, link.href, link.rel)
    }

    // Batch UPDATE for embedded links — set embed_of on the host node.
    // `embed_of` is still materialized on `nodes`; it's resolved at write
    // time from the embed row's href. Node type stays as-is.
    if (embeddedUpdates.length > 0) {
      const now = Date.now()
      const updateStmt = db.prepare(`UPDATE nodes SET embed_of = ?, name = ?, updated_at = ? WHERE id = ?`)
      for (const update of embeddedUpdates) {
        updateStmt.run(update.embed_of, update.alias, now, update.host_id)
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

    for (const [i, pending] of pendingLinks.entries()) {
      const { nodeId, link } = pending
      const embedded = link.embedded ?? false
      const href = pendingLinkHref(pending)

      linksToInsert.push({ host_id: nodeId, href, rel: embedded ? "embed" : "link" })

      // For embeds, resolve the target id so nodes.embed_of gets populated.
      if (embedded) {
        let targetId: string | null = null
        if (link.blockId) targetId = resolver.resolveBlockId(link.blockId)
        if (!targetId) {
          targetId = resolver.resolveTarget(link.target)
          if (targetId && link.section) {
            const sectionId = resolver.resolveSection(targetId, link.section)
            if (sectionId) targetId = sectionId
          }
        }
        if (targetId) {
          embeddedUpdates.push({ host_id: nodeId, embed_of: targetId, alias: link.alias ?? null })
          resolved++
        }
      } else if (resolver.resolveTarget(link.target)) {
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
  for (const [i, pending] of pendingLinks.entries()) {
    const { nodeId, link } = pending
    const embedded = link.embedded ?? false
    const href = pendingLinkHref(pending)

    linksToInsert.push({ host_id: nodeId, href, rel: embedded ? "embed" : "link" })

    if (embedded) {
      let targetId: string | null = null
      if (link.blockId) targetId = resolver.resolveBlockId(link.blockId)
      if (!targetId) {
        targetId = resolver.resolveTarget(link.target)
        if (targetId && link.section) {
          const sectionId = resolver.resolveSection(targetId, link.section)
          if (sectionId) targetId = sectionId
        }
      }
      if (targetId) {
        embeddedUpdates.push({ host_id: nodeId, embed_of: targetId, alias: link.alias ?? null })
        resolved++
      }
    } else if (resolver.resolveTarget(link.target)) {
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
