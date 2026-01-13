/**
 * Query Language Parser and Executor
 *
 * Parses and executes structured queries for task filtering.
 *
 * Syntax:
 * - field:value      Filter by field (status:open, priority:1, due:2026-01-20)
 * - @ref             Filter by mention
 * - #tag             Filter by tag
 * - +project         Filter by project
 * - -field:value     Negation (exclude matches)
 * - text             Full-text search
 */

import { getDb } from "./db.ts";
import type { Node } from "@km/core";

/**
 * Parsed query condition
 */
export interface QueryCondition {
  field: string;
  op: "=" | "!=" | ">" | "<" | ">=" | "<=" | "LIKE";
  value: string;
  negated?: boolean;
}

/**
 * Parsed reference filter
 */
export interface QueryRef {
  type: "person" | "tag" | "project";
  value: string;
  negated?: boolean;
}

/**
 * Parsed query AST
 */
export interface QueryAST {
  conditions: QueryCondition[];
  refs: QueryRef[];
  text: string[];
  phrases: string[]; // Quoted phrase searches
}

/**
 * Parse a query string into an AST
 */
export function parseQuery(query: string): QueryAST {
  const ast: QueryAST = {
    conditions: [],
    refs: [],
    text: [],
    phrases: [],
  };

  if (!query || query.trim() === "") {
    return ast;
  }

  // Tokenize by splitting on whitespace, but preserve quoted strings
  const tokens: string[] = [];
  const regex = /"([^"]+)"|(\S+)/g;
  let match;
  while ((match = regex.exec(query)) !== null) {
    // match[1] is content inside quotes (phrase search)
    // match[2] is unquoted token
    if (match[1] !== undefined) {
      // Quoted phrase - add to phrases array
      ast.phrases.push(match[1]);
    } else {
      tokens.push(match[2] ?? "");
    }
  }

  for (const token of tokens) {
    if (!token) continue;

    // Check for negation prefix
    const negated = token.startsWith("-");
    const term = negated ? token.slice(1) : token;

    // @mention
    if (term.startsWith("@")) {
      ast.refs.push({
        type: "person",
        value: term.slice(1),
        negated,
      });
      continue;
    }

    // #tag
    if (term.startsWith("#")) {
      ast.refs.push({
        type: "tag",
        value: term.slice(1),
        negated,
      });
      continue;
    }

    // +project
    if (term.startsWith("+")) {
      ast.refs.push({
        type: "project",
        value: term.slice(1),
        negated,
      });
      continue;
    }

    // field:value (supports comma-separated values like status:open,blocked)
    const fieldMatch = term.match(/^([a-z_]+)([:=<>!]+)(.+)$/i);
    if (fieldMatch) {
      const [, field, opStr, rawValue] = fieldMatch;
      let op: QueryCondition["op"] = "=";

      // Determine operator
      if (opStr === ":" || opStr === "=") {
        op = negated ? "!=" : "=";
      } else if (opStr === "!=") {
        op = "!=";
      } else if (opStr === ">") {
        op = ">";
      } else if (opStr === "<") {
        op = "<";
      } else if (opStr === ">=") {
        op = ">=";
      } else if (opStr === "<=") {
        op = "<=";
      }

      // Map common field aliases
      const mappedField = mapFieldName(field ?? "");

      // Store value as-is (comma-separated values handled in executeQuery)
      ast.conditions.push({
        field: mappedField,
        op,
        value: rawValue ?? "",
        negated,
      });
      continue;
    }

    // Plain text search term
    ast.text.push(negated ? `-${term}` : term);
  }

  return ast;
}

/**
 * Map common field aliases to database column names
 */
function mapFieldName(field: string): string {
  const aliases: Record<string, string> = {
    status: "task_status",
    priority: "priority",
    p: "priority",
    due: "due_date",
    start: "scheduled_date",
    scheduled: "scheduled_date",
    assigned: "assigned_to",
    type: "type",
  };
  return aliases[field.toLowerCase()] ?? field;
}

/**
 * Date range for query resolution
 */
export interface DateRange {
  start: string;
  end: string;
}

/**
 * Resolve a date shortcut to a date range (YYYY-MM-DD format)
 *
 * Supported shortcuts:
 * - today: today's date
 * - tomorrow: tomorrow's date
 * - yesterday: yesterday's date
 * - week: next 7 days (including today)
 * - past: all dates before today (overdue)
 * - YYYY-MM-DD: exact date
 */
export function resolveDateQuery(value: string): DateRange | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const formatDate = (d: Date): string => {
    return d.toISOString().slice(0, 10);
  };

  switch (value.toLowerCase()) {
    case "today": {
      const dateStr = formatDate(today);
      return { start: dateStr, end: dateStr };
    }

    case "tomorrow": {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = formatDate(tomorrow);
      return { start: dateStr, end: dateStr };
    }

    case "yesterday": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = formatDate(yesterday);
      return { start: dateStr, end: dateStr };
    }

    case "week": {
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() + 6);
      return { start: formatDate(today), end: formatDate(weekEnd) };
    }

    case "past":
    case "overdue": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { start: "0000-01-01", end: formatDate(yesterday) };
    }

    default: {
      // Check if it's a date range pattern (YYYY-MM-DD-YYYY-MM-DD)
      const rangeMatch = value.match(
        /^(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})$/,
      );
      if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
        return { start: rangeMatch[1], end: rangeMatch[2] };
      }

      // Check if it's a single date pattern (YYYY-MM-DD)
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return { start: value, end: value };
      }
      return null;
    }
  }
}

/**
 * Check if a value is a date shortcut or date range
 */
function isDateShortcut(value: string): boolean {
  const shortcuts = [
    "today",
    "tomorrow",
    "yesterday",
    "week",
    "past",
    "overdue",
  ];
  // Also match date ranges (YYYY-MM-DD-YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}$/.test(value)) {
    return true;
  }
  return shortcuts.includes(value.toLowerCase());
}

/**
 * Check if a field is a date field
 */
function isDateField(field: string): boolean {
  const dateFields = ["due_date", "scheduled_date", "created_at", "updated_at"];
  return dateFields.includes(field);
}

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
      const dateRange = resolveDateQuery(value);
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
    const values = value.split(",").filter((v) => v.length > 0);

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

  sql += " ORDER BY parent_idx ASC, created_at DESC";

  const rows = db.prepare(sql).all(...params) as Node[];
  return rows;
}

/**
 * Query tasks with a string query
 */
export function queryTasks(query: string): Node[] {
  const ast = parseQuery(query);
  return executeQuery(ast, "task");
}

/**
 * Query all nodes with a string query
 */
export function queryNodes(query: string, type?: string): Node[] {
  const ast = parseQuery(query);
  return executeQuery(ast, type);
}
