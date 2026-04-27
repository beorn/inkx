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
import { Box, ListView, type ListViewHandle, Prose, Text, useModifierKeys, usePopoverHandlers } from "silvery"
import { ActivityIndicator, type ActivityStatus } from "./ActivityIndicator.tsx"
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
 * User turn row. The `>` glyph + prose layout mirrors the user message row layout
 * styling so existing visual tests pass. `additionalContext` carries hidden
 * context (system-reminders, hook output) exposed via the `/raw` toggle.
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
    <Box
      flexDirection="column"
      flexShrink={1}
      minWidth={0}
      backgroundColor="$bg-surface-subtle"
      paddingX={1}
      paddingY={0}
    >
      {!isMetaOnly && (
        <Box flexDirection="row" gap={1} flexShrink={1} minWidth={0}>
          <Text bold color="$accent">
            {">"}
          </Text>
          <Prose flexGrow={1} flexShrink={1} minWidth={0}>
            <LinkifiedText text={text} role="user" />
          </Prose>
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
 * Assistant turn row. `●` glyph + MarkdownView, mirroring the old
 * The `flexShrink + minWidth=0` chain on the outer
 * row is load-bearing for soft-wrapping long paragraphs — see the original
 * same structural notes apply.
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
 * RawInspector — secret debug trick. Wraps each chat entry so that hovering
 * with Cmd+Shift held shows a popover with the entry's raw JSON. When the
 * modifiers aren't held, the wrapper is a transparent passthrough — no popover
 * trigger, no event cost beyond the modifier-state hook.
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
  // Always compute a valid PopoverContent (the hook requires non-null), but
  // only attach mouse handlers when debug mode is active. When the modifiers
  // aren't held, the wrapper is a transparent fragment — no handlers, no
  // hover-event cost.
  const popoverContent = useMemo(() => {
    const json = JSON.stringify(payload, null, 2)
    // Trim very long payloads; full payload available via /debug or the JSONL.
    const lines = json.split("\n")
    const truncated =
      lines.length > 40 ? [...lines.slice(0, 40), `… (${lines.length - 40} more lines)`].join("\n") : json
    return {
      body: (
        <Box flexDirection="column" paddingX={2} paddingY={1}>
          <SyntaxHighlighter language="json" code={truncated} bare />
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
  return debugMode ? <Box {...handlers}>{children}</Box> : <>{children}</>
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
  // Assistant turn: optional text block + tool calls.
  // Wrap chain (flexShrink + minWidth=0) propagates min-content through Box
  // wrappers so MarkdownView's per-Text `wrap="wrap"` fires correctly — same
  // structural note: flexShrink + minWidth=0 is load-bearing for soft-wrap.
  return (
    <Box flexDirection="column" gap={1}>
      {m.text.length > 0 && <AssistantRow text={m.text} />}
      {m.toolCalls.map((c) => {
        const result = m.toolResults.find((r) => r.id === c.id)
        const running = result === undefined
        const adaptedCall = adaptToolCall(c, result, running)
        return (
          <ToolCall
            key={c.id}
            toolCall={adaptedCall}
            errorMessage={result?.is_error ? String(result.output ?? "Tool call failed") : undefined}
          />
        )
      })}
    </Box>
  )
}

// =============================================================================
// Sentinel type for the activity tail item
// =============================================================================

type ActivityItem = { __activity: true }
type Item = MessageEntry | ActivityItem

function isActivity(item: Item): item is ActivityItem {
  return (item as ActivityItem).__activity === true
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
  }
>(function SessionUpdateList(
  { messages, status, turnStartedAt, inputTokens, outputTokens, pendingPermissions, inFlightTool, showDebug = false },
  ref,
): React.ReactElement {
  const showActivity = status !== "idle" && status !== "ended"
  const items: Item[] = showActivity ? [...messages, { __activity: true }] : messages

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
      getKey={(item, i) => (isActivity(item) ? "__activity" : i)}
      gap={1}
      maxRendered={200}
      follow="end"
      renderItem={(item) =>
        isActivity(item) ? (
          <ActivityIndicator
            status={status}
            pendingPermissions={pendingPermissions}
            inFlightTool={inFlightTool}
            turnStartedAt={turnStartedAt}
            inputTokens={inputTokens}
            outputTokens={outputTokens}
          />
        ) : (
          <RawInspector payload={item}>
            <ExchangeItem m={item} showDebug={showDebug} />
          </RawInspector>
        )
      }
    />
  )
})
