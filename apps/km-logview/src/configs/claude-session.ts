import { parseJsonLine } from "../parse-jsonl.ts"
import type { LogRow, ViewConfig } from "../view-config.ts"

/**
 * Claude Code session JSONL config.
 *
 * Each JSONL line has a top-level .type that determines how to derive rows:
 *   - "user"            → 1..N rows (content is string OR array of {type, ...})
 *   - "assistant"       → 1..N rows (content is array of text / tool_use / thinking)
 *   - "attachment"      → 1 row (hook_success, hook_failure)
 *   - "system"          → 1 row
 *   - others (queue-operation, permission-mode, last-prompt, file-history-snapshot): skipped
 *
 * The script tools/session-view.sh is the prior-art reference; this module is a
 * structured port of that jq program.
 */

type JSON = Record<string, unknown>

const INJECTION_PATTERN = /<system-reminder>|<recall-memory|UserPromptSubmit hook|additionalContext/

function asObject(x: unknown): JSON | null {
  return x != null && typeof x === "object" && !Array.isArray(x) ? (x as JSON) : null
}
function asString(x: unknown): string | null {
  return typeof x === "string" ? x : null
}
function asArray(x: unknown): unknown[] | null {
  return Array.isArray(x) ? x : null
}

function timeOf(parsed: JSON): string {
  const ts = asString(parsed.timestamp)
  if (!ts) return ""
  return ts.length >= 19 ? ts.slice(11, 19) : ts
}

function truncate(s: string, max: number): string {
  if (max <= 0 || s.length <= max) return s
  return `${s.slice(0, max)}…(+${s.length - max})`
}

/** Human-readable size for image payloads (base64 → decoded byte estimate). */
function humanBytes(b: number): string {
  if (b < 1024) return `${b}B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}kB`
  return `${(b / (1024 * 1024)).toFixed(1)}MB`
}

/**
 * Summarize a single Anthropic content-block (text / image / other) to a compact
 * display string. The critical case: tool_result content can be an array of blocks
 * where one block is `{type:"image",source:{type:"base64",media_type:...,data:<MB of base64>}}`.
 * Dumping that raw via JSON.stringify produces ~hundreds of kB of garbage per row.
 */
function summarizeContentBlock(block: JSON): string {
  const t = asString(block.type)
  if (t === "text") return asString(block.text) ?? ""
  if (t === "image") {
    const src = asObject(block.source)
    const media = asString(src?.media_type) ?? "image"
    const data = asString(src?.data) ?? ""
    // base64 decodes to ~3/4 of encoded length
    const approxBytes = Math.round((data.length * 3) / 4)
    return data.length > 0 ? `[${media}, ${humanBytes(approxBytes)}]` : `[${media}]`
  }
  if (t === "tool_use") {
    const name = asString(block.name) ?? "?"
    return `[tool_use: ${name}]`
  }
  if (t === "tool_result") {
    // Nested tool_result blocks in a content array — rare but possible.
    const nested = block.content
    if (typeof nested === "string") return nested
    if (Array.isArray(nested)) return summarizeContent(nested)
    return "[tool_result]"
  }
  // Unknown block type — don't dump raw JSON; render a compact tag.
  return t ? `[${t}]` : ""
}

/** Summarize tool_result / message content that is a string OR an array of content blocks. */
function summarizeContent(content: unknown): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    const parts: string[] = []
    for (const item of content) {
      const obj = asObject(item)
      if (!obj) continue
      const s = summarizeContentBlock(obj)
      if (s) parts.push(s)
    }
    return parts.join("\n")
  }
  return ""
}

/** Pretty-print tool input. Multi-line output is OK — rendered as overflow
 * lines beneath the row header. Short, fast-scan format for common tools;
 * JSON pretty-print as fallback so nothing is lost. */
function formatToolInput(name: string, input: JSON): string {
  if (name === "Bash") {
    return asString(input.command) ?? ""
  }
  if (name === "Read") {
    const path = asString(input.file_path) ?? "?"
    const offset = input.offset != null ? ` @${String(input.offset)}` : ""
    const limit = input.limit != null ? ` limit=${String(input.limit)}` : ""
    return `read ${path}${offset}${limit}`
  }
  if (name === "Edit") {
    const path = asString(input.file_path) ?? "?"
    const oldS = asString(input.old_string) ?? ""
    const newS = asString(input.new_string) ?? ""
    return `edit ${path}\n─── old ───\n${oldS}\n─── new ───\n${newS}`
  }
  if (name === "Write") {
    const path = asString(input.file_path) ?? "?"
    const content = asString(input.content) ?? ""
    return `write ${path}\n${content}`
  }
  if (name === "Grep") {
    const glob = asString(input.glob)
    return `grep ${asString(input.pattern) ?? "?"}${glob ? ` glob=${glob}` : ""}`
  }
  if (name === "Glob") return `glob ${asString(input.pattern) ?? "?"}`
  if (name === "Task") {
    const prompt = asString(input.prompt) ?? ""
    return `task ${asString(input.subagent_type) ?? "general"}: ${asString(input.description) ?? ""}\n${prompt}`
  }
  try {
    return JSON.stringify(input, null, 2)
  } catch {
    return String(input)
  }
}

function basename(p: string): string {
  const i = p.lastIndexOf("/")
  return i === -1 ? p : p.slice(i + 1)
}

function mkRow(lineNo: number, suffix: string, kind: string, fields: Record<string, unknown>, raw: unknown): LogRow {
  return { id: `${lineNo}.${suffix}`, lineNo, kind, raw, fields }
}

function deriveAttachmentRows(obj: JSON, lineNo: number, time: string): LogRow[] {
  const att = asObject(obj.attachment)
  if (!att) return []
  const hookName = asString(att.hookName) ?? "?"
  const cmd = asString(att.command) ?? ""
  const cmdBase = cmd ? basename(cmd) : ""
  const label = cmdBase ? `${hookName} (${cmdBase})` : hookName
  const attType = asString(att.type)
  if (attType === "hook_success") {
    const body = asString(att.content) ?? asString(att.stdout) ?? ""
    // Hooks are noisy; only surface when they actually produced output.
    if (!body.trim() && !cmdBase) return []
    return [mkRow(lineNo, "att", "hook", { time, label, body: truncate(body, 8000) }, obj)]
  }
  if (attType === "hook_failure") {
    const body = asString(att.stderr) ?? asString(att.content) ?? ""
    return [mkRow(lineNo, "att", "hook_fail", { time, label, body: truncate(body, 8000) }, obj)]
  }
  return []
}

function deriveSystemRows(obj: JSON, lineNo: number, time: string): LogRow[] {
  const content = asString(obj.content) ?? JSON.stringify(obj)
  return [mkRow(lineNo, "sys", "system", { time, label: "", body: truncate(content, 8000) }, obj)]
}

/** Single user row when message.content is a bare string (injection-aware kind). */
function userRowFromString(content: string, obj: JSON, lineNo: number, time: string): LogRow {
  const injected = INJECTION_PATTERN.test(content)
  return mkRow(lineNo, "u", injected ? "inject" : "user", { time, label: "", body: truncate(content, 8000) }, obj)
}

/** One row from a single user content-array item (tool_result or text; other types skipped). */
function userRowFromItem(item: JSON, idx: number, lineNo: number, time: string): LogRow | null {
  const itemType = asString(item.type)
  if (itemType === "tool_result") {
    const body = summarizeContent(item.content)
    return mkRow(
      lineNo,
      `u${idx}`,
      "tool_result",
      { time, label: asString(item.tool_use_id) ?? "", body: truncate(body, 8000) },
      item,
    )
  }
  if (itemType === "text") {
    const text = asString(item.text) ?? ""
    const injected = INJECTION_PATTERN.test(text)
    return mkRow(lineNo, `u${idx}`, injected ? "inject" : "user", { time, label: "", body: truncate(text, 8000) }, item)
  }
  return null
}

function deriveUserRows(obj: JSON, lineNo: number, time: string): LogRow[] {
  const message = asObject(obj.message)
  const content = message?.content
  if (typeof content === "string") return [userRowFromString(content, obj, lineNo, time)]
  const items = asArray(content)
  if (!items) return []
  const out: LogRow[] = []
  for (let i = 0; i < items.length; i++) {
    const item = asObject(items[i])
    if (!item) continue
    const row = userRowFromItem(item, i, lineNo, time)
    if (row) out.push(row)
  }
  return out
}

/** One row from a single assistant content-array item (text / thinking / tool_use). */
function assistantRowFromItem(item: JSON, idx: number, lineNo: number, time: string): LogRow | null {
  const itemType = asString(item.type)
  if (itemType === "text") {
    return mkRow(
      lineNo,
      `a${idx}`,
      "assistant",
      { time, label: "", body: truncate(asString(item.text) ?? "", 8000) },
      item,
    )
  }
  if (itemType === "thinking") {
    return mkRow(
      lineNo,
      `a${idx}`,
      "thinking",
      { time, label: "", body: truncate(asString(item.thinking) ?? "", 8000) },
      item,
    )
  }
  if (itemType === "tool_use") {
    const name = asString(item.name) ?? "?"
    const input = asObject(item.input) ?? {}
    return mkRow(
      lineNo,
      `a${idx}`,
      "tool_use",
      { time, label: name, body: truncate(formatToolInput(name, input), 8000) },
      item,
    )
  }
  return null
}

function deriveAssistantRows(obj: JSON, lineNo: number, time: string): LogRow[] {
  const message = asObject(obj.message)
  const items = asArray(message?.content)
  if (!items) return []
  const out: LogRow[] = []
  for (let i = 0; i < items.length; i++) {
    const item = asObject(items[i])
    if (!item) continue
    const row = assistantRowFromItem(item, i, lineNo, time)
    if (row) out.push(row)
  }
  return out
}

function deriveRows(parsed: unknown, lineNo: number): LogRow[] {
  const obj = asObject(parsed)
  if (!obj) return []
  const topType = asString(obj.type)
  if (!topType) return []
  const time = timeOf(obj)

  switch (topType) {
    case "attachment":
      return deriveAttachmentRows(obj, lineNo, time)
    case "system":
      return deriveSystemRows(obj, lineNo, time)
    case "user":
      return deriveUserRows(obj, lineNo, time)
    case "assistant":
      return deriveAssistantRows(obj, lineNo, time)
    default:
      return []
  }
}

// Per Silvery styling guide: $color0-$color15 (the user's terminal palette,
// verbatim) are the canonical tokens for *categorical* data differentiation.
// Status tokens ($fg-success / $fg-info / $fg-warning / $fg-error) mean
// success / info / warning / error — not "category A vs category B". We use
// them only for intrinsically status-shaped kinds (inject = warning,
// hook_fail = error). Everything else picks from the palette so kinds stay
// distinct without overloading the semantic system.
function kindColor(kind: string): string | undefined {
  switch (kind) {
    case "user":
      return "$color4" // blue — the human
    case "assistant":
      return "$color2" // green — the agent
    case "thinking":
      return "$color8" // bright-black — dim thought
    case "tool_use":
      return "$color6" // cyan — tool invocation
    case "tool_result":
      return "$color14" // bright-cyan — tool output (echo of 6)
    case "hook":
      return "$color5" // magenta — hook machinery
    case "inject":
      return "$fg-warning" // intrinsically a warning
    case "hook_fail":
      return "$fg-error" // intrinsically an error
    case "system":
      return "$color3" // yellow — system
    default:
      return undefined
  }
}

/** Subtler than kindColor — tints body text without shouting. Falls back to
 * $fg-muted so unclassified content reads muted rather than default terminal
 * fg (which can clash with the bg-cursor selection row). */
function bodyColor(kind: string): string {
  switch (kind) {
    case "user":
      return "$color4"
    case "tool_use":
      return "$color6"
    case "inject":
      return "$fg-warning"
    case "hook_fail":
      return "$fg-error"
    default:
      return "$fg-muted"
  }
}

const KIND_LABEL: Record<string, string> = {
  user: "USER",
  assistant: "ASSIST",
  thinking: "think",
  tool_use: "→ tool",
  tool_result: "← result",
  inject: "⚠ inject",
  hook: "◆ hook",
  hook_fail: "✗ hook",
  system: "SYSTEM",
}

export const claudeSessionConfig: ViewConfig = {
  name: "claude-session",
  detect(path) {
    return path.includes("/.claude/projects/") && path.endsWith(".jsonl")
  },
  parseLine(line) {
    return parseJsonLine(line)
  },
  deriveRows,
  fields: [
    {
      key: "time",
      width: 8,
      color: (_v, row) => kindColor(row.kind ?? "") ?? "$fg-muted",
      bold: true,
    },
    {
      key: "kind",
      width: 8,
      color: (_v, row) => kindColor(row.kind ?? ""),
      bold: true,
      render: (_v, row) => KIND_LABEL[row.kind ?? ""] ?? row.kind ?? "",
    },
    {
      key: "label",
      width: "auto",
      color: (_v, row) => kindColor(row.kind ?? "") ?? "$fg-muted",
    },
    {
      key: "body",
      width: "flex",
      multiLine: "below",
      color: (_v, row) => bodyColor(row.kind ?? ""),
      bold: (_v, row) => row.kind === "user",
    },
  ],
  searchText(row) {
    const f = row.fields
    return [f.label, f.body].filter((v) => typeof v === "string").join(" ")
  },
}
