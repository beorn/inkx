/**
 * Wikilink Resolver Queries
 *
 * Functions for resolving wikilinks: finding files by name
 * and finding sections within files.
 */

import type { KNode } from "@km/core";
import { getDb } from "../db-instance.ts";
import { rowToNode } from "./utils.ts";

// =============================================================================
// Wikilink Resolution
// =============================================================================

/**
 * Find a file node by name (for wikilink resolution)
 */
export function findFileByName(name: string): KNode | null {
  const db = getDb();
  const normalizedName = name.toLowerCase().replace(/\.md$/, "");

  const row = db
    .query(
      `
    SELECT * FROM nodes
    WHERE type = 'file'
    AND (
      LOWER(REPLACE(fs_path, '.md', '')) LIKE '%' || ? || '%'
      OR LOWER(json_extract(data, '$.name')) = ?
    )
    LIMIT 1
  `,
    )
    .get(normalizedName, normalizedName) as Record<string, unknown> | null;

  if (!row) return null;
  return rowToNode(row);
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
 * @param fileId - The file node ID to search within
 * @param sectionName - The section/content name to match
 * @returns The matching child node, or null if not found
 */
export function findChildByContent(
  fileId: string,
  sectionName: string,
): KNode | null {
  const db = getDb();
  const normalizedSection = sectionName.toLowerCase().trim();

  // Get all descendants of this file
  const rows = db
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
    ) as Record<string, unknown> | null;

  if (!rows) return null;
  return rowToNode(rows);
}
