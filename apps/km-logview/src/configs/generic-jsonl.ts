import { parseJsonLine } from "../parse-jsonl.ts"
import type { ViewConfig } from "../view-config.ts"

/**
 * Fallback config for arbitrary JSONL files. Each line becomes one row with
 * common fields extracted (timestamp, level, msg) plus a catch-all "rest" field
 * containing the remaining JSON as a one-line string.
 */

type JSON = Record<string, unknown>

function asObject(x: unknown): JSON | null {
  return x != null && typeof x === "object" && !Array.isArray(x) ? (x as JSON) : null
}
function asString(x: unknown): string | null {
  return typeof x === "string" ? x : null
}

function extractTime(o: JSON): string {
  const ts = asString(o.timestamp) ?? asString(o.time) ?? asString(o.ts)
  if (!ts) return ""
  return ts.length >= 19 && /^\d{4}-\d{2}-\d{2}T/.test(ts) ? ts.slice(11, 19) : ts
}
function extractLevel(o: JSON): string {
  return asString(o.level) ?? asString(o.severity) ?? ""
}
function extractMsg(o: JSON): string {
  return asString(o.msg) ?? asString(o.message) ?? asString(o.text) ?? ""
}

function levelColor(value: unknown): string | undefined {
  const l = typeof value === "string" ? value.toLowerCase() : ""
  if (l.startsWith("err") || l === "fatal") return "$fg-error"
  if (l.startsWith("warn")) return "$fg-warning"
  if (l.startsWith("info")) return "$fg-info"
  if (l.startsWith("debug") || l.startsWith("trace")) return "$fg-muted"
  return undefined
}

export const genericJsonlConfig: ViewConfig = {
  name: "generic-jsonl",
  detect(path) {
    return path.endsWith(".jsonl") || path.endsWith(".ndjson") || path.endsWith(".log")
  },
  parseLine(line) {
    return parseJsonLine(line)
  },
  deriveRows(parsed, lineNo) {
    const obj = asObject(parsed)
    if (!obj) {
      // Non-object JSON line — fall back to raw-string rendering.
      return [
        {
          id: `${lineNo}`,
          lineNo,
          raw: parsed,
          fields: { time: "", level: "", msg: JSON.stringify(parsed), rest: "" },
        },
      ]
    }
    const time = extractTime(obj)
    const level = extractLevel(obj)
    const msg = extractMsg(obj)
    const rest: JSON = { ...obj }
    for (const k of ["timestamp", "time", "ts", "level", "severity", "msg", "message", "text"]) {
      delete rest[k]
    }
    const restStr = Object.keys(rest).length ? JSON.stringify(rest) : ""
    return [{ id: `${lineNo}`, lineNo, raw: obj, fields: { time, level, msg, rest: restStr } }]
  },
  fields: [
    { key: "time", width: 8, color: "$fg-muted" },
    {
      key: "level",
      width: 6,
      color: (v) => levelColor(v),
      bold: (v) => {
        const l = typeof v === "string" ? v.toLowerCase() : ""
        return l.startsWith("err") || l === "fatal" || l.startsWith("warn")
      },
    },
    { key: "msg", width: "flex", multiLine: "truncate" },
    { key: "rest", width: "auto", color: "$fg-muted", multiLine: "truncate" },
  ],
  searchText(row) {
    const f = row.fields
    return [f.msg, f.rest, f.level].filter((v) => typeof v === "string").join(" ")
  },
}
