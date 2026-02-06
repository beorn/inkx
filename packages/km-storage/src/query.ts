/**
 * Query Executor
 *
 * Executes parsed queries against the SQLite database.
 * Parsing is done by @km/core query module.
 */

import { createLogger } from "@beorn/logger"
import type { Database } from "bun:sqlite"
import { rowToNode } from "./db-queries/index.ts"

const log = createLogger("km:storage:query")
import {
  parseQuery as parse,
  resolveDateQuery as resolveDate,
  isDateShortcut,
  isDateField,
  type KNode,
  type QueryAST,
  type QueryCondition,
  type QueryRef,
  type QueryPath,
  type QueryPropCondition,
  type QuerySpecial,
  type DateRange,
} from "@km/core"

// Re-export parsing types and functions from @km/core
export {
  parse as parseQuery,
  resolveDate as resolveDateQuery,
  type QueryAST,
  type QueryCondition,
  type QueryRef,
  type DateRange,
}

/** Options for executeQuery */
export interface QueryOptions {
  /** Filter by structural type (e.g., "file", "section") */
  baseType?: string
  /** If true, only return nodes with task_status set (any node acting as a task) */
  requireTaskStatus?: boolean
}

/**
 * Execute a query against the database
 */
export function executeQuery(
  db: Database,
  ast: QueryAST,
  baseType?: string,
  options?: QueryOptions,
): KNode[] {
  const requireTaskStatus = options?.requireTaskStatus ?? false
  const needsPathFilter = ast.paths.length > 0
  const params: (string | number)[] = []

  // Build base SQL (with or without CTE for path ancestor lookup)
  let sql = needsPathFilter
    ? buildPathCteSelect()
    : "SELECT * FROM nodes WHERE 1=1"

  // Apply type and task_status filters
  if (baseType) {
    sql += " AND type = ?"
    params.push(baseType)
  }
  if (requireTaskStatus) {
    sql += " AND task_status IS NOT NULL"
  }

  // Apply AST conditions
  for (const cond of ast.conditions) sql += buildFieldCondition(cond, params)
  for (const ref of ast.refs) sql += buildRefCondition(ref, params)
  for (const propCond of ast.propConditions) {
    sql += buildPropCondition(propCond, params)
  }
  const outerTable = needsPathFilter ? "n" : "nodes"
  for (const special of ast.specials) {
    sql += buildBlockedCondition(special, outerTable)
  }
  for (const term of ast.text) sql += buildTextCondition(term, params)
  const pathColumn = needsPathFilter ? "effective_path" : "fs_path"
  for (const pathFilter of ast.paths) {
    sql += buildPathCondition(pathFilter, pathColumn, params)
  }

  sql += " ORDER BY parent_idx ASC, created_at DESC"

  const start = Date.now()
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  const nodes = rows.map(rowToNode)
  log.debug?.(
    `executeQuery results=${nodes.length} ms=${Date.now() - start} type=${baseType ?? "any"} conditions=${ast.conditions.length} paths=${ast.paths.length}`,
  )
  return nodes
}

/**
 * Query tasks with a string query
 * A "task" is any node with task_status set, regardless of structural type
 */
export function queryTasks(db: Database, query: string): KNode[] {
  const ast = parse(query)
  return executeQuery(db, ast, undefined, { requireTaskStatus: true })
}

/**
 * Query all nodes with a string query
 */
export function queryNodes(
  db: Database,
  query: string,
  type?: string,
): KNode[] {
  const ast = parse(query)
  return executeQuery(db, ast, type)
}

// ---------------------------------------------------------------------------
// SQL builder helpers
// Each takes the relevant AST piece and a params array (which it pushes to),
// and returns a SQL fragment string (e.g., " AND field = ?").
// ---------------------------------------------------------------------------

/** Build the recursive CTE SELECT for path ancestor lookup */
function buildPathCteSelect(): string {
  return `
      WITH RECURSIVE node_ancestors AS (
        -- Base case: start with each node
        SELECT
          id AS node_id,
          id AS current_id,
          parent_id,
          fs_path,
          0 AS depth
        FROM nodes

        UNION ALL

        -- Recursive case: walk up to parent
        SELECT
          na.node_id,
          n.id,
          n.parent_id,
          n.fs_path,
          na.depth + 1
        FROM node_ancestors na
        JOIN nodes n ON n.id = na.parent_id
        WHERE na.fs_path IS NULL  -- Stop when we find an fs_path
      ),
      node_paths AS (
        -- Get the first ancestor with fs_path for each node
        SELECT node_id, fs_path AS effective_path
        FROM node_ancestors
        WHERE fs_path IS NOT NULL
        GROUP BY node_id
      )
      SELECT n.*, COALESCE(n.fs_path, np.effective_path) AS effective_path
      FROM nodes n
      LEFT JOIN node_paths np ON n.id = np.node_id
      WHERE 1=1`
}

/** Handle date shortcut resolution and general field conditions */
function buildFieldCondition(
  cond: QueryCondition,
  params: (string | number)[],
): string {
  const { field, op, value } = cond

  // Handle date shortcuts for date fields
  if (isDateField(field) && isDateShortcut(value)) {
    const dateRange = resolveDate(value)
    if (dateRange) return buildDateCondition(field, op, dateRange, params)
  }

  // Handle comma-separated values (e.g., status:open,blocked -> IN clause)
  const values = value.split(",").filter((v: string) => v.length > 0)

  if (op === "=") {
    if (values.length > 1) {
      const placeholders = values.map(() => "?").join(", ")
      params.push(...values)
      return ` AND ${field} IN (${placeholders})`
    }
    params.push(value)
    return ` AND ${field} = ?`
  }
  if (op === "!=") {
    if (values.length > 1) {
      const placeholders = values.map(() => "?").join(", ")
      params.push(...values)
      return ` AND (${field} NOT IN (${placeholders}) OR ${field} IS NULL)`
    }
    params.push(value)
    return ` AND (${field} != ? OR ${field} IS NULL)`
  }
  if (op === ">" || op === "<" || op === ">=" || op === "<=") {
    params.push(value)
    return ` AND ${field} ${op} ?`
  }
  if (op === "LIKE") {
    params.push(`%${value}%`)
    return ` AND ${field} LIKE ?`
  }
  return ""
}

/** Build SQL for date field with resolved date range */
function buildDateCondition(
  field: string,
  op: string,
  dateRange: DateRange,
  params: (string | number)[],
): string {
  if (op !== "=" && op !== "!=") return ""

  if (dateRange.start === dateRange.end) {
    // Single day - use exact match or not equal
    if (op === "=") {
      params.push(dateRange.start)
      return ` AND ${field} = ?`
    }
    params.push(dateRange.start)
    return ` AND (${field} != ? OR ${field} IS NULL)`
  }

  // Date range
  if (op === "=") {
    params.push(dateRange.start, dateRange.end)
    return ` AND ${field} >= ? AND ${field} <= ?`
  }
  params.push(dateRange.start, dateRange.end)
  return ` AND (${field} < ? OR ${field} > ? OR ${field} IS NULL)`
}

/** Build SQL for reference filters (person/tag/project stored in JSON data) */
function buildRefCondition(ref: QueryRef, params: (string | number)[]): string {
  const jsonPath =
    ref.type === "person"
      ? "mentions"
      : ref.type === "tag"
        ? "tags"
        : "projects"

  if (ref.negated) {
    params.push(`%"${ref.value}"%`)
    return ` AND (data IS NULL OR json_extract(data, '$') NOT LIKE ?)`
  }
  params.push(`%"${ref.value}"%`)
  return ` AND json_extract(data, '$.${jsonPath}') LIKE ?`
}

/**
 * Build SQL for property conditions (data.props queries).
 * Properties are stored as PropertyValue objects:
 * - { type: "number", value: N }
 * - { type: "link", target: "..." }
 * - { type: "text", value: "..." }
 * - { type: "date", value: "YYYY-MM-DD" }
 * - { type: "list", values: [...] }
 */
function buildPropCondition(
  propCond: QueryPropCondition,
  params: (string | number)[],
): string {
  const { prop, op, value, negated } = propCond
  const jsonPath = `$.props.${prop}`
  const valuePath = `$.props.${prop}.value` // For number/text/date
  const targetPath = `$.props.${prop}.target` // For link

  if (op === "exists") {
    params.push(jsonPath)
    if (negated) return ` AND (data IS NULL OR json_extract(data, ?) IS NULL)`
    return ` AND json_extract(data, ?) IS NOT NULL`
  }

  if ((op === "=" || op === "!=") && value !== undefined) {
    const effectiveOp = negated ? (op === "=" ? "!=" : "=") : op
    if (effectiveOp === "=") {
      // Match value in different property types:
      // - number/text/date: $.props.X.value = ?
      // - link: $.props.X.target = ?
      // - list: $.props.X.values contains the value (LIKE search)
      params.push(valuePath, value, targetPath, value, jsonPath, `%"${value}"%`)
      return ` AND (json_extract(data, ?) = ? OR json_extract(data, ?) = ? OR json_extract(data, ?) LIKE ?)`
    }
    // Not equal - must not match in any form
    params.push(
      jsonPath,
      valuePath,
      value,
      targetPath,
      value,
      jsonPath,
      `%"${value}"%`,
    )
    return ` AND (json_extract(data, ?) IS NULL OR (json_extract(data, ?) != ? AND json_extract(data, ?) != ? AND json_extract(data, ?) NOT LIKE ?))`
  }

  if (
    (op === ">" || op === "<" || op === ">=" || op === "<=") &&
    value !== undefined
  ) {
    // Numeric comparison - extract from $.props.X.value
    params.push(valuePath, value)
    return ` AND CAST(json_extract(data, ?) AS REAL) ${op} ?`
  }

  return ""
}

/**
 * Build SQL for blocked:true/false special conditions.
 * blocked:true = has blocked-by property pointing to at least one non-done task
 * blocked:false = no blocked-by property OR all blockers are done
 */
function buildBlockedCondition(
  special: QuerySpecial,
  outerTable: string,
): string {
  if (special.type !== "blocked") return ""

  if (special.value) {
    // blocked:true - has blocked-by property with at least one unresolved blocker
    return (
      ` AND json_extract(data, '$.props.blocked-by') IS NOT NULL` +
      ` AND EXISTS (
          SELECT 1 FROM nodes AS blocker
          WHERE (
            blocker.id = json_extract(${outerTable}.data, '$.props.blocked-by.target')
            OR blocker.name = json_extract(${outerTable}.data, '$.props.blocked-by.target')
            OR json_extract(${outerTable}.data, '$.props.blocked-by') LIKE '%"target":"' || blocker.id || '"%'
            OR json_extract(${outerTable}.data, '$.props.blocked-by') LIKE '%"target":"' || blocker.name || '"%'
          )
          AND (blocker.task_status IS NULL OR blocker.task_status NOT IN ('done', 'dropped'))
        )`
    )
  }

  // blocked:false - no blocked-by property OR all blockers are done
  return ` AND (
          json_extract(data, '$.props.blocked-by') IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM nodes AS blocker
            WHERE (
              blocker.id = json_extract(${outerTable}.data, '$.props.blocked-by.target')
              OR blocker.name = json_extract(${outerTable}.data, '$.props.blocked-by.target')
              OR json_extract(${outerTable}.data, '$.props.blocked-by') LIKE '%"target":"' || blocker.id || '"%'
              OR json_extract(${outerTable}.data, '$.props.blocked-by') LIKE '%"target":"' || blocker.name || '"%'
            )
            AND (blocker.task_status IS NULL OR blocker.task_status NOT IN ('done', 'dropped'))
          )
        )`
}

/** Build SQL for text search with negation support */
function buildTextCondition(term: string, params: (string | number)[]): string {
  if (term.startsWith("-")) {
    params.push(`%${term.slice(1)}%`)
    return " AND content NOT LIKE ?"
  }
  params.push(`%${term}%`)
  return " AND content LIKE ?"
}

/**
 * Build SQL for path pattern matching.
 * Path patterns match against effective_path (includes ancestor lookup for child nodes).
 */
function buildPathCondition(
  pathFilter: QueryPath,
  pathColumn: string,
  params: (string | number)[],
): string {
  const { pattern, recursive, negated } = pathFilter

  // Normalize pattern:
  // - Remove leading ./ for relative paths
  // - Remove leading / for absolute paths
  // - Remove trailing / if present
  let normalizedPattern = pattern
  if (normalizedPattern.startsWith("./")) {
    normalizedPattern = normalizedPattern.slice(2)
  }
  if (normalizedPattern.startsWith("/")) {
    normalizedPattern = normalizedPattern.slice(1)
  }
  if (normalizedPattern.endsWith("/")) {
    normalizedPattern = normalizedPattern.slice(0, -1)
  }

  // Default to recursive matching (./folder matches all contents)
  // Use ./folder$ for non-recursive (direct children only)
  const isNonRecursive = normalizedPattern.endsWith("$")
  if (isNonRecursive) {
    normalizedPattern = normalizedPattern.slice(0, -1)
  }
  const effectiveRecursive = recursive || !isNonRecursive

  if (effectiveRecursive) {
    // Recursive pattern (e.g., ./inbox/** or ./inbox)
    // Matches:
    //   - /root/inbox/file.md (file directly in folder)
    //   - /root/inbox/sub/file.md (file in subfolder)
    //   - /root/inbox.md (the folder itself as a file)
    if (negated) {
      params.push(
        `%/${normalizedPattern}/%`, // files inside folder
        `%/${normalizedPattern}.md`, // the folder file itself
        `%/${normalizedPattern}`, // exact match at end
      )
      return ` AND (${pathColumn} IS NULL OR (${pathColumn} NOT LIKE ? AND ${pathColumn} NOT LIKE ? AND ${pathColumn} NOT LIKE ?))`
    }
    params.push(
      `%/${normalizedPattern}/%`, // files inside folder
      `%/${normalizedPattern}.md`, // the folder file itself
      `%/${normalizedPattern}`, // exact match at end (for folder names without extension)
    )
    return ` AND (${pathColumn} LIKE ? OR ${pathColumn} LIKE ? OR ${pathColumn} LIKE ?)`
  }

  // Non-recursive pattern (e.g., ./inbox$) - direct children only
  // Only matches files directly in the folder, not subfolders
  if (negated) {
    params.push(`*/${normalizedPattern}/*[!/]*`)
    return ` AND (${pathColumn} IS NULL OR ${pathColumn} NOT GLOB ?)`
  }
  // Match direct children: /folder/file.md but not /folder/sub/file.md
  // GLOB pattern: */folder/* where the part after folder/ has no more slashes
  params.push(`*/${normalizedPattern}/*`, `*/${normalizedPattern}/*/*`)
  return ` AND ${pathColumn} GLOB ? AND ${pathColumn} NOT GLOB ?`
}
