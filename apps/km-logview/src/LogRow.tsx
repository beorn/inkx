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
 * Row shape:
 *   Line 1 (header):   [time]  [ KIND-pill ]  [ label-pill ]
 *   Lines 2+ (body):   one row per body line, dim muted, indented 2, with inline
 *                      tag/JSON colorization via colorize().
 *
 * Pills: fields named in PILL_FIELDS render as inverse-bg chips using the
 * field's color as the pill background. Enter on the row opens the detail
 * pane (serves as the popover: full JSON of the row). Other inline fields
 * (time) render as plain bold colored text. Separators: a single space,
 * not a middot — pill shape provides its own visual boundary.
 *
 * When a `multiLine: "below"` field contains ANY newline, the whole body
 * pushes below the header (first line included). Body lines are dim.
 *
 * Selection (Omnibox pattern): row Box gets $bg-cursor; Text falls back to
 * $fg-cursor for contrast. Pill bgs collapse to cursor fg for unity.
 */

const PILL_FIELDS = new Set(["kind", "label"])

/** Inline single-line body threshold. Below this many chars → inline with
 * the header; at/above, or any multi-line content → push below muted+dim. */
const INLINE_BODY_MAX_CHARS = 30

function Pill({
  color,
  bold,
  isCursor,
  children,
}: {
  color: string | undefined
  bold: boolean
  isCursor: boolean
  children: React.ReactNode
}) {
  // Pills are "groupings with a name" — rendered as plain colored bold text.
  // No inverse fill (tried it, too loud). Shape carries meaning via the
  // content itself (KIND, label) + surrounding spacing.
  return (
    <Text color={isCursor ? "$fg-cursor" : color} bold={bold || undefined}>
      {children}
    </Text>
  )
}

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
    const color = resolve(field.color, raw, row)
    const bold = resolve(field.bold, raw, row) ?? false
    const rendered = field.render ? field.render(raw, row) : valueToString(raw)
    const asStr = typeof rendered === "string" ? rendered : null

    // Body-like fields (multiLine:"below"): go below when there are 2+
    // non-empty lines OR the single line is ≥ INLINE_BODY_MAX_CHARS. Short
    // single-liners render inline beside the header. Keep the styling
    // uniform: body is always dim-muted + colorized, never per-kind.
    let inlineBody: string | null = null
    if (field.multiLine === "below" && asStr !== null && asStr.length > 0) {
      const allLines = asStr.split("\n")
      const nonEmpty = allLines.filter((l) => l.trim().length > 0)
      const single = nonEmpty[0] ?? ""
      if (nonEmpty.length > 1 || single.length >= INLINE_BODY_MAX_CHARS) {
        bodyLines = allLines
        continue
      }
      inlineBody = single
      if (inlineBody === "") continue
    }

    if (inlineBody === null && (rendered == null || rendered === "")) continue

    // Pills → pill rendering. Body inline → dim-muted + colorize. Other
    // inline fields → plain colored bold.
    if (PILL_FIELDS.has(field.key)) {
      headerSegments.push(
        <Pill key={field.key} color={color} bold={bold} isCursor={isCursor}>
          {rendered}
        </Pill>,
      )
    } else if (inlineBody !== null) {
      headerSegments.push(
        <Text
          key={field.key}
          color={isCursor ? cursorFg : "$fg-muted"}
          dim={!isCursor}
        >
          {colorize(inlineBody)}
        </Text>,
      )
    } else {
      headerSegments.push(
        <Text
          key={field.key}
          color={isCursor ? cursorFg : color}
          bold={bold || isCursor || undefined}
        >
          {rendered}
        </Text>,
      )
    }

    if (i < fields.length - 1) {
      headerSegments.push(<Text key={`sep-${field.key}`}>{" "}</Text>)
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
          dim={!isCursor}
          wrap="truncate-end"
        >
          <Text>{"  "}</Text>
          {colorize(line)}
        </Text>
      ))}
    </Box>
  )
}
