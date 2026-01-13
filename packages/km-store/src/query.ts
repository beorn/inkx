/**
 * Query Executor
 *
 * Executes parsed queries against the SQLite database.
 * Parsing is done by @km/query package.
 */

import { getDb } from "./db.ts";
import type { Node } from "@km/core";
import {
  parseQuery as parse,
  resolveDateQuery as resolveDate,
  isDateShortcut,
  isDateField,
  type QueryAST,
  type QueryCondition,
  type QueryRef,
  type QueryPath,
  type DateRange,
} from "@km/query";

// Re-export parsing types and functions from @km/query
export {
  parse as parseQuery,
  resolveDate as resolveDateQuery,
  type QueryAST,
  type QueryCondition,
  type QueryRef,
  type QueryPath,
  type DateRange,
};

/**
 * Execute a query against the database
 */
export function executeQuery(ast: QueryAST, baseType?: string): Node[] {
  const db = getDb();

  let sql = "SELECT * FROM nodes WHERE 1=1";
  const params: (string | number)[] = [];

  // Filter by type if specified
  if (baseType) {
    sql += " AND type = ?";
    params.push(baseType);
  }

  // Apply field conditions
  for (const cond of ast.conditions) {
    const { field, op, value } = cond;

    // Handle date shortcuts for date fields
    if (isDateField(field) && isDateShortcut(value)) {
      const dateRange = resolveDate(value);
      if (dateRange) {
        if (op === "=" || op === "!=") {
          if (dateRange.start === dateRange.end) {
            // Single day - use exact match or not equal
            if (op === "=") {
              sql += ` AND ${field} = ?`;
              params.push(dateRange.start);
            } else {
              sql += ` AND (${field} != ? OR ${field} IS NULL)`;
              params.push(dateRange.start);
            }
          } else {
            // Date range
            if (op === "=") {
              sql += ` AND ${field} >= ? AND ${field} <= ?`;
              params.push(dateRange.start, dateRange.end);
            } else {
              sql += ` AND (${field} < ? OR ${field} > ? OR ${field} IS NULL)`;
              params.push(dateRange.start, dateRange.end);
            }
          }
        }
        continue;
      }
    }

    // Handle comma-separated values (e.g., status:open,blocked → IN clause)
    const values = value.split(",").filter((v: string) => v.length > 0);

    if (op === "=") {
      if (values.length > 1) {
        // Multiple values: use IN clause (OR semantics)
        const placeholders = values.map(() => "?").join(", ");
        sql += ` AND ${field} IN (${placeholders})`;
        params.push(...values);
      } else {
        sql += ` AND ${field} = ?`;
        params.push(value);
      }
    } else if (op === "!=") {
      if (values.length > 1) {
        // Multiple values: NOT IN clause
        const placeholders = values.map(() => "?").join(", ");
        sql += ` AND (${field} NOT IN (${placeholders}) OR ${field} IS NULL)`;
        params.push(...values);
      } else {
        sql += ` AND (${field} != ? OR ${field} IS NULL)`;
        params.push(value);
      }
    } else if (op === ">" || op === "<" || op === ">=" || op === "<=") {
      sql += ` AND ${field} ${op} ?`;
      params.push(value);
    } else if (op === "LIKE") {
      sql += ` AND ${field} LIKE ?`;
      params.push(`%${value}%`);
    }
  }

  // Apply reference filters (stored in JSON data field)
  for (const ref of ast.refs) {
    const jsonPath =
      ref.type === "person"
        ? "mentions"
        : ref.type === "tag"
          ? "tags"
          : "projects";

    if (ref.negated) {
      // Exclude nodes with this ref
      sql += ` AND (data IS NULL OR json_extract(data, '$') NOT LIKE ?)`;
      params.push(`%"${ref.value}"%`);
    } else {
      // Include only nodes with this ref
      sql += ` AND json_extract(data, '$.${jsonPath}') LIKE ?`;
      params.push(`%"${ref.value}"%`);
    }
  }

  // Apply text search
  if (ast.text.length > 0) {
    for (const term of ast.text) {
      if (term.startsWith("-")) {
        sql += " AND content NOT LIKE ?";
        params.push(`%${term.slice(1)}%`);
      } else {
        sql += " AND content LIKE ?";
        params.push(`%${term}%`);
      }
    }
  }

  // Apply path pattern filters
  // Path patterns match against fs_path or require CTE for parent lookup
  for (const pathFilter of ast.paths) {
    const { pattern, recursive, negated } = pathFilter;

    // Normalize pattern:
    // - Remove leading ./ for relative paths
    // - Remove leading / for absolute paths (we use LIKE %/pattern/%)
    // - Remove trailing / if present
    let normalizedPattern = pattern;
    if (normalizedPattern.startsWith("./")) {
      normalizedPattern = normalizedPattern.slice(2);
    }
    if (normalizedPattern.startsWith("/")) {
      normalizedPattern = normalizedPattern.slice(1);
    }
    if (normalizedPattern.endsWith("/")) {
      normalizedPattern = normalizedPattern.slice(0, -1);
    }

    if (recursive) {
      // Recursive pattern (e.g., ./inbox/** → match inbox or anything under inbox)
      // Match: fs_path contains /pattern/ or ends with /pattern
      if (negated) {
        sql += ` AND (fs_path IS NULL OR (fs_path NOT LIKE ? AND fs_path NOT LIKE ?))`;
        params.push(`%/${normalizedPattern}/%`, `%/${normalizedPattern}`);
      } else {
        // Match path containing pattern as directory
        sql += ` AND (fs_path LIKE ? OR fs_path LIKE ?)`;
        params.push(`%/${normalizedPattern}/%`, `%/${normalizedPattern}`);
      }
    } else {
      // Non-recursive pattern - must contain this directory segment
      if (negated) {
        sql += ` AND (fs_path IS NULL OR fs_path NOT LIKE ?)`;
        params.push(`%/${normalizedPattern}/%`);
      } else {
        // Must contain this path segment
        sql += ` AND fs_path LIKE ?`;
        params.push(`%/${normalizedPattern}/%`);
      }
    }
  }

  sql += " ORDER BY parent_idx ASC, created_at DESC";

  const rows = db.prepare(sql).all(...params) as Node[];
  return rows;
}

/**
 * Query tasks with a string query
 */
export function queryTasks(query: string): Node[] {
  const ast = parse(query);
  return executeQuery(ast, "task");
}

/**
 * Query all nodes with a string query
 */
export function queryNodes(query: string, type?: string): Node[] {
  const ast = parse(query);
  return executeQuery(ast, type);
}
