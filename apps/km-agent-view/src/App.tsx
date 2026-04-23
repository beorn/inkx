/* eslint-disable @typescript-eslint/no-non-null-assertion -- codebase idiom */
import React, { useCallback, useMemo, useRef, useState } from "react"
import { Box, ListView, Text, useWindowSize } from "silvery"
import { useInput } from "silvery/runtime"
import type { LogRow } from "@km/logview/view-config"
import { ChatRow, ClusterRow } from "./ChatRow.tsx"
import { type ChatItem, clusterRows } from "./cluster.ts"

/**
 * km-agent-view App — v0 layout.
 *
 *   ┌─────────────────────────────────────┐  (1 row)  session-tabs placeholder
 *   │  ● claude session                   │           just the current title —
 *   ├─────────────────────────────────────┤           multi-tab is v2.
 *   │                                     │
 *   │   ┌─ USER ──────────────────┐       │
 *   │   │ hello                   │       │  (fills) chat stream — ListView
 *   │   └─────────────────────────┘       │           with nav enabled.
 *   │                                     │
 *   │   ┌ ASSIST                          │           USER right-aligned,
 *   │   │ hi there                        │           everything else left.
 *   │   └                                 │
 *   │                                     │
 *   ├─────────────────────────────────────┤  (1 row)  composer placeholder,
 *   │  Type a message…     (v0 disabled)  │           greyed out — telegraphs
 *   └─────────────────────────────────────┘           v-future direction.
 *
 * Hook clustering: adjacent "hook" rows collapse to `◆ N hooks`. Enter on a
 * cluster toggles in-place expansion. Enter on any other row opens a detail
 * overlay with the raw JSON (same as km-logview's DetailPane).
 *
 * Nav: j/k/G/gg/Space/b handled by ListView's built-in nav prop + a light
 * custom useInput layer for `gg`, paging, and Esc/q to exit.
 */

export function App({ path: _path, title, rows }: { path: string; title: string; rows: LogRow[] }) {
  const { rows: termRows, columns: termCols } = useWindowSize()

  // Static clustering — v0 clusters adjacent hooks once at mount. If we add
  // realtime tail in v1, clusterRows gets re-run per update (it's cheap).
  const items = useMemo(() => clusterRows(rows), [rows])

  // Expansion state — which cluster ids are currently expanded.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  // Detail overlay — shows raw JSON of one row, mirrors km-logview's pattern.
  const [detail, setDetail] = useState<LogRow | null>(null)
  const [cursor, setCursor] = useState(items.length - 1)

  const cursorRef = useRef(cursor)
  cursorRef.current = cursor
  const itemsLenRef = useRef(items.length)
  itemsLenRef.current = items.length
  const pendingG = useRef<number>(0)

  // Chrome: 1 row top tabs = 1 row reserved. The composer is rendered as
  // ListView's `listFooter` so it sits inside the scroll surface and can't
  // be pushed off the bottom by flex accounting drift. (Attempted top-level
  // flex composition with explicit heights; ListView's scroll container
  // consumed all rows below SessionTabs regardless of its `height` prop.)
  const listHeight = Math.max(1, termRows - 1)

  const handleCursor = useCallback((i: number) => {
    cursorRef.current = i
    setCursor(i)
  }, [])

  const handleSelect = useCallback(
    (i: number) => {
      const item = items[i]
      if (!item) return
      if (item.kind === "cluster") {
        setExpanded((prev) => {
          const next = new Set(prev)
          if (next.has(item.id)) next.delete(item.id)
          else next.add(item.id)
          return next
        })
        return
      }
      setDetail(item.row)
    },
    [items],
  )

  const renderItem = useCallback(
    (item: ChatItem, _i: number, meta: { isCursor: boolean }) => {
      if (item.kind === "cluster") {
        const isExpanded = expanded.has(item.id)
        const first = item.rows[0]!
        const time = typeof first.fields.time === "string" ? first.fields.time : ""
        if (!isExpanded) {
          return (
            <ClusterRow
              count={item.rows.length}
              time={time}
              isCursor={meta.isCursor}
              expanded={false}
            />
          )
        }
        // Expanded: render the cluster header PLUS all children inline. The
        // cluster still owns the cursor — children render non-cursor so users
        // can scan the pile without per-child navigation gymnastics.
        return (
          <Box flexDirection="column" width="100%">
            <ClusterRow
              count={item.rows.length}
              time={time}
              isCursor={meta.isCursor}
              expanded={true}
            />
            {item.rows.map((row) => (
              <ChatRow key={row.id} row={row} isCursor={false} cols={termCols} />
            ))}
          </Box>
        )
      }
      return <ChatRow row={item.row} isCursor={meta.isCursor} cols={termCols} />
    },
    [expanded, termCols],
  )

  useInput((input, key) => {
    if (detail) {
      if (key.escape || input === "q") {
        setDetail(null)
        return
      }
      return
    }

    // `gg` chord — first `g` primes, second `g` within 1s triggers top-jump.
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

    const page = Math.max(1, listHeight - 1)
    if (input === " ") {
      handleCursor(Math.min(itemsLenRef.current - 1, cursorRef.current + page))
      return
    }
    if ((key.ctrl && input === "b") || input === "b") {
      handleCursor(Math.max(0, cursorRef.current - page))
      return
    }

    if (input === "q") return "exit"
    if (key.escape) return "exit"
  })

  if (detail) {
    return <DetailPane row={detail} height={termRows} />
  }

  return (
    <Box flexDirection="column" height={termRows} width="100%">
      <SessionTabs title={title} />
      <ListView
        items={items}
        height={listHeight}
        maxRendered={200}
        nav
        cursorKey={cursor}
        getKey={(it) => it.id}
        onCursor={handleCursor}
        onSelect={handleSelect}
        renderItem={renderItem}
        listFooter={<Composer />}
      />
    </Box>
  )
}

/**
 * SessionTabs — v0 renders only the current session title. v2 will show up to
 * 5 tabs with new-data dots; the layout slot is already here so upgrading
 * doesn't move the chat stream.
 */
function SessionTabs({ title }: { title: string }) {
  return (
    <Box flexDirection="row" flexShrink={0} height={1} paddingX={1} width="100%" backgroundColor="$fg">
      <Text color="$bg" bold>
        {"● "}
        {title}
      </Text>
    </Box>
  )
}

/**
 * Composer — v0 disabled placeholder. Greyed out prompt telegraphs that this
 * surface is architected for live agent input in a later phase.
 */
function Composer() {
  return (
    <Box flexDirection="row" flexShrink={0} paddingX={1} width="100%" backgroundColor="$bg-muted">
      <Text color="$fg-muted">
        {"› "}
        Type a message… (disabled in v0 — read-only viewer)
      </Text>
    </Box>
  )
}

/**
 * DetailPane — full-screen raw JSON view. Mirrors km-logview's DetailPane so
 * power users can inspect the source line. Esc/q closes.
 */
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
