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

import React, { useCallback, useEffect, useMemo, useState } from "react"
import type { ContentBlock, MessageEntry, MessageOp, ToolCallId, ToolCallStatus, ToolKind } from "@km/agent-harness"
import type { ToolCall as ToolCallType, ToolCallContent } from "@km/agent-harness"
import { buildTextAnalysis, shrinkwrapWidth } from "@silvery/ag-term/pipeline/pretext"
import {
  Box,
  ListView,
  type ListViewHandle,
  Prose,
  Small,
  Text,
  type SilveryMouseEvent,
  useHover,
  useModifierKeys,
  usePopoverHandlers,
} from "silvery"
import { ActivityIndicator, type ActivityStatus } from "./ActivityIndicator.tsx"
import { AmbientNotificationStack, type AmbientStreamEntry } from "./AmbientEventRow.tsx"
import { MarkdownView } from "./MarkdownView.tsx"
import { SyntaxHighlighter } from "./SyntaxHighlighter.tsx"
import { ToolCall } from "./ToolCall.tsx"
import { TurnActivitySummary, type TurnActivitySummaryItem } from "./TurnActivitySummary.tsx"
import { BACKGROUND_MESSAGE_PREFIX } from "../controller.ts"
import { Content, useContentLayout, useHasContentLayout } from "./Content.tsx"
import { parseBlocks, type MdBlock } from "../markdown.ts"
import { SessionEntry } from "./SessionEntry.tsx"
import type { SessionHistoryMetadata } from "../session-metadata.ts"

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
    lower === "write_stdin" ||
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
  return text.length > 80 ? `${text.slice(0, 80)}...` : text
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
    return command
  }
  if (name === "exec_command") {
    const command = stringProp(o, "cmd")
    return command
  }
  if (name === "write_stdin") {
    const chars = stringProp(o, "chars")
    const sessionId = o.session_id
    const suffix = typeof sessionId === "number" || typeof sessionId === "string" ? ` ${sessionId}` : ""
    return chars && chars.length > 0 ? `Sent input to command${suffix}` : `Waited for command output${suffix}`
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
function stripCommandEcho(text: string, title: string): string {
  const lines = text.split("\n")
  const first = lines[0]?.trim()
  const trimmedTitle = title.trim()
  if (first !== `$ ${trimmedTitle}` && first !== trimmedTitle) return text
  if (lines[1]?.trim() === "") lines.splice(0, 2)
  else lines.splice(0, 1)
  return lines.join("\n")
}

function toolResultContent(output: unknown, _isError?: boolean, title?: string): ToolCallContent[] {
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>
    const stdout = typeof o.stdout === "string" ? (title ? stripCommandEcho(o.stdout, title) : o.stdout) : ""
    const rawStderr = typeof o.stderr === "string" ? stripShellRunnerMetadata(o.stderr) : ""
    const stderr = title ? stripCommandEcho(rawStderr, title) : rawStderr
    const blocks: ToolCallContent[] = []
    if (stdout.length > 0) blocks.push({ type: "content", content: { type: "text", text: stdout } })
    if (stderr.length > 0) {
      blocks.push({
        type: "content",
        content: { type: "text", text: stderr, stream: "stderr" } as ContentBlock,
      })
    }
    if (blocks.length > 0) return blocks
  }
  const rawText = typeof output === "string" ? output : JSON.stringify(output, null, 2)
  const text = title ? stripCommandEcho(rawText, title) : rawText
  return [
    {
      type: "content",
      content: { type: "text", text: text ?? "" },
    },
  ]
}

function toolErrorMessage(output: unknown, title?: string): string {
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>
    const rawStderr = typeof o.stderr === "string" ? stripShellRunnerMetadata(o.stderr).trim() : ""
    const stderr = title ? stripCommandEcho(rawStderr, title).trim() : rawStderr
    if (stderr.length > 0) return stderr
    const content = typeof o.content === "string" ? o.content.trim() : ""
    if (content.length > 0) return content
    const stdout = typeof o.stdout === "string" ? o.stdout.trim() : ""
    if (stdout.length > 0) return stdout
  }
  return String(output ?? "Tool call failed")
}

function stripShellRunnerMetadata(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^Shell cwd was reset to /.test(line.trim()))
    .join("\n")
    .trim()
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
      content = toolResultContent(result.output, result.is_error, kind === "execute" ? title : undefined)
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
    title,
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
    <Box flexDirection="row" flexShrink={1} minWidth={0}>
      <Text color="$info">
        {text}
      </Text>
    </Box>
  )
}

const USER_BUBBLE_PADDING_X = 2
const USER_BUBBLE_HORIZONTAL_CHROME = USER_BUBBLE_PADDING_X * 2
const USER_PROMPT_BUBBLE_BG = "$bg-surface-raised"

function shrinkTextMeasure(text: string, maxWidth: number): number {
  const cap = Math.max(1, maxWidth)
  if (text.length === 0) return 0
  return Math.max(1, shrinkwrapWidth(buildTextAnalysis(text), cap))
}

function userBlockVisualWidth(block: MdBlock, maxInnerWidth: number): number {
  switch (block.kind) {
    case "heading":
    case "paragraph":
    case "quote":
      return shrinkTextMeasure(block.text, maxInnerWidth)
    case "bullet": {
      const markerWidth = block.depth * 2 + 2
      return markerWidth + shrinkTextMeasure(block.text, maxInnerWidth - markerWidth)
    }
    case "ordered": {
      const markerWidth = block.depth * 2 + `${block.number}.`.length + 1
      return markerWidth + shrinkTextMeasure(block.text, maxInnerWidth - markerWidth)
    }
    case "code":
      return Math.min(maxInnerWidth, Math.max(block.language.length, ...block.code.split("\n").map((line) => line.length)))
    case "table":
      return maxInnerWidth
    case "rule":
    case "blank":
      return 0
  }
}

function userBubbleWidthForText(text: string, maxBubbleWidth: number): number {
  const maxInnerWidth = Math.max(1, maxBubbleWidth - USER_BUBBLE_HORIZONTAL_CHROME)
  const blocks = parseBlocks(text)
  const visualWidth =
    blocks.length > 0
      ? Math.max(1, ...blocks.map((block) => userBlockVisualWidth(block, maxInnerWidth)))
      : Math.max(1, ...text.split("\n").map((line) => line.length))
  return Math.max(1, Math.min(maxBubbleWidth, visualWidth + USER_BUBBLE_HORIZONTAL_CHROME))
}

/**
 * User turn row — right-aligned bubble using the same quiet surface as the
 * command composer.
 *
 * Visual: submitted prompts stay visually related to the command box by using
 * `$bg-surface-raised` and no border. The bubble snaps to the right via
 * `justifyContent="flex-end"` and shrinks to fit its content with a max width
 * cap so long prompts wrap cleanly within the bubble instead of pushing the
 * chrome edge-to-edge.
 *
 * Wrapping: silvery's `<Prose>` wrap primitive (canonical typography wrapper)
 * + `<MarkdownView role="user">` handles markdown and word-boundary breaking. No mid-word breaks
 * unless a single token exceeds the bubble's interior width — same behavior
 * as the previous bg-tint UserRow, just chrome-only now.
 *
 * Selection: silvery's mouse-driven selection works at buffer level — the
 * cells inside the bubble carry plain styled text (no replacement glyphs or
 * non-text nodes), so drag-to-select inside the bubble continues to work.
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
  const content = useContentLayout()
  const maxBubbleWidth = Math.max(1, Math.min(58, Math.floor(content.measure * 0.8)))
  const bubbleWidth = userBubbleWidthForText(text, maxBubbleWidth)

  return (
    <Box
      flexDirection="column"
      alignSelf="stretch"
      width="100%"
      flexShrink={1}
      minWidth={0}
      paddingY={0}
    >
      {!isMetaOnly && (
        <Box flexDirection="column" width="100%" flexShrink={1} minWidth={0}>
          <Box
            key={`${content.available}:${bubbleWidth}`}
            flexDirection="row"
            alignSelf="flex-end"
            width={bubbleWidth}
            maxWidth={maxBubbleWidth}
            flexShrink={0}
            minWidth={0}
            backgroundColor={USER_PROMPT_BUBBLE_BG}
            paddingX={USER_BUBBLE_PADDING_X}
            paddingY={1}
          >
            <Prose width="100%" flexGrow={1} flexShrink={1} minWidth={0}>
              <MarkdownView source={text} role="user" layout="inline" />
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
 * Assistant turn row. Leading `●` glyph uses regular foreground so role
 * identity stays visible without adding another accent color. Same structural notes as UserRow apply
 * (flexShrink + minWidth=0 chain so MarkdownView's wrap fires).
 */
function AssistantRow({ text }: { text: string }): React.ReactElement {
  const hasCode = hasCodeMarkdownBlock(text)
  const hasTable = hasTableMarkdownBlock(text)
  const layout = hasCode || hasTable ? "content" : "inline"
  if (hasCode) {
    return (
      <Box flexDirection="column" position="relative" width="100%" maxWidth="100%" minWidth={0}>
        <Prose flexGrow={1} minWidth={0}>
          <MarkdownView source={text} layout="inline" />
        </Prose>
      </Box>
    )
  }
  return (
    <SessionEntry marker="•" markerColor="$fg" width={hasTable ? "100%" : "90%"}>
      <Prose flexGrow={1} minWidth={0}>
        <MarkdownView source={text} layout={layout} />
      </Prose>
    </SessionEntry>
  )
}

function StandaloneProseFrame({
  children,
  paddingBefore,
  paddingAfter,
}: {
  children: React.ReactNode
  paddingBefore: boolean
  paddingAfter: boolean
}): React.ReactElement {
  if (!paddingBefore && !paddingAfter) return <>{children}</>
  return (
    <Box flexDirection="column" alignSelf="stretch" width="100%" minWidth={0} flexShrink={0}>
      {paddingBefore ? <Box height={1} flexShrink={0} /> : null}
      {children}
      {paddingAfter ? <Box height={1} flexShrink={0} /> : null}
    </Box>
  )
}

function hasCodeMarkdownBlock(text: string): boolean {
  return parseBlocks(text).some((block) => block.kind === "code")
}

function hasTableMarkdownBlock(text: string): boolean {
  return parseBlocks(text).some((block) => block.kind === "table")
}

function isVisibleTurnOp(op: MessageOp | undefined): boolean {
  if (!op) return false
  return op.kind !== "text" || op.text.length > 0
}

function hasVisibleTurnOpBefore(ops: readonly MessageOp[], index: number): boolean {
  for (let i = index - 1; i >= 0; i--) {
    if (isVisibleTurnOp(ops[i])) return true
  }
  return false
}

function hasVisibleTurnOpAfter(ops: readonly MessageOp[], index: number): boolean {
  for (let i = index + 1; i < ops.length; i++) {
    if (isVisibleTurnOp(ops[i])) return true
  }
  return false
}

function ThinkingRow({ text }: { text: string }): React.ReactElement {
  return (
    <SessionEntry marker="•" markerColor="$muted">
      <Prose flexGrow={1}>
        <Text color="$muted" wrap="wrap">
          {text}
        </Text>
      </Prose>
    </SessionEntry>
  )
}

function RawRow({ label }: { label: string }): React.ReactElement {
  return (
    <SessionEntry marker="•" markerColor="$error">
      <Text color="$error" wrap="wrap">
        {label}
      </Text>
    </SessionEntry>
  )
}

function InterruptedRow(): React.ReactElement {
  return (
    <SessionEntry marker="▪" markerColor="$error">
      <Text color="$error" wrap="wrap">
        Conversation interrupted - tell the model what to do differently. Something went wrong? Hit `/feedback` to
        report the issue.
      </Text>
    </SessionEntry>
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

function formatTime(ts: number): string {
  const d = new Date(ts)
  const hh = d.getHours().toString().padStart(2, "0")
  const mm = d.getMinutes().toString().padStart(2, "0")
  return `${hh}:${mm}`
}

function formatDateTime(ts: number | undefined): string | undefined {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return undefined
  const d = new Date(ts)
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  return `${date} ${formatTime(ts)}`
}

function shortPath(path: string | undefined): string | undefined {
  if (!path) return undefined
  const home = process.env.HOME
  return home && path.startsWith(home) ? `~${path.slice(home.length)}` : path
}

function metadataPairs(fields: Record<string, string | number | undefined>): Array<[string, string]> {
  return Object.entries(fields).flatMap(([key, value]) =>
    value === undefined || value === "" ? [] : ([[key, String(value)]] as Array<[string, string]>),
  )
}

function durationLabel(start: number | undefined, end: number | undefined): string | undefined {
  if (typeof start !== "number" || typeof end !== "number" || end < start) return undefined
  const seconds = Math.round((end - start) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rem = seconds % 60
  if (minutes < 60) return rem > 0 ? `${minutes}m ${rem}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remMinutes = minutes % 60
  return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`
}

type SessionMetadataRowKind = "start" | "loaded" | "ended"

type SessionMetadataRowData = {
  kind: SessionMetadataRowKind
  title: string
  timestamp?: string
  parts: string[]
  fields: Array<[string, string]>
}

function MutedDivider({ title, width }: { title: string; width: number }): React.ReactElement {
  const total = Math.max(1, width)
  const padded = ` ${title} `
  const remaining = Math.max(0, total - padded.length)
  const left = Math.floor(remaining / 2)
  const right = remaining - left
  return (
    <Box flexDirection="row">
      <Text color="$border-default">{"─".repeat(left)}</Text>
      <Text color="$fg-muted">{padded}</Text>
      <Text color="$border-default">{"─".repeat(right)}</Text>
    </Box>
  )
}

function SessionMetadataRow({ data }: { data: SessionMetadataRowData }): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const hover = useHover()
  const { super: cmdHeld } = useModifierKeys({ enabled: hover.isHovered })
  const content = useContentLayout()
  const marker = expanded ? "▾" : hover.isHovered || data.kind === "loaded" ? "▸" : " "
  const bg = hover.isHovered ? "$bg-surface-hover" : undefined
  const isDivider = data.kind === "loaded"
  const headerMaxWidth = Math.max(1, isDivider ? content.wide : content.measure)
  const showTimestamp = hover.isHovered && cmdHeld
  const label = [data.title, ...data.parts].join(" · ")
  const dividerLabel = isDivider ? `${marker} ${label}` : label
  const titleWidth = data.title.length + data.parts.reduce((sum, part) => sum + part.length + 3, 0)
  const trailingFill = " ".repeat(Math.max(1, headerMaxWidth - 2 - titleWidth))
  const header = isDivider ? (
    <MutedDivider title={dividerLabel} width={headerMaxWidth} />
  ) : (
    <Box flexDirection="row" width="100%" maxWidth={headerMaxWidth} minWidth={0} backgroundColor={bg}>
      <Box width={1} flexShrink={0} backgroundColor={bg}>
        <Text color={marker === " " ? "$fg-muted" : "$fg"} backgroundColor={bg}>
          {marker}
        </Text>
      </Box>
      <Box width={1} flexShrink={0} backgroundColor={bg}>
        <Text backgroundColor={bg}> </Text>
      </Box>
      <Box flexDirection="row" flexGrow={1} flexShrink={1} minWidth={0} backgroundColor={bg}>
        <Text color={expanded ? "$fg" : "$fg-muted"} bold={expanded} wrap="truncate" backgroundColor={bg}>
          <Text backgroundColor={bg}>{data.title}</Text>
          {data.parts.map((part, i) => (
            <React.Fragment key={`${part}-${i}`}>
              <Text color="$muted" backgroundColor={bg}>
                {" · "}
              </Text>
              <Text backgroundColor={bg}>{part}</Text>
            </React.Fragment>
          ))}
        </Text>
        <Text backgroundColor={bg}>{trailingFill}</Text>
      </Box>
    </Box>
  )
  const row = (
    <Content.Row>
      {data.timestamp ? (
        <Content.Left>
          <Content.Aside show={showTimestamp}>{data.timestamp}</Content.Aside>
        </Content.Left>
      ) : null}
      <Content.Body width={isDivider || expanded ? "wide" : "prose"}>
        <Box flexDirection="column" width="100%" minWidth={0}>
          <Box
            width="100%"
            minWidth={0}
            backgroundColor={bg}
            onMouseEnter={hover.onMouseEnter}
            onMouseLeave={hover.onMouseLeave}
            onClick={() => setExpanded((v) => !v)}
          >
            {header}
          </Box>
          {expanded ? (
            <Box flexDirection="column" paddingLeft={2}>
              {data.fields.map(([key, value]) => (
                <Text key={key} color="$fg-muted" wrap="wrap">
                  <Text color="$muted">{key}: </Text>
                  {value}
                </Text>
              ))}
            </Box>
          ) : null}
        </Box>
      </Content.Body>
    </Content.Row>
  )
  if (data.kind === "loaded") {
    return (
      <Box flexDirection="column" width="100%" minWidth={0}>
        <Text> </Text>
        {row}
        <Text> </Text>
      </Box>
    )
  }
  return row
}

function sessionMetadataItems(
  metadata: SessionHistoryMetadata | undefined,
): { start?: SessionMetadataItem; loaded?: SessionMetadataItem; ended?: SessionMetadataItem } {
  if (!metadata) return {}
  const agent = metadata.agent ?? "agent"
  const model = metadata.model
  const cwd = shortPath(metadata.cwd)
  const startFields = metadataPairs({
    agent,
    sessionId: metadata.sessionId,
    cwd,
    model,
    account: metadata.account,
    resumeId: metadata.resumeId,
    spawnedAt: formatDateTime(metadata.spawnedAt),
    sessionInitAt: formatDateTime(metadata.sessionInitAt),
  })
  const start: SessionMetadataItem = {
    __sessionMetadata: true,
    id: "session-metadata:start",
    data: {
      kind: "start",
      title: "Session started",
      timestamp: formatTime(metadata.spawnedAt),
      parts: [agent, model, cwd].filter((p): p is string => !!p),
      fields: startFields,
    },
  }

  const loaded =
    metadata.resumeId && metadata.replayCompletedAt
      ? {
          __sessionMetadata: true as const,
          id: "session-metadata:loaded",
          data: {
            kind: "loaded" as const,
            title: `Session resumed ${displaySessionId(metadata.resumeId)}`,
            timestamp: formatTime(metadata.replayCompletedAt),
            parts: [metadata.replayMessageCount !== undefined ? `${metadata.replayMessageCount} entries` : undefined].filter(
              (p): p is string => !!p,
            ),
            fields: metadataPairs({
              resumeId: metadata.resumeId,
              transcriptPath: metadata.transcriptPath,
              replayStartedAt: formatDateTime(metadata.replayStartedAt),
              replayCompletedAt: formatDateTime(metadata.replayCompletedAt),
              replayMessageCount: metadata.replayMessageCount,
              replayBoundaryMessageId: metadata.replayBoundaryMessageId,
            }),
          },
        }
      : undefined

  const ended =
    metadata.endedAt !== undefined
      ? {
          __sessionMetadata: true as const,
          id: "session-metadata:ended",
          data: {
            kind: "ended" as const,
            title: "Session ended",
            timestamp: formatTime(metadata.endedAt),
            parts: [durationLabel(metadata.spawnedAt, metadata.endedAt)].filter((p): p is string => !!p),
            fields: metadataPairs({
              endedAt: formatDateTime(metadata.endedAt),
              duration: durationLabel(metadata.spawnedAt, metadata.endedAt),
            }),
          },
        }
      : undefined
  return { start, loaded, ended }
}

function displaySessionId(id: string): string {
  const value = id.includes(":") ? (id.split(":").pop() ?? id) : id
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value
}

function TimestampedRow({
  timestamp,
  side,
  width = "prose",
  children,
}: {
  timestamp: string
  side: "left" | "right"
  width?: "prose" | "wide"
  children: React.ReactNode
}): React.ReactElement {
  const hover = useHover()
  const content = useContentLayout()
  const { super: cmdHeld } = useModifierKeys({ enabled: hover.isHovered })
  const laneWidth = width === "wide" ? content.wide : content.measure
  const sideGutter = Math.max(0, Math.floor(((content.available || laneWidth) - laneWidth) / 2))
  const showTimestamp = hover.isHovered && cmdHeld && sideGutter >= timestamp.length + 1
  return (
    <Box
      key={`${content.available}:${content.measure}:${content.wide}:${side}`}
      flexDirection="row"
      alignSelf="stretch"
      width="100%"
      minWidth={0}
      flexShrink={0}
      onMouseEnter={hover.onMouseEnter}
      onMouseLeave={hover.onMouseLeave}
    >
      <Content.Row>
        {side === "left" ? (
          <Content.Left>
            <Content.Aside side="left" show={showTimestamp}>{timestamp}</Content.Aside>
          </Content.Left>
        ) : null}
        {width === "wide" ? <Content.Body width="wide">{children}</Content.Body> : <Content.Prose>{children}</Content.Prose>}
        {side === "right" ? (
          <Content.Right>
            <Content.Aside side="right" show={showTimestamp} paddingTop={1}>{timestamp}</Content.Aside>
          </Content.Right>
        ) : null}
      </Content.Row>
    </Box>
  )
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
        <Box flexDirection="column">
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

function isHighContentToolRun(run: Array<{ op: MessageOp; index: number }>): boolean {
  const toolOps = run.filter(({ op }) => op.kind === "tool")
  if (toolOps.length === 1) {
    const item = turnActivityItemForOp(toolOps[0]!.op)
    return item?.toolCall.kind === "execute"
  }
  const resultCount = toolOps.filter(({ op }) => op.kind === "tool" && op.result !== undefined).length
  if (resultCount >= 2) return true
  return toolOps.some(({ op }) => op.kind === "tool" && op.result?.is_error === true)
}

function turnActivityItemForOp(op: MessageOp): TurnActivitySummaryItem | null {
  if (op.kind !== "tool") return null
  const adaptedCall = adaptToolCall(op.toolCall, op.result, op.result === undefined)
  return {
    id: op.toolCall.id,
    toolCall: adaptedCall,
    errorMessage: op.result?.is_error ? toolErrorMessage(op.result.output, adaptedCall.title) : undefined,
  }
}

function ActivityDetails({ ops }: { ops: readonly MessageOp[] }): React.ReactElement {
  return (
    <Box flexDirection="column" gap={0}>
      {ops.map((op, index) => {
        if (op.kind === "thinking") {
          if (op.text.length === 0) return null
          return (
            <RawInspector key={`thinking-${index}`} payload={op}>
              <ThinkingRow text={op.text} />
            </RawInspector>
          )
        }
        if (op.kind === "text") {
          if (op.text.length === 0) return null
          return (
            <RawInspector key={`text-${index}`} payload={op}>
              <AssistantRow text={op.text} />
            </RawInspector>
          )
        }
        if (op.kind === "raw") {
          return (
            <RawInspector key={`raw-${index}`} payload={op.raw}>
              <RawRow label={op.label} />
            </RawInspector>
          )
        }
        const adaptedCall = adaptToolCall(op.toolCall, op.result, op.result === undefined)
        return (
          <RawInspector key={op.toolCall.id} payload={op}>
            <ToolCall
              toolCall={adaptedCall}
              errorMessage={op.result?.is_error ? toolErrorMessage(op.result.output, adaptedCall.title) : undefined}
            />
          </RawInspector>
        )
      })}
    </Box>
  )
}

function ActivityLivePreview({ ops }: { ops: readonly MessageOp[] }): React.ReactElement | null {
  const runningTools = ops.filter((op) => op.kind === "tool" && op.result === undefined)
  const thinking = ops.filter((op) => op.kind === "thinking" && op.text.trim().length > 0)
  if (runningTools.length === 0 && thinking.length === 0) return null
  return (
    <Box flexDirection="column" gap={0}>
      {runningTools.map((op) => {
        if (op.kind !== "tool") return null
        return (
          <ToolCall key={op.toolCall.id} toolCall={adaptToolCall(op.toolCall, op.result, true)} interactive={false} />
        )
      })}
      {thinking.map((op, index) => {
        if (op.kind !== "thinking") return null
        return <ThinkingRow key={`thinking-${index}`} text={op.text} />
      })}
    </Box>
  )
}

function ActivitySummaryForOps({
  ops,
  timestamp,
  onDisclosureToggle,
}: {
  ops: readonly MessageOp[]
  timestamp?: string
  onDisclosureToggle?: () => void
}): React.ReactElement {
  const items = ops.flatMap((op) => turnActivityItemForOp(op) ?? [])
  return (
    <TurnActivitySummary
      items={items}
      timestamp={timestamp}
      details={<ActivityDetails ops={ops} />}
      livePreview={<ActivityLivePreview ops={ops} />}
      onDisclosureToggle={onDisclosureToggle}
    />
  )
}

function ExchangeItem({
  m,
  showDebug,
  onDisclosureToggle,
}: {
  m: MessageEntry
  showDebug: boolean
  onDisclosureToggle?: () => void
}): React.ReactElement {
  // Background-task system messages: user-role entries with a "bg-" turnId
  // prefix AND the BACKGROUND_MESSAGE_PREFIX text prefix.
  if (isBackgroundSystemMessage(m)) {
    return (
      <TimestampedRow timestamp={formatTime(m.ts)} side="left">
        <BackgroundSystemRow text={m.text} />
      </TimestampedRow>
    )
  }
  if (m.role === "user") {
    return (
      <TimestampedRow timestamp={formatTime(m.ts)} side="right">
        <UserRow text={m.text} additionalContext={m.additionalContext} showDebug={showDebug} />
      </TimestampedRow>
    )
  }
  if (m.role === "system") {
    if (m.additionalContext) {
      return (
        <RawInspector payload={{ text: m.text, raw: m.additionalContext }}>
          <TimestampedRow timestamp={formatTime(m.ts)} side="left">
            <RawRow label={m.text} />
          </TimestampedRow>
        </RawInspector>
      )
    }
    return (
      <RawInspector payload={m.additionalContext ? { text: m.text, raw: m.additionalContext } : m}>
        <BackgroundSystemRow text={m.text} />
      </RawInspector>
    )
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
  type OpRun = { kind: MessageOp["kind"]; ops: Array<{ op: (typeof m.ops)[number]; index: number }> }
  const runs: OpRun[] = []
  m.ops.forEach((op, i) => {
    const k = op.kind
    const tail = runs[runs.length - 1]
    if (tail && tail.kind === k) {
      tail.ops.push({ op, index: i })
    } else {
      runs.push({ kind: k, ops: [{ op, index: i }] })
    }
  })

  return (
    <Box flexDirection="column" gap={1} flexShrink={0}>
      {runs.map((run, runIdx) => (
        // gap=0 inside a run → consecutive tool calls (or coalesced text
        // ops) render contiguously. The outer `gap={1}` only applies
        // BETWEEN runs.
        <Box key={runIdx} flexDirection="column" flexShrink={0}>
          {run.kind === "tool" && isHighContentToolRun(run.ops) ? (
            <ActivitySummaryForOps
              ops={run.ops.map(({ op }) => op)}
              timestamp={formatTime(m.ts)}
              onDisclosureToggle={onDisclosureToggle}
            />
          ) : (
            run.ops.map(({ op, index }) => {
              if (op.kind === "text") {
                if (op.text.length === 0) return null
                const standalone = textNeedsStandaloneSpacing(op.text)
                const row = (
                  <RawInspector key={`text-${index}`} payload={op}>
                    <StandaloneProseFrame
                      paddingBefore={standalone && hasVisibleTurnOpBefore(m.ops, index)}
                      paddingAfter={standalone && hasVisibleTurnOpAfter(m.ops, index)}
                    >
                      <TimestampedRow timestamp={formatTime(m.ts)} side="left" width={hasTableMarkdownBlock(op.text) ? "wide" : "prose"}>
                        <AssistantRow text={op.text} />
                      </TimestampedRow>
                    </StandaloneProseFrame>
                  </RawInspector>
                )
                return row
              }
              if (op.kind === "thinking") {
                if (op.text.length === 0) return null
                return (
                  <RawInspector key={`thinking-${index}`} payload={op}>
                    <TimestampedRow timestamp={formatTime(m.ts)} side="left">
                      <ThinkingRow text={op.text} />
                    </TimestampedRow>
                  </RawInspector>
                )
              }
              if (op.kind === "raw") {
                return (
                  <RawInspector key={`raw-${index}`} payload={op.raw}>
                    <TimestampedRow timestamp={formatTime(m.ts)} side="left">
                      <RawRow label={op.label} />
                    </TimestampedRow>
                  </RawInspector>
                )
              }
              const c = op.toolCall
              const result = op.result
              const running = result === undefined
              const adaptedCall = adaptToolCall(c, result, running)
              return (
                <RawInspector key={c.id} payload={op}>
                  <TimestampedRow timestamp={formatTime(m.ts)} side="left">
                    <ToolCall
                      toolCall={adaptedCall}
                      errorMessage={result?.is_error ? toolErrorMessage(result.output, adaptedCall.title) : undefined}
                    />
                  </TimestampedRow>
                </RawInspector>
              )
            })
          )}
        </Box>
      ))}
      {m.stopReason === "interrupted" ? (
        <TimestampedRow timestamp={formatTime(m.ts)} side="left">
          <InterruptedRow />
        </TimestampedRow>
      ) : null}
    </Box>
  )
}

// =============================================================================
// Sentinel types for the activity tail and ambient observation rows
// =============================================================================

type ActivityItem = { __activity: true }
type AmbientItem = { __ambient: true; entries: AmbientStreamEntry[] }
type AssistantActivitySlice = { __assistantActivity: true; id: string; message: MessageEntry; ops: MessageOp[] }
type SessionMetadataItem = { __sessionMetadata: true; id: string; data: SessionMetadataRowData }
type PaddingItem = { __padding: true; id: string; height: number }
type Item = MessageEntry | ActivityItem | AmbientItem | AssistantActivitySlice | SessionMetadataItem | PaddingItem
type SimilarGroupKind = "user" | "system" | "ambient" | "assistant-tool-activity"
type GroupedItem = { __group: true; kind: SimilarGroupKind; items: Item[] }
type RenderItem = Item | GroupedItem

function isActivity(item: Item): item is ActivityItem {
  return (item as ActivityItem).__activity === true
}

function isAmbient(item: Item): item is AmbientItem {
  return (item as AmbientItem).__ambient === true
}

function isSessionMetadata(item: Item): item is SessionMetadataItem {
  return (item as SessionMetadataItem).__sessionMetadata === true
}

function isPadding(item: Item): item is PaddingItem {
  return (item as PaddingItem).__padding === true
}

function isAssistantActivitySlice(item: Item): item is AssistantActivitySlice {
  return (item as AssistantActivitySlice).__assistantActivity === true
}

function isMessageEntry(item: Item): item is MessageEntry {
  return !isActivity(item) && !isAmbient(item) && !isSessionMetadata(item) && !isPadding(item) && !isAssistantActivitySlice(item)
}

function sliceMessage(message: MessageEntry, ops: MessageOp[], suffix: string): MessageEntry {
  const out = {
    ...message,
    id: `${message.id}:${suffix}` as MessageEntry["id"],
    ops,
  } as MessageEntry
  Object.defineProperty(out, "text", {
    get() {
      return ops.flatMap((op) => (op.kind === "text" ? [op.text] : [])).join("")
    },
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(out, "toolCalls", {
    get() {
      return ops.flatMap((op) => (op.kind === "tool" ? [op.toolCall] : []))
    },
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(out, "toolResults", {
    get() {
      return ops.flatMap((op) => (op.kind === "tool" && op.result ? [op.result] : []))
    },
    enumerable: true,
    configurable: true,
  })
  return out
}

function splitAssistantToolActivity(item: Item): Item[] {
  if (
    isActivity(item) ||
    isAmbient(item) ||
    isSessionMetadata(item) ||
    isPadding(item) ||
    isAssistantActivitySlice(item) ||
    item.role !== "assistant"
  )
    return [item]
  const toolCount = item.ops.filter((op) => op.kind === "tool").length
  if (toolCount >= 8) {
    const out: Item[] = []
    const activityOps = item.ops.filter((op) => op.kind === "tool" || op.kind === "thinking")
    let textOps: MessageOp[] = []
    let insertedActivity = false
    let seq = 0
    const flushText = (): void => {
      if (textOps.length === 0) return
      out.push(sliceMessage(item, textOps, `text-${seq++}`))
      textOps = []
    }
    for (const op of item.ops) {
      if (op.kind === "tool" || op.kind === "thinking") {
        if (!insertedActivity) {
          flushText()
          out.push({ __assistantActivity: true, id: `${item.id}:tools-all`, message: item, ops: activityOps })
          insertedActivity = true
        }
      } else {
        textOps.push(op)
      }
    }
    flushText()
    return out.length > 0 ? out : [item]
  }
  const out: Item[] = []
  let nonToolOps: MessageOp[] = []
  let toolOps: MessageOp[] = []
  let pendingThinkingOps: MessageOp[] = []
  let hasTool = false
  let seq = 0
  const flushNonTool = (): void => {
    if (nonToolOps.length === 0) return
    out.push(sliceMessage(item, nonToolOps, `text-${seq++}`))
    nonToolOps = []
  }
  const flushTool = (): void => {
    if (toolOps.length === 0) return
    out.push({ __assistantActivity: true, id: `${item.id}:tools-${seq++}`, message: item, ops: toolOps })
    toolOps = []
  }
  for (const op of item.ops) {
    if (op.kind === "tool") {
      hasTool = true
      flushNonTool()
      if (toolOps.length === 0 && pendingThinkingOps.length > 0) {
        toolOps.push(...pendingThinkingOps)
        pendingThinkingOps = []
      }
      toolOps.push(op)
    } else if (op.kind === "thinking") {
      if (toolOps.length > 0) toolOps.push(op)
      else pendingThinkingOps.push(op)
    } else {
      flushTool()
      nonToolOps.push(op)
    }
  }
  flushTool()
  flushNonTool()
  return hasTool && out.length > 0 ? out : [item]
}

function isAssistantToolActivity(item: Item): boolean {
  if (isAssistantActivitySlice(item)) return true
  if (isActivity(item) || isAmbient(item) || isSessionMetadata(item) || isPadding(item) || item.role !== "assistant")
    return false
  let hasTool = false
  for (const op of item.ops) {
    if (op.kind === "tool") {
      hasTool = true
      continue
    }
    if (op.kind === "thinking") continue
    if (op.kind === "text" && op.text.trim().length === 0) continue
    return false
  }
  return hasTool
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
  if (isSessionMetadata(item)) return null
  if (isPadding(item)) return null
  if (isAssistantActivitySlice(item)) return "assistant-tool-activity"
  if (isAssistantToolActivity(item)) return "assistant-tool-activity"
  if (isBackgroundSystemMessage(item)) return "system"
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
  if (isSessionMetadata(item)) return item.id
  if (isPadding(item)) return `__padding:${item.id}`
  if (isAssistantActivitySlice(item)) return item.id
  return String(item.id ?? i)
}

function renderItemKey(item: RenderItem, i: number): string {
  if (!isGrouped(item)) return itemKey(item, i)
  const first = item.items[0]
  return `group:${item.kind}:${first ? itemKey(first, i) : i}`
}

function insertRenderGaps(items: RenderItem[]): RenderItem[] {
  const out: RenderItem[] = []
  for (const item of items) {
    const prev = out[out.length - 1]
    if (!prev && needsBreathingBefore(item) && !ownsVerticalSpacing(item)) {
      out.push({ __padding: true, id: `gap:start:${renderItemKey(item, out.length)}`, height: 1 })
    } else if (
      prev &&
      !(isPaddingRenderItem(prev) || isPaddingRenderItem(item)) &&
      !areDenseAdjacentItems(prev, item) &&
      !(ownsVerticalSpacing(prev) || ownsVerticalSpacing(item))
    ) {
      out.push({ __padding: true, id: `gap:${renderItemKey(prev, out.length)}:${renderItemKey(item, out.length)}`, height: 1 })
    }
    out.push(item)
  }
  const last = out[out.length - 1]
  if (last && !isPaddingRenderItem(last) && needsBreathingAfter(last) && !ownsVerticalSpacing(last)) {
    out.push({ __padding: true, id: `gap:${renderItemKey(last, out.length)}:end`, height: 1 })
  }
  return out
}

function isPaddingRenderItem(item: RenderItem): item is PaddingItem {
  return !isGrouped(item) && isPadding(item)
}

function areDenseAdjacentItems(prev: RenderItem, item: RenderItem): boolean {
  if (isGrouped(prev) || isGrouped(item)) return false
  if (isPadding(prev) || isPadding(item)) return false
  if (isActivity(prev) || isActivity(item)) return false
  if (isAmbient(prev) || isAmbient(item)) return false
  if (isSessionMetadata(prev) || isSessionMetadata(item)) return false
  if (isAssistantActivitySlice(prev) || isAssistantActivitySlice(item)) return false
  return prev.role === "system" && item.role === "system"
}

function renderItemHasInternalBlankLine(item: RenderItem): boolean {
  if (isGrouped(item)) return item.items.some(itemHasInternalBlankLine)
  return itemHasInternalBlankLine(item)
}

function needsBreathingBefore(item: RenderItem): boolean {
  return renderItemHasInternalBlankLine(item)
}

function needsBreathingAfter(item: RenderItem): boolean {
  return needsBreathingBefore(item)
}

function ownsVerticalSpacing(item: RenderItem): boolean {
  return !isGrouped(item) && isSessionMetadata(item) && item.data.kind === "loaded"
}

function itemTimestamp(item: Item): number | null {
  if (isActivity(item) || isAmbient(item) || isSessionMetadata(item) || isPadding(item)) return null
  if (isAssistantActivitySlice(item)) return item.message.ts
  return item.ts
}

function itemBlockText(item: Item): string {
  if (isActivity(item) || isAmbient(item) || isSessionMetadata(item) || isPadding(item)) return ""
  const ops = isAssistantActivitySlice(item) ? item.ops : item.ops
  return ops
    .flatMap((op) => {
      if (op.kind === "text" || op.kind === "thinking") return [op.text]
      return []
    })
    .join("")
}

function itemHasInternalBlankLine(item: Item): boolean {
  return /\n[ \t]*\n/.test(itemBlockText(item))
}

function textNeedsStandaloneSpacing(text: string): boolean {
  return /\n[ \t]*\n/.test(text)
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
    sessionMetadata?: SessionHistoryMetadata
    /** Display name for the running agent. Forwarded to the inline
     *  ActivityIndicator so the spawning-state label can read
     *  "Spawning Claude Code v<version>…". Bead: km-cr94. */
    agentLabel?: string | null
    /** CLI version string from session-init (e.g. "2.1.119"). Forwarded
     *  to ActivityIndicator. `null` until session-init resolves. */
    agentVersion?: string | null
    /** Chat panes follow the latest turn; natural-height story previews can disable it. */
    follow?: "end" | false
    /** Vertical breathing room rendered inside the scroll content. */
    paddingY?: number
    /** Overrides paddingY for the top edge when the viewport has asymmetric chrome. */
    paddingTop?: number
    /** Overrides paddingY for the bottom edge when floating chrome overlays the list. */
    paddingBottom?: number
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
    sessionMetadata,
    agentLabel = null,
    agentVersion = null,
    follow = "end",
    paddingY = 0,
    paddingTop,
    paddingBottom,
  },
  ref,
): React.ReactElement {
  const [followPausedByDisclosure, setFollowPausedByDisclosure] = useState(false)
  const hasContentLayout = useHasContentLayout()
  const pauseFollowForDisclosure = useCallback(() => {
    setFollowPausedByDisclosure(true)
  }, [])
  useEffect(() => {
    setFollowPausedByDisclosure(false)
  }, [messages.length, status])

  const showActivity = status !== "idle" && status !== "ended"
  const merged = ambientEntries && ambientEntries.length > 0 ? interleave(messages, ambientEntries) : [...messages]
  const metadata = sessionMetadataItems(sessionMetadata)
  const replayMessageCount = Math.max(0, sessionMetadata?.replayMessageCount ?? 0)
  const replayBoundaryMessageId = sessionMetadata?.replayBoundaryMessageId
  const visibleItems: Item[] = []
  if (metadata.start) visibleItems.push(metadata.start)
  let seenReplayMessages = 0
  let insertedLoadedMetadata = false
  for (const item of merged) {
    visibleItems.push(...splitAssistantToolActivity(item))
    if (isMessageEntry(item)) seenReplayMessages++
    const isReplayBoundary =
      replayBoundaryMessageId !== undefined
        ? isMessageEntry(item) && item.id === replayBoundaryMessageId
        : replayMessageCount > 0 && seenReplayMessages === replayMessageCount
    if (metadata.loaded && !insertedLoadedMetadata && isReplayBoundary) {
      visibleItems.push(metadata.loaded)
      insertedLoadedMetadata = true
    }
  }
  if (metadata.loaded && !insertedLoadedMetadata) {
    visibleItems.push(metadata.loaded)
  }
  if (metadata.ended) visibleItems.push(metadata.ended)
  const contentItems: Item[] = showActivity ? [...visibleItems, { __activity: true }] : visibleItems
  const topPadding = Math.max(0, paddingTop ?? paddingY)
  const bottomPadding = Math.max(0, paddingBottom ?? paddingY)
  const items: Item[] =
    (topPadding > 0 || bottomPadding > 0) && contentItems.length > 0
      ? [
          ...(topPadding > 0 ? [{ __padding: true as const, id: "viewport-top", height: topPadding }] : []),
          ...contentItems,
          ...(bottomPadding > 0 ? [{ __padding: true as const, id: "viewport-bottom", height: bottomPadding }] : []),
        ]
      : contentItems
  const renderItems = insertRenderGaps(groupSimilarItems(items))
  const listEpoch = sessionMetadata?.replayCompletedAt ? `replay:${sessionMetadata.replayCompletedAt}` : "live"
  const renderSessionItem = (item: Item, _i: number): React.ReactNode =>
    isPadding(item) ? (
      <Box flexDirection="column" flexShrink={0}>
        {Array.from({ length: item.height }, (_, i) => (
          <Text key={i}> </Text>
        ))}
      </Box>
    ) : isActivity(item) ? (
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
    ) : isSessionMetadata(item) ? (
      <SessionMetadataRow data={item.data} />
    ) : isAssistantActivitySlice(item) ? (
      <ActivitySummaryForOps
        ops={item.ops}
        timestamp={formatTime(item.message.ts)}
        onDisclosureToggle={pauseFollowForDisclosure}
      />
    ) : item.role === "assistant" ? (
      // Assistant turns wrap each op (text/tool) individually inside
      // ExchangeItem so the hover popover shows ONLY the hovered op,
      // not the whole turn's combined JSON.
      <ExchangeItem m={item} showDebug={showDebug} onDisclosureToggle={pauseFollowForDisclosure} />
    ) : (
      <RawInspector payload={item}>
        <ExchangeItem m={item} showDebug={showDebug} onDisclosureToggle={pauseFollowForDisclosure} />
      </RawInspector>
    )
  const renderGroupedItem = (item: RenderItem, i: number): React.ReactNode =>
    isGrouped(item) && item.kind === "assistant-tool-activity" && item.items.length >= 2 ? (
      <ActivitySummaryForOps
        timestamp={formatTime(item.items.flatMap((child) => itemTimestamp(child) ?? [])[0] ?? 0)}
        onDisclosureToggle={pauseFollowForDisclosure}
        ops={item.items.flatMap((child) =>
          isActivity(child) || isAmbient(child) || isSessionMetadata(child)
            ? []
            : isAssistantActivitySlice(child)
              ? child.ops
              : isPadding(child)
                ? []
                : child.ops,
        )}
      />
    ) : isGrouped(item) ? (
      <Box flexDirection="column" gap={0} alignSelf="stretch" width="100%" flexShrink={0}>
        {item.items.map((child, childIndex) => (
          <Box key={itemKey(child, childIndex)} flexDirection="column" alignSelf="stretch" width="100%" flexShrink={0}>
            {renderSessionItem(child, childIndex)}
          </Box>
        ))}
      </Box>
    ) : (
      renderSessionItem(item, i)
    )

  if (follow === false) {
    const body = (
      <Box flexDirection="column" gap={0} alignSelf="stretch" width="100%" flexShrink={0}>
        {renderItems.map((item, i) => (
          <Box key={renderItemKey(item, i)} flexDirection="column" alignSelf="stretch" width="100%" flexShrink={0}>
            {renderGroupedItem(item, i)}
          </Box>
        ))}
      </Box>
    )
    return hasContentLayout ? body : <Content.Layout>{body}</Content.Layout>
  }

  const list = (
    <ListView
      key={listEpoch}
      ref={ref}
      items={renderItems}
      getKey={renderItemKey}
      gap={0}
      maxRendered={200}
      nav={false}
      follow={followPausedByDisclosure ? undefined : follow}
      renderItem={renderGroupedItem}
    />
  )
  return hasContentLayout ? (
    list
  ) : (
    <Content.Layout>
      {list}
    </Content.Layout>
  )
})
