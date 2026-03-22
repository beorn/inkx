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
import { createLogger } from "loggily"
import { basenameFast } from "@km/core"
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
  const filesByName = new Map<string, string | null>()

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
      const name = basenameFast(row.fs_path).replace(/\.md$/i, "")
      if (name) {
        const key = name.toLowerCase()
        const existing = filesByName.get(key)
        if (existing === undefined) {
          filesByName.set(key, row.id)
        } else if (existing !== null && existing !== row.id) {
          filesByName.set(key, null) // ambiguous — multiple nodes share this name
        }
      }
    }
    // Also index by name from data field
    if (row.name) {
      const key = row.name.toLowerCase()
      const existing = filesByName.get(key)
      if (existing === undefined) {
        filesByName.set(key, row.id)
      } else if (existing !== null && existing !== row.id) {
        filesByName.set(key, null) // ambiguous — multiple nodes share this name
      }
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
      // null means ambiguous (multiple nodes with that name) — don't resolve
      if (byName === null) return null

      // Fallback: check if target is a node ID directly.
      // Handles ![[ULID]] embeds serialized from embed_source task targets.
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
      const existing = filesByName.get(normalized)
      if (existing === undefined) {
        filesByName.set(normalized, id)
      } else if (existing !== null && existing !== id) {
        filesByName.set(normalized, null) // ambiguous — multiple nodes share this name
      }
    },

    get size(): number {
      return filesByName.size
    },
  }
}
