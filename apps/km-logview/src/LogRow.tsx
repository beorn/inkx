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

function FieldCell({
  field,
  row,
  isCursor,
}: {
  field: FieldSpec
  row: LogRowData
  isCursor: boolean
}) {
  const raw = row.fields[field.key]
  // Omnibox pattern: selection wins over per-field color — everything on the
  // cursor row reads in $fg-cursor (black on $bg-cursor), bold. This is why
  // Omnibox row looks like a native-terminal cursor highlight.
  const color = isCursor
    ? "$fg-cursor"
    : resolve(field.color, raw, row)
  const bold = isCursor || (resolve(field.bold, raw, row) ?? false)
  const wrap = field.multiLine === "wrap"
  const content = field.render ? field.render(raw, row) : valueToString(raw)

  const width = field.width
  const isFlex = width === "flex"
  const isAuto = width === "auto"
  const fixed = typeof width === "number" ? width : undefined

  return (
    <Box
      width={fixed}
      flexGrow={isFlex ? 1 : 0}
      flexShrink={isFlex || isAuto ? 1 : 0}
      overflow="hidden"
      marginRight={1}
    >
      <Text color={color} bold={bold || undefined} wrap={wrap ? "wrap" : "truncate-end"}>
        {content}
      </Text>
    </Box>
  )
}

export function LogRowView({
  row,
  fields,
  isCursor,
}: {
  row: LogRowData
  fields: FieldSpec[]
  isCursor: boolean
}) {
  // Cursor row: $bg-cursor background fills the row. No leading ▸ glyph —
  // selection is communicated entirely by the bg (per Silvery Omnibox pattern).
  return (
    <Box
      flexDirection="row"
      paddingX={1}
      backgroundColor={isCursor ? "$bg-cursor" : undefined}
    >
      {fields.map((f) => (
        <FieldCell key={f.key} field={f} row={row} isCursor={isCursor} />
      ))}
    </Box>
  )
}
