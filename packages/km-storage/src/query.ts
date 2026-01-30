/**
 * Query Executor
 *
 * Executes parsed queries against the SQLite database.
 * Parsing is done by @km/core query module.
 */

import createDebug from "debug"
import type { Database } from "bun:sqlite"
import { rowToNode } from "./db-queries/index.ts"

const debug = createDebug("km:storage:query")
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
  type DateRange,
  type QueryPropCondition,
  type QuerySpecial,
} from "@km/core"

// Re-export parsing types and functions from @km/core
export {
  parse as parseQuery,
  resolveDate as resolveDateQuery,
  type QueryAST,
  type QueryCondition,
  type QueryRef,
  type QueryPath,
  type DateRange,
}

/** Options for executeQuery */
export interface QueryOptions {
  /** Filter by structural type (e.g., "file", "section") */
  baseType?: string
  /** If true, only return nodes with task_status set (any node acting as a task) */
  requireTaskStatus?: boolean
}

/** Accumulator for building SQL queries */
interface QueryBuilder {
  clauses: string[]
  params: (string | number)[]
}

/**
 * Build base SQL with optional recursive CTE for path filtering
 */
function buildBaseQuery(needsPathFilter: boolean): string {
  if (needsPathFilter) {
    return `
      WITH RECURSIVE node_ancestors AS (
        SELECT
          id AS node_id,
          id AS current_id,
          parent_id,
          fs_path,
          0 AS depth
        FROM nodes

        UNION ALL

        SELECT
          na.node_id,
          n.id,
          n.parent_id,
          n.fs_path,
          na.depth + 1
        FROM node_ancestors na
        JOIN nodes n ON n.id = na.parent_id
        WHERE na.fs_path IS NULL
      ),
      node_paths AS (
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
  return "SELECT * FROM nodes WHERE 1=1"
}

/**
 * Build date predicate for date fields with shortcuts (today, tomorrow, week, etc.)
 * Returns SQL clause or null if not a date shortcut
 */
function buildDatePredicate(
  field: string,
  op: string,
  value: string,
  builder: QueryBuilder,
): boolean {
  if (!isDateField(field) || !isDateShortcut(value)) return false

  const dateRange = resolveDate(value)
  if (!dateRange) return false

  if (op !== "=" && op !== "!=") return false

  const isSingleDay = dateRange.start === dateRange.end

  if (op === "=") {
    if (isSingleDay) {
      builder.clauses.push(`${field} = ?`)
      builder.params.push(dateRange.start)
    } else {
      builder.clauses.push(`${field} >= ? AND ${field} <= ?`)
      builder.params.push(dateRange.start, dateRange.end)
    }
  } else {
    if (isSingleDay) {
      builder.clauses.push(`(${field} != ? OR ${field} IS NULL)`)
      builder.params.push(dateRange.start)
    } else {
      builder.clauses.push(`(${field} < ? OR ${field} > ? OR ${field} IS NULL)`)
      builder.params.push(dateRange.start, dateRange.end)
    }
  }
  return true
}

/**
 * Build SQL for field:value conditions with IN/NOT IN support
 */
function buildFieldCondition(
  cond: QueryCondition,
  builder: QueryBuilder,
): void {
  const { field, op, value } = cond
  const values = value.split(",").filter((v: string) => v.length > 0)

  if (op === "=") {
    if (values.length > 1) {
      const placeholders = values.map(() => "?").join(", ")
      builder.clauses.push(`${field} IN (${placeholders})`)
      builder.params.push(...values)
    } else {
      builder.clauses.push(`${field} = ?`)
      builder.params.push(value)
    }
  } else if (op === "!=") {
    if (values.length > 1) {
      const placeholders = values.map(() => "?").join(", ")
      builder.clauses.push(
        `(${field} NOT IN (${placeholders}) OR ${field} IS NULL)`,
      )
      builder.params.push(...values)
    } else {
      builder.clauses.push(`(${field} != ? OR ${field} IS NULL)`)
      builder.params.push(value)
    }
  } else if (op === ">" || op === "<" || op === ">=" || op === "<=") {
    builder.clauses.push(`${field} ${op} ?`)
    builder.params.push(value)
  } else if (op === "LIKE") {
    builder.clauses.push(`${field} LIKE ?`)
    builder.params.push(`%${value}%`)
  }
}

/**
 * Build SQL for reference filters (@person, #tag, +project)
 */
function buildRefCondition(ref: QueryRef, builder: QueryBuilder): void {
  const jsonPath =
    ref.type === "person"
      ? "mentions"
      : ref.type === "tag"
        ? "tags"
        : "projects"

  if (ref.negated) {
    builder.clauses.push(`(data IS NULL OR json_extract(data, '$') NOT LIKE ?)`)
    builder.params.push(`%"${ref.value}"%`)
  } else {
    builder.clauses.push(`json_extract(data, '$.${jsonPath}') LIKE ?`)
    builder.params.push(`%"${ref.value}"%`)
  }
}

/**
 * Build SQL for property existence check
 */
function buildPropExistsCondition(
  jsonPath: string,
  negated: boolean,
  builder: QueryBuilder,
): void {
  if (negated) {
    builder.clauses.push(`(data IS NULL OR json_extract(data, ?) IS NULL)`)
  } else {
    builder.clauses.push(`json_extract(data, ?) IS NOT NULL`)
  }
  builder.params.push(jsonPath)
}

/**
 * Build SQL for property equality check (handles number/text/date/link/list)
 */
function buildPropEqualityCondition(
  jsonPath: string,
  valuePath: string,
  targetPath: string,
  value: string,
  isEqual: boolean,
  builder: QueryBuilder,
): void {
  if (isEqual) {
    builder.clauses.push(
      `(json_extract(data, ?) = ? OR json_extract(data, ?) = ? OR json_extract(data, ?) LIKE ?)`,
    )
    builder.params.push(
      valuePath,
      value,
      targetPath,
      value,
      jsonPath,
      `%"${value}"%`,
    )
  } else {
    builder.clauses.push(
      `(json_extract(data, ?) IS NULL OR (json_extract(data, ?) != ? AND json_extract(data, ?) != ? AND json_extract(data, ?) NOT LIKE ?))`,
    )
    builder.params.push(
      jsonPath,
      valuePath,
      value,
      targetPath,
      value,
      jsonPath,
      `%"${value}"%`,
    )
  }
}

/**
 * Build SQL for property conditions (data.props queries)
 */
function buildPropCondition(
  propCond: QueryPropCondition,
  builder: QueryBuilder,
): void {
  const { prop, op, value, negated } = propCond
  const jsonPath = `$.props.${prop}`
  const valuePath = `$.props.${prop}.value`
  const targetPath = `$.props.${prop}.target`

  if (op === "exists") {
    buildPropExistsCondition(jsonPath, negated, builder)
  } else if ((op === "=" || op === "!=") && value !== undefined) {
    const effectiveOp = negated ? (op === "=" ? "!=" : "=") : op
    buildPropEqualityCondition(
      jsonPath,
      valuePath,
      targetPath,
      value,
      effectiveOp === "=",
      builder,
    )
  } else if (
    (op === ">" || op === "<" || op === ">=" || op === "<=") &&
    value !== undefined
  ) {
    builder.clauses.push(`CAST(json_extract(data, ?) AS REAL) ${op} ?`)
    builder.params.push(valuePath, value)
  }
}

/**
 * Build SQL for blocked:true/false special conditions
 */
function buildBlockedCondition(
  isBlocked: boolean,
  outerTable: string,
  builder: QueryBuilder,
): void {
  const blockerSubquery = `
    SELECT 1 FROM nodes AS blocker
    WHERE (
      blocker.id = json_extract(${outerTable}.data, '$.props.blocked-by.target')
      OR blocker.name = json_extract(${outerTable}.data, '$.props.blocked-by.target')
      OR json_extract(${outerTable}.data, '$.props.blocked-by') LIKE '%"target":"' || blocker.id || '"%'
      OR json_extract(${outerTable}.data, '$.props.blocked-by') LIKE '%"target":"' || blocker.name || '"%'
    )
    AND (blocker.task_status IS NULL OR blocker.task_status NOT IN ('done', 'dropped'))`

  if (isBlocked) {
    builder.clauses.push(`json_extract(data, '$.props.blocked-by') IS NOT NULL`)
    builder.clauses.push(`EXISTS (${blockerSubquery})`)
  } else {
    builder.clauses.push(
      `(json_extract(data, '$.props.blocked-by') IS NULL OR NOT EXISTS (${blockerSubquery}))`,
    )
  }
}

/**
 * Build SQL for special conditions (blocked:true/false)
 */
function buildSpecialCondition(
  special: QuerySpecial,
  outerTable: string,
  builder: QueryBuilder,
): void {
  if (special.type === "blocked") {
    buildBlockedCondition(special.value, outerTable, builder)
  }
}

/**
 * Build SQL for text search terms
 */
function buildTextCondition(terms: string[], builder: QueryBuilder): void {
  for (const term of terms) {
    if (term.startsWith("-")) {
      builder.clauses.push("content NOT LIKE ?")
      builder.params.push(`%${term.slice(1)}%`)
    } else {
      builder.clauses.push("content LIKE ?")
      builder.params.push(`%${term}%`)
    }
  }
}

/**
 * Normalize path pattern by removing leading ./ or / and trailing /
 */
function normalizePathPattern(pattern: string): {
  pattern: string
  isNonRecursive: boolean
} {
  let normalized = pattern
  if (normalized.startsWith("./")) normalized = normalized.slice(2)
  if (normalized.startsWith("/")) normalized = normalized.slice(1)
  if (normalized.endsWith("/")) normalized = normalized.slice(0, -1)

  const isNonRecursive = normalized.endsWith("$")
  if (isNonRecursive) normalized = normalized.slice(0, -1)

  return { pattern: normalized, isNonRecursive }
}

/**
 * Build SQL for recursive path matching
 */
function buildRecursivePathCondition(
  pathColumn: string,
  pattern: string,
  negated: boolean,
  builder: QueryBuilder,
): void {
  if (negated) {
    builder.clauses.push(
      `(${pathColumn} IS NULL OR (${pathColumn} NOT LIKE ? AND ${pathColumn} NOT LIKE ? AND ${pathColumn} NOT LIKE ?))`,
    )
  } else {
    builder.clauses.push(
      `(${pathColumn} LIKE ? OR ${pathColumn} LIKE ? OR ${pathColumn} LIKE ?)`,
    )
  }
  builder.params.push(`%/${pattern}/%`, `%/${pattern}.md`, `%/${pattern}`)
}

/**
 * Build SQL for non-recursive path matching (direct children only)
 */
function buildNonRecursivePathCondition(
  pathColumn: string,
  pattern: string,
  negated: boolean,
  builder: QueryBuilder,
): void {
  if (negated) {
    builder.clauses.push(`(${pathColumn} IS NULL OR ${pathColumn} NOT GLOB ?)`)
    builder.params.push(`*/${pattern}/*[!/]*`)
  } else {
    builder.clauses.push(`${pathColumn} GLOB ? AND ${pathColumn} NOT GLOB ?`)
    builder.params.push(`*/${pattern}/*`, `*/${pattern}/*/*`)
  }
}

/**
 * Build SQL for path pattern filters
 */
function buildPathCondition(
  pathFilter: QueryPath,
  pathColumn: string,
  builder: QueryBuilder,
): void {
  const { pattern, recursive, negated } = pathFilter
  const { pattern: normalizedPattern, isNonRecursive } =
    normalizePathPattern(pattern)
  const effectiveRecursive = recursive || !isNonRecursive

  if (effectiveRecursive) {
    buildRecursivePathCondition(pathColumn, normalizedPattern, negated, builder)
  } else {
    buildNonRecursivePathCondition(
      pathColumn,
      normalizedPattern,
      negated,
      builder,
    )
  }
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
  const pathColumn = needsPathFilter ? "effective_path" : "fs_path"
  const outerTable = needsPathFilter ? "n" : "nodes"

  const builder: QueryBuilder = { clauses: [], params: [] }

  // Type and status filters
  if (baseType) {
    builder.clauses.push("type = ?")
    builder.params.push(baseType)
  }
  if (requireTaskStatus) {
    builder.clauses.push("task_status IS NOT NULL")
  }

  // Field conditions
  for (const cond of ast.conditions) {
    if (!buildDatePredicate(cond.field, cond.op, cond.value, builder)) {
      buildFieldCondition(cond, builder)
    }
  }

  // Reference filters
  for (const ref of ast.refs) {
    buildRefCondition(ref, builder)
  }

  // Property conditions
  for (const propCond of ast.propConditions) {
    buildPropCondition(propCond, builder)
  }

  // Special conditions
  for (const special of ast.specials) {
    buildSpecialCondition(special, outerTable, builder)
  }

  // Text search
  if (ast.text.length > 0) {
    buildTextCondition(ast.text, builder)
  }

  // Path filters
  for (const pathFilter of ast.paths) {
    buildPathCondition(pathFilter, pathColumn, builder)
  }

  // Assemble final SQL
  let sql = buildBaseQuery(needsPathFilter)
  if (builder.clauses.length > 0) {
    sql += " AND " + builder.clauses.join(" AND ")
  }
  sql += " ORDER BY parent_idx ASC, created_at DESC"

  const start = Date.now()
  const rows = db.prepare(sql).all(...builder.params) as Record<
    string,
    unknown
  >[]
  const nodes = rows.map(rowToNode)
  debug("executeQuery", {
    results: nodes.length,
    ms: Date.now() - start,
    type: baseType ?? "any",
    conditions: ast.conditions.length,
    paths: ast.paths.length,
  })
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
