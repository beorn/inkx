import { watch } from "node:fs"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Box, ListView, SearchBar, Text, useSearch, useWindowSize } from "silvery"
import { useInput } from "silvery/runtime"
import { LogRowView } from "./LogRow.tsx"
import { loadRows } from "./parse-jsonl.ts"
import type { LogRow, ViewConfig } from "./view-config.ts"

/**
 * Layout:
 *   [ single status bar (top)          ]  1 row
 *   [ ListView                         ]  fills rest
 *   [ SearchBar (only when active)     ]  0 or 1 row
 *
 * No bottom status bar — everything collapses into the top strip.
 *
 * No `cache={{ mode: "virtual" }}` — that freezes older items to a ring buffer
 * and is right for chat (top-to-bottom reading), wrong for a log viewer where
 * users jump to arbitrary positions (G, /search, PgDn). ListView's built-in
 * viewport virtualization handles any size via maxRendered + overscan.
 *
 * Tailing: fs.watch re-parses on change (debounced 150ms). If cursor was at
 * the bottom before the refresh, it follows to the new bottom (sticky tail).
 */

function defaultSearchText(row: LogRow): string {
  return Object.values(row.fields)
    .filter((v): v is string => typeof v === "string")
    .join(" ")
}

export function App({ path, config, rows: initialRows }: { path: string; config: ViewConfig; rows: LogRow[] }) {
  const { rows: termRows } = useWindowSize()
  const [rows, setRows] = useState(initialRows)
  const [cursor, setCursor] = useState(initialRows.length - 1)
  const [detail, setDetail] = useState<LogRow | null>(null)
  const search = useSearch()

  const cursorRef = useRef(cursor)
  cursorRef.current = cursor
  const rowsLenRef = useRef(rows.length)
  rowsLenRef.current = rows.length

  // 1 (status bar) + (1 if SearchBar active else 0)
  const chrome = 1 + (search.isActive ? 1 : 0)
  const listHeight = Math.max(5, termRows - chrome)

  const getText = useMemo(() => config.searchText ?? defaultSearchText, [config])

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
      <StatusBar
        path={path}
        configName={config.name}
        rowCount={rows.length}
        cursor={cursor}
        matches={search.matches.length}
        searchActive={search.isActive}
      />
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
    </Box>
  )
}

function StatusBar({
  path,
  configName,
  rowCount,
  cursor,
  matches,
  searchActive,
}: {
  path: string
  configName: string
  rowCount: number
  cursor: number
  matches: number
  searchActive: boolean
}) {
  const short = path.length > 40 ? `…${path.slice(-38)}` : path
  const hint = searchActive
    ? "Esc close · Enter/Shift+Enter next/prev"
    : matches > 0
      ? `${matches} match${matches === 1 ? "" : "es"} · n/N next/prev`
      : "/ find · Enter detail · q quit"
  return (
    <Box
      flexDirection="row"
      paddingX={1}
      width="100%"
      backgroundColor="$bg-muted"
      justifyContent="space-between"
    >
      <Text bold>
        {configName} · {cursor + 1}/{rowCount} · {short}
      </Text>
      <Text bold>{hint}</Text>
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
