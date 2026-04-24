import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import React, { useEffect, useMemo, useState } from "react"
import { Box, ModalDialog, Muted, SelectList, Text, TextInput } from "silvery"

type Entry = {
  sessionId: string
  path: string
  summary: string
  turns: number
}

function scanLogDir(dir: string | undefined): Entry[] {
  if (!dir || !existsSync(dir)) return []
  try {
    const names = readdirSync(dir).filter((n) => n.endsWith(".jsonl"))
    return names.map((n) => {
      const full = join(dir, n)
      let turns = 0
      let summary = ""
      try {
        const content = readFileSync(full, "utf8")
        const lines = content.split("\n").filter((l) => l.length > 0)
        for (const l of lines) {
          try {
            const obj = JSON.parse(l) as { kind?: string; text?: string }
            if (obj.kind === "turn-start") turns++
            if (!summary && obj.kind === "user-message") summary = String(obj.text ?? "").slice(0, 80)
          } catch {
            /* malformed line */
          }
        }
      } catch {
        /* unreadable */
      }
      return { sessionId: n.replace(/\.jsonl$/, ""), path: full, summary, turns }
    })
  } catch {
    return []
  }
}

/**
 * M10 seed — list prior session logs, search over them with a naive includes,
 * replay a selected log. FTS5 + mdtest tape integration come after the MVP
 * M10 work expands recall-index coverage; for now this is linear scan.
 */
export function HistoryView({ onClose, logDir }: { onClose: () => void; logDir?: string }): React.ReactElement {
  const [query, setQuery] = useState("")
  const [cursor, setCursor] = useState(0)

  // Sync fs scan lives in useEffect, not useMemo — render-time sync I/O
  // blocks the event loop. User sees an empty list for one frame, then
  // entries pop in after scanLogDir returns.
  const [entries, setEntries] = useState<Entry[]>([])
  useEffect(() => {
    setEntries(scanLogDir(logDir))
  }, [logDir])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) => e.sessionId.toLowerCase().includes(q) || e.summary.toLowerCase().includes(q))
  }, [entries, query])

  return (
    <ModalDialog title="History" hotkey="Esc" onClose={onClose}>
      <Box flexDirection="column" gap={1}>
        <TextInput value={query} onChange={setQuery} placeholder="Search session history" prompt="🔍 " isActive />
        {filtered.length === 0 ? (
          <Muted>No prior sessions. Enable logs with --log-dir.</Muted>
        ) : (
          <SelectList
            items={filtered.map((e, i) => ({
              label: `${e.sessionId}  ${e.turns} turns  ${e.summary}`,
              value: String(i),
            }))}
            highlightedIndex={cursor}
            onHighlight={setCursor}
            onSelect={() => onClose()}
            isActive
          />
        )}
        <Text color="$muted">Enter = open · Esc = close</Text>
      </Box>
    </ModalDialog>
  )
}
