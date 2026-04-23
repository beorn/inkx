/* eslint-disable @typescript-eslint/no-non-null-assertion -- codebase idiom: arr[i]! / map.get(k)! / stack.pop()! after surrounding length/has/bounds check; TS noUncheckedIndexedAccess requires the assertion even when invariant is obvious */
import React from "react"
import { Box, Text } from "silvery"
import { colorize } from "./colorize.tsx"
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
 *   Line 1 (header):  fields flow inline with ` · ` separators, truncated right.
 *   Lines 2+ (body):  one row per body line, muted, indented 2, with inline
 *                     tag/JSON colorization via colorize().
 *
 * When a `multiLine: "below"` field contains ANY newline, the *entire* body
 * (including the first line) is pushed below the header so body lines are
 * left-aligned with each other — not jutting out inline.
 *
 * Selection (Omnibox pattern): outer Box gets $bg-cursor; all Text uses
 * $fg-cursor for contrast against the bright bg.
 */
export function LogRowView({
  row,
  fields,
  isCursor,
}: { row: LogRowData; fields: FieldSpec[]; isCursor: boolean }) {
  const headerSegments: React.ReactNode[] = []
  let bodyLines: string[] = []
  const cursorFg = "$fg-cursor"

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]!
    const raw = row.fields[field.key]
    const color = isCursor ? cursorFg : resolve(field.color, raw, row)
    const bold = isCursor || (resolve(field.bold, raw, row) ?? false)
    const content = field.render ? field.render(raw, row) : valueToString(raw)
    const asStr = typeof content === "string" ? content : null

    // Multi-line body → all lines below. First line no longer inline.
    if (field.multiLine === "below" && asStr !== null && asStr.includes("\n")) {
      bodyLines = asStr.split("\n")
      continue
    }

    if (content == null || content === "") continue

    headerSegments.push(
      <Text key={field.key} color={color} bold={bold || undefined}>
        {content}
      </Text>,
    )
    if (i < fields.length - 1) {
      headerSegments.push(
        <Text key={`sep-${field.key}`} color={isCursor ? cursorFg : "$fg-muted"}>
          {" · "}
        </Text>,
      )
    }
  }

  const bodyColor = isCursor ? cursorFg : "$fg-muted"

  return (
    <Box
      flexDirection="column"
      paddingX={1}
      width="100%"
      backgroundColor={isCursor ? "$bg-cursor" : undefined}
    >
      <Text wrap="truncate-end">{headerSegments}</Text>
      {bodyLines.map((line, i) => (
        <Text
          // biome-ignore lint/suspicious/noArrayIndexKey: line order is stable within a row
          key={`b${i}`}
          color={bodyColor}
          wrap="truncate-end"
        >
          <Text>{"  "}</Text>
          {colorize(line)}
        </Text>
      ))}
    </Box>
  )
}
