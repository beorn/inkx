/**
 * Query Executor
 *
 * Executes parsed queries against the SQLite database.
 * Parsing is done by @km/core query module.
 */

import createDebug from "debug";
import { getDb } from "./db.ts";

const debug = createDebug("km:storage:query");
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
} from "@km/core";

// Re-export parsing types and functions from @km/core
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
export function executeQuery(ast: QueryAST, baseType?: string): KNode[] {
  const db = getDb();

  // Check if we need path filtering (requires CTE for ancestor lookup)
  const needsPathFilter = ast.paths.length > 0;

  let sql: string;
  const params: (string | number)[] = [];

  if (needsPathFilter) {
    // Use a recursive CTE to compute effective_path for all nodes
    // This walks up the parent chain to find the nearest ancestor with fs_path
    sql = `
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
      WHERE 1=1`;
  } else {
    sql = "SELECT * FROM nodes WHERE 1=1";
  }

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

  // Apply property conditions (data.props queries)
  for (const propCond of ast.propConditions) {
    const { prop, op, value, negated } = propCond;
    const jsonPath = `$.props.${prop}`;

    if (op === "exists") {
      if (negated) {
        // Property does not exist
        sql += ` AND (data IS NULL OR json_extract(data, ?) IS NULL)`;
      } else {
        // Property exists
        sql += ` AND json_extract(data, ?) IS NOT NULL`;
      }
      params.push(jsonPath);
    } else if ((op === "=" || op === "!=") && value !== undefined) {
      const effectiveOp = negated ? (op === "=" ? "!=" : "=") : op;
      if (effectiveOp === "=") {
        // For link values, check if the value is in an array or equals directly
        sql += ` AND (json_extract(data, ?) = ? OR json_extract(data, ?) LIKE ?)`;
        params.push(jsonPath, value, jsonPath, `%"${value}"%`);
      } else {
        sql += ` AND (json_extract(data, ?) IS NULL OR (json_extract(data, ?) != ? AND json_extract(data, ?) NOT LIKE ?))`;
        params.push(jsonPath, jsonPath, value, jsonPath, `%"${value}"%`);
      }
    } else if ((op === ">" || op === "<" || op === ">=" || op === "<=") && value !== undefined) {
      // Numeric comparison
      sql += ` AND CAST(json_extract(data, ?) AS REAL) ${op} ?`;
      params.push(jsonPath, value);
    }
  }

  // Apply special conditions (blocked:true/false)
  for (const special of ast.specials) {
    if (special.type === "blocked") {
      if (special.value) {
        // blocked:true - has blocked-by property with at least one unresolved blocker
        // A node is blocked if it has blocked-by:: with targets that are not done
        sql += ` AND json_extract(data, '$.props.blocked-by') IS NOT NULL`;
        // Note: Full blocked check (checking if blockers are done) requires a subquery
        // For now, just check if blocked-by property exists
        // TODO: Add subquery to check blocker statuses
      } else {
        // blocked:false - no blocked-by property OR all blockers are done
        sql += ` AND (json_extract(data, '$.props.blocked-by') IS NULL)`;
        // Note: Full unblocked check would need to verify all blockers are done
      }
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
  // Path patterns match against effective_path (includes ancestor lookup for child nodes)
  // When needsPathFilter is true, we use the CTE with effective_path column
  const pathColumn = needsPathFilter ? "effective_path" : "fs_path";

  for (const pathFilter of ast.paths) {
    const { pattern, recursive, negated } = pathFilter;

    // Normalize pattern:
    // - Remove leading ./ for relative paths
    // - Remove leading / for absolute paths
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

    // Default to recursive matching (./folder matches all contents)
    // Use ./folder$ for non-recursive (direct children only)
    const isNonRecursive = normalizedPattern.endsWith("$");
    if (isNonRecursive) {
      normalizedPattern = normalizedPattern.slice(0, -1);
    }
    const effectiveRecursive = recursive || !isNonRecursive;

    if (effectiveRecursive) {
      // Recursive pattern (e.g., ./inbox/** or ./inbox)
      // Matches:
      //   - /root/inbox/file.md (file directly in folder)
      //   - /root/inbox/sub/file.md (file in subfolder)
      //   - /root/inbox.md (the folder itself as a file)
      if (negated) {
        sql += ` AND (${pathColumn} IS NULL OR (${pathColumn} NOT LIKE ? AND ${pathColumn} NOT LIKE ? AND ${pathColumn} NOT LIKE ?))`;
        params.push(
          `%/${normalizedPattern}/%`, // files inside folder
          `%/${normalizedPattern}.md`, // the folder file itself
          `%/${normalizedPattern}`, // exact match at end
        );
      } else {
        sql += ` AND (${pathColumn} LIKE ? OR ${pathColumn} LIKE ? OR ${pathColumn} LIKE ?)`;
        params.push(
          `%/${normalizedPattern}/%`, // files inside folder
          `%/${normalizedPattern}.md`, // the folder file itself
          `%/${normalizedPattern}`, // exact match at end (for folder names without extension)
        );
      }
    } else {
      // Non-recursive pattern (e.g., ./inbox$) - direct children only
      // Only matches files directly in the folder, not subfolders
      if (negated) {
        sql += ` AND (${pathColumn} IS NULL OR ${pathColumn} NOT GLOB ?)`;
        params.push(`*/${normalizedPattern}/*[!/]*`);
      } else {
        // Match direct children: /folder/file.md but not /folder/sub/file.md
        // GLOB pattern: */folder/* where the part after folder/ has no more slashes
        sql += ` AND ${pathColumn} GLOB ? AND ${pathColumn} NOT GLOB ?`;
        params.push(`*/${normalizedPattern}/*`, `*/${normalizedPattern}/*/*`);
      }
    }
  }

  sql += " ORDER BY parent_idx ASC, created_at DESC";

  const start = Date.now();
  const rows = db.prepare(sql).all(...params) as KNode[];
  debug("executeQuery: %d results in %dms (type=%s, conditions=%d, paths=%d)",
    rows.length, Date.now() - start, baseType ?? "any", ast.conditions.length, ast.paths.length);
  return rows;
}

/**
 * Query tasks with a string query
 */
export function queryTasks(query: string): KNode[] {
  const ast = parse(query);
  return executeQuery(ast, "task");
}

/**
 * Query all nodes with a string query
 */
export function queryNodes(query: string, type?: string): KNode[] {
  const ast = parse(query);
  return executeQuery(ast, type);
}
