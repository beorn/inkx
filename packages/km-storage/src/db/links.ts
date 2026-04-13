/**
 * Database Links - Link management for wikilinks
 *
 * This module handles all link-related operations:
 * - Adding/removing links
 * - Querying outgoing links (forward links)
 * - Querying incoming links (backlinks)
 * - Resolving unresolved links
 */

import type { Database } from "bun:sqlite"
import { createLogger } from "loggily"
import { createDbOps } from "./ops.ts"
import { findChildByContent } from "./queries/index.ts"

const log = createLogger("km:storage:db:links")

// =============================================================================
// Types
// =============================================================================

/**
 * Link record for wikilinks and property-based links
 */
export interface Link {
  source_id: string
  target_name: string
  target_id: string | null
  section: string | null
  block_id: string | null
  alias: string | null
  embedded: boolean
  /** Property name for property-based links (e.g., "blocked-by"), null for wikilinks */
  relationship: string | null
  created_at: number
}

// =============================================================================
// Write Operations
// =============================================================================

/**
 * Add a link from source to target
 */
export function addLink(db: Database, link: Omit<Link, "created_at">): void {
  db.run(
    `
    INSERT OR REPLACE INTO links (source_id, target_name, target_id, section, block_id, alias, embedded, relationship, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      link.source_id,
      link.target_name,
      link.target_id,
      link.section,
      link.block_id,
      link.alias,
      link.embedded ? 1 : 0,
      link.relationship,
      Date.now(),
    ],
  )

  // For embedded links, update the source node's embed_of
  // Use "memory" mode - embed_of is derived state, not user intent (no events)
  if (link.embedded && link.target_id) {
    createDbOps(db).updateNode(link.source_id, {
      embed_of: link.target_id,
      name: link.alias ?? undefined,
    })
  }
}

/**
 * Remove all links from a source node
 */
export function removeLinksFromSource(db: Database, sourceId: string): void {
  db.run("DELETE FROM links WHERE source_id = ?", [sourceId])
}

/**
 * Remove links from a source node with a specific relationship type.
 * Used to clear computed links before re-evaluation.
 */
export function removeLinksFromSourceByRelationship(db: Database, sourceId: string, relationship: string): void {
  db.run("DELETE FROM links WHERE source_id = ? AND relationship = ?", [sourceId, relationship])
}

/**
 * Resolve unresolved links to a target node
 * Call this when a new node is created that might match pending links
 */
export function resolveLinks(db: Database, targetId: string, targetName: string): number {
  const normalizedName = targetName.toLowerCase().replace(/\.md$/, "")

  // Find all unresolved links that match this target name
  const unresolvedLinks = db
    .query(
      `
    SELECT source_id, section, block_id, alias, embedded FROM links
    WHERE target_id IS NULL
    AND LOWER(REPLACE(target_name, '.md', '')) = ?
  `,
    )
    .all(normalizedName) as Array<{
    source_id: string
    section: string | null
    block_id: string | null
    alias: string | null
    embedded: number
  }>

  let resolvedCount = 0

  for (const link of unresolvedLinks) {
    // Determine the actual target: if there's a section, try to find the child
    let actualTargetId = targetId
    if (link.section) {
      const childNode = findChildByContent(db, targetId, link.section)
      if (childNode) {
        actualTargetId = childNode.id
      }
    }

    // Update this specific link — scope by section and block_id to avoid
    // updating sibling links (e.g., [[doc#A]] vs [[doc#B]]) from the same source
    db.run(
      `
      UPDATE links
      SET target_id = ?
      WHERE source_id = ?
      AND target_id IS NULL
      AND LOWER(REPLACE(target_name, '.md', '')) = ?
      AND section IS ?
      AND block_id IS ?
    `,
      [actualTargetId, link.source_id, normalizedName, link.section, link.block_id],
    )
    resolvedCount++

    // For embedded links, update the source node's embed_of
    // Use "memory" mode - embed_of is derived state, not user intent (no events)
    if (link.embedded) {
      createDbOps(db).updateNode(link.source_id, {
        embed_of: actualTargetId,
        name: link.alias ?? undefined,
      })
    }
  }

  log.debug?.(`resolveLinks targetName=${targetName} targetId=${targetId} resolved=${resolvedCount}`)
  return resolvedCount
}

/**
 * Batch resolve unresolved links to multiple target nodes.
 * Much faster than calling resolveLinks() per file when processing many files.
 *
 * Call this after creating multiple files to resolve all pending links in one pass.
 *
 * @param targets - Array of {id, name} for newly created file nodes
 * @returns Number of links resolved
 */
export function resolveLinksBatch(db: Database, targets: Array<{ id: string; name: string }>): number {
  if (targets.length === 0) return 0

  // Build lookup map: normalized name -> target id
  const targetsByName = new Map<string, string>()
  for (const t of targets) {
    const normalized = t.name.toLowerCase().replace(/\.md$/, "")
    targetsByName.set(normalized, t.id)
  }

  // Single query for all unresolved links
  const unresolvedLinks = db
    .query(
      `
    SELECT source_id, target_name, section, block_id, alias, embedded FROM links
    WHERE target_id IS NULL
  `,
    )
    .all() as Array<{
    source_id: string
    target_name: string
    section: string | null
    block_id: string | null
    alias: string | null
    embedded: number
  }>

  let resolved = 0

  for (const link of unresolvedLinks) {
    const normalized = link.target_name.toLowerCase().replace(/\.md$/, "")
    const targetId = targetsByName.get(normalized)

    if (!targetId) continue

    // Determine actual target: if there's a section, try to find the child
    let actualTargetId = targetId
    if (link.section) {
      const childNode = findChildByContent(db, targetId, link.section)
      if (childNode) {
        actualTargetId = childNode.id
      }
    }

    // Update the link — scope by section and block_id to avoid
    // updating sibling links (e.g., [[doc#A]] vs [[doc#B]]) from the same source
    db.run(
      `
      UPDATE links
      SET target_id = ?
      WHERE source_id = ?
      AND target_id IS NULL
      AND LOWER(REPLACE(target_name, '.md', '')) = ?
      AND section IS ?
      AND block_id IS ?
    `,
      [actualTargetId, link.source_id, normalized, link.section, link.block_id],
    )
    resolved++

    // For embedded links, update the source node's embed_of
    if (link.embedded) {
      createDbOps(db).updateNode(link.source_id, {
        embed_of: actualTargetId,
        name: link.alias ?? undefined,
      })
    }
  }

  log.debug?.(`resolveLinksBatch targets=${targets.length} resolved=${resolved}`)
  return resolved
}

/**
 * Update target_name in links when a node is renamed.
 * When targetId is provided, only updates links pointing at that specific node
 * (prevents corrupting links to other nodes that happen to share the same name).
 * Returns the number of links updated.
 */
export function updateTargetName(db: Database, oldName: string, newName: string, targetId?: string): number {
  const normalizedOld = oldName.toLowerCase().replace(/\.md$/, "")
  if (targetId) {
    const result = db.run(
      `UPDATE links SET target_name = ? WHERE LOWER(REPLACE(target_name, '.md', '')) = ? AND target_id = ?`,
      [newName, normalizedOld, targetId],
    )
    return result.changes
  }
  const result = db.run(`UPDATE links SET target_name = ? WHERE LOWER(REPLACE(target_name, '.md', '')) = ?`, [
    newName,
    normalizedOld,
  ])
  return result.changes
}

// =============================================================================
// Read Operations
// =============================================================================

/**
 * Get outgoing links from a node (forward links)
 */
export function getOutgoingLinks(db: Database, sourceId: string): Link[] {
  const rows = db.query("SELECT * FROM links WHERE source_id = ?").all(sourceId) as Array<Record<string, unknown>>

  return rows.map(rowToLink)
}

/**
 * Get incoming links to a node (backlinks)
 */
export function getBacklinks(db: Database, targetId: string): Link[] {
  const rows = db.query("SELECT * FROM links WHERE target_id = ?").all(targetId) as Array<Record<string, unknown>>

  return rows.map(rowToLink)
}

/**
 * Get backlinks by target name (for unresolved links)
 */
export function getBacklinksByName(db: Database, targetName: string): Link[] {
  // Match by name (case-insensitive, with or without .md extension)
  const normalizedName = targetName.toLowerCase().replace(/\.md$/, "")
  const rows = db
    .query(
      `
    SELECT * FROM links
    WHERE LOWER(REPLACE(target_name, '.md', '')) = ?
  `,
    )
    .all(normalizedName) as Array<Record<string, unknown>>

  return rows.map(rowToLink)
}

// =============================================================================
// Row Conversion
// =============================================================================

/**
 * Convert database row to Link object
 */
function rowToLink(row: Record<string, unknown>): Link {
  return {
    source_id: row.source_id as string,
    target_name: row.target_name as string,
    target_id: row.target_id as string | null,
    section: row.section as string | null,
    block_id: row.block_id as string | null,
    alias: row.alias as string | null,
    embedded: Boolean(row.embedded),
    relationship: (row.relationship as string | null) ?? null,
    created_at: row.created_at as number,
  }
}
