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
 *   - `<SubAgentExchange>`     — nested Task tool stream block
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
import {
  Box,
  Divider,
  ListView,
  type ListViewHandle,
  Small,
  Text,
  useHover,
  useModifierKeys,
  usePopoverHandlers,
  useSelection,
} from "silvery"
import { ActivityIndicator, type ActivityStatus } from "./ActivityIndicator.tsx"
import { NotificationStack } from "./NotificationEventRow.tsx"
import type { NotificationStreamEntry } from "../notification-stream.ts"
import { BoundedScroll } from "./BoundedScroll.tsx"
import { EntryDisclosure } from "./EntryDisclosure.tsx"
import { SyntaxHighlighter } from "./SyntaxHighlighter.tsx"
import { ToolCall } from "./ToolCall.tsx"
import type { TurnActivitySummaryItem } from "./TurnActivitySummary.tsx"
import { BACKGROUND_MESSAGE_PREFIX } from "../controller.ts"
import { Content, useContentLayout, useHasContentLayout } from "./Content.tsx"
import { parseBlocks } from "../markdown.ts"
import { SessionEntry } from "./SessionEntry.tsx"
import type { SessionHistoryMetadata } from "../session-metadata.ts"
import { Chat } from "./Chat.tsx"
import { createLogger } from "loggily"
import {
  activitySpansFromOps,
  latestRunningActivitySpan,
  normalizeCommandSessionOps,
  splitAssistantMessageForTranscript,
  type ChatActivitySpan,
} from "../chat-model.ts"

const sessionListLog = createLogger("silvercode:session-list")

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
    lower === "view_image" ||
    lower === "view_image_tool_call" ||
    lower === "run_command" ||
    lower === "shell" ||
    lower === "computer"
  ) {
    return "execute"
  }
  if (lower === "edit" || lower === "write" || lower === "multiedit" || lower === "apply_patch") return "edit"
  if (lower === "read") return "read"
  if (lower === "glob" || lower === "grep" || lower === "search" || lower === "websearch") return "search"
  if (lower === "todowrite" || lower === "update_plan") return "think"
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
  if (name === "view_image" || name === "view_image_tool_call" || name === "ViewImage") {
    const path = stringProp(o, "path") ?? stringProp(o, "local_path") ?? stringProp(o, "file_path")
    return path ? `View ${path}` : "View image"
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
    return applyPatchDiffContent(input)
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

function applyPatchDiffContent(patch: string): ToolCallContent[] {
  const out: ToolCallContent[] = []
  let path = ""
  let oldLines: string[] = []
  let newLines: string[] = []

  function flush(): void {
    if (!path || (oldLines.length === 0 && newLines.length === 0)) return
    out.push({
      type: "diff",
      path,
      oldText: oldLines.join("\n"),
      newText: newLines.join("\n"),
    })
    oldLines = []
    newLines = []
  }

  for (const line of patch.split("\n")) {
    if (line.startsWith("*** Update File: ")) {
      flush()
      path = line.slice("*** Update File: ".length)
      continue
    }
    if (line.startsWith("*** Add File: ")) {
      flush()
      path = line.slice("*** Add File: ".length)
      continue
    }
    if (line.startsWith("*** Delete File: ")) {
      flush()
      path = line.slice("*** Delete File: ".length)
      continue
    }
    if (!path || line.startsWith("***") || line.startsWith("@@")) continue
    if (line.startsWith("+") && !line.startsWith("+++")) {
      newLines.push(line.slice(1))
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      oldLines.push(line.slice(1))
    }
  }
  flush()
  return out.length > 0
    ? out
    : [
        {
          type: "content",
          content: { type: "text", text: patch },
        },
      ]
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

function singleLineGenericToolContentTitle(
  toolName: string,
  title: string,
  content: ToolCallContent[] | undefined,
): string | null {
  if (title !== toolName || content?.length !== 1) return null
  const only = content[0]
  if (only?.type !== "content" || only.content.type !== "text") return null
  const text = only.content.text.trim()
  if (text.length === 0 || text.includes("\n")) return null
  return text
}

function singleLineTextToolContent(content: ToolCallContent[] | undefined): string | null {
  if (content?.length !== 1) return null
  const only = content[0]
  if (only?.type !== "content" || only.content.type !== "text") return null
  const text = only.content.text.trim()
  if (text.length === 0 || text.includes("\n")) return null
  return text
}

function agentLifecycleTitle(toolName: string, title: string, status: ToolCallStatus): string {
  if (toolName !== "Agent" && toolName !== "Task") return title
  const lifecycle =
    status === "completed" ? "completed" : status === "failed" ? "failed" : status === "pending" ? "pending" : "running"
  const suffix = title !== toolName && title.trim().length > 0 ? ` - ${title}` : ""
  return `Agent ${lifecycle}${suffix}`
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
    .filter((line) => !line.trim().startsWith("Shell cwd was reset to "))
    .join("\n")
    .trim()
}

function opRendersDiff(op: MessageOp): boolean {
  if (op.kind !== "tool") return false
  if (op.toolCall.name === "apply_patch") {
    return typeof op.toolCall.input === "string" && op.toolCall.input.startsWith("*** Begin Patch")
  }
  const input = op.toolCall.input
  return !!(
    input &&
    typeof input === "object" &&
    typeof (input as Record<string, unknown>).old_string === "string" &&
    typeof (input as Record<string, unknown>).new_string === "string"
  )
}

function opsRenderDiff(ops: readonly MessageOp[]): boolean {
  return ops.some(opRendersDiff)
}

/**
 * Adapt a legacy `MessageEntry` tool-call entry to the ACP `ToolCall` shape
 * consumed by `<ToolCall>`. The tool result (if any) is folded into the
 * `content` array so `<ToolCall>` renders both in a single block body.
 */
function adaptToolCall(
  c: { id: string; name: string; input: unknown; mcp_server?: string },
  result: { output: unknown; is_error?: boolean } | undefined,
  running: boolean,
): ToolCallType {
  const kind = toolKindFromName(c.name, c.input)
  const status: ToolCallStatus = running ? "in_progress" : result?.is_error ? "failed" : "completed"
  let title = toolTitle(c.name, c.input)
  title = agentLifecycleTitle(c.name, title, status)

  // AskUserQuestion replay: surface the question + options instead of the
  // bare `Answer questions?` cancellation sentinel. The agent never returns
  // a structured success result for AskUserQuestion in transcript replay —
  // it's either pending (live, handled by InlineAskUserQuestionPrompt) or
  // cancelled (`is_error: true`, output text "Answer questions?"). This
  // branch returns early so the generic title-from-input/result-collapse
  // logic below doesn't overwrite the question framing.
  if (c.name === "AskUserQuestion") {
    return adaptAskUserQuestion(c, result, status)
  }

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
  const inlineTitle = singleLineGenericToolContentTitle(c.name, title, content)
  const inlineAgentResult =
    (c.name === "Agent" || c.name === "Task") && status === "completed" ? singleLineTextToolContent(content) : null
  if (inlineAgentResult) {
    title = `Agent completed - ${inlineAgentResult}`
    content = undefined
  } else if (inlineTitle) {
    title = inlineTitle
    content = undefined
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
// AskUserQuestion (Claude Code) — historical transcript replay
//
// Live-session interactive picker is owned by `<InlineAskUserQuestionPrompt>`;
// this path renders the *replayed* transcript view: the agent asked X, the
// user either answered or cancelled. The cancellation sentinel
// (`output === "Answer questions?"`, `is_error: true`) is what Claude Code
// emits when the picker is dismissed — surface it as "(cancelled)" rather
// than letting the failed tool envelope render the bare error string.
// =============================================================================

const ASK_USER_QUESTION_CANCEL_SENTINEL = "Answer questions?"

type AskUserQuestionOption = { label?: string; description?: string }
type AskUserQuestionEntry = {
  question?: string
  header?: string
  multiSelect?: boolean
  options?: AskUserQuestionOption[]
}

function extractAskUserQuestionEntries(input: unknown): AskUserQuestionEntry[] {
  if (!input || typeof input !== "object") return []
  const raw = (input as Record<string, unknown>).questions
  if (!Array.isArray(raw)) return []
  const entries: AskUserQuestionEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    const optionsRaw = Array.isArray(o.options) ? o.options : []
    const options: AskUserQuestionOption[] = []
    for (const opt of optionsRaw) {
      if (!opt || typeof opt !== "object") continue
      const oo = opt as Record<string, unknown>
      options.push({
        label: typeof oo.label === "string" ? oo.label : undefined,
        description: typeof oo.description === "string" ? oo.description : undefined,
      })
    }
    entries.push({
      question: typeof o.question === "string" ? o.question : undefined,
      header: typeof o.header === "string" ? o.header : undefined,
      multiSelect: typeof o.multiSelect === "boolean" ? o.multiSelect : undefined,
      options,
    })
  }
  return entries
}

function isAskUserQuestionCancellation(result: { output: unknown; is_error?: boolean } | undefined): boolean {
  if (!result?.is_error) return false
  const out = result.output
  if (typeof out === "string") return out.trim() === ASK_USER_QUESTION_CANCEL_SENTINEL
  if (out && typeof out === "object") {
    const content = (out as Record<string, unknown>).content
    if (typeof content === "string" && content.trim() === ASK_USER_QUESTION_CANCEL_SENTINEL) return true
  }
  return false
}

function askUserQuestionTitle(entries: AskUserQuestionEntry[], cancelled: boolean): string {
  const first = entries[0]
  const headline = first?.question?.trim() ?? first?.header?.trim() ?? ""
  const more = entries.length > 1 ? ` (+${entries.length - 1} more)` : ""
  const verb = cancelled ? "Asked (cancelled)" : "Asked"
  if (headline.length === 0) return cancelled ? "Asked (cancelled)" : "Asked"
  return `${verb}: "${headline}"${more}`
}

function askUserQuestionBody(entries: AskUserQuestionEntry[]): ToolCallContent[] | undefined {
  if (entries.length === 0) return undefined
  const lines: string[] = []
  entries.forEach((entry, idx) => {
    if (idx > 0) lines.push("")
    const q = entry.question?.trim() ?? ""
    if (q.length > 0) lines.push(q)
    const opts = entry.options ?? []
    for (const opt of opts) {
      const label = opt.label?.trim() ?? ""
      const desc = opt.description?.trim() ?? ""
      if (label.length === 0 && desc.length === 0) continue
      const labelPart = label.length > 0 ? label : "(option)"
      const descPart = desc.length > 0 ? ` — ${desc}` : ""
      lines.push(`  • ${labelPart}${descPart}`)
    }
  })
  if (lines.length === 0) return undefined
  return [
    {
      type: "content",
      content: { type: "text", text: lines.join("\n") },
    },
  ]
}

function adaptAskUserQuestion(
  c: { id: string; name: string; input: unknown; mcp_server?: string },
  result: { output: unknown; is_error?: boolean } | undefined,
  status: ToolCallStatus,
): ToolCallType {
  const entries = extractAskUserQuestionEntries(c.input)
  const cancelled = isAskUserQuestionCancellation(result)
  const title = askUserQuestionTitle(entries, cancelled)
  const content = askUserQuestionBody(entries)
  // Cancellation is encoded in the title ("Asked (cancelled): ..."). Keep
  // the lifecycle as "completed" so <ToolCall> doesn't render its red error
  // envelope on top of the cancellation marker — that would render the bare
  // "Answer questions?" string and undo the framing this branch installed.
  const finalStatus: ToolCallStatus = cancelled ? "completed" : status
  return {
    toolCallId: c.id as ToolCallId,
    title,
    kind: "other",
    status: finalStatus,
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
    <SessionEntry marker="•" markerColor="$info">
      <Text color="$info" wrap="wrap">
        {text}
      </Text>
    </SessionEntry>
  )
}

function isRecapSystemText(text: string): boolean {
  return text === "RECAP" || text.startsWith("RECAP ·") || text.startsWith("<recap:")
}

function recapDisplayText(text: string): string {
  if (!text.startsWith("<recap:")) return text
  return `RECAP · ${text
    .replace(/^<recap:\s*/, "")
    .replace(/>\s*$/, "")
    .trim()}`
}

function RecapSystemRow({ text }: { text: string }): React.ReactElement {
  return (
    <SessionEntry marker=" " markerColor="$muted" width="100%">
      <Text color="$muted" italic wrap="wrap">
        {recapDisplayText(text)}
      </Text>
    </SessionEntry>
  )
}

function ExpandableSystemRow({
  text,
  details,
  onDisclosureToggle,
}: {
  text: string
  details: string
  onDisclosureToggle?: () => void
}): React.ReactElement {
  return (
    <EntryDisclosure popover={null} onExpandedChange={() => onDisclosureToggle?.()}>
      {({ surfaceProps, isHovered, expanded }) => (
        <Box
          {...surfaceProps}
          flexDirection="column"
          minWidth={0}
          backgroundColor={isHovered ? "$bg-surface-hover" : undefined}
        >
          <SessionEntry
            marker={
              <Text color="$info" {...surfaceProps}>
                {expanded ? "▾" : "▸"}
              </Text>
            }
            markerColor="$info"
          >
            <Box flexDirection="column" minWidth={0}>
              <Text color="$info" wrap="wrap" {...surfaceProps}>
                {text}
              </Text>
              {expanded ? (
                <Box flexDirection="column" paddingTop={1} minWidth={0}>
                  <BoundedScroll>
                    <Text color="$muted" wrap="wrap">
                      {details}
                    </Text>
                  </BoundedScroll>
                </Box>
              ) : null}
            </Box>
          </SessionEntry>
        </Box>
      )}
    </EntryDisclosure>
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

function hasTableMarkdownBlock(text: string): boolean {
  return parseBlocks(text).some((block) => block.kind === "table")
}

function isVisibleTurnOp(op: MessageOp | undefined): boolean {
  if (!op) return false
  return op.kind !== "text" || isVisibleAssistantText(op.text)
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

function compactDebugPayload(value: unknown): unknown | null {
  if (value === null || value === undefined) return null
  if (typeof value === "string") return value.trim().length > 0 ? value : null
  if (typeof value !== "object") return value
  if (Array.isArray(value)) {
    const items = value.flatMap((item) => {
      const compact = compactDebugPayload(item)
      return compact === null ? [] : [compact]
    })
    return items.length > 0 ? items : null
  }

  const input = value as Record<string, unknown>
  if (
    typeof input.kind === "string" &&
    (input.kind === "text" || input.kind === "thinking") &&
    typeof input.text === "string" &&
    Object.keys(input).every((key) => key === "kind" || key === "text")
  ) {
    return null
  }

  const entries = Object.entries(input).flatMap(([key, entry]) => {
    if (key === "ops") return []
    if (key === "text" && "raw" in input) return []
    const compact = compactDebugPayload(entry)
    return compact === null ? [] : ([[key, compact]] as Array<[string, unknown]>)
  })
  return entries.length > 0 ? Object.fromEntries(entries) : null
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

function useCmdHoverArmed(isHovered: boolean, enabled = true): boolean {
  const selection = useSelection()
  const selectionActive = !!selection?.range || !!selection?.selecting
  const armed = enabled && isHovered && !selectionActive
  const modifierState = useModifierKeys({ enabled: armed })
  return armed && modifierState.super
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
  return (
    <Box flexDirection="row" width="100%" minWidth={0}>
      <Box width={1} flexShrink={0}>
        <Text> </Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
        <Divider title={title} width={width} color="$border-default" titleColor="$fg-muted" titleBold={false} />
      </Box>
      <Box width={1} flexShrink={0}>
        <Text> </Text>
      </Box>
    </Box>
  )
}

function SessionMetadataRow({ data }: { data: SessionMetadataRowData }): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const hover = useHover()
  const cmdHeld = useCmdHoverArmed(hover.isHovered)
  const content = useContentLayout()
  const marker = expanded ? "▾" : hover.isHovered || data.kind === "loaded" ? "▸" : " "
  const bg = hover.isHovered ? "$bg-surface-hover" : undefined
  const isDivider = data.kind === "loaded"
  const headerMaxWidth = Math.max(1, content.measure)
  const dividerWidth = Math.max(1, content.wide - 2)
  const showTimestamp = hover.isHovered && cmdHeld
  const label = [data.title, ...data.parts].join(" · ")
  const dividerLabel = isDivider ? `${marker} ${label}` : label
  const titleWidth = data.title.length + data.parts.reduce((sum, part) => sum + part.length + 3, 0)
  const trailingFill = " ".repeat(Math.max(1, headerMaxWidth - 2 - titleWidth))
  const header = isDivider ? (
    <MutedDivider title={dividerLabel} width={dividerWidth} />
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
            maxWidth={isDivider ? "100%" : headerMaxWidth}
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

function sessionMetadataItems(metadata: SessionHistoryMetadata | undefined): {
  start?: SessionMetadataItem
  loaded?: SessionMetadataItem
  ended?: SessionMetadataItem
} {
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
            parts: [
              metadata.replayMessageCount !== undefined ? `${metadata.replayMessageCount} entries` : undefined,
            ].filter((p): p is string => !!p),
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
  const cmdHeld = useCmdHoverArmed(hover.isHovered, side === "left")
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
            <Content.Aside side="left" show={showTimestamp}>
              {timestamp}
            </Content.Aside>
          </Content.Left>
        ) : null}
        {width === "wide" ? (
          <Content.Body width="wide">{children}</Content.Body>
        ) : (
          <Content.Prose>{children}</Content.Prose>
        )}
        {side === "right" ? (
          <Content.Right>
            <Content.Aside side="right" show={showTimestamp} paddingTop={1}>
              {timestamp}
            </Content.Aside>
          </Content.Right>
        ) : null}
      </Content.Row>
    </Box>
  )
}
/**
 * RawInspector — transcript-entry detail view. Cmd-hover shows the complete
 * YAML payload behind the visible row so parser/debug metadata never has to
 * masquerade as user-facing prose just to remain inspectable.
 *
 * Bead: km-silvercode.raw-entry-inspector.
 */
function RawInspector({ payload, children }: { payload: unknown; children: React.ReactNode }): React.ReactElement {
  const debugPayload = useMemo(() => compactDebugPayload(payload), [payload])
  // Always compute a valid PopoverContent (the hook requires non-null).
  const popoverContent = useMemo(() => {
    // Pretty-print: when a string value contains newlines, render the body
    // as an indented block under the key (no JSON escapes, no surrounding
    // quotes) so tool output / commands read like the actual text. Trades
    // strict JSON validity for human readability — the popover is for
    // eyeballing, not parsing.
    const yaml = prettyYamlForDebug(debugPayload)
    const allLines = yaml.split("\n")
    const displayYaml =
      allLines.length > 60 ? [...allLines.slice(0, 60), `# ... (${allLines.length - 60} more lines)`].join("\n") : yaml
    const timestamp = timestampFromPayload(debugPayload)
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
          <SyntaxHighlighter language="yaml" code={displayYaml} bare />
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
  }, [debugPayload])
  const handlers = usePopoverHandlers(popoverContent)
  if (debugPayload === null) return <>{children}</>
  return (
    <Box onMouseEnter={handlers.onMouseEnter} onMouseLeave={handlers.onMouseLeave}>
      {children}
    </Box>
  )
}

function isHighContentToolRun(run: Array<{ op: MessageOp; index: number }>): boolean {
  const toolOps = run.filter(({ op }) => op.kind === "tool")
  if (toolOps.length <= 1) return false
  const resultCount = toolOps.filter(({ op }) => op.kind === "tool" && op.result !== undefined).length
  if (resultCount >= 2) return true
  return toolOps.some(({ op }) => op.kind === "tool" && op.result?.is_error === true)
}

function turnActivityItemForSpan(span: ChatActivitySpan): TurnActivitySummaryItem | null {
  if (span.kind !== "tool" || span.op.kind !== "tool") return null
  const op = span.op
  const adaptedCall = adaptToolCall(op.toolCall, op.result, span.status === "running")
  return {
    id: op.toolCall.id,
    span,
    toolCall: adaptedCall,
    errorMessage: op.result?.is_error ? toolErrorMessage(op.result.output, adaptedCall.title) : undefined,
  }
}

function ActivityDetails({
  ops,
  onDisclosureToggle,
}: {
  ops: readonly MessageOp[]
  onDisclosureToggle?: () => void
}): React.ReactElement {
  return (
    <Box flexDirection="column" gap={0}>
      {ops.map((op, index) => {
        if (op.kind === "thinking") {
          if (op.text.length === 0) return null
          return (
            <StandaloneProseFrame
              key={`thinking-${index}`}
              paddingBefore={hasVisibleTurnOpBefore(ops, index)}
              paddingAfter={hasVisibleTurnOpAfter(ops, index)}
            >
              <Chat.Turn.Narration text={op.text} muted />
            </StandaloneProseFrame>
          )
        }
        if (op.kind === "text") {
          if (op.text.length === 0) return null
          return (
            <StandaloneProseFrame
              key={`text-${index}`}
              paddingBefore={hasVisibleTurnOpBefore(ops, index)}
              paddingAfter={hasVisibleTurnOpAfter(ops, index)}
            >
              <Chat.Turn.Narration text={op.text} />
            </StandaloneProseFrame>
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
          <ToolCall
            key={op.toolCall.id}
            toolCall={adaptedCall}
            errorMessage={op.result?.is_error ? toolErrorMessage(op.result.output, adaptedCall.title) : undefined}
            titleWrap="wrap"
            onExpandedChange={() => onDisclosureToggle?.()}
          />
        )
      })}
    </Box>
  )
}

function ActivityLivePreview({ spans }: { spans: readonly ChatActivitySpan[] }): React.ReactElement | null {
  const currentSpan = latestRunningActivitySpan(spans)
  const currentTool = currentSpan?.kind === "tool" && currentSpan.op.kind === "tool" ? currentSpan.op : null
  const thinking = spans.filter((span) => span.kind === "reasoning" && span.op.kind === "thinking")
  if (!currentTool && thinking.length === 0) return null
  return (
    <Box flexDirection="column" gap={0}>
      {currentTool ? (
        <ToolCall
          key={currentTool.toolCall.id}
          toolCall={adaptToolCall(currentTool.toolCall, currentTool.result, true)}
          interactive={false}
        />
      ) : null}
      {thinking.map((span) => {
        if (span.op.kind !== "thinking") return null
        return <Chat.Turn.Narration key={span.id} text={span.op.text} muted />
      })}
    </Box>
  )
}

function ActivitySummaryForOps({
  ops,
  timestamp,
  onDisclosureToggle,
  onExpandedChange,
}: {
  ops: readonly MessageOp[]
  timestamp?: string
  onDisclosureToggle?: () => void
  onExpandedChange?: (expanded: boolean) => void
}): React.ReactElement {
  const displayOps = normalizeCommandSessionOps(ops)
  const spans = activitySpansFromOps(displayOps)
  const items = spans.flatMap((span) => turnActivityItemForSpan(span) ?? [])
  return (
    <Chat.Turn.Activity
      items={items}
      timestamp={timestamp}
      details={<ActivityDetails ops={displayOps} onDisclosureToggle={onDisclosureToggle} />}
      livePreview={<ActivityLivePreview spans={spans} />}
      width={opsRenderDiff(displayOps) ? "auto" : "prose"}
      onDisclosureToggle={onDisclosureToggle}
      onExpandedChange={onExpandedChange}
    />
  )
}

type IndexedMessageOp = { op: MessageOp; index: number }

function coalescedTextChunks(runOps: readonly IndexedMessageOp[]): Array<{ text: string; firstIndex: number }> {
  const chunks: Array<{ text: string; firstIndex: number }> = []
  let current = ""
  let firstIndex: number | null = null

  const flush = (): void => {
    if (firstIndex !== null && current.trim().length > 0) chunks.push({ text: current, firstIndex })
    current = ""
    firstIndex = null
  }

  for (const { op, index } of runOps) {
    if (op.kind !== "text") continue
    const trimmed = op.text.trim()
    if (/^[.。]+$/.test(trimmed) && op.text.includes("\n")) continue
    if (firstIndex === null && trimmed.length === 0) continue
    if (textNeedsStandaloneSpacing(op.text) && /[.!?]$/.test(current.trim())) flush()
    firstIndex ??= index
    current += op.text
  }
  flush()
  return chunks
}

function syntheticLiveToolOps(status: ActivityStatus, inFlightTool: string | null): MessageOp[] | null {
  if (status !== "tool-running" || !inFlightTool) return null
  return [
    {
      kind: "tool",
      toolCall: {
        id: "__activity-inflight-tool" as never,
        name: inFlightTool,
        input: {},
      },
      ts: Date.now(),
    },
  ]
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
  const [highVolumeExpanded, setHighVolumeExpanded] = useState(false)
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
        <Chat.Turn.Prompt text={m.text} additionalContext={m.additionalContext} showDebug={showDebug} />
      </TimestampedRow>
    )
  }
  if (m.role === "system") {
    const details = m.additionalContext ?? ""
    const isRecap = isRecapSystemText(m.text)
    if (isRecap) {
      return (
        <RawInspector payload={m.additionalContext ? { text: m.text, raw: m.additionalContext } : m}>
          <TimestampedRow timestamp={formatTime(m.ts)} side="left">
            <Chat.Notification>
              <RecapSystemRow text={m.text} />
            </Chat.Notification>
          </TimestampedRow>
        </RawInspector>
      )
    }
    const isCompactSummary = m.text === "Compact summary" && details.length > 0
    if (isCompactSummary) {
      return (
        <TimestampedRow timestamp={formatTime(m.ts)} side="left">
          <Chat.Notification>
            <ExpandableSystemRow text={m.text} details={details} onDisclosureToggle={onDisclosureToggle} />
          </Chat.Notification>
        </TimestampedRow>
      )
    }
    return (
      <RawInspector payload={m.additionalContext ? { text: m.text, raw: m.additionalContext } : m}>
        <TimestampedRow timestamp={formatTime(m.ts)} side="left">
          <Chat.Notification>
            <BackgroundSystemRow text={m.text} />
          </Chat.Notification>
        </TimestampedRow>
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
  const displayOps = normalizeCommandSessionOps(m.ops)
  type OpRun = { kind: MessageOp["kind"]; ops: Array<{ op: (typeof m.ops)[number]; index: number }> }
  const runs: OpRun[] = []
  displayOps.forEach((op, i) => {
    const k = op.kind
    const tail = runs[runs.length - 1]
    if (tail && tail.kind === k) {
      tail.ops.push({ op, index: i })
    } else {
      runs.push({ kind: k, ops: [{ op, index: i }] })
    }
  })
  const toolOpCount = displayOps.reduce((count, op) => count + (op.kind === "tool" ? 1 : 0), 0)
  if (toolOpCount > 8) {
    return (
      <Chat.Turn.Root>
        <Chat.Turn.Segment>
          <ActivitySummaryForOps
            ops={displayOps}
            timestamp={formatTime(m.ts)}
            onDisclosureToggle={onDisclosureToggle}
            onExpandedChange={setHighVolumeExpanded}
          />
        </Chat.Turn.Segment>
        {!highVolumeExpanded
          ? runs.map((run, runIdx) => {
              if (run.kind === "tool") return null
              if (run.kind === "text") {
                const chunks = coalescedTextChunks(run.ops)
                return chunks.map((chunk) => {
                  const standalone = textNeedsStandaloneSpacing(chunk.text)
                  return (
                    <Chat.Turn.Segment key={`text-${chunk.firstIndex}`}>
                      <StandaloneProseFrame
                        paddingBefore={standalone && hasVisibleTurnOpBefore(displayOps, chunk.firstIndex)}
                        paddingAfter={standalone && hasVisibleTurnOpAfter(displayOps, chunk.firstIndex)}
                      >
                        <TimestampedRow
                          timestamp={formatTime(m.ts)}
                          side="left"
                          width={hasTableMarkdownBlock(chunk.text) ? "wide" : "prose"}
                        >
                          <Chat.Turn.Narration text={chunk.text} />
                        </TimestampedRow>
                      </StandaloneProseFrame>
                    </Chat.Turn.Segment>
                  )
                })
              }
              if (run.kind === "thinking") {
                const text = run.ops.flatMap(({ op }) => (op.kind === "thinking" ? [op.text] : [])).join("")
                if (text.length === 0) return null
                const firstIndex = run.ops[0]?.index ?? runIdx
                return (
                  <Chat.Turn.Segment key={`thinking-${firstIndex}`}>
                    <TimestampedRow timestamp={formatTime(m.ts)} side="left">
                      <Chat.Turn.Narration text={text} muted />
                    </TimestampedRow>
                  </Chat.Turn.Segment>
                )
              }
              return run.ops.map(({ op, index }) => {
                if (op.kind === "raw") {
                  return (
                    <Chat.Turn.Segment key={`raw-${index}`}>
                      <RawInspector payload={op.raw}>
                        <TimestampedRow timestamp={formatTime(m.ts)} side="left">
                          <RawRow label={op.label} />
                        </TimestampedRow>
                      </RawInspector>
                    </Chat.Turn.Segment>
                  )
                }
                return null
              })
            })
          : null}
      </Chat.Turn.Root>
    )
  }

  return (
    <Chat.Turn.Root>
      {runs.map((run, runIdx) => (
        // gap=0 inside a run → consecutive tool calls (or coalesced text
        // ops) render contiguously. The outer `gap={1}` only applies
        // BETWEEN runs.
        <Chat.Turn.Segment key={runIdx}>
          {run.kind === "tool" && isHighContentToolRun(run.ops) ? (
            <ActivitySummaryForOps
              ops={run.ops.map(({ op }) => op)}
              timestamp={formatTime(m.ts)}
              onDisclosureToggle={onDisclosureToggle}
            />
          ) : run.kind === "tool" ? (
            <Chat.Turn.ToolGroup>
              {run.ops.map(({ op }) => {
                if (op.kind !== "tool") return null
                const c = op.toolCall
                const result = op.result
                const running = result === undefined
                const adaptedCall = adaptToolCall(c, result, running)
                return (
                  <TimestampedRow
                    key={c.id}
                    timestamp={formatTime(m.ts)}
                    side="left"
                    width={opRendersDiff(op) ? "wide" : "prose"}
                  >
                    <ToolCall
                      toolCall={adaptedCall}
                      errorMessage={result?.is_error ? toolErrorMessage(result.output, adaptedCall.title) : undefined}
                      onExpandedChange={() => onDisclosureToggle?.()}
                    />
                  </TimestampedRow>
                )
              })}
            </Chat.Turn.ToolGroup>
          ) : run.kind === "text" ? (
            (() => {
              const chunks = coalescedTextChunks(run.ops)
              return chunks.map((chunk) => {
                const standalone = textNeedsStandaloneSpacing(chunk.text)
                return (
                  <StandaloneProseFrame
                    key={`text-${chunk.firstIndex}`}
                    paddingBefore={standalone && hasVisibleTurnOpBefore(displayOps, chunk.firstIndex)}
                    paddingAfter={standalone && hasVisibleTurnOpAfter(displayOps, chunk.firstIndex)}
                  >
                    <TimestampedRow
                      timestamp={formatTime(m.ts)}
                      side="left"
                      width={hasTableMarkdownBlock(chunk.text) ? "wide" : "prose"}
                    >
                      <Chat.Turn.Narration text={chunk.text} />
                    </TimestampedRow>
                  </StandaloneProseFrame>
                )
              })
            })()
          ) : run.kind === "thinking" ? (
            (() => {
              const text = run.ops.flatMap(({ op }) => (op.kind === "thinking" ? [op.text] : [])).join("")
              if (text.length === 0) return null
              const firstIndex = run.ops[0]?.index ?? 0
              return (
                <TimestampedRow key={`thinking-${firstIndex}`} timestamp={formatTime(m.ts)} side="left">
                  <Chat.Turn.Narration text={text} muted />
                </TimestampedRow>
              )
            })()
          ) : (
            run.ops.map(({ op, index }) => {
              if (op.kind === "raw") {
                return (
                  <RawInspector key={`raw-${index}`} payload={op.raw}>
                    <TimestampedRow timestamp={formatTime(m.ts)} side="left">
                      <RawRow label={op.label} />
                    </TimestampedRow>
                  </RawInspector>
                )
              }
              return null
            })
          )}
        </Chat.Turn.Segment>
      ))}
      {m.stopReason === "interrupted" ? (
        <Chat.Turn.Summary>
          <TimestampedRow timestamp={formatTime(m.ts)} side="left">
            <InterruptedRow />
          </TimestampedRow>
        </Chat.Turn.Summary>
      ) : null}
    </Chat.Turn.Root>
  )
}

// =============================================================================
// Sentinel types for the activity tail and notification observation rows
// =============================================================================

type ActivityItem = { __activity: true }
type NotificationItem = { __notification: true; entries: NotificationStreamEntry[] }
type AssistantActivitySlice = { __assistantActivity: true; id: string; message: MessageEntry; ops: MessageOp[] }
type SessionMetadataItem = { __sessionMetadata: true; id: string; data: SessionMetadataRowData }
type PaddingItem = { __padding: true; id: string; height: number }
type Item = MessageEntry | ActivityItem | NotificationItem | AssistantActivitySlice | SessionMetadataItem | PaddingItem
type SimilarGroupKind = "user" | "system" | "notification" | "assistant-tool-activity"
type GroupedItem = { __group: true; kind: SimilarGroupKind; items: Item[] }
type RenderItem = Item | GroupedItem

function isActivity(item: Item): item is ActivityItem {
  return (item as ActivityItem).__activity === true
}

function isNotification(item: Item): item is NotificationItem {
  return (item as NotificationItem).__notification === true
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
  return (
    !isActivity(item) &&
    !isNotification(item) &&
    !isSessionMetadata(item) &&
    !isPadding(item) &&
    !isAssistantActivitySlice(item)
  )
}

function splitAssistantToolActivity(item: Item): Item[] {
  if (
    isActivity(item) ||
    isNotification(item) ||
    isSessionMetadata(item) ||
    isPadding(item) ||
    isAssistantActivitySlice(item) ||
    item.role !== "assistant"
  ) {
    return [item]
  }
  return splitAssistantMessageForTranscript(item).map(
    (slice): Item =>
      slice.kind === "activity"
        ? { __assistantActivity: true, id: slice.id, message: slice.message, ops: slice.ops }
        : slice.message,
  )
}

function isAssistantToolActivity(item: Item): boolean {
  if (isAssistantActivitySlice(item)) return true
  if (
    isActivity(item) ||
    isNotification(item) ||
    isSessionMetadata(item) ||
    isPadding(item) ||
    item.role !== "assistant"
  ) {
    return false
  }
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
  if (isNotification(item)) return "notification"
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
  if (isNotification(item)) return `notification-cluster:${item.entries[0]?.id ?? i}`
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
      out.push({
        __padding: true,
        id: `gap:${renderItemKey(prev, out.length)}:${renderItemKey(item, out.length)}`,
        height: 1,
      })
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
  if (isNotification(prev) || isNotification(item)) return false
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
  if (isActivity(item) || isNotification(item) || isSessionMetadata(item) || isPadding(item)) return null
  if (isAssistantActivitySlice(item)) return item.message.ts
  return item.ts
}

function sourceMessageId(item: Item): string | null {
  if (!isMessageEntry(item) && !isAssistantActivitySlice(item)) return null
  const message = isAssistantActivitySlice(item) ? item.message : item
  return ((message as unknown as { __sourceMessageId?: string }).__sourceMessageId ?? String(message.id)) as string
}

function itemBlockText(item: Item): string {
  if (isActivity(item) || isNotification(item) || isSessionMetadata(item) || isPadding(item)) return ""
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

function isVisibleAssistantText(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length === 0) return false
  return !/^[.。]+$/.test(trimmed)
}

/**
 * Anchor a `MessageEntry` to its scrollback timestamp. Mirrors how
 * `ts: number` is assigned in `session-store.ts` — a millisecond epoch
 * timestamp aligned with `NotificationStreamEntry.timestamp` so the merge
 * sort interleaves correctly.
 */
function messageTimestamp(m: MessageEntry): number {
  return m.ts
}

function opTimestamp(op: MessageOp, fallback: number): number {
  return op.ts ?? fallback
}

function notificationTimestamp(entry: NotificationStreamEntry): number {
  return entry.ts ?? entry.timestamp ?? 0
}

function cloneMessageForTimeline(message: MessageEntry, ops: MessageOp[], suffix: string): MessageEntry {
  const sourceId = sourceMessageId(message) ?? String(message.id)
  const ts = ops.reduce((min, op) => Math.min(min, opTimestamp(op, message.ts)), Number.POSITIVE_INFINITY)
  const out = {
    ...message,
    id: `${sourceId}:${suffix}` as MessageEntry["id"],
    ops,
    ts: Number.isFinite(ts) ? ts : message.ts,
  } as MessageEntry
  Object.defineProperty(out, "__sourceMessageId", {
    value: sourceId,
    enumerable: false,
    configurable: true,
  })
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

/**
 * Merge messages + notification entries into one list sorted by timestamp
 * (ascending). Stable on equal timestamps: messages keep their relative
 * order, notification entries keep theirs, and a tie between a message and
 * notification resolves by source array order (messages, then notification) — so a
 * user prompt and a notification event with the same `ts` render as
 * "user, then notification." That is the conservative read: a notification
 * observation associated with the *next* turn arrived after the user
 * sent the prompt.
 *
 * Consecutive notification entries coalesce into one `NotificationItem` so the
 * outer `ListView gap={1}` separates clusters from messages but doesn't
 * insert a blank line between adjacent notification observations. A burst of
 * filewatch events therefore renders as a tight block.
 */
function interleave(messages: MessageEntry[], notification: readonly NotificationStreamEntry[]): Item[] {
  function pushNotification(out: Item[], entry: NotificationStreamEntry): void {
    const last = out[out.length - 1]
    if (last && isNotification(last)) {
      last.entries.push(entry)
      return
    }
    out.push({ __notification: true, entries: [entry] })
  }
  function flushAssistantOps(out: Item[], message: MessageEntry, ops: MessageOp[], index: number): void {
    if (ops.length === 0) return
    const part = cloneMessageForTimeline(message, ops, `notification-${index}`)
    out.push(...splitAssistantToolActivity(part))
  }
  const out: Item[] = []
  let j = 0
  for (const message of messages) {
    if (message.role === "assistant" && message.ops.length > 0) {
      const ops = normalizeCommandSessionOps(message.ops)
      let buffer: MessageOp[] = []
      let segment = 0
      for (const op of ops) {
        const ots = opTimestamp(op, message.ts)
        while (j < notification.length) {
          const entry = notification[j]
          if (!entry || notificationTimestamp(entry) >= ots) break
          flushAssistantOps(out, message, buffer, segment++)
          buffer = []
          pushNotification(out, entry)
          j++
        }
        buffer.push(op)
      }
      flushAssistantOps(out, message, buffer, segment)
      continue
    }
    const mts = messageTimestamp(message)
    while (j < notification.length) {
      const entry = notification[j]
      if (!entry || notificationTimestamp(entry) < mts) {
        if (entry) pushNotification(out, entry)
        j++
        continue
      }
      break
    }
    out.push(message)
  }
  while (j < notification.length) {
    const notificationEntry = notification[j++]
    if (notificationEntry) pushNotification(out, notificationEntry)
  }
  return out
}

function messageItems(messages: MessageEntry[]): Item[] {
  const out: Item[] = []
  for (const message of messages) {
    if (message.role === "assistant") {
      out.push(...splitAssistantToolActivity(message))
    } else {
      out.push(message)
    }
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
     * Pre-filtered notification observations (mute filter applied upstream
     * in `ChatPane`). Merged with `messages` by timestamp; rendered
     * inline as styled observation rows between turns.
     * Bead: km-silvercode.notification-inline-display.
     */
    notificationEntries?: readonly NotificationStreamEntry[]
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
    /** Overrides paddingY for the bottom edge inside scroll content. */
    paddingBottom?: number
    /** Rows reserved below the list viewport for bottom chrome such as the composer. */
    viewportBottomInset?: number
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
    notificationEntries,
    sessionMetadata,
    agentLabel = null,
    agentVersion = null,
    follow = "end",
    paddingY = 0,
    paddingTop,
    paddingBottom,
    viewportBottomInset,
  },
  ref,
): React.ReactElement {
  const [followPausedByDisclosure, setFollowPausedByDisclosure] = useState(false)
  const hasContentLayout = useHasContentLayout()
  const contentLayout = useContentLayout()
  const pauseFollowForDisclosure = useCallback(() => {
    setFollowPausedByDisclosure(true)
  }, [])
  useEffect(() => {
    setFollowPausedByDisclosure(false)
  }, [messages.length, status])

  const showActivity = status !== "idle" && status !== "ended"
  const merged =
    notificationEntries && notificationEntries.length > 0
      ? interleave(messages, notificationEntries)
      : messageItems(messages)
  const metadata = sessionMetadataItems(sessionMetadata)
  const replayMessageCount = Math.max(0, sessionMetadata?.replayMessageCount ?? 0)
  const replayBoundaryMessageId = sessionMetadata?.replayBoundaryMessageId
  const replayCompletedAt = sessionMetadata?.replayCompletedAt
  const replayLiveMessageThreshold = sessionMetadata?.spawnedAt
  const replayLiveSessionInitAt = sessionMetadata?.sessionInitAt
  const visibleItems: Item[] = []
  if (metadata.start) visibleItems.push(metadata.start)
  let seenReplayMessages = 0
  const seenReplayMessageIds = new Set<string>()
  let insertedLoadedMetadata = false
  let sawReplayItemBeforeLiveThreshold = false
  for (let index = 0; index < merged.length; index++) {
    const item = merged[index]
    if (item === undefined) continue
    const timestamp = itemTimestamp(item)
    if (metadata.loaded && !insertedLoadedMetadata && replayCompletedAt !== undefined) {
      const crossesLiveThreshold =
        timestamp !== null &&
        replayLiveMessageThreshold !== undefined &&
        timestamp >= replayLiveMessageThreshold &&
        sawReplayItemBeforeLiveThreshold
      const crossesSessionInit =
        timestamp !== null && replayLiveSessionInitAt !== undefined && timestamp >= replayLiveSessionInitAt
      const looksLive =
        timestamp !== null &&
        (replayBoundaryMessageId !== undefined
          ? crossesSessionInit || crossesLiveThreshold
          : timestamp > replayCompletedAt || crossesSessionInit || crossesLiveThreshold)
      if (looksLive) {
        visibleItems.push(metadata.loaded)
        insertedLoadedMetadata = true
      }
    }
    visibleItems.push(item)
    const sourceId = sourceMessageId(item)
    if (sourceId && !seenReplayMessageIds.has(sourceId)) {
      seenReplayMessageIds.add(sourceId)
      seenReplayMessages++
    }
    const nextItem = merged[index + 1]
    const nextSourceId = nextItem !== undefined ? sourceMessageId(nextItem) : null
    const isLastSliceForSource = sourceId === null || nextSourceId !== sourceId
    const isReplayBoundary =
      isLastSliceForSource &&
      (replayBoundaryMessageId !== undefined
        ? sourceId === replayBoundaryMessageId
        : replayCompletedAt === undefined && replayMessageCount > 0 && seenReplayMessages === replayMessageCount)
    if (metadata.loaded && !insertedLoadedMetadata && isReplayBoundary) {
      visibleItems.push(metadata.loaded)
      insertedLoadedMetadata = true
    }
    if (timestamp !== null && replayLiveMessageThreshold !== undefined && timestamp < replayLiveMessageThreshold) {
      sawReplayItemBeforeLiveThreshold = true
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
  const baseListEpoch = sessionMetadata?.replayCompletedAt ? `replay:${sessionMetadata.replayCompletedAt}` : "live"
  const listEpoch = baseListEpoch
  useEffect(() => {
    const kindOf = (item: RenderItem): string => {
      if (isGrouped(item)) return `group:${item.kind}:${item.items.length}`
      if (isPadding(item)) return `padding:${item.id}:${item.height}`
      if (isActivity(item)) return "activity"
      if (isNotification(item)) return `notification:${item.entries.length}`
      if (isSessionMetadata(item)) return "session-metadata"
      if (isAssistantActivitySlice(item)) return `assistant-activity:${item.ops.length}`
      return `message:${item.role}:${item.ops.length}`
    }
    sessionListLog.debug?.("session list shape", {
      visibleCount: visibleItems.length,
      contentCount: contentItems.length,
      itemCount: items.length,
      renderCount: renderItems.length,
      showActivity,
      status,
      follow,
      followPausedByDisclosure,
      listEpoch,
      contentAvailable: contentLayout.available,
      contentMeasure: contentLayout.measure,
      contentWide: contentLayout.wide,
      topPadding,
      bottomPadding,
      first: renderItems[0] ? kindOf(renderItems[0]) : null,
      last: ((): string | null => {
        const tail = renderItems.at(-1)
        return tail ? kindOf(tail) : null
      })(),
    })
  }, [
    bottomPadding,
    contentItems.length,
    contentLayout.available,
    contentLayout.measure,
    contentLayout.wide,
    follow,
    followPausedByDisclosure,
    items.length,
    listEpoch,
    renderItems,
    showActivity,
    status,
    topPadding,
    visibleItems.length,
  ])
  const renderPadding = (height: number): React.ReactNode => (
    <Box flexDirection="column" flexShrink={0}>
      {Array.from({ length: height }, (_, i) => (
        <Text key={i}> </Text>
      ))}
    </Box>
  )
  const activityStartupVerb = sessionMetadata?.resumeId ? "resuming" : "spawning"
  const liveActivityOps = syntheticLiveToolOps(status, inFlightTool)
  const renderSessionItem = (item: Item, _i: number): React.ReactNode =>
    isPadding(item) ? (
      renderPadding(item.height)
    ) : isActivity(item) ? (
      <RawInspector
        payload={{
          kind: "activity",
          status,
          pendingPermissions,
          inFlightTool,
          turnStartedAt,
          inputTokens,
          outputTokens,
          agentLabel,
          agentVersion,
          startupVerb: activityStartupVerb,
          activityOps: liveActivityOps,
        }}
      >
        {liveActivityOps ? (
          <ActivitySummaryForOps ops={liveActivityOps} onDisclosureToggle={pauseFollowForDisclosure} />
        ) : (
          <Chat.Body width="prose">
            <ActivityIndicator
              status={status}
              pendingPermissions={pendingPermissions}
              inFlightTool={inFlightTool}
              turnStartedAt={turnStartedAt}
              inputTokens={inputTokens}
              outputTokens={outputTokens}
              agentLabel={agentLabel}
              agentVersion={agentVersion}
              startupVerb={activityStartupVerb}
            />
          </Chat.Body>
        )}
      </RawInspector>
    ) : isNotification(item) ? (
      <RawInspector payload={{ kind: "notification", entries: item.entries }}>
        <Chat.Notification>
          <NotificationStack entries={item.entries} />
        </Chat.Notification>
      </RawInspector>
    ) : isSessionMetadata(item) ? (
      <RawInspector payload={item.data}>
        <Chat.Metadata>
          <SessionMetadataRow data={item.data} />
        </Chat.Metadata>
      </RawInspector>
    ) : isAssistantActivitySlice(item) ? (
      <RawInspector payload={{ kind: "assistant-activity", messageId: item.message.id, activityOps: item.ops }}>
        <ActivitySummaryForOps
          ops={item.ops}
          timestamp={formatTime(item.message.ts)}
          onDisclosureToggle={pauseFollowForDisclosure}
        />
      </RawInspector>
    ) : item.role === "assistant" || item.role === "system" || item.role === "user" ? (
      // Assistant turns wrap each op (text/tool) individually inside
      // ExchangeItem so the hover popover shows ONLY the hovered op,
      // not the whole turn's combined JSON. System rows may provide their
      // own disclosure surface, and user prompts have no hidden payload, so
      // do not wrap them in another RawInspector.
      <ExchangeItem m={item} showDebug={showDebug} onDisclosureToggle={pauseFollowForDisclosure} />
    ) : (
      <RawInspector payload={item}>
        <ExchangeItem m={item} showDebug={showDebug} onDisclosureToggle={pauseFollowForDisclosure} />
      </RawInspector>
    )
  const renderGroupedItem = (item: RenderItem, i: number): React.ReactNode =>
    isGrouped(item) && item.kind === "assistant-tool-activity" && item.items.length >= 2 ? (
      <RawInspector
        payload={{
          kind: "assistant-tool-activity",
          activityOps: item.items.flatMap((child) => (isAssistantActivitySlice(child) ? child.ops : [])),
        }}
      >
        <ActivitySummaryForOps
          timestamp={formatTime(item.items.flatMap((child) => itemTimestamp(child) ?? [])[0] ?? 0)}
          onDisclosureToggle={pauseFollowForDisclosure}
          ops={item.items.flatMap((child) =>
            isActivity(child) || isNotification(child) || isSessionMetadata(child)
              ? []
              : isAssistantActivitySlice(child)
                ? child.ops
                : isPadding(child)
                  ? []
                  : child.ops,
          )}
        />
      </RawInspector>
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
    return hasContentLayout ? body : <Chat.Transcript>{body}</Chat.Transcript>
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
      follow={followPausedByDisclosure ? "none" : follow}
      viewportBottomInset={viewportBottomInset}
      renderItem={renderGroupedItem}
    />
  )
  return hasContentLayout ? list : <Chat.Transcript>{list}</Chat.Transcript>
})
