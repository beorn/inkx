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
  Text,
  type SilveryMouseEvent,
  useModifierKeys,
  usePopoverHandlers,
} from "silvery"
import { ActivityIndicator, type ActivityStatus } from "./ActivityIndicator.tsx"
import { AmbientEventRow, type AmbientStreamEntry } from "./AmbientEventRow.tsx"
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
function toolKindFromName(name: string): ToolKind {
  const lower = name.toLowerCase()
  if (lower === "bash" || lower === "execute" || lower === "computer") return "execute"
  if (lower === "edit" || lower === "write" || lower === "multiedit") return "edit"
  if (lower === "read") return "read"
  if (lower === "glob" || lower === "grep" || lower === "search" || lower === "websearch") return "search"
  if (lower === "todowrite") return "think"
  if (lower === "webfetch" || lower === "fetch") return "fetch"
  if (lower === "delete") return "delete"
  if (lower === "agent" || lower === "task") return "other"
  return "other"
}

/**
 * Build the brief one-line title the ToolCallStatusTitle shows alongside
 * the verb. For file-operating tools this is the `file_path`; for Bash it's
 * the command (truncated); for everything else it's the tool name itself.
 */
function toolTitle(name: string, input: unknown): string {
  if (!input || typeof input !== "object") return name
  const o = input as Record<string, unknown>
  if (
    (name === "Read" || name === "Edit" || name === "Write" || name === "MultiEdit") &&
    typeof o.file_path === "string"
  ) {
    return o.file_path as string
  }
  if ((name === "Bash" || name === "Execute") && typeof o.command === "string") {
    const cmd = o.command as string
    // Truncate very long commands in the title — body shows the full text.
    return cmd.length > 80 ? `${cmd.slice(0, 80)}…` : cmd
  }
  // Codex uses `exec_command` with a `cmd` arg (vs Claude's Bash/`command`).
  if (name === "exec_command" && typeof o.cmd === "string") {
    const cmd = o.cmd as string
    return cmd.length > 80 ? `${cmd.slice(0, 80)}…` : cmd
  }
  // Codex file ops: read_file / write_file / apply_patch / list_dir use `path`.
  if (
    (name === "read_file" || name === "write_file" || name === "apply_patch" || name === "list_dir") &&
    typeof o.path === "string"
  ) {
    return o.path as string
  }
  if ((name === "Grep" || name === "Search") && typeof o.pattern === "string") return o.pattern as string
  if (name === "Glob" && typeof o.pattern === "string") return o.pattern as string
  if ((name === "WebFetch" || name === "WebSearch") && typeof o.url === "string") return o.url as string
  if (name === "Agent" || name === "Task") {
    if (typeof o.description === "string") return o.description as string
    if (typeof o.prompt === "string") {
      const p = o.prompt as string
      return p.length > 80 ? `${p.slice(0, 80)}…` : p
    }
  }
  return name
}

/**
 * Determine whether the Edit tool input contains a diff payload
 * (old_string + new_string). When true, `<ToolCall>` will render the diff
 * via silvery's `<Diff>` component automatically (the "diff" content type).
 */
function editToolContent(input: unknown): ToolCallContent[] | undefined {
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
  const kind = toolKindFromName(c.name)
  const status: ToolCallStatus = running ? "in_progress" : result?.is_error ? "failed" : "completed"
  const display = c.mcp_server ? `${c.mcp_server}:${c.name}` : c.name
  const title = toolTitle(c.name, c.input)

  // Build content: for Edit tools, show the diff. For everything else, show
  // the result text (if a result has arrived) or the raw input as JSON.
  let content: ToolCallContent[] | undefined
  if (!running) {
    if (c.name === "Edit" || c.name === "MultiEdit") {
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
    <Box flexDirection="row" gap={1} paddingX={1} paddingY={0} backgroundColor="$bg-surface-subtle">
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
    <Box flexDirection="column" alignSelf="stretch" width="100%" flexShrink={1} minWidth={0} paddingX={1} paddingY={0}>
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
            {showDebug ? "▾" : "▸"} {lineCount} line{lineCount === 1 ? "" : "s"} of hidden context (run `/debug` to
            toggle)
          </Text>
          {showDebug && (
            <Box flexDirection="column" flexShrink={1} minWidth={0} paddingLeft={2}>
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
    <Box flexDirection="row" gap={1} paddingX={1} flexShrink={1} minWidth={0}>
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
        // YAML idiom: `- ` substitutes for two chars of leading indent on
        // the first line. Continuation lines stay at indent+1.
        if (lines[0]!.startsWith(childIndent)) {
          lines[0] = pad + "- " + lines[0]!.slice(childIndent.length)
        } else {
          lines[0] = pad + "- " + lines[0]
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
    return {
      body: (
        <Box flexDirection="column" paddingX={2} paddingY={1}>
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
  if (m.role === "user" && (m.id as string).startsWith("bg-") && m.text.startsWith(BACKGROUND_MESSAGE_PREFIX)) {
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

function isActivity(item: Item): item is ActivityItem {
  return (item as ActivityItem).__activity === true
}

function isAmbient(item: Item): item is AmbientItem {
  return (item as AmbientItem).__ambient === true
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
    const mts = messageTimestamp(messages[i]!)
    const ats = ambient[j]!.timestamp
    if (mts <= ats) {
      out.push(messages[i]!)
      i++
    } else {
      pushAmbient(out, ambient[j]!)
      j++
    }
  }
  while (i < messages.length) out.push(messages[i++]!)
  while (j < ambient.length) pushAmbient(out, ambient[j++]!)
  return out
}

/**
 * Inline ambient row wrapper — owns the `expanded` state so toggling one
 * row does not re-render the whole list. The expand state is local and
 * resets on remount; rotation through ambient rows is bounded so this is
 * acceptable for Phase 6.a.
 */
function AmbientRow({ entry }: { entry: AmbientStreamEntry }): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false)
  return <AmbientEventRow entry={entry} expanded={expanded} onToggleExpand={() => setExpanded((v) => !v)} />
}

/**
 * Cluster wrapper — a tight stack of ambient rows with no gap between
 * them, so a burst (e.g. filewatch events for one save) reads as one
 * coherent block in the chat scrollback.
 */
function AmbientCluster({ entries }: { entries: AmbientStreamEntry[] }): React.ReactElement {
  return (
    <Box flexDirection="column">
      {entries.map((e) => (
        <AmbientRow key={e.id} entry={e} />
      ))}
    </Box>
  )
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
  const renderSessionItem = (item: Item, i: number): React.ReactNode =>
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
      <AmbientCluster entries={item.entries} />
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

  if (follow === false) {
    return (
      <Box flexDirection="column" gap={1} alignSelf="stretch" width="100%">
        {items.map((item, i) => (
          <Box
            key={isActivity(item) ? "__activity" : isAmbient(item) ? `ambient-cluster:${item.entries[0]?.id ?? i}` : i}
            flexDirection="column"
            alignSelf="stretch"
            width="100%"
          >
            {renderSessionItem(item, i)}
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
      items={items}
      getKey={(item, i) =>
        isActivity(item) ? "__activity" : isAmbient(item) ? `ambient-cluster:${item.entries[0]?.id ?? i}` : i
      }
      gap={1}
      maxRendered={200}
      follow={follow}
      renderItem={renderSessionItem}
    />
  )
})
