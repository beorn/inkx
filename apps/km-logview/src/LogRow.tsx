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

function FieldCell({ field, row }: { field: FieldSpec; row: LogRowData }) {
  const raw = row.fields[field.key]

  let node: React.ReactNode
  if (field.render) {
    node = field.render(raw, row)
  } else {
    const str = valueToString(raw)
    const color = resolve(field.color, raw, row)
    const bold = resolve(field.bold, raw, row) ?? false
    const wrap = field.multiLine === "wrap"
    node = (
      <Text color={color} bold={bold || undefined} wrap={wrap ? "wrap" : "truncate-end"}>
        {str}
      </Text>
    )
  }

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
      {node}
    </Box>
  )
}

export function LogRowView({ row, fields, isCursor }: { row: LogRowData; fields: FieldSpec[]; isCursor: boolean }) {
  return (
    <Box flexDirection="row" paddingX={1}>
      <Box width={2}>
        <Text color="$fg-accent" bold>
          {isCursor ? "▸" : " "}
        </Text>
      </Box>
      {fields.map((f) => (
        <FieldCell key={f.key} field={f} row={row} />
      ))}
    </Box>
  )
}
