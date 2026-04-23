import React, { useMemo, useState } from "react"
import { Box, ListView, SearchBar, Text, useWindowSize } from "silvery"
import { useInput } from "silvery/runtime"
import { LogRowView } from "./LogRow.tsx"
import type { LogRow, ViewConfig } from "./view-config.ts"

function defaultSearchText(row: LogRow): string {
  return Object.values(row.fields)
    .filter((v): v is string => typeof v === "string")
    .join(" ")
}

export function App({ path, config, rows }: { path: string; config: ViewConfig; rows: LogRow[] }) {
  const { rows: termRows } = useWindowSize()
  const [cursor, setCursor] = useState(0)
  const [detail, setDetail] = useState<LogRow | null>(null)

  const listHeight = Math.max(5, termRows - 3)

  const getText = config.searchText ?? defaultSearchText

  useInput((input, key) => {
    if (detail) {
      if (key.escape || input === "q") {
        setDetail(null)
        return
      }
      return
    }
    if (input === "q") return "exit"
    if (key.escape) return "exit"
  })

  if (detail) {
    return <DetailPane row={detail} onClose={() => setDetail(null)} height={termRows} />
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
        onSelect={(i) => {
          const r = rows[i]
          if (r) setDetail(r)
        }}
        cache={{ mode: "virtual", isCacheable: (_r, i) => i < cursor - 10 }}
        search={{ getText }}
        renderItem={(row, _i, meta) => <LogRowView row={row} fields={config.fields} isCursor={meta.isCursor} />}
      />
      <SearchBar />
      <StatusBar rowCount={rows.length} cursor={cursor} />
    </Box>
  )
}

function HeaderBar({ path, configName, rowCount }: { path: string; configName: string; rowCount: number }) {
  const short = path.length > 60 ? `…${path.slice(-58)}` : path
  return (
    <Box paddingX={1} flexDirection="row" justifyContent="space-between">
      <Text bold color="$fg-accent">
        {short}
      </Text>
      <Text color="$fg-muted">
        [{configName}] {rowCount} rows
      </Text>
    </Box>
  )
}

function StatusBar({ rowCount, cursor }: { rowCount: number; cursor: number }) {
  return (
    <Box paddingX={1}>
      <Text color="$fg-muted">
        {cursor + 1}/{rowCount} · j/k nav · / find · Enter detail · q quit
      </Text>
    </Box>
  )
}

function DetailPane({ row, onClose, height }: { row: LogRow; onClose: () => void; height: number }) {
  const formatted = useMemo(() => {
    try {
      return JSON.stringify(row.raw, null, 2)
    } catch {
      return String(row.raw)
    }
  }, [row])
  // onClose is invoked via useInput in parent; this is layout-only.
  void onClose
  return (
    <Box flexDirection="column" height={height} paddingX={1}>
      <Box paddingY={0}>
        <Text bold color="$fg-accent">
          row #{row.lineNo} · kind={row.kind ?? "—"} · Esc/q to close
        </Text>
      </Box>
      <Box flexGrow={1} flexDirection="column" marginTop={1}>
        <Text>{formatted}</Text>
      </Box>
    </Box>
  )
}
