import React, { useCallback, useMemo, useState } from "react"
import { Box, ListView, SearchBar, Text, useSearch, useWindowSize } from "silvery"
import { useInput } from "silvery/runtime"
import { LogRowView } from "./LogRow.tsx"
import type { LogRow, ViewConfig } from "./view-config.ts"

function defaultSearchText(row: LogRow): string {
  return Object.values(row.fields)
    .filter((v): v is string => typeof v === "string")
    .join(" ")
}

export function App({
  path,
  config,
  rows,
}: {
  path: string
  config: ViewConfig
  rows: LogRow[]
}) {
  const { rows: termRows } = useWindowSize()
  const [cursor, setCursor] = useState(0)
  const [detail, setDetail] = useState<LogRow | null>(null)
  const search = useSearch()

  const listHeight = Math.max(5, termRows - 3)

  const getText = useMemo(
    () => config.searchText ?? defaultSearchText,
    [config],
  )

  // Stable — does not depend on cursor, so ListView doesn't rebuild each keypress.
  const isCacheable = useCallback((_r: LogRow, i: number) => i < rows.length - 1, [rows.length])

  const handleSelect = useCallback(
    (i: number) => {
      const r = rows[i]
      if (r) setDetail(r)
    },
    [rows],
  )

  const renderItem = useCallback(
    (row: LogRow, _i: number, meta: { isCursor: boolean }) => (
      <LogRowView row={row} fields={config.fields} isCursor={meta.isCursor} />
    ),
    [config.fields],
  )

  useInput((input, key) => {
    if (detail) {
      if (key.escape || input === "q") {
        setDetail(null)
        return
      }
      return
    }
    // When search is active, let SearchProvider handle keys (Ctrl+F/Enter/Esc/…).
    if (search.isActive) return
    if (input === "/") {
      search.open()
      return
    }
    if (input === "n") {
      search.next()
      return
    }
    if (input === "N") {
      search.prev()
      return
    }
    if (input === "q") return "exit"
    if (key.escape) return "exit"
  })

  if (detail) {
    return <DetailPane row={detail} height={termRows} />
  }

  return (
    <Box flexDirection="column" height={termRows}>
      <HeaderBar path={path} configName={config.name} rowCount={rows.length} />
      <ListView
        items={rows}
        height={listHeight}
        nav
        getKey={(r) => r.id}
        onCursor={setCursor}
        onSelect={handleSelect}
        cache={{ mode: "virtual", isCacheable }}
        search={{ getText }}
        renderItem={renderItem}
      />
      <SearchBar />
      <StatusBar rowCount={rows.length} cursor={cursor} matches={search.matches.length} />
    </Box>
  )
}

function HeaderBar({
  path,
  configName,
  rowCount,
}: {
  path: string
  configName: string
  rowCount: number
}) {
  const short = path.length > 50 ? `…${path.slice(-48)}` : path
  return (
    <Box paddingX={1} flexDirection="row">
      <Text color="$fg-muted">
        {configName} · {rowCount} rows · {short}
      </Text>
    </Box>
  )
}

function StatusBar({
  rowCount,
  cursor,
  matches,
}: {
  rowCount: number
  cursor: number
  matches: number
}) {
  const hint =
    matches > 0
      ? `${matches} match${matches === 1 ? "" : "es"} · n/N next/prev · /clear: Esc`
      : "/ find · Enter detail · q quit"
  return (
    <Box paddingX={1} flexDirection="row" justifyContent="space-between">
      <Text color="$fg-muted">
        {cursor + 1}/{rowCount}
      </Text>
      <Text color="$fg-muted">{hint}</Text>
    </Box>
  )
}

function DetailPane({ row, height }: { row: LogRow; height: number }) {
  const formatted = useMemo(() => {
    try {
      return JSON.stringify(row.raw, null, 2)
    } catch {
      return String(row.raw)
    }
  }, [row])
  return (
    <Box flexDirection="column" height={height} paddingX={1}>
      <Text bold color="$fg-accent">
        row #{row.lineNo} · {row.kind ?? "—"} · Esc/q to close
      </Text>
      <Box flexGrow={1} flexDirection="column" marginTop={1}>
        <Text>{formatted}</Text>
      </Box>
    </Box>
  )
}
