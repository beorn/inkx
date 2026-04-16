/**
 * Query Executor
 *
 * Executes parsed queries against the SQLite database.
 * Parsing is done by @km/core query module.
 */

import { createLogger } from "loggily"
import type { Database } from "bun:sqlite"
import { rowToNode } from "./db/queries/index.ts"
import { parseTreeGlob } from "@km/core"

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
export function executeQuery(db: Database, ast: QueryAST, baseType?: string, options?: QueryOptions): KNode[] {
  const requireTaskStatus = options?.requireTaskStatus ?? false
  const needsPathFilter = ast.paths.length > 0
  const params: (string | number)[] = []

  // Nodes of type file/folder always have fs_path set — skip the expensive
  // recursive CTE that walks all 500K+ nodes to compute ancestor paths.
  const typeHasFsPath =
    baseType === "file" ||
    baseType === "folder" ||
    ast.conditions.some((c) => c.field === "type" && c.op === "=" && (c.value === "file" || c.value === "folder"))
  const needsCte = needsPathFilter && !typeHasFsPath

  // Build base SQL (with or without CTE for path ancestor lookup)
  let sql = needsCte ? buildPathCteSelect() : "SELECT * FROM nodes WHERE 1=1"

  // Apply type and task_status filters
  // Translate virtual types from old schema to new km-ast types
  if (baseType) {
    const typeFilter = translateBaseType(baseType)
    sql += typeFilter.sql
    params.push(...typeFilter.params)
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
  const outerTable = needsCte ? "n" : "nodes"
  for (const special of ast.specials) {
    sql += buildBlockedCondition(special, outerTable)
  }
  for (const phrase of ast.phrases) sql += buildPhraseCondition(phrase, params)
  for (const term of ast.text) sql += buildTextCondition(term, params)
  const pathColumn = needsCte ? "effective_path" : "fs_path"
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
export function queryNodes(db: Database, query: string, type?: string): KNode[] {
  const ast = parse(query)
  return executeQuery(db, ast, type)
}

// ---------------------------------------------------------------------------
// Virtual type translation
// The query language uses user-friendly type names (task, section, file, folder)
// which map to the km-ast schema (type + fstype columns).
// ---------------------------------------------------------------------------

/** Translate a virtual base type to SQL filter */
function translateBaseType(baseType: string): { sql: string; params: (string | number)[] } {
  switch (baseType) {
    case "task":
      return { sql: " AND task_status IS NOT NULL", params: [] }
    case "section":
      return { sql: " AND type = 'h' AND item = 1 AND fstype IS NULL", params: [] }
    case "file":
      return { sql: " AND type = 'h' AND item = 1 AND fstype IN ('file', 'mdfile')", params: [] }
    case "folder":
      return { sql: " AND type = 'h' AND item = 1 AND fstype = 'folder'", params: [] }
    default:
      return { sql: " AND type = ?", params: [baseType] }
  }
}

/** Translate a type:X field condition to proper SQL */
function translateTypeCondition(value: string, op: string, params: (string | number)[]): string {
  const negated = op === "!="
  switch (value) {
    case "task":
      return negated ? " AND NOT (item = 1 AND task_marker IS NOT NULL)" : " AND item = 1 AND task_marker IS NOT NULL"
    case "section":
      return negated
        ? " AND NOT (type = 'h' AND item = 1 AND fstype IS NULL)"
        : " AND type = 'h' AND item = 1 AND fstype IS NULL"
    case "file":
      return negated
        ? " AND NOT (type = 'h' AND item = 1 AND fstype IN ('file', 'mdfile'))"
        : " AND type = 'h' AND item = 1 AND fstype IN ('file', 'mdfile')"
    case "folder":
      return negated
        ? " AND NOT (type = 'h' AND item = 1 AND fstype = 'folder')"
        : " AND type = 'h' AND item = 1 AND fstype = 'folder'"
    default:
      params.push(value)
      return negated ? ` AND (type != ? OR type IS NULL)` : ` AND type = ?`
  }
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
function buildFieldCondition(cond: QueryCondition, params: (string | number)[]): string {
  const { field, op, value } = cond

  // Handle type: conditions with virtual type translation
  if (field === "type" && (op === "=" || op === "!=")) {
    return translateTypeCondition(value, op, params)
  }

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
function buildDateCondition(field: string, op: string, dateRange: DateRange, params: (string | number)[]): string {
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
  const jsonPath = ref.type === "person" ? "mentions" : ref.type === "tag" ? "tags" : "projects"

  if (ref.negated) {
    params.push(`%"${ref.value}"%`)
    return ` AND (data IS NULL OR json_extract(data, '$.${jsonPath}') IS NULL OR json_extract(data, '$.${jsonPath}') NOT LIKE ?)`
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
function buildPropCondition(propCond: QueryPropCondition, params: (string | number)[]): string {
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
    params.push(jsonPath, valuePath, value, targetPath, value, jsonPath, `%"${value}"%`)
    return ` AND (json_extract(data, ?) IS NULL OR (json_extract(data, ?) != ? AND json_extract(data, ?) != ? AND json_extract(data, ?) NOT LIKE ?))`
  }

  if ((op === ">" || op === "<" || op === ">=" || op === "<=") && value !== undefined) {
    // Numeric comparison - extract from $.props.X.value
    params.push(valuePath, value)
    return ` AND CAST(json_extract(data, ?) AS REAL) ${op} ?`
  }

  return ""
}

/** SQL subquery matching unresolved blockers for a given outer table alias */
function unresolvedBlockerExists(outerTable: string): string {
  return `EXISTS (
          SELECT 1 FROM nodes AS blocker
          WHERE (
            blocker.id = json_extract(${outerTable}.data, '$.props.blocked-by.target')
            OR blocker.name = json_extract(${outerTable}.data, '$.props.blocked-by.target')
            OR json_extract(${outerTable}.data, '$.props.blocked-by') LIKE '%"target":"' || blocker.id || '"%'
            OR json_extract(${outerTable}.data, '$.props.blocked-by') LIKE '%"target":"' || blocker.name || '"%'
          )
          AND (blocker.task_status IS NULL OR blocker.task_status NOT IN ('done', 'dropped'))
        )`
}

/**
 * Build SQL for blocked:true/false special conditions.
 * blocked:true = has blocked-by property pointing to at least one non-done task
 * blocked:false = no blocked-by property OR all blockers are done
 */
function buildBlockedCondition(special: QuerySpecial, outerTable: string): string {
  if (special.type !== "blocked") return ""

  const blockerSubquery = unresolvedBlockerExists(outerTable)

  if (special.value) {
    // blocked:true - has blocked-by property with at least one unresolved blocker
    return ` AND json_extract(data, '$.props.blocked-by') IS NOT NULL AND ${blockerSubquery}`
  }

  // blocked:false - no blocked-by property OR all blockers are done
  return ` AND (json_extract(data, '$.props.blocked-by') IS NULL OR NOT ${blockerSubquery})`
}

/** Build SQL for phrase search (exact phrase in content, order-sensitive) */
function buildPhraseCondition(phrase: string, params: (string | number)[]): string {
  params.push(`%${phrase}%`)
  return " AND content LIKE ?"
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

/** Normalize a path pattern by stripping leading ./ or / and trailing / */
function normalizePathPattern(pattern: string): string {
  let p = pattern
  if (p.startsWith("./")) p = p.slice(2)
  if (p.startsWith("/")) p = p.slice(1)
  if (p.endsWith("/")) p = p.slice(0, -1)
  return p
}

/** Build SQL for recursive path matching (folder contents, optionally including self) */
function buildRecursivePathSQL(
  normalizedPattern: string,
  pathColumn: string,
  negated: boolean,
  includesSelf: boolean,
  params: (string | number)[],
): string {
  params.push(
    `${normalizedPattern}/%`, // relative: files inside folder
    `%/${normalizedPattern}/%`, // nested: files inside folder
  )

  if (negated) {
    let sql = ` AND (${pathColumn} IS NULL OR (${pathColumn} NOT LIKE ? AND ${pathColumn} NOT LIKE ?`
    if (includesSelf) {
      params.push(`${normalizedPattern}.md`, `%/${normalizedPattern}.md`, normalizedPattern)
      sql += ` AND ${pathColumn} NOT LIKE ? AND ${pathColumn} NOT LIKE ? AND ${pathColumn} != ?`
    }
    return sql + "))"
  }

  let sql = ` AND (${pathColumn} LIKE ? OR ${pathColumn} LIKE ?`
  if (includesSelf) {
    params.push(`${normalizedPattern}.md`, `%/${normalizedPattern}.md`, normalizedPattern)
    sql += ` OR ${pathColumn} LIKE ? OR ${pathColumn} LIKE ? OR ${pathColumn} = ?`
  }
  return sql + ")"
}

/** Build SQL for non-recursive path matching (direct children only) */
function buildNonRecursivePathSQL(
  normalizedPattern: string,
  pathColumn: string,
  negated: boolean,
  params: (string | number)[],
): string {
  if (negated) {
    params.push(`${normalizedPattern}/*[!/]*`, `*/${normalizedPattern}/*[!/]*`)
    return ` AND (${pathColumn} IS NULL OR (${pathColumn} NOT GLOB ? AND ${pathColumn} NOT GLOB ?))`
  }
  params.push(
    `${normalizedPattern}/*`,
    `*/${normalizedPattern}/*`,
    `${normalizedPattern}/*/*`,
    `*/${normalizedPattern}/*/*`,
  )
  return ` AND (${pathColumn} GLOB ? OR ${pathColumn} GLOB ?) AND ${pathColumn} NOT GLOB ? AND ${pathColumn} NOT GLOB ?`
}

/**
 * Build SQL for path pattern matching.
 * Path patterns match against effective_path (includes ancestor lookup for child nodes).
 * Uses Tree.glob() for parsing — supports qualifiers like `./inbox/**(.)`.
 */
function buildPathCondition(pathFilter: QueryPath, pathColumn: string, params: (string | number)[]): string {
  const { pattern, negated = false } = pathFilter

  // Parse the full pattern with Tree.glob (handles *, **, qualifiers, normalization)
  const glob = parseTreeGlob((negated ? "-" : "") + pattern)

  // Legacy: bare patterns without ./ prefix or glob suffix — normalize manually
  let normalizedPattern = glob.path
  if (!normalizedPattern) normalizedPattern = normalizePathPattern(pattern)

  // Build path SQL
  let sql: string
  if (glob.recursive) {
    const includesSelf = !pattern.includes("**") // bare ./inbox includes self
    sql = buildRecursivePathSQL(normalizedPattern, pathColumn, negated, includesSelf, params)
  } else {
    sql = buildNonRecursivePathSQL(normalizedPattern, pathColumn, negated, params)
  }

  // Append qualifier filters — each dimension ANDs, values within OR
  for (const q of glob.qualifiers) {
    sql += buildQualifierSQL(q, params)
  }

  return sql
}

/** Translate a glob qualifier to SQL conditions. */
function buildQualifierSQL(q: import("@km/core").GlobQualifier, params: (string | number)[]): string {
  if (q.type === "fstype") {
    const placeholders = q.values.map(() => "?").join(", ")
    params.push(...q.values)
    return q.negated ? ` AND (fstype IS NULL OR fstype NOT IN (${placeholders}))` : ` AND fstype IN (${placeholders})`
  }

  if (q.type === "nodetype") {
    // outline = type='h' AND item=1, list = type='p' AND item=1
    const conditions: string[] = []
    for (const v of q.values) {
      if (v === "outline") conditions.push("(type = 'h' AND item = 1)")
      if (v === "list") conditions.push("(type = 'p' AND item = 1)")
    }
    if (conditions.length === 0) return ""
    const joined = conditions.join(" OR ")
    return q.negated ? ` AND NOT (${joined})` : ` AND (${joined})`
  }

  if (q.type === "task") {
    // Task qualifiers: each value is a condition, OR together
    const conditions: string[] = []
    const notDone = "task_status NOT IN ('done', 'dropped')"
    for (const v of q.values) {
      switch (v) {
        case "task":
          conditions.push("task_marker IS NOT NULL")
          break
        case "past_due":
          conditions.push(`(due_at < date('now', 'localtime') AND ${notDone})`)
          break
        case "this_week":
          conditions.push(`(due_at <= date('now', 'localtime', 'weekday 0', '+1 day') AND ${notDone})`)
          break
        case "has_due":
          conditions.push("due_at IS NOT NULL")
          break
        case "started":
          conditions.push(`(start_at <= date('now', 'localtime') AND ${notDone})`)
          break
        case "done":
          conditions.push("task_status IN ('done', 'dropped')")
          break
      }
    }
    if (conditions.length === 0) return ""
    const joined = conditions.join(" OR ")
    return q.negated ? ` AND NOT (${joined})` : ` AND (${joined})`
  }

  return ""
}
