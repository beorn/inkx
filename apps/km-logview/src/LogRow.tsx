/* eslint-disable @typescript-eslint/no-non-null-assertion -- codebase idiom: arr[i]! / map.get(k)! / stack.pop()! after surrounding length/has/bounds check; TS noUncheckedIndexedAccess requires the assertion even when invariant is obvious */
import React from "react"
import { Box, Text } from "silvery"
import type { FieldSpec, LogRow as LogRowData } from "./view-config.ts"

function resolve<T>(
  v: T | ((value: unknown, row: LogRowData) => T) | undefined,
  value: unknown,
  row: LogRowData,
): T | undefined {
  if (typeof v === "function") {
    return (v as (value: unknown, row: LogRowData) => T)(value, row)
  }
  return v
}

function valueToString(v: unknown): string {
  if (v == null) return ""
  if (typeof v === "string") return v
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

/**
 * Row layout:
 *   Line 1: all fields flow inline with ` · ` separators, truncated at right.
 *   Lines 2+: for fields with `multiLine: "below"`, continuation lines render
 *   underneath in muted colour, indented 2.
 *
 * Selection (Omnibox pattern): the outer Box gets `$bg-cursor` backgroundColor
 * (full terminal width), and every field Text is overridden to `$fg-cursor` so
 * contrast is readable. Following Silvery Omnibox — no cursor glyph, bg
 * communicates selection.
 */
export function LogRowView({ row, fields, isCursor }: { row: LogRowData; fields: FieldSpec[]; isCursor: boolean }) {
  const segments: React.ReactNode[] = []
  let overflowLines: string[] = []
  const cursorFg = "$fg-cursor"

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]!
    const raw = row.fields[field.key]
    const color = isCursor ? cursorFg : resolve(field.color, raw, row)
    const bold = isCursor || (resolve(field.bold, raw, row) ?? false)
    const content = field.render ? field.render(raw, row) : valueToString(raw)

    let firstLine: React.ReactNode = content
    if (typeof content === "string" && field.multiLine === "below" && content.includes("\n")) {
      const lines = content.split("\n").filter((l) => l.length > 0)
      firstLine = lines[0] ?? ""
      overflowLines = lines.slice(1)
    }

    if (firstLine == null || firstLine === "") continue

    segments.push(
      <Text key={field.key} color={color} bold={bold || undefined}>
        {firstLine}
      </Text>,
    )
    if (i < fields.length - 1) {
      segments.push(
        <Text key={`sep-${field.key}`} color={isCursor ? cursorFg : "$fg-muted"}>
          {" · "}
        </Text>,
      )
    }
  }

  return (
    <Box flexDirection="column" paddingX={1} width="100%" backgroundColor={isCursor ? "$bg-cursor" : undefined}>
      <Text wrap="truncate-end">{segments}</Text>
      {overflowLines.map((line, i) => (
        <Text
          // biome-ignore lint/suspicious/noArrayIndexKey: index is stable for static content
          key={`overflow-${i}`}
          color={isCursor ? cursorFg : "$fg-muted"}
          wrap="truncate-end"
        >
          {"  "}
          {line}
        </Text>
      ))}
    </Box>
  )
}
