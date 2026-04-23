import { watch } from "node:fs"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Box, ListView, SearchBar, Text, useSearch, useWindowSize } from "silvery"
import { useInput } from "silvery/runtime"
import { LogRowView } from "./LogRow.tsx"
import { loadRows } from "./parse-jsonl.ts"
import type { LogRow, ViewConfig } from "./view-config.ts"

/**
 * No `cache={{ mode: "virtual" }}` here — that's for chat-style apps where old
 * items freeze to scrollback and you only read top-to-bottom. A log viewer
 * needs arbitrary scroll (G, /search → match mid-file), so we use ListView's
 * built-in viewport virtualization (maxRendered + overscan) instead.
 *
 * Tailing: the file is re-parsed on every fs.watch event (debounced 150ms).
 * If the cursor was at the bottom before the refresh, it follows to the new
 * bottom (sticky tail). Otherwise cursor stays put.
 */

function defaultSearchText(row: LogRow): string {
  return Object.values(row.fields)
    .filter((v): v is string => typeof v === "string")
    .join(" ")
}

export function App({
  path,
  config,
  rows: initialRows,
}: {
  path: string
  config: ViewConfig
  rows: LogRow[]
}) {
  const { rows: termRows } = useWindowSize()
  const [rows, setRows] = useState(initialRows)
  const [cursor, setCursor] = useState(initialRows.length - 1)
  const [detail, setDetail] = useState<LogRow | null>(null)
  const search = useSearch()

  // Refs so the fs.watch callback reads fresh values without re-subscribing.
  const cursorRef = useRef(cursor)
  cursorRef.current = cursor
  const rowsLenRef = useRef(rows.length)
  rowsLenRef.current = rows.length

  const listHeight = Math.max(5, termRows - 3)

  const getText = useMemo(
    () => config.searchText ?? defaultSearchText,
    [config],
  )

  const handleCursor = useCallback((i: number) => {
    cursorRef.current = i
    setCursor(i)
  }, [])

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

  // Live tail — re-parse on fs.watch, sticky-to-bottom if cursor was at end.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const reload = () => {
      try {
        const fresh = loadRows(path, config)
        const prevLen = rowsLenRef.current
        const wasAtEnd = cursorRef.current >= prevLen - 1
        setRows(fresh)
        rowsLenRef.current = fresh.length
        if (wasAtEnd && fresh.length !== prevLen) {
          const nextCursor = Math.max(0, fresh.length - 1)
          cursorRef.current = nextCursor
          setCursor(nextCursor)
        }
      } catch {
        // Ignore transient errors (file replaced mid-read, etc.)
      }
    }
    const watcher = watch(path, { persistent: false }, () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(reload, 150)
    })
    return () => {
      if (timer) clearTimeout(timer)
      watcher.close()
    }
  }, [path, config])

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
        maxRendered={200}
        nav
        cursorKey={cursor}
        getKey={(r) => r.id}
        onCursor={handleCursor}
        onSelect={handleSelect}
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
