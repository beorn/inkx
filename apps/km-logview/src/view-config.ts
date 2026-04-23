import type { ReactNode } from "react"

export interface LogRow {
  /** Unique key, stable across re-renders. */
  id: string
  /** Source line number (1-based) in the file. */
  lineNo: number
  /** Classification for row-level styling (e.g. "user", "assistant", "hook"). */
  kind?: string
  /** Original parsed object from the source line. */
  raw: unknown
  /** Field values looked up by FieldSpec.key. Derived by ViewConfig.deriveRows. */
  fields: Record<string, unknown>
}

export type FieldColor = string | ((value: unknown, row: LogRow) => string | undefined)

export interface FieldSpec {
  /** Key into LogRow.fields (flat, not dotted — derive during deriveRows). */
  key: string
  /** Display label (undefined → inferred from key). */
  label?: string
  /** Column width: number=chars, "flex"=fill remaining, "auto"=content-sized. */
  width?: number | "flex" | "auto"
  /** Text color: string (semantic token or hex) or function. */
  color?: FieldColor
  /** Bold text for this field. */
  bold?: boolean | ((value: unknown, row: LogRow) => boolean)
  /** Custom renderer (receives raw field value). Overrides default text rendering. */
  render?: (value: unknown, row: LogRow) => ReactNode
  /**
   * Multi-line behavior:
   * - "truncate" (default): single-line, truncated with ellipsis
   * - "wrap": preserve newlines, wrap naturally
   * - "collapsed": truncated inline, expand on Enter (v1 — v0 renders as truncate)
   */
  multiLine?: "truncate" | "wrap" | "collapsed"
  /** Max chars for truncation (default 500). */
  maxChars?: number
}

export interface ViewConfig {
  /** Identifier for logging/debug. */
  name: string
  /** Return true if this config handles the given path. */
  detect: (path: string) => boolean
  /**
   * Parse a single line. Return null to skip (blank line, comment, etc.).
   * Default JSONL parser is available as `parseJsonLine` from parse-jsonl.ts.
   */
  parseLine: (line: string, lineNo: number) => unknown | null
  /**
   * Turn one parsed object into 0..N rows. Claude session JSONL typically
   * emits 1..4 rows per line because message.content is an array of
   * { type: "text" | "tool_use" | "tool_result" | "thinking" } items.
   */
  deriveRows: (parsed: unknown, lineNo: number) => LogRow[]
  /** Ordered fields for the row renderer. */
  fields: FieldSpec[]
  /**
   * Plain-text representation of a row for substring search. Defaults to
   * concatenating all string field values if omitted.
   */
  searchText?: (row: LogRow) => string
}
