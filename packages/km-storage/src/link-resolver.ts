/**
 * Link Resolver
 *
 * Efficient link resolution using pre-built lookup maps.
 * Eliminates O(n²) DB queries during bulk sync operations.
 *
 * Usage:
 *   const resolver = createLinkResolver(db)
 *   const targetId = resolver.resolveTarget("My Note")
 *   resolver.addFile(newFileId, "New Note") // update map as files are created
 */

import type { Database } from "bun:sqlite"
import { createLogger } from "@beorn/logger"
import { findChildByContent } from "./db-queries/wikilink-resolver.ts"

const log = createLogger("km:storage:link-resolver")

export interface LinkResolver {
  /** Resolve a wikilink target name to a node ID */
  resolveTarget(targetName: string): string | null

  /** Resolve a section reference within a file */
  resolveSection(fileId: string, sectionName: string): string | null

  /** Resolve a block_id reference to a node ID */
  resolveBlockId(blockId: string): string | null

  /** Add a newly created file to the lookup map */
  addFile(id: string, name: string): void

  /** Number of files in the lookup map */
  readonly size: number
}

/**
 * Create a LinkResolver pre-populated with all file nodes from the database.
 */
export function createLinkResolver(db: Database): LinkResolver {
  // Build lookup map: normalized name → node id
  // Use name field for capability-based matching (any named node is linkable)
  // This includes files, folders, and sections
  const filesByName = new Map<string, string>()

  const rows = db
    .query(
      `
    SELECT id, fs_path, name
    FROM nodes
    WHERE name IS NOT NULL
  `,
    )
    .all() as Array<{ id: string; fs_path: string | null; name: string | null }>

  for (const row of rows) {
    // Index by basename from fs_path
    if (row.fs_path) {
      const basename = row.fs_path.split("/").pop()?.replace(/\.md$/i, "")
      if (basename) {
        filesByName.set(basename.toLowerCase(), row.id)
      }
    }
    // Also index by name from data field
    if (row.name) {
      filesByName.set(row.name.toLowerCase(), row.id)
    }
  }

  log.debug?.(`created resolver with ${filesByName.size} files`)

  // Cache for section lookups: "fileId:sectionName" → nodeId
  const sectionCache = new Map<string, string | null>()

  // Prepare statement for node ID fallback (used for ![[ULID]] embeds)
  const nodeIdStmt = db.prepare("SELECT id FROM nodes WHERE id = ? LIMIT 1")

  // Prepare statement for block_id lookups (stable across content edits)
  const blockIdStmt = db.prepare("SELECT id FROM nodes WHERE block_id = ? LIMIT 1")

  return {
    resolveTarget(targetName: string): string | null {
      const normalized = targetName.toLowerCase().replace(/\.md$/i, "")
      const byName = filesByName.get(normalized)
      if (byName) return byName

      // Fallback: check if target is a node ID directly.
      // Handles ![[ULID]] embeds serialized from link_to task targets.
      const byId = nodeIdStmt.get(targetName) as { id: string } | null
      return byId?.id ?? null
    },

    resolveSection(fileId: string, sectionName: string): string | null {
      const cacheKey = `${fileId}:${sectionName.toLowerCase()}`
      if (sectionCache.has(cacheKey)) {
        return sectionCache.get(cacheKey) ?? null
      }

      // Cache miss - do DB query (only happens once per unique section ref)
      const child = findChildByContent(db, fileId, sectionName)
      const childId = child?.id ?? null
      sectionCache.set(cacheKey, childId)
      return childId
    },

    resolveBlockId(blockId: string): string | null {
      const row = blockIdStmt.get(blockId) as { id: string } | null
      return row?.id ?? null
    },

    addFile(id: string, name: string): void {
      const normalized = name.toLowerCase().replace(/\.md$/i, "")
      filesByName.set(normalized, id)
    },

    get size(): number {
      return filesByName.size
    },
  }
}
