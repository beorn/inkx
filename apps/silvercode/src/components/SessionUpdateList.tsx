/**
 * <SessionUpdateList>
 *
 * Virtualized list of all updates in a session. Replaces the prior flat chat list component.
 *
 * Renders a stream of `MessageEntry` items (silvercode's aggregated turn
 * view over the underlying `SessionUpdate` stream) with ACP-aligned
 * components. Tool calls use `<ToolCall>` (the canonical ACP renderer)
 * rather than the legacy block pair.
 *
 * Turn grouping — ACP does not have a "turn" concept. Silvercode coins
 * `<SessionExchangeDivider>` to visually separate exchanges (one user
 * prompt + its agent response stream) without asserting a protocol concept.
 * Dividers are purely presentational.
 *
 * Component family:
 *   - `<SessionUpdateList>`    — this component, top-level virtualized list
 *   - `<SessionExchangeDivider>` — thin rule between exchanges
 *   - `<SessionRetry>`         — retry affordance below a failed exchange
 *   - `<SubAgentExchange>`     — nested Task tool stream card
 *
 * ListView owns scroll (wheel / keyboard / cursor). `follow="end"` is the
 * canonical chat-style auto-follow API. `nav={false}` so ListView does not
 * register a `useInput` that would consume Ctrl+D / j/k / arrows — the
 * SessionPromptComposer owns keyboard focus, and app-level Shift+Up/Down/PageUp/Down
 * are the scroll surface. See bead km-silvercode.ctrl-d-scrolls-to-top
 * for the full rationale.
 *
 * The ActivityIndicator renders as a virtual tail item (sentinel pattern)
 * so it pulses at the arrival position, not as bottom-pinned chrome.
 *
 * Bead: km-silvercode.acp-session-update-list.
 */

import React, { useMemo } from "react"
import type { MessageEntry, ToolCallId, ToolCallStatus, ToolKind } from "@km/agent-harness"
import type { ToolCall as ToolCallType, ToolCallContent } from "@km/agent-harness"
import {
  Box,
  ListView,
  type ListViewHandle,
  Prose,
  Small,
  Text,
  type SilveryMouseEvent,
  useModifierKeys,
  usePopoverHandlers,
} from "silvery"
import { ActivityIndicator, type ActivityStatus } from "./ActivityIndicator.tsx"
import { AmbientNotificationStack, type AmbientStreamEntry } from "./AmbientEventRow.tsx"
import { MarkdownView } from "./MarkdownView.tsx"
import { SyntaxHighlighter } from "./SyntaxHighlighter.tsx"
import { ToolCall } from "./ToolCall.tsx"
import { LinkifiedText } from "./LinkifiedText.tsx"
import { BACKGROUND_MESSAGE_PREFIX } from "../controller.ts"

// =============================================================================
// Helpers — adapt legacy MessageEntry tool shapes to ACP ToolCall
// =============================================================================

/**
 * Map Claude Code tool names to ACP `ToolKind`. Claude names tools with
 * PascalCase ("Bash", "Edit", "Read", etc.); ACP uses lowercase snake_case
 * `ToolKind`. Unknown names fall back to "other".
 */
function toolKindFromName(name: string, input?: unknown): ToolKind {
  const codexKind = codexExecToolKind(name, input)
  if (codexKind) return codexKind
  const lower = name.toLowerCase()
  if (
    lower === "bash" ||
    lower === "execute" ||
    lower === "exec_command" ||
    lower === "run_command" ||
    lower === "shell" ||
    lower === "computer"
  ) {
    return "execute"
  }
  if (lower === "edit" || lower === "write" || lower === "multiedit" || lower === "apply_patch") return "edit"
  if (lower === "read") return "read"
  if (lower === "glob" || lower === "grep" || lower === "search" || lower === "websearch") return "search"
  if (lower === "todowrite") return "think"
  if (lower === "webfetch" || lower === "fetch") return "fetch"
  if (lower === "delete") return "delete"
  if (lower === "agent" || lower === "task") return "other"
  return "other"
}

/**
 * Build the brief one-line title shown by ToolCallStatusTitle. Keep
 * low-content tool calls self-describing inline ("Read file.ts",
 * "Deleted old.ts") so click-to-expand is reserved for the payload body,
 * not for discovering what the row did.
 */
function toolTitle(name: string, input: unknown): string {
  const patchTitle = patchToolTitle(name, input)
  if (patchTitle) return patchTitle
  if (!input || typeof input !== "object") return name
  const o = input as Record<string, unknown>
  return (
    claudeFileToolTitle(name, o) ??
    codexExecToolTitle(name, o) ??
    shellToolTitle(name, o) ??
    codexFileToolTitle(name, o) ??
    searchToolTitle(name, o) ??
    todoToolTitle(name, o) ??
    agentToolTitle(name, o) ??
    name
  )
}

function codexExecToolKind(name: string, input: unknown): ToolKind | null {
  if (name !== "exec_command" || !input || typeof input !== "object") return null
  const parsed = firstCodexParsedCommand(input as Record<string, unknown>)
  if (!parsed) return null
  const type = stringProp(parsed, "type")
  if (type === "read") return "read"
  if (type === "search" || type === "list_files") return "search"
  return null
}

type PatchSummary = {
  files: string[]
  additions: number
  deletions: number
  action: "Added" | "Deleted" | "Edited"
}

function patchToolTitle(name: string, input: unknown): string | null {
  if (name !== "apply_patch") return null
  const patch = typeof input === "string" ? input : null
  if (!patch) return null
  const summary = summarizePatch(patch)
  if (!summary) return null
  const target = summary.files.length === 1 ? summary.files[0] : `${summary.files.length} files`
  return `${summary.action} ${target} (+${summary.additions} -${summary.deletions})`
}

function summarizePatch(patch: string): PatchSummary | null {
  const files: string[] = []
  let action: PatchSummary["action"] = "Edited"
  let additions = 0
  let deletions = 0
  for (const line of patch.split("\n")) {
    if (line.startsWith("*** Add File: ")) {
      files.push(line.slice("*** Add File: ".length))
      action = action === "Deleted" ? "Edited" : "Added"
      continue
    }
    if (line.startsWith("*** Delete File: ")) {
      files.push(line.slice("*** Delete File: ".length))
      action = action === "Added" ? "Edited" : "Deleted"
      continue
    }
    if (line.startsWith("*** Update File: ")) {
      files.push(line.slice("*** Update File: ".length))
      action = "Edited"
      continue
    }
    if (line.startsWith("+") && !line.startsWith("+++")) additions++
    else if (line.startsWith("-") && !line.startsWith("---")) deletions++
  }
  return files.length > 0 ? { files, additions, deletions, action } : null
}

function compactTitle(text: string): string {
  return text.length > 80 ? `${text.slice(0, 80)}…` : text
}

function stringProp(o: Record<string, unknown>, key: string): string | null {
  const value = o[key]
  return typeof value === "string" ? value : null
}

function firstCodexParsedCommand(o: Record<string, unknown>): Record<string, unknown> | null {
  const parsed = o.parsed_cmd
  if (!Array.isArray(parsed)) return null
  const first = parsed.find((item) => item && typeof item === "object")
  return first ? (first as Record<string, unknown>) : null
}

function claudeFileToolTitle(name: string, o: Record<string, unknown>): string | null {
  const filePath = stringProp(o, "file_path")
  if (name === "Read" && filePath) return `Read ${filePath}`
  if ((name === "Edit" || name === "MultiEdit") && filePath) return `Edited ${filePath}`
  if (name === "Write" && filePath) return `Wrote ${filePath}`
  if (name !== "Delete") return null
  const path = filePath ?? stringProp(o, "path")
  return path ? `Deleted ${path}` : null
}

function shellToolTitle(name: string, o: Record<string, unknown>): string | null {
  if (name === "Bash" || name === "Execute") {
    const command = stringProp(o, "command")
    return command ? compactTitle(command) : null
  }
  if (name === "exec_command") {
    const command = stringProp(o, "cmd")
    return command ? compactTitle(command) : null
  }
  return null
}

function codexExecToolTitle(name: string, o: Record<string, unknown>): string | null {
  if (name !== "exec_command") return null
  const parsed = firstCodexParsedCommand(o)
  if (!parsed) return null
  const type = stringProp(parsed, "type")
  const path = stringProp(parsed, "path")
  const query = stringProp(parsed, "query")
  const command = stringProp(parsed, "cmd")
  if (type === "read") return `Read ${path ?? stringProp(parsed, "name") ?? command ?? "file"}`
  if (type === "search") {
    const target = path ? ` in ${path}` : ""
    return query ? `Searched ${query}${target}` : `Searched${target}`
  }
  if (type === "list_files") return `Explored ${path ?? command ?? "files"}`
  return null
}

function codexFileToolTitle(name: string, o: Record<string, unknown>): string | null {
  const path = stringProp(o, "path")
  if (!path) return null
  if (name === "read_file") return `Read ${path}`
  if (name === "write_file") return `Wrote ${path}`
  if (name === "apply_patch") return `Patched ${path}`
  if (name === "list_dir") return `Listed ${path}`
  return null
}

function searchToolTitle(name: string, o: Record<string, unknown>): string | null {
  if (name === "Grep" || name === "Search") {
    const pattern = stringProp(o, "pattern")
    return pattern ? `Searched ${pattern}` : null
  }
  if (name === "Glob") {
    const pattern = stringProp(o, "pattern")
    return pattern ? `Find ${pattern}` : null
  }
  if (name === "WebFetch") {
    const url = stringProp(o, "url")
    return url ? `Fetched ${url}` : null
  }
  if (name !== "WebSearch") return null
  const query = stringProp(o, "query")
  const url = stringProp(o, "url")
  return query ? `Searched ${query}` : url ? `Searched ${url}` : null
}

function todoToolTitle(name: string, o: Record<string, unknown>): string | null {
  if (name !== "TodoWrite" || !Array.isArray(o.todos)) return null
  const todos = o.todos as Array<Record<string, unknown>>
  if (todos.length > 1) return `Todos updated ${todos.length} items`
  const todo = todos[0]
  const content = todo ? stringProp(todo, "content") : null
  if (!content) return null
  const status = todo?.status
  const verb = status === "completed" ? "completed" : status === "in_progress" ? "started" : "added"
  return `Todo ${verb} ${content}`
}

function agentToolTitle(name: string, o: Record<string, unknown>): string | null {
  if (name !== "Agent" && name !== "Task") return null
  const description = stringProp(o, "description")
  if (description) return description
  const prompt = stringProp(o, "prompt")
  return prompt ? compactTitle(prompt) : null
}

/**
 * Determine whether the Edit tool input contains a diff payload
 * (old_string + new_string). When true, `<ToolCall>` will render the diff
 * via silvery's `<Diff>` component automatically (the "diff" content type).
 */
function editToolContent(input: unknown): ToolCallContent[] | undefined {
  if (typeof input === "string" && input.startsWith("*** Begin Patch")) {
    return [
      {
        type: "content",
        content: { type: "text", text: input },
      },
    ]
  }
  if (!input || typeof input !== "object") return undefined
  const o = input as Record<string, unknown>
  if (typeof o.old_string === "string" && typeof o.new_string === "string") {
    const path = typeof o.file_path === "string" ? (o.file_path as string) : ""
    return [
      {
        type: "diff",
        path,
        oldText: o.old_string as string,
        newText: o.new_string as string,
      },
    ]
  }
  return undefined
}

/**
 * Build a tool result content block from a legacy tool result entry. Maps to
 * ACP `Content` with a `text` content block so `<ToolCall>` renders it in
 * the body section.
 */
function toolResultContent(output: unknown, _isError?: boolean): ToolCallContent[] {
  const text = typeof output === "string" ? output : JSON.stringify(output, null, 2)
  return [
    {
      type: "content",
      content: { type: "text", text: text ?? "" },
    },
  ]
}

/**
 * Adapt a legacy `MessageEntry` tool-call entry to the ACP `ToolCall` shape
 * consumed by `<ToolCall>`. The tool result (if any) is folded into the
 * `content` array so `<ToolCall>` renders both in a single card body.
 */
function adaptToolCall(
  c: { id: string; name: string; input: unknown; mcp_server?: string },
  result: { output: unknown; is_error?: boolean } | undefined,
  running: boolean,
): ToolCallType {
  const kind = toolKindFromName(c.name, c.input)
  const status: ToolCallStatus = running ? "in_progress" : result?.is_error ? "failed" : "completed"
  const display = c.mcp_server ? `${c.mcp_server}:${c.name}` : c.name
  const title = toolTitle(c.name, c.input)

  // Build content: for Edit tools, show the diff. For everything else, show
  // the result text (if a result has arrived) or the raw input as JSON.
  let content: ToolCallContent[] | undefined
  if (!running) {
    if (c.name === "Edit" || c.name === "MultiEdit" || c.name === "apply_patch") {
      const diffContent = editToolContent(c.input)
      if (diffContent) {
        content = diffContent
      }
    }
    if (!content && result) {
      content = toolResultContent(result.output, result.is_error)
    }
    if (!content && c.input) {
      // Fallback: show the raw input as a text content block.
      content = [
        {
          type: "content",
          content: { type: "text", text: JSON.stringify(c.input, null, 2) },
        },
      ]
    }
  }

  return {
    toolCallId: c.id as ToolCallId,
    title: display !== c.name ? `${display}: ${title}` : title,
    kind,
    status,
    content,
    rawInput: c.input,
    rawOutput: result?.output,
  }
}

// =============================================================================
// Per-item renderers — inline (no separate files)
// =============================================================================

/**
 * Background-task system message. Rendered when the controller surfaces a
 * "▶ Background task ..." row. Distinct treatment vs user/assistant rows so
 * the user can see "this came from a backgrounded turn, not from me typing."
 */
function BackgroundSystemRow({ text }: { text: string }): React.ReactElement {
  return (
    <Box flexDirection="row" gap={1} paddingY={0} backgroundColor="$bg-surface-subtle">
      <Text color="$info">{text}</Text>
    </Box>
  )
}

/**
 * User turn row — right-aligned bubble with rounded border, no background fill.
 *
 * Visual: chat-app convention — the border IS the bubble (no background tint).
 * The bubble snaps to the right via `justifyContent="flex-end"` and shrinks to
 * fit its content with a max width cap (`maxWidth="80%"`) so long prompts wrap
 * cleanly within the bubble instead of pushing the chrome edge-to-edge.
 *
 * Wrapping: silvery's `<Prose>` wrap primitive (canonical typography wrapper)
 * + `<LinkifiedText>` handles word-boundary breaking. No mid-word breaks
 * unless a single token exceeds the bubble's interior width — same behavior
 * as the previous bg-tint UserRow, just chrome-only now.
 *
 * Selection: silvery's mouse-driven selection works at buffer level — the
 * cells inside the bubble carry plain styled text (no replacement glyphs or
 * non-text nodes), so drag-to-select inside the bubble continues to work.
 * The rounded border adds chrome rectangles around the bubble but doesn't
 * sit between text cells, so it doesn't break the selection rectangle math.
 *
 * `additionalContext` carries hidden context (system-reminders, hook output)
 * exposed via the `/debug` toggle. The disclosure stays left-aligned and bg-
 * less BELOW the bubble — it's metadata about the bubble, not part of it.
 *
 * Bead: km-cr94.
 */
function UserRow({
  text,
  additionalContext,
  showDebug,
}: {
  text: string
  additionalContext?: string
  showDebug?: boolean
}): React.ReactElement {
  const hasContext = (additionalContext?.length ?? 0) > 0
  const isMetaOnly = text.length === 0 && hasContext
  const lineCount = additionalContext ? additionalContext.split("\n").length : 0

  return (
    <Box flexDirection="column" alignSelf="stretch" width="100%" flexShrink={1} minWidth={0} paddingY={0}>
      {!isMetaOnly && (
        <Box flexDirection="row" width="100%" justifyContent="flex-end" flexShrink={1} minWidth={0}>
          <Box
            flexDirection="row"
            width="snug-content"
            maxWidth="80%"
            flexShrink={1}
            minWidth={0}
            borderStyle="round"
            borderColor="$border-default"
            paddingX={1}
          >
            <Prose flexShrink={1} minWidth={0}>
              <LinkifiedText text={text} role="user" />
            </Prose>
          </Box>
        </Box>
      )}
      {hasContext && (
        <Box flexDirection="column" flexShrink={1} minWidth={0}>
          <Text color="$muted">
            {lineCount} line{lineCount === 1 ? "" : "s"} of hidden context (run `/debug` to toggle)
          </Text>
          {showDebug && (
            <Box flexDirection="column" flexShrink={1} minWidth={0}>
              <Text color="$muted" wrap="wrap">
                {additionalContext}
              </Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}

/**
 * Assistant turn row. Leading `●` glyph in `$primary` for clear role
 * identity at a glance — same structural notes as UserRow apply
 * (flexShrink + minWidth=0 chain so MarkdownView's wrap fires).
 */
function AssistantRow({ text }: { text: string }): React.ReactElement {
  return (
    <Box flexDirection="row" gap={1} flexShrink={1} minWidth={0}>
      <Text bold color="$primary">
        ●
      </Text>
      <Prose flexGrow={1}>
        <MarkdownView source={text} />
      </Prose>
    </Box>
  )
}

/**
 * Render one `MessageEntry`. Dispatches on role and handles the background-
 * system-message sentinel pattern.
 */
/**
 * Pretty-print a value as YAML for the debug popover. We emit YAML (not
 * JSON) because:
 *
 *   1. Multi-line string values render as a `|` block scalar — body lines
 *      are plain text, no `\n` escapes, no surrounding quotes. YAML's
 *      grammar supports this natively; JSON does not.
 *   2. shiki's YAML tokenizer correctly classifies block-scalar bodies as
 *      strings AND keeps them readable. Asking shiki to highlight an
 *      almost-but-not-quite-JSON string trips up the JSON tokenizer's
 *      string-fallback path, which applies italic-pink github-dark
 *      coloring to the entire body — unreadable for prose / markdown.
 *
 * Use `language="yaml"` on the SyntaxHighlighter consumer.
 */
function prettyYamlForDebug(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent)
  if (value === null || value === undefined) return "null"
  if (typeof value === "boolean") return String(value)
  if (typeof value === "number") return String(value)
  if (typeof value === "string") {
    if (value.includes("\n")) {
      const body = value
        .split("\n")
        .map((l) => "  ".repeat(indent + 1) + l)
        .join("\n")
      return "|\n" + body
    }
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]"
    const childIndent = "  ".repeat(indent + 1)
    return value
      .map((v) => {
        const inner = prettyYamlForDebug(v, indent + 1)
        const lines = inner.split("\n")
        const first = lines[0] ?? ""
        // YAML idiom: `- ` substitutes for two chars of leading indent on
        // the first line. Continuation lines stay at indent+1.
        if (first.startsWith(childIndent)) {
          lines[0] = pad + "- " + first.slice(childIndent.length)
        } else {
          lines[0] = pad + "- " + first
        }
        return lines.join("\n")
      })
      .join("\n")
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as object)
    if (entries.length === 0) return "{}"
    return entries
      .map(([k, v]) => {
        const key = /^[A-Za-z_][\w-]*$/.test(k) ? k : JSON.stringify(k)
        const isBlock =
          typeof v === "object" && v !== null && (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0)
        const inner = prettyYamlForDebug(v, indent + 1)
        return isBlock ? pad + key + ":\n" + inner : pad + key + ": " + inner
      })
      .join("\n")
  }
  return String(value)
}

function timestampFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null
  const ts = (payload as { ts?: unknown }).ts
  if (typeof ts !== "number" || !Number.isFinite(ts)) return null
  const d = new Date(ts)
  const hh = d.getHours().toString().padStart(2, "0")
  const mm = d.getMinutes().toString().padStart(2, "0")
  return `${hh}:${mm}`
}

/**
 * RawInspector — secret debug trick. Wraps each chat entry so that hovering
 * with Cmd+Shift held shows a popover with the entry's raw JSON. The wrapper
 * always listens for hover so a modifier-aware mouse-enter can trigger the
 * popover even when the terminal did not emit standalone modifier key events.
 *
 * Why: debugging a verbose-tool-result or thinking-loop bug usually means
 * inspecting what the wire actually delivered. Without this, the only path is
 * opening the JSONL file directly. The Cmd+Shift gate keeps the affordance
 * out of the way for normal use.
 *
 * Cmd is `super` in silvery's modifier-key tracking (macOS). Most terminals
 * pass Cmd through in mouse events; the popover gracefully no-ops on terminals
 * that don't.
 *
 * Bead: km-silvercode.raw-entry-inspector.
 */
function RawInspector({ payload, children }: { payload: unknown; children: React.ReactNode }): React.ReactElement {
  const { super: cmdHeld, shift: shiftHeld } = useModifierKeys()
  const debugMode = cmdHeld && shiftHeld
  // Always compute a valid PopoverContent (the hook requires non-null).
  const popoverContent = useMemo(() => {
    // Pretty-print: when a string value contains newlines, render the body
    // as an indented block under the key (no JSON escapes, no surrounding
    // quotes) so tool output / commands read like the actual text. Trades
    // strict JSON validity for human readability — the popover is for
    // eyeballing, not parsing.
    const yaml = prettyYamlForDebug(payload)
    // Trim very long payloads; full payload available via /debug or the JSONL.
    const allLines = yaml.split("\n")
    const truncated =
      allLines.length > 60 ? [...allLines.slice(0, 60), `# … (${allLines.length - 60} more lines)`].join("\n") : yaml
    const timestamp = timestampFromPayload(payload)
    return {
      body: (
        <Box flexDirection="column" paddingY={1}>
          {timestamp ? (
            <Box flexDirection="row">
              <Box flexGrow={1} />
              <Small>{timestamp}</Small>
            </Box>
          ) : null}
          {/* YAML — shiki's YAML highlighter handles `|` block scalars
              natively and colors prose bodies as plain string content
              (no italic-pink JSON-string fallback). `bare` drops chrome
              and switches to wrap="wrap" so long lines flow within the
              popover width. */}
          <SyntaxHighlighter language="yaml" code={truncated} bare />
        </Box>
      ),
      // Tighter maxWidth so the +10 anchorOffsetX doesn't get clamped away
      // by the right-edge constraint on typical terminal widths.
      maxWidth: 80,
      // Borderless + flush-top + 10-col right offset so the popover doesn't
      // cover the immediately-adjacent lines and the user can sweep the
      // cursor down through other entries while debug is active.
      borderless: true,
      flushTop: true,
      anchorOffsetX: 10,
    }
  }, [payload])
  const handlers = usePopoverHandlers(popoverContent)
  function onMouseEnter(e: SilveryMouseEvent): void {
    if (debugMode || (e.metaKey && e.shiftKey)) {
      handlers.onMouseEnter(e)
    }
  }
  return (
    <Box onMouseEnter={onMouseEnter} onMouseLeave={handlers.onMouseLeave}>
      {children}
    </Box>
  )
}

function ExchangeItem({ m, showDebug }: { m: MessageEntry; showDebug: boolean }): React.ReactElement {
  // Background-task system messages: user-role entries with a "bg-" turnId
  // prefix AND the BACKGROUND_MESSAGE_PREFIX text prefix.
  if (isBackgroundSystemMessage(m)) {
    return <BackgroundSystemRow text={m.text} />
  }
  if (m.role === "user") {
    return <UserRow text={m.text} additionalContext={m.additionalContext} showDebug={showDebug} />
  }
  if (m.role === "system") {
    return <BackgroundSystemRow text={m.text} />
  }
  // Assistant turn: render `m.ops` in arrival order. Each text op is an
  // AssistantRow; each tool op is a ToolCall row. Order matters — codex
  // emits text→tool→text→tool many times in a single ACP turn, and the
  // legacy "all text first, all tools after" flatten loses that
  // interleaving. The store coalesces consecutive text deltas into one
  // text op, so multi-chunk Claude paragraphs still render as one row.
  // Bead: km-silvercode.codex-bundling-order.
  //
  // Gap policy (km-silvercode.tool-call-rendering-v2): consecutive tool
  // ops cluster with NO blank row between them — a sequence of Read /
  // Glob / Grep calls reads as one tight block. A blank row separates a
  // text op from a tool cluster (and vice versa), and separates two text
  // ops. Implementation: group ops into runs of one kind, render each
  // run with `gap={0}`, and stack the runs themselves with `gap={1}`.
  //
  // Soft-wrap of MarkdownView's per-Text `wrap="wrap"` works without
  // ceremony under silvery's CSS-correct defaults (flexShrink:1 +
  // CSS §4.5 auto min-size with recursive intrinsic min-content). See
  // regression tests in apps/silvercode/tests/wrap-unbreakable-overflow.test.tsx
  // (bead: km-silvercode.wrap-unbreakable-audit, closed 2026-04-28).
  type OpRun = { kind: "text" | "tool"; ops: Array<{ op: (typeof m.ops)[number]; index: number }> }
  const runs: OpRun[] = []
  m.ops.forEach((op, i) => {
    const k = op.kind === "text" ? "text" : "tool"
    const tail = runs[runs.length - 1]
    if (tail && tail.kind === k) {
      tail.ops.push({ op, index: i })
    } else {
      runs.push({ kind: k, ops: [{ op, index: i }] })
    }
  })

  return (
    <Box flexDirection="column" gap={1}>
      {runs.map((run, runIdx) => (
        // gap=0 inside a run → consecutive tool calls (or coalesced text
        // ops) render contiguously. The outer `gap={1}` only applies
        // BETWEEN runs.
        <Box key={runIdx} flexDirection="column">
          {run.ops.map(({ op, index }) => {
            if (op.kind === "text") {
              if (op.text.length === 0) return null
              return (
                <RawInspector key={`text-${index}`} payload={op}>
                  <AssistantRow text={op.text} />
                </RawInspector>
              )
            }
            const c = op.toolCall
            const result = op.result
            const running = result === undefined
            const adaptedCall = adaptToolCall(c, result, running)
            return (
              <RawInspector key={c.id} payload={op}>
                <ToolCall
                  toolCall={adaptedCall}
                  errorMessage={result?.is_error ? String(result.output ?? "Tool call failed") : undefined}
                />
              </RawInspector>
            )
          })}
        </Box>
      ))}
    </Box>
  )
}

// =============================================================================
// Sentinel types for the activity tail and ambient observation rows
// =============================================================================

type ActivityItem = { __activity: true }
type AmbientItem = { __ambient: true; entries: AmbientStreamEntry[] }
type Item = MessageEntry | ActivityItem | AmbientItem
type SimilarGroupKind = "user" | "system" | "ambient"
type GroupedItem = { __group: true; kind: SimilarGroupKind; items: Item[] }
type RenderItem = Item | GroupedItem

function isActivity(item: Item): item is ActivityItem {
  return (item as ActivityItem).__activity === true
}

function isAmbient(item: Item): item is AmbientItem {
  return (item as AmbientItem).__ambient === true
}

function isGrouped(item: RenderItem): item is GroupedItem {
  return (item as GroupedItem).__group === true
}

function isBackgroundSystemMessage(m: MessageEntry): boolean {
  return m.role === "user" && (m.id as string).startsWith("bg-") && m.text.startsWith(BACKGROUND_MESSAGE_PREFIX)
}

function similarGroupKind(item: Item): SimilarGroupKind | null {
  if (isAmbient(item)) return "ambient"
  if (isActivity(item)) return null
  if (isBackgroundSystemMessage(item) || item.role === "system") return "system"
  if (item.role === "user") return "user"
  return null
}

function groupSimilarItems(items: Item[]): RenderItem[] {
  const grouped: RenderItem[] = []
  for (const item of items) {
    const kind = similarGroupKind(item)
    const last = grouped[grouped.length - 1]
    if (kind && last && isGrouped(last) && last.kind === kind) {
      last.items.push(item)
      continue
    }
    grouped.push(kind ? { __group: true, kind, items: [item] } : item)
  }
  return grouped
}

function itemKey(item: Item, i: number): string {
  if (isActivity(item)) return "__activity"
  if (isAmbient(item)) return `ambient-cluster:${item.entries[0]?.id ?? i}`
  return String(item.id ?? i)
}

function renderItemKey(item: RenderItem, i: number): string {
  if (!isGrouped(item)) return itemKey(item, i)
  const first = item.items[0]
  return `group:${item.kind}:${first ? itemKey(first, i) : i}`
}

/**
 * Anchor a `MessageEntry` to its scrollback timestamp. Mirrors how
 * `ts: number` is assigned in `session-store.ts` — a millisecond epoch
 * timestamp aligned with `AmbientStreamEntry.timestamp` so the merge
 * sort interleaves correctly.
 */
function messageTimestamp(m: MessageEntry): number {
  return m.ts
}

/**
 * Merge messages + ambient entries into one list sorted by timestamp
 * (ascending). Stable on equal timestamps: messages keep their relative
 * order, ambient entries keep theirs, and a tie between a message and
 * ambient resolves by source array order (messages, then ambient) — so a
 * user prompt and an ambient event with the same `ts` render as
 * "user, then ambient." That is the conservative read: an ambient
 * observation associated with the *next* turn arrived after the user
 * sent the prompt.
 *
 * Consecutive ambient entries coalesce into one `AmbientItem` so the
 * outer `ListView gap={1}` separates clusters from messages but doesn't
 * insert a blank line between adjacent ambient observations. A burst of
 * filewatch events therefore renders as a tight block.
 */
function interleave(messages: MessageEntry[], ambient: readonly AmbientStreamEntry[]): Item[] {
  function pushAmbient(out: Item[], entry: AmbientStreamEntry): void {
    const last = out[out.length - 1]
    if (last && isAmbient(last)) {
      last.entries.push(entry)
      return
    }
    out.push({ __ambient: true, entries: [entry] })
  }
  const out: Item[] = []
  let i = 0
  let j = 0
  while (i < messages.length && j < ambient.length) {
    const message = messages[i]
    const ambientEntry = ambient[j]
    if (!message || !ambientEntry) break
    const mts = messageTimestamp(message)
    const ats = ambientEntry.timestamp
    if (mts <= ats) {
      out.push(message)
      i++
    } else {
      pushAmbient(out, ambientEntry)
      j++
    }
  }
  while (i < messages.length) {
    const message = messages[i++]
    if (message) out.push(message)
  }
  while (j < ambient.length) {
    const ambientEntry = ambient[j++]
    if (ambientEntry) pushAmbient(out, ambientEntry)
  }
  return out
}

// =============================================================================
// SessionUpdateList
// =============================================================================

export const SessionUpdateList = React.forwardRef<
  ListViewHandle,
  {
    messages: MessageEntry[]
    onApprove: (requestId: string) => void
    onDeny: (requestId: string) => void
    sessionId: string
    status: ActivityStatus
    turnStartedAt: number | null
    inputTokens: number
    outputTokens: number
    pendingPermissions: number
    inFlightTool: string | null
    /** Toggled by App-level `/raw` slash command. When true, each user
     *  message inlines its `additionalContext` (system-reminders, hook
     *  output, isMeta bodies) below the visible prompt. Default false.
     *  Bead: km-silvercode.resume-show-everything-collapsed. */
    showDebug?: boolean
    /**
     * Pre-filtered ambient observations (mute filter applied upstream
     * in `SessionCard`). Merged with `messages` by timestamp; rendered
     * inline as styled observation rows between turns.
     * Bead: km-silvercode.ambient-inline-display.
     */
    ambientEntries?: readonly AmbientStreamEntry[]
    /** Display name for the running agent. Forwarded to the inline
     *  ActivityIndicator so the spawning-state label can read
     *  "Spawning Claude Code v<version>…". Bead: km-cr94. */
    agentLabel?: string | null
    /** CLI version string from session-init (e.g. "2.1.119"). Forwarded
     *  to ActivityIndicator. `null` until session-init resolves. */
    agentVersion?: string | null
    /** Chat panes follow the latest turn; natural-height story previews can disable it. */
    follow?: "end" | false
  }
>(function SessionUpdateList(
  {
    messages,
    status,
    turnStartedAt,
    inputTokens,
    outputTokens,
    pendingPermissions,
    inFlightTool,
    showDebug = false,
    ambientEntries,
    agentLabel = null,
    agentVersion = null,
    follow = "end",
  },
  ref,
): React.ReactElement {
  const showActivity = status !== "idle" && status !== "ended"
  const merged = ambientEntries && ambientEntries.length > 0 ? interleave(messages, ambientEntries) : [...messages]
  const items: Item[] = showActivity ? [...merged, { __activity: true }] : merged
  const renderItems = groupSimilarItems(items)
  const renderSessionItem = (item: Item, _i: number): React.ReactNode =>
    isActivity(item) ? (
      <ActivityIndicator
        status={status}
        pendingPermissions={pendingPermissions}
        inFlightTool={inFlightTool}
        turnStartedAt={turnStartedAt}
        inputTokens={inputTokens}
        outputTokens={outputTokens}
        agentLabel={agentLabel}
        agentVersion={agentVersion}
      />
    ) : isAmbient(item) ? (
      <AmbientNotificationStack entries={item.entries} />
    ) : item.role === "assistant" ? (
      // Assistant turns wrap each op (text/tool) individually inside
      // ExchangeItem so the hover popover shows ONLY the hovered op,
      // not the whole turn's combined JSON.
      <ExchangeItem m={item} showDebug={showDebug} />
    ) : (
      <RawInspector payload={item}>
        <ExchangeItem m={item} showDebug={showDebug} />
      </RawInspector>
    )
  const renderGroupedItem = (item: RenderItem, i: number): React.ReactNode =>
    isGrouped(item) ? (
      <Box flexDirection="column" gap={0} alignSelf="stretch" width="100%">
        {item.items.map((child, childIndex) => (
          <Box key={itemKey(child, childIndex)} flexDirection="column" alignSelf="stretch" width="100%">
            {renderSessionItem(child, childIndex)}
          </Box>
        ))}
      </Box>
    ) : (
      renderSessionItem(item, i)
    )

  if (follow === false) {
    return (
      <Box flexDirection="column" gap={1} alignSelf="stretch" width="100%">
        {renderItems.map((item, i) => (
          <Box key={renderItemKey(item, i)} flexDirection="column" alignSelf="stretch" width="100%">
            {renderGroupedItem(item, i)}
          </Box>
        ))}
      </Box>
    )
  }

  // `follow="end"` is the canonical chat-style auto-follow API
  // (silvery bead `km-silvery.listview-followpolicy-split`). It owns
  // viewport position via row-space snap math while atEnd; cursor is
  // a SELECTION marker only and does NOT drive the viewport.
  //
  // `nav` is intentionally OFF. ListView with `nav={true}` registers a
  // `useInput` that consumes Ctrl+D / Ctrl+U as vim half-page-down/up
  // and j/k/arrows as cursor moves. SessionUpdateList has no item-selection
  // — chat updates are not a select-list. App-level Shift+Up/Down/PageUp/
  // PageDown/Home/End are the canonical scroll surface. See the full rationale
  // in the original source (bead km-silvercode.ctrl-d-scrolls-to-top).
  return (
    <ListView
      ref={ref}
      items={renderItems}
      getKey={renderItemKey}
      gap={1}
      maxRendered={200}
      follow={follow}
      renderItem={renderGroupedItem}
    />
  )
})
