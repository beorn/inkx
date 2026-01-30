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
import createDebug from "debug"
import { findChildByContent } from "./db-queries/wikilink-resolver.ts"

const debug = createDebug("km:storage:link-resolver")

export interface LinkResolver {
  /** Resolve a wikilink target name to a node ID */
  resolveTarget(targetName: string): string | null

  /** Resolve a section reference within a file */
  resolveSection(fileId: string, sectionName: string): string | null

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
  // Index by both basename and full path for flexible matching
  // Include any node with fs_path (files and folders) to support folder embeds
  const filesByName = new Map<string, string>()

  const rows = db
    .query(
      `
    SELECT id, fs_path, json_extract(data, '$.name') as name
    FROM nodes
    WHERE fs_path IS NOT NULL
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

  debug("created resolver with %d files", filesByName.size)

  // Cache for section lookups: "fileId:sectionName" → nodeId
  const sectionCache = new Map<string, string | null>()

  return {
    resolveTarget(targetName: string): string | null {
      const normalized = targetName.toLowerCase().replace(/\.md$/i, "")
      return filesByName.get(normalized) ?? null
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

    addFile(id: string, name: string): void {
      const normalized = name.toLowerCase().replace(/\.md$/i, "")
      filesByName.set(normalized, id)
    },

    get size(): number {
      return filesByName.size
    },
  }
}
