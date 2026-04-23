import { watch } from "node:fs"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Box, Em, ListView, SearchBar, Small, Strong, Text, useSearch, useWindowSize } from "silvery"
import { useInput } from "silvery/runtime"
import { LogRowView } from "./LogRow.tsx"
import { loadRows } from "./parse-jsonl.ts"
import { PopoverProvider } from "./Popover.tsx"
import type { LogRow, ViewConfig } from "./view-config.ts"

/**
 * Layout:
 *   [ single status bar (top)          ]  1 row
 *   [ ListView                         ]  fills rest
 *   [ SearchBar (only when active)     ]  0 or 1 row
 *
 * No bottom status bar — everything collapses into the top strip.
 *
 * Interactions (redesigned 2026-04-23):
 *   - Hover a pill / segment → popover shows that field's full value
 *   - Click a row body → toggles per-row expand for multi-line body
 *   No full-screen detail pane; the popover + inline expansion subsume it.
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
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const [follow, setFollow] = useState(true)
  const search = useSearch()

  const cursorRef = useRef(cursor)
  cursorRef.current = cursor
  const rowsLenRef = useRef(rows.length)
  rowsLenRef.current = rows.length
  // `gg` chord: first `g` primes, a second within the window triggers top-jump.
  const pendingG = useRef<number>(0)
  const followRef = useRef(follow)
  followRef.current = follow

  // 1 (status bar) + (1 if SearchBar active else 0)
  const chrome = 1 + (search.isActive ? 1 : 0)
  const listHeight = Math.max(5, termRows - chrome)

  const getText = useMemo(() => config.searchText ?? defaultSearchText, [config])

  const handleCursor = useCallback((i: number) => {
    cursorRef.current = i
    setCursor(i)
  }, [])

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const renderItem = useCallback(
    (row: LogRow, _i: number, meta: { isCursor: boolean; searchQuery: string }) => (
      <LogRowView
        row={row}
        fields={config.fields}
        isCursor={meta.isCursor}
        expanded={expanded.has(row.id)}
        onToggleExpand={() => toggleExpand(row.id)}
        searchQuery={meta.searchQuery}
      />
    ),
    [config.fields, expanded, toggleExpand],
  )

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const reload = () => {
      try {
        const fresh = loadRows(path, config)
        const prevLen = rowsLenRef.current
        // Follow-mode semantics:
        //   follow=true  → always jump to the new end on refresh (explicit
        //                  vim-F toggle; tail -f behavior)
        //   follow=false → cursor stays put regardless of where it is (user
        //                  has paused to read; don't yank them)
        setRows(fresh)
        rowsLenRef.current = fresh.length
        if (followRef.current && fresh.length !== prevLen) {
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
    if (search.isActive) return

    // `gg` chord — first `g` primes, second `g` within 1s triggers top-jump.
    // Any other key resets the chord.
    if (input === "g" && !key.shift) {
      const now = Date.now()
      if (pendingG.current && now - pendingG.current < 1000) {
        handleCursor(0)
        pendingG.current = 0
        return
      }
      pendingG.current = now
      return
    }
    pendingG.current = 0

    // Full-page nav (less Space/b + vim Ctrl+B). Ctrl+F is NOT bound — it
    // collides with silvery's SearchProvider (Ctrl+F opens find). Space is
    // the conventional less-style forward page; `b` is back.
    const page = Math.max(1, listHeight - 1)
    if (input === " ") {
      handleCursor(Math.min(rowsLenRef.current - 1, cursorRef.current + page))
      return
    }
    if ((key.ctrl && input === "b") || input === "b") {
      handleCursor(Math.max(0, cursorRef.current - page))
      return
    }

    // Search — `/` forward, `?` also opens (direction is Shift+Enter within bar).
    if (input === "/" || input === "?") {
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

    // Follow-mode toggle — vim-F / less-F convention.
    if (input === "F") {
      setFollow((f) => !f)
      return
    }

    if (input === "q") return "exit"
    if (key.escape) return "exit"
  })

  return (
    <PopoverProvider>
      <Box flexDirection="column" height={termRows} width="100%">
        <StatusBar
          path={path}
          configName={config.name}
          rowCount={rows.length}
          cursor={cursor}
          matches={search.matches.length}
          searchActive={search.isActive}
          follow={follow}
        />
        <ListView
          items={rows}
          height={listHeight}
          maxRendered={200}
          nav
          cursorKey={cursor}
          getKey={(r) => r.id}
          onCursor={handleCursor}
          search={{ getText }}
          renderItem={renderItem}
        />
        <SearchBar />
      </Box>
    </PopoverProvider>
  )
}

function StatusBar({
  path,
  configName,
  rowCount,
  cursor,
  matches,
  searchActive,
  follow,
}: {
  path: string
  configName: string
  rowCount: number
  cursor: number
  matches: number
  searchActive: boolean
  follow: boolean
}) {
  const short = path.length > 60 ? `…${path.slice(-58)}` : path
  // Status suffixes — state indicators, not key hints. Literal text must
  // match test expectations ("find…", "N match(es)", "paused").
  const findText = searchActive ? "find…" : matches > 0 ? `${matches} match${matches === 1 ? "" : "es"}` : ""
  // follow=true is the default; only surface the off state (user explicitly
  // paused tailing via F — they'll want the reminder).
  return (
    // Inverted chrome: $fg bg + $bg fg so the bar visually separates from the
    // log body. Children use typography presets with color="inherit" to keep
    // the inverted foreground instead of their default semantic tokens.
    <Box flexDirection="row" paddingX={1} width="100%" backgroundColor="$fg" color="$bg">
      <Strong>{configName}</Strong>
      <Text> · </Text>
      <Text>
        {cursor + 1}/{rowCount}
      </Text>
      <Text> · </Text>
      <Small color="inherit">{short}</Small>
      {findText ? (
        <>
          <Text> · </Text>
          <Em color="inherit">{findText}</Em>
        </>
      ) : null}
      {!follow ? (
        <>
          <Text> · </Text>
          <Em color="inherit">⏸ paused</Em>
        </>
      ) : null}
    </Box>
  )
}
