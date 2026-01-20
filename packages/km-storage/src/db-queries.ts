/**
 * Database Queries - Read-only query functions
 *
 * This module contains all read-only query operations against the database.
 * All functions return KNode objects or arrays of them.
 */

import type { KNode, TaskStatus, NodeType, NodeRules } from "@km/core";
import { getDb } from "./db-instance.ts";
import { isExplicitPath } from "./path-utils.ts";
import { resolve } from "path";

// =============================================================================
// Core Queries
// =============================================================================

/**
 * Get a node by ID
 */
export function getNode(id: string): KNode | null {
  const db = getDb();
  const row = db.query("SELECT * FROM nodes WHERE id = ?").get(id) as Record<
    string,
    unknown
  > | null;

  if (!row) return null;
  return rowToNode(row);
}

/**
 * Get a node by ID prefix or suffix with optional type filter.
 *
 * Supports both prefix matching (start of ID) and suffix matching (end of ID).
 * The CLI displays short IDs using the last 8 chars (suffix), so we try both.
 *
 * @param idPrefix - The ID or partial ID to search for
 * @param typeFilter - Optional type to filter by (e.g., 'task')
 */
function getNodeByIdPrefixWithType(
  idPrefix: string,
  typeFilter?: string,
): KNode | null {
  const db = getDb();
  const typeClause = typeFilter ? " AND type = ?" : "";
  const params = typeFilter ? [idPrefix, typeFilter] : [idPrefix];

  // Try exact match first
  let row = db
    .query(`SELECT * FROM nodes WHERE id = ?${typeClause}`)
    .get(...params) as Record<string, unknown> | null;

  if (row) return rowToNode(row);

  // Try prefix match (ID starts with input)
  const prefixParams = typeFilter
    ? [`${idPrefix}%`, typeFilter]
    : [`${idPrefix}%`];
  row = db
    .query(`SELECT * FROM nodes WHERE id LIKE ?${typeClause}`)
    .get(...prefixParams) as Record<string, unknown> | null;

  if (row) return rowToNode(row);

  // Try suffix match (ID ends with input) - for short IDs displayed as last 8 chars
  const suffixParams = typeFilter
    ? [`%${idPrefix}`, typeFilter]
    : [`%${idPrefix}`];
  row = db
    .query(`SELECT * FROM nodes WHERE id LIKE ?${typeClause}`)
    .get(...suffixParams) as Record<string, unknown> | null;

  if (!row) return null;
  return rowToNode(row);
}

/**
 * Get a node by ID prefix or suffix (for CLI convenience)
 */
export function getNodeByIdPrefix(idPrefix: string): KNode | null {
  return getNodeByIdPrefixWithType(idPrefix);
}

/**
 * Get a task by ID prefix or suffix (for CLI convenience)
 */
export function getTaskByIdPrefix(idPrefix: string): KNode | null {
  return getNodeByIdPrefixWithType(idPrefix, "task");
}

/**
 * Get a node by filesystem path
 */
export function getNodeByPath(fsPath: string): KNode | null {
  const db = getDb();
  const row = db
    .query("SELECT * FROM nodes WHERE fs_path = ?")
    .get(fsPath) as Record<string, unknown> | null;

  if (!row) return null;
  return rowToNode(row);
}

/**
 * Get all folder/file nodes under a directory path (for reconciliation)
 */
export function getNodesUnderPath(dirPath: string): KNode[] {
  const db = getDb();
  const rows = db
    .query(
      `
      SELECT * FROM nodes
      WHERE fs_path LIKE ? || '%'
      AND (type = 'folder' OR type = 'file')
    `,
    )
    .all(dirPath) as Record<string, unknown>[];

  return rows.map(rowToNode);
}

/**
 * Get a file node and its children (sections, tasks, etc.)
 */
export function getFileWithChildren(fsPath: string): KNode[] {
  const db = getDb();
  const rows = db
    .query(
      `
      SELECT * FROM nodes
      WHERE fs_path = ? OR parent_id IN (
        SELECT id FROM nodes WHERE fs_path = ?
      )
    `,
    )
    .all(fsPath, fsPath) as Record<string, unknown>[];

  return rows.map(rowToNode);
}

/**
 * Get content hash for a node (for change detection)
 */
export function getNodeContentHash(nodeId: string): string | null {
  const db = getDb();
  const row = db
    .query("SELECT content_hash FROM nodes WHERE id = ?")
    .get(nodeId) as { content_hash: string | null } | undefined;

  return row?.content_hash ?? null;
}

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

// =============================================================================
// Smart Node Resolution
// =============================================================================

/**
 * Smart node resolver - finds a node by various identifiers.
 *
 * Resolution order:
 * 1. Exact ID match
 * 2. ID prefix match (e.g., "abc" matches "abc123...")
 * 3. ID suffix match (e.g., "xyz" matches "...xyz")
 * 4. Exact filesystem path match
 * 5. Filename match (fs_path ends with query)
 * 6. Filename without extension (e.g., "@inbox" matches "@inbox.md")
 * 7. Content/title match (for nodes without fs_path)
 *
 * @param query - ID, path, or filename to search for
 * @param type - Optional type filter (e.g., "task", "file")
 * @returns The matching node, or null if not found
 */
export function resolveNode(query: string, type?: string): KNode | null {
  const db = getDb();
  const typeFilter = type ? " AND type = ?" : "";
  const typeParams = type ? [type] : [];

  // 0. Handle explicit filesystem paths (/, ./, ../)
  // Note: ~ is expanded by the shell before reaching this code
  if (isExplicitPath(query)) {
    const absolutePath = resolve(process.cwd(), query);
    // Try exact absolute path match first
    let row = db
      .query(`SELECT * FROM nodes WHERE fs_path = ?${typeFilter}`)
      .get(absolutePath, ...typeParams) as Record<string, unknown> | null;
    if (row) return rowToNode(row);

    // For directory paths, try finding the corresponding .md file
    // e.g., /vault/Projects → /vault/Projects.md or /vault/Projects/index.md
    if (!absolutePath.endsWith(".md")) {
      // Try sibling .md file (Projects → Projects.md)
      row = db
        .query(`SELECT * FROM nodes WHERE fs_path = ?${typeFilter}`)
        .get(`${absolutePath}.md`, ...typeParams) as Record<
        string,
        unknown
      > | null;
      if (row) return rowToNode(row);

      // Try index.md inside the directory
      row = db
        .query(`SELECT * FROM nodes WHERE fs_path = ?${typeFilter}`)
        .get(`${absolutePath}/index.md`, ...typeParams) as Record<
        string,
        unknown
      > | null;
      if (row) return rowToNode(row);
    }

    // Also try matching by filename suffix (handles relative paths in DB)
    // When DB stores "board.md" but query is "/tmp/vault/board.md"
    row = db
      .query(`SELECT * FROM nodes WHERE fs_path LIKE ?${typeFilter}`)
      .get(`%${absolutePath.split("/").pop()}`, ...typeParams) as Record<
      string,
      unknown
    > | null;
    if (row) return rowToNode(row);

    // Don't fall through for explicit paths - they should match exactly or not at all
    // This prevents /some/path from accidentally matching an ID suffix
    return null;
  }

  // 1. Exact ID match
  let row = db
    .query(`SELECT * FROM nodes WHERE id = ?${typeFilter}`)
    .get(query, ...typeParams) as Record<string, unknown> | null;
  if (row) return rowToNode(row);

  // 2. ID prefix match
  row = db
    .query(`SELECT * FROM nodes WHERE id LIKE ?${typeFilter}`)
    .get(`${query}%`, ...typeParams) as Record<string, unknown> | null;
  if (row) return rowToNode(row);

  // 3. ID suffix match (for short IDs like the last 8 chars)
  row = db
    .query(`SELECT * FROM nodes WHERE id LIKE ?${typeFilter}`)
    .get(`%${query}`, ...typeParams) as Record<string, unknown> | null;
  if (row) return rowToNode(row);

  // 4. Exact filesystem path match
  row = db
    .query(`SELECT * FROM nodes WHERE fs_path = ?${typeFilter}`)
    .get(query, ...typeParams) as Record<string, unknown> | null;
  if (row) return rowToNode(row);

  // 5. Filename match (fs_path ends with the query)
  // This handles cases like "@inbox.md" when full path is "/path/to/@inbox.md"
  row = db
    .query(`SELECT * FROM nodes WHERE fs_path LIKE ?${typeFilter}`)
    .get(`%/${query}`, ...typeParams) as Record<string, unknown> | null;
  if (row) return rowToNode(row);

  // Also try without leading slash (handles bare filenames)
  row = db
    .query(`SELECT * FROM nodes WHERE fs_path LIKE ?${typeFilter}`)
    .get(`%${query}`, ...typeParams) as Record<string, unknown> | null;
  if (row) return rowToNode(row);

  // 6. Filename without extension (e.g., "@inbox" matches "@inbox.md")
  if (!query.includes(".")) {
    row = db
      .query(`SELECT * FROM nodes WHERE fs_path LIKE ?${typeFilter}`)
      .get(`%/${query}.md`, ...typeParams) as Record<string, unknown> | null;
    if (row) return rowToNode(row);

    row = db
      .query(`SELECT * FROM nodes WHERE fs_path LIKE ?${typeFilter}`)
      .get(`%${query}.md`, ...typeParams) as Record<string, unknown> | null;
    if (row) return rowToNode(row);
  }

  // 7. Content/title match (exact match on content field)
  row = db
    .query(`SELECT * FROM nodes WHERE content = ?${typeFilter}`)
    .get(query, ...typeParams) as Record<string, unknown> | null;
  if (row) return rowToNode(row);

  return null;
}

/**
 * Smart task resolver - like resolveNode but only returns tasks.
 *
 * @param query - ID, path, or filename to search for
 * @returns The matching task node, or null if not found
 */
export function resolveTask(query: string): KNode | null {
  return resolveNode(query, "task");
}

// =============================================================================
// Tree Queries
// =============================================================================

/**
 * Get children of a node
 */
export function getChildren(parentId: string | null): KNode[] {
  const db = getDb();

  let rows: Record<string, unknown>[];
  if (parentId === null) {
    rows = db
      .query(
        `
      SELECT * FROM nodes
      WHERE parent_id IS NULL
      ORDER BY parent_idx, created_at
    `,
      )
      .all() as Record<string, unknown>[];
  } else {
    rows = db
      .query(
        `
      SELECT * FROM nodes
      WHERE parent_id = ?
      ORDER BY parent_idx, created_at
    `,
      )
      .all(parentId) as Record<string, unknown>[];
  }

  return rows.map(rowToNode);
}

/**
 * Get subtree (recursive)
 */
export function getSubtree(rootId: string): KNode[] {
  const db = getDb();
  const rows = db
    .query(
      `
    WITH RECURSIVE subtree AS (
      SELECT * FROM nodes WHERE id = ?
      UNION ALL
      SELECT n.* FROM nodes n
      JOIN subtree s ON n.parent_id = s.id
    )
    SELECT * FROM subtree
    ORDER BY parent_idx, created_at
  `,
    )
    .all(rootId) as Record<string, unknown>[];

  return rows.map(rowToNode);
}

/**
 * Get ancestors of a node (from root to parent)
 * Returns array from root down to immediate parent (excludes the node itself)
 */
export function getAncestors(nodeId: string): KNode[] {
  const db = getDb();
  const rows = db
    .query(
      `
    WITH RECURSIVE ancestors AS (
      SELECT * FROM nodes WHERE id = (SELECT parent_id FROM nodes WHERE id = ?)
      UNION ALL
      SELECT n.* FROM nodes n
      JOIN ancestors a ON n.id = a.parent_id
    )
    SELECT * FROM ancestors
  `,
    )
    .all(nodeId) as Record<string, unknown>[];

  // Results come in child-to-root order, reverse to get root-to-parent
  return rows.map(rowToNode).reverse();
}

// =============================================================================
// Task Queries
// =============================================================================

/**
 * Get tasks by status
 */
export function getTasksByStatus(status: TaskStatus | TaskStatus[]): KNode[] {
  const db = getDb();
  const statuses = Array.isArray(status) ? status : [status];
  const placeholders = statuses.map(() => "?").join(", ");

  const rows = db
    .query(
      `
    SELECT * FROM nodes
    WHERE type = 'task' AND task_status IN (${placeholders})
    ORDER BY priority ASC, due_date ASC, created_at ASC
  `,
    )
    .all(...statuses) as Record<string, unknown>[];

  return rows.map(rowToNode);
}

/**
 * Get all tasks
 */
export function getAllTasks(): KNode[] {
  const db = getDb();
  const rows = db
    .query(
      `
    SELECT * FROM nodes
    WHERE type = 'task'
    ORDER BY task_status, priority ASC, due_date ASC, created_at ASC
  `,
    )
    .all() as Record<string, unknown>[];

  return rows.map(rowToNode);
}

/**
 * Get all links pointing to a given node
 * Used to find which boards/sections contain a task
 */
export function getLinksTo(nodeId: string): KNode[] {
  const db = getDb();
  const rows = db
    .query(
      `
    SELECT * FROM nodes
    WHERE link_to = ?
    ORDER BY parent_idx ASC
  `,
    )
    .all(nodeId) as Record<string, unknown>[];

  return rows.map(rowToNode);
}

/**
 * Get tasks with optional status filter
 */
export function getTasksFiltered(options: {
  status?: TaskStatus;
  excludeDone?: boolean;
}): KNode[] {
  const db = getDb();

  let sql = "SELECT * FROM nodes WHERE type = 'task'";
  const params: string[] = [];

  if (options.status) {
    sql += " AND task_status = ?";
    params.push(options.status);
  } else if (options.excludeDone) {
    sql += " AND task_status IN ('todo', 'wip')";
  }

  sql +=
    " ORDER BY priority ASC NULLS LAST, due_date ASC NULLS LAST, created_at DESC";

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(rowToNode);
}

/**
 * Get all tasks under a node (recursive via descendants)
 */
export function getTasksUnderNode(rootId: string): KNode[] {
  const db = getDb();

  // Use recursive CTE to get all descendants
  const rows = db
    .query(
      `
    WITH RECURSIVE descendants(id) AS (
      SELECT id FROM nodes WHERE parent_id = ?
      UNION ALL
      SELECT n.id FROM nodes n
      JOIN descendants d ON n.parent_id = d.id
    )
    SELECT * FROM nodes
    WHERE id IN descendants AND type = 'task'
    ORDER BY priority ASC NULLS LAST, due_date ASC NULLS LAST, created_at DESC
  `,
    )
    .all(rootId) as Record<string, unknown>[];

  return rows.map(rowToNode);
}

/**
 * Get filtered nodes by type and optional status
 */
export function getFilteredNodes(options: {
  type?: string;
  status?: string;
  excludeDone?: boolean;
}): KNode[] {
  const db = getDb();

  let sql = "SELECT * FROM nodes WHERE 1=1";
  const params: string[] = [];

  // Filter by type
  if (options.type) {
    sql += " AND type = ?";
    params.push(options.type);
  }

  // Filter by status (for tasks)
  if (options.type === "task") {
    if (options.status) {
      sql += " AND task_status = ?";
      params.push(options.status);
    } else if (options.excludeDone) {
      sql += " AND (task_status IS NULL OR task_status != 'done')";
    }
  }

  sql += " ORDER BY parent_idx ASC, created_at DESC";

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(rowToNode);
}

/**
 * Find a project/container by name (searches folders, files, sections)
 */
export function findProject(name: string): KNode | null {
  const db = getDb();
  const normalizedName = name.toLowerCase();

  // Search by content or fs_path basename
  const rows = db
    .query(
      `
    SELECT * FROM nodes
    WHERE type IN ('folder', 'file', 'section')
    AND (
      LOWER(content) = ?
      OR LOWER(content) LIKE ?
      OR fs_path LIKE ?
    )
    LIMIT 10
  `,
    )
    .all(
      normalizedName,
      `%${normalizedName}%`,
      `%/${normalizedName}%`,
    ) as Record<string, unknown>[];

  const nodes = rows.map(rowToNode);

  // Prefer exact match
  for (const node of nodes) {
    if (node.content?.toLowerCase() === normalizedName) {
      return node;
    }
    if (node.fs_path?.split("/").pop()?.toLowerCase() === normalizedName) {
      return node;
    }
  }

  // Otherwise return first match
  return nodes[0] ?? null;
}

// =============================================================================
// Full-Text Search
// =============================================================================

/**
 * Convert a search query to FTS5 syntax
 * - Quoted phrases become FTS5 phrase queries
 * - Unquoted terms use prefix matching with *
 */
export function toFts5Query(query: string): string {
  const parts: string[] = [];

  // Extract quoted phrases and replace with placeholders
  const phrases: string[] = [];
  const remaining = query.replace(/"([^"]+)"/g, (_, phrase) => {
    phrases.push(phrase);
    return `__PHRASE_${phrases.length - 1}__`;
  });

  // Split remaining into tokens
  const tokens = remaining.split(/\s+/).filter((t) => t.length > 0);

  for (const token of tokens) {
    // Check if this is a phrase placeholder
    const phraseMatch = token.match(/^__PHRASE_(\d+)__$/);
    if (phraseMatch && phraseMatch[1] !== undefined) {
      const idx = parseInt(phraseMatch[1], 10);
      const phrase = phrases[idx];
      if (phrase !== undefined) {
        // FTS5 phrase syntax: "word1 word2 word3"
        parts.push(`"${phrase}"`);
      }
    } else if (token.startsWith("-")) {
      // Negation: NOT term
      parts.push(`NOT ${token.slice(1)}*`);
    } else {
      // Regular term with prefix matching
      parts.push(`${token}*`);
    }
  }

  return parts.join(" ");
}

/**
 * Full-text search
 */
export function search(query: string, limit = 50): KNode[] {
  const db = getDb();
  const ftsQuery = toFts5Query(query);

  const rows = db
    .query(
      `
    SELECT n.* FROM nodes n
    JOIN nodes_fts f ON n.id = f.id
    WHERE nodes_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `,
    )
    .all(ftsQuery, limit) as Record<string, unknown>[];

  return rows.map(rowToNode);
}

/**
 * Search result with snippet highlighting
 */
export interface SearchResult {
  node: KNode;
  snippet: string;
}

/**
 * Full-text search with snippet highlighting
 *
 * Returns nodes with a snippet showing matching context.
 * Uses FTS5 snippet() function for efficient highlighting.
 *
 * @param query - Search query (supports "quoted phrases" and individual terms)
 * @param limit - Maximum results to return
 * @param snippetOptions - Options for snippet generation
 * @returns Array of search results with highlighted snippets
 */
export function searchWithSnippet(
  query: string,
  limit = 50,
  snippetOptions: {
    startMark?: string;
    endMark?: string;
    ellipsis?: string;
    maxTokens?: number;
  } = {},
): SearchResult[] {
  const db = getDb();
  const ftsQuery = toFts5Query(query);

  const {
    startMark = "<<",
    endMark = ">>",
    ellipsis = "...",
    maxTokens = 32,
  } = snippetOptions;

  // Use snippet() function for highlighting
  // snippet(fts_table, column_idx, start_mark, end_mark, ellipsis, max_tokens)
  // column_idx 1 = content column
  const rows = db
    .query(
      `
    SELECT n.*, snippet(nodes_fts, 1, ?, ?, ?, ?) as snippet
    FROM nodes n
    JOIN nodes_fts f ON n.id = f.id
    WHERE nodes_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `,
    )
    .all(startMark, endMark, ellipsis, maxTokens, ftsQuery, limit) as Array<
    Record<string, unknown> & { snippet: string }
  >;

  return rows.map((row) => ({
    node: rowToNode(row),
    snippet: row.snippet ?? "",
  }));
}

// =============================================================================
// Utility Queries
// =============================================================================

/**
 * Get the last event ID processed
 */
export function getLastEventId(): string | null {
  const db = getDb();
  const row = db
    .query("SELECT value FROM meta WHERE key = ?")
    .get("last_event") as { value: string } | null;

  return row?.value ?? null;
}

/**
 * Get all nodes (for debugging/export)
 */
export function getAllNodes(): KNode[] {
  const db = getDb();
  const rows = db.query("SELECT * FROM nodes").all() as Record<
    string,
    unknown
  >[];
  return rows.map(rowToNode);
}

// =============================================================================
// Row Conversion
// =============================================================================

/**
 * Convert database row to KNode object
 * Title and rules are read from stored values (data.title, data.rules)
 */
export function rowToNode(row: Record<string, unknown>): KNode {
  const type = row.type as NodeType;
  const content = row.content as string | undefined;

  // Parse data JSON
  const data =
    typeof row.data === "string"
      ? (JSON.parse(row.data) as Record<string, unknown>)
      : ((row.data as Record<string, unknown>) ?? {});

  // Extract rules from data.rules (stored by parser during sync)
  const rules = data.rules as NodeRules | undefined;

  return {
    id: row.id as string,
    type,
    parent_id: row.parent_id as string | null,
    parent_idx: row.parent_idx as number,
    link_to: row.link_to as string | null,
    link_alias: row.link_alias as string | undefined,
    fs_path: row.fs_path as string | undefined,
    fs_ino: row.fs_ino as number | undefined,
    name: row.name as string | undefined,
    md_pos: row.md_pos as number | undefined,
    md_slug: row.md_slug as string | undefined,
    md_line: row.md_line as number | undefined,
    task_status: row.task_status as TaskStatus | undefined,
    task_mark: row.task_mark as KNode["task_mark"],
    assigned_to: row.assigned_to as string | undefined,
    due_date: row.due_date as string | undefined,
    scheduled_date: row.scheduled_date as string | undefined,
    priority: row.priority as number | undefined,
    content,
    content_hash: row.content_hash as string | undefined,
    title: row.title as string | undefined,
    rules,
    data,
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
    version: row.version as string,
  };
}
