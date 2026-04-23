import { readFileSync } from "node:fs"
import type { LogRow, ViewConfig } from "./view-config.ts"

export function parseJsonLine(line: string): unknown | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

/** Synchronous full-file parse. v0 — good enough for typical JSONL (<100MB). */
export function loadRows(path: string, config: ViewConfig): LogRow[] {
  const text = readFileSync(path, "utf8")
  const lines = text.split("\n")
  const rows: LogRow[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""
    const parsed = config.parseLine(line, i + 1)
    if (parsed == null) continue
    for (const row of config.deriveRows(parsed, i + 1)) {
      rows.push(row)
    }
  }
  return rows
}
