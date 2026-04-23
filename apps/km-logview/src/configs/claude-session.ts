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

function deriveRows(parsed: unknown, lineNo: number): LogRow[] {
  const obj = asObject(parsed)
  if (!obj) return []
  const topType = asString(obj.type)
  if (!topType) return []

  const time = timeOf(obj)

  if (topType === "attachment") {
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

  if (topType === "system") {
    const content = asString(obj.content) ?? JSON.stringify(obj)
    return [mkRow(lineNo, "sys", "system", { time, label: "", body: truncate(content, 8000) }, obj)]
  }

  if (topType === "user") {
    const message = asObject(obj.message)
    const content = message?.content
    const out: LogRow[] = []

    if (typeof content === "string") {
      const injected = INJECTION_PATTERN.test(content)
      out.push(
        mkRow(lineNo, "u", injected ? "inject" : "user", { time, label: "", body: truncate(content, 8000) }, obj),
      )
      return out
    }

    const items = asArray(content)
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = asObject(items[i])
        if (!item) continue
        const itemType = asString(item.type)
        if (itemType === "tool_result") {
          const body = typeof item.content === "string" ? item.content : JSON.stringify(item.content)
          out.push(
            mkRow(
              lineNo,
              `u${i}`,
              "tool_result",
              {
                time,
                label: asString(item.tool_use_id) ?? "",
                body: truncate(body, 8000),
              },
              item,
            ),
          )
        } else if (itemType === "text") {
          const text = asString(item.text) ?? ""
          const injected = INJECTION_PATTERN.test(text)
          out.push(
            mkRow(lineNo, `u${i}`, injected ? "inject" : "user", { time, label: "", body: truncate(text, 8000) }, item),
          )
        }
      }
      return out
    }
    return []
  }

  if (topType === "assistant") {
    const message = asObject(obj.message)
    const items = asArray(message?.content)
    if (!items) return []
    const out: LogRow[] = []
    for (let i = 0; i < items.length; i++) {
      const item = asObject(items[i])
      if (!item) continue
      const itemType = asString(item.type)
      if (itemType === "text") {
        out.push(
          mkRow(
            lineNo,
            `a${i}`,
            "assistant",
            { time, label: "", body: truncate(asString(item.text) ?? "", 8000) },
            item,
          ),
        )
      } else if (itemType === "thinking") {
        out.push(
          mkRow(
            lineNo,
            `a${i}`,
            "thinking",
            { time, label: "", body: truncate(asString(item.thinking) ?? "", 8000) },
            item,
          ),
        )
      } else if (itemType === "tool_use") {
        const name = asString(item.name) ?? "?"
        const input = asObject(item.input) ?? {}
        out.push(
          mkRow(
            lineNo,
            `a${i}`,
            "tool_use",
            { time, label: name, body: truncate(formatToolInput(name, input), 8000) },
            item,
          ),
        )
      }
    }
    return out
  }

  return []
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
    { key: "time", width: 8, color: "$fg-muted" },
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
