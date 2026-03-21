/**
 * Wikilink Resolver Queries
 *
 * Functions for resolving wikilinks: finding files by name
 * and finding sections within files.
 */

import type { Database } from "bun:sqlite"
import type { KNode } from "@km/core"
import { rowToNode } from "./utils.ts"

// =============================================================================
// Wikilink Resolution
// =============================================================================

/**
 * Find a node by name (for wikilink resolution)
 * Matches files, folders, and sections that have a name field.
 * Falls back to fs_path matching for backwards compatibility.
 */
export function findFileByName(db: Database, name: string): KNode | null {
  const normalizedName = name.toLowerCase().replace(/\.md$/, "")

  // Query all matches and check for ambiguity
  // Prefer exact name matches over path matches
  const rows = db
    .query(
      `
    SELECT * FROM nodes
    WHERE LOWER(name) = ?
       OR (type = 'h' AND item = 1 AND fstype IN ('file', 'mdfile') AND LOWER(REPLACE(fs_path, '.md', '')) LIKE '%' || ? || '%')
    ORDER BY CASE WHEN LOWER(name) = ? THEN 0 ELSE 1 END
    LIMIT 2
  `,
    )
    .all(normalizedName, normalizedName, normalizedName) as Array<Record<string, unknown>>

  if (rows.length === 0) return null
  // Ambiguous — multiple nodes match, return null to avoid arbitrary resolution
  if (rows.length > 1) return null
  const row = rows[0]
  if (!row) return null
  return rowToNode(row)
}

/**
 * Find a child node within a file by content/title matching.
 * Used for resolving section references in wikilinks like [[file#section]].
 *
 * Matches against:
 * - Section title (title field or heading text in content)
 * - Task content (first line of content)
 * - Node name
 *
 * @param db - Database instance
 * @param fileId - The file node ID to search within
 * @param sectionName - The section/content name to match
 * @returns The matching child node, or null if not found
 */
export function findChildByContent(db: Database, fileId: string, sectionName: string): KNode | null {
  const normalizedSection = sectionName.toLowerCase().trim()

  // Get the best-matching descendant of this file
  const row = db
    .query(
      `
    WITH RECURSIVE descendants AS (
      SELECT * FROM nodes WHERE parent_id = ?
      UNION ALL
      SELECT n.* FROM nodes n
      INNER JOIN descendants d ON n.parent_id = d.id
    )
    SELECT * FROM descendants
    WHERE (
      -- Match section title
      LOWER(TRIM(title)) = ?
      -- Match content (first line, stripping task marks)
      OR LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
        SUBSTR(content, 1, INSTR(content || char(10), char(10)) - 1),
        '- [ ] ', ''), '- [x] ', ''), '- [/] ', ''), '- [-] ', ''), '- [!] ', ''
      ))) = ?
      -- Match content containing the search term (for partial matches)
      OR LOWER(content) LIKE '%' || ? || '%'
      -- Match name field
      OR LOWER(name) = ?
    )
    ORDER BY
      -- Prefer exact title matches
      CASE WHEN LOWER(TRIM(title)) = ? THEN 0 ELSE 1 END,
      -- Then exact content matches
      CASE WHEN LOWER(TRIM(content)) LIKE ? || '%' THEN 0 ELSE 1 END,
      -- Then by position in file
      parent_idx
    LIMIT 1
  `,
    )
    .get(
      fileId,
      normalizedSection,
      normalizedSection,
      normalizedSection,
      normalizedSection,
      normalizedSection,
      normalizedSection,
    ) as Record<string, unknown> | null

  if (!row) return null
  return rowToNode(row)
}
