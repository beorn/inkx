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
 *   - `<SubagentActivityPanel>`     — nested Task tool stream block
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
import { Box, Divider, ListView, type ListViewHandle, Text, useHover, useModifierKeys, useSelection } from "silvery"
import { ActivityIndicator, type ActivityStatus } from "./ActivityIndicator.tsx"
import { NotificationStack } from "./NotificationEventRow.tsx"
import type { ChannelNotification } from "../notification-stream.ts"
import { BoundedScroll } from "./BoundedScroll.tsx"
import { ToolCall } from "./ToolCall.tsx"
import type { ChatMessageSummaryItem } from "./ChatMessageSummary.tsx"
import { BACKGROUND_MESSAGE_PREFIX } from "../controller.ts"
import { Content, useContentLayout, useHasContentLayout } from "./Content.tsx"
import { parseBlocks } from "../markdown.ts"
import { SessionEntry } from "./SessionEntry.tsx"
import type { SessionHistoryMetadata } from "../session-metadata.ts"
import { Chat } from "./Chat.tsx"
import { BlockInteraction } from "./BlockInteraction.tsx"
import { createLogger } from "loggily"
import {
  activityRunsFromOps,
  isInstantCompletedToolName,
  latestRunningActivityRun,
  normalizeCommandSessionOps,
  type ActivityRun,
} from "../chat-model.ts"
import {
  formatTime,
  isAssistantActivitySegment,
  isChatLifecycleItem,
  isChatNotificationGroup,
  isGrouped,
  isLiveActivityTail,
  isTranscriptMessageEntry,
  isTranscriptPadding,
  itemKey,
  itemTimestamp,
  projectSessionUpdateTranscript,
  renderItemKey,
  type AssistantActivitySegment,
  type SessionMetadataRowData,
  type TranscriptItem,
  type TranscriptRenderItem,
} from "../chat/session-update-projection.ts"

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
  const structuredText = structuredTextOutput(output)
  if (structuredText !== null) {
    return [
      {
        type: "content",
        content: { type: "text", text: title ? stripCommandEcho(structuredText, title) : structuredText },
      },
    ]
  }
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

function structuredTextOutput(output: unknown): string | null {
  if (!Array.isArray(output)) return null
  const parts = output.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const o = item as Record<string, unknown>
    return o.type === "text" && typeof o.text === "string" ? [o.text] : []
  })
  return parts.length > 0 ? parts.join("\n") : null
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

function singleLineAgentResultContent(content: ToolCallContent[] | undefined): string | null {
  if (content?.length !== 1) return null
  const only = content[0]
  if (only?.type !== "content" || only.content.type !== "text") return null
  const line = only.content.text
    .split(/\r?\n/)
    .map((part) => part.trim())
    .find((part) => part.length > 0 && !part.startsWith("agentId:"))
  return line && !line.includes("\n") ? line : null
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
    const message = typeof o.message === "string" ? o.message.trim() : ""
    if (message.length > 0) return message
    const error = typeof o.error === "string" ? o.error.trim() : ""
    const details = safeStructuredToolText(o.details)
    if (error.length > 0) return details ? `${error}\n${details}` : error
    const structured = safeStructuredToolText(output)
    if (structured.length > 0) return structured
  }
  return String(output ?? "Tool call failed")
}

function safeStructuredToolText(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? ""
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return `Unable to serialize tool output: ${message}`
  }
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
  const status: ToolCallStatus =
    running && !isInstantCompletedToolName(c.name) ? "in_progress" : result?.is_error ? "failed" : "completed"
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
    (c.name === "Agent" || c.name === "Task") && status === "completed" ? singleLineAgentResultContent(content) : null
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
 * Background-job system message. Rendered when the controller surfaces a
 * background job row. Distinct treatment vs user/assistant rows so the user
 * can see "this came from background work, not from me typing."
 */
function BackgroundSystemRow({ text }: { text: string }): React.ReactElement {
  const unprefixed = text.startsWith(BACKGROUND_MESSAGE_PREFIX) ? text.slice(BACKGROUND_MESSAGE_PREFIX.length) : text
  const displayText = unprefixed.replace(/^interrupted by Esc:\s*/i, "Interrupted by Esc · ")
  return (
    <SessionEntry marker="•" markerColor="$info">
      <Text color="$info" wrap="wrap">
        {displayText}
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
  rawPayload,
  onDisclosureToggle,
}: {
  text: string
  details: string
  rawPayload?: unknown
  onDisclosureToggle?: () => void
}): React.ReactElement {
  return (
    <BlockInteraction
      raw={rawPayload}
      canExpand
      onExpandedChange={() => onDisclosureToggle?.()}
      expandedContent={
        <Box flexDirection="column" paddingTop={1} minWidth={0}>
          <BoundedScroll>
            <Text color="$muted" wrap="wrap">
              {details}
            </Text>
          </BoundedScroll>
        </Box>
      }
    >
      {({ surfaceProps, expanded }) => (
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
          </Box>
        </SessionEntry>
      )}
    </BlockInteraction>
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
function useCmdHoverArmed(isHovered: boolean, enabled = true): boolean {
  const selection = useSelection()
  const selectionActive = !!selection?.range || !!selection?.selecting
  const armed = enabled && isHovered && !selectionActive
  const modifierState = useModifierKeys({ enabled: armed })
  return armed && modifierState.super
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
  return <BlockInteraction raw={payload}>{children}</BlockInteraction>
}

function isHighContentToolRun(run: Array<{ op: MessageOp; index: number }>): boolean {
  const toolOps = run.filter(({ op }) => op.kind === "tool")
  return toolOps.length >= 3
}

function shouldSummarizeActivityOps(ops: readonly MessageOp[]): boolean {
  const toolNames = ops.flatMap((op) => (op.kind === "tool" ? [op.toolCall.name] : []))
  if (toolNames.length >= 3) return true
  return toolNames.length === 2 && toolNames[0] === toolNames[1]
}

function assistantActivitySegments(items: readonly TranscriptItem[]): AssistantActivitySegment[] {
  return items.filter(isAssistantActivitySegment)
}

function assistantActivityPayload(items: readonly TranscriptItem[]): {
  kind: "assistant-activity"
  messageId: MessageEntry["id"] | undefined
  activityOps: MessageOp[]
} {
  const segments = assistantActivitySegments(items)
  return {
    kind: "assistant-activity",
    messageId: segments[0]?.message.id,
    activityOps: segments.flatMap((segment) => segment.ops),
  }
}

function chatMessageSummaryItemForActivity(activity: ActivityRun): ChatMessageSummaryItem | null {
  if (activity.kind !== "tool" || activity.op.kind !== "tool") return null
  const op = activity.op
  const adaptedCall = adaptToolCall(op.toolCall, op.result, activity.status === "running")
  return {
    id: op.toolCall.id,
    activity,
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
              <Chat.Thought text={op.text} />
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
              <Chat.Message text={op.text} />
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
            defaultExpanded={adaptedCall.status === "failed"}
            titleWrap="wrap"
            onExpandedChange={() => onDisclosureToggle?.()}
          />
        )
      })}
    </Box>
  )
}

function InlineActivityDetails({
  ops,
  timestamp,
  onDisclosureToggle,
}: {
  ops: readonly MessageOp[]
  timestamp?: string
  onDisclosureToggle?: () => void
}): React.ReactElement {
  return (
    <Chat.Tool>
      {ops.map((op, index) => {
        if (op.kind !== "tool") {
          return <ActivityDetails key={`activity-${index}`} ops={[op]} onDisclosureToggle={onDisclosureToggle} />
        }
        const adaptedCall = adaptToolCall(op.toolCall, op.result, op.result === undefined)
        return (
          <TimestampedRow
            key={op.toolCall.id}
            timestamp={timestamp ?? ""}
            side="left"
            width={opRendersDiff(op) ? "wide" : "prose"}
          >
            <ToolCall
              toolCall={adaptedCall}
              errorMessage={op.result?.is_error ? toolErrorMessage(op.result.output, adaptedCall.title) : undefined}
              onExpandedChange={() => onDisclosureToggle?.()}
            />
          </TimestampedRow>
        )
      })}
    </Chat.Tool>
  )
}

function ActivityLivePreview({ activities }: { activities: readonly ActivityRun[] }): React.ReactElement | null {
  const currentActivity = latestRunningActivityRun(activities)
  const currentTool = currentActivity?.kind === "tool" && currentActivity.op.kind === "tool" ? currentActivity.op : null
  const thinking = activities.filter((activity) => activity.kind === "thought" && activity.op.kind === "thinking")
  if (!currentTool && thinking.length === 0) return null
  return (
    <Box flexDirection="column" gap={0}>
      {currentTool ? (
        <ToolCall
          key={currentTool.toolCall.id}
          toolCall={adaptToolCall(currentTool.toolCall, currentTool.result, true)}
          interactive={false}
          animateMarker={false}
        />
      ) : null}
      {thinking.map((activity) => {
        if (activity.op.kind !== "thinking") return null
        return <Chat.Thought key={activity.id} text={activity.op.text} />
      })}
    </Box>
  )
}

function ChatMessageSummaryForOps({
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
  const activities = activityRunsFromOps(displayOps)
  const items = activities.flatMap((activity) => chatMessageSummaryItemForActivity(activity) ?? [])
  return (
    <Chat.Activity
      items={items}
      timestamp={timestamp}
      details={<ActivityDetails ops={displayOps} onDisclosureToggle={onDisclosureToggle} />}
      livePreview={<ActivityLivePreview activities={activities} />}
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
    if (op.boundary === "semantic" && current.trim().length > 0) flush()
    firstIndex ??= index
    current += textOpBoundary(current, op.text) + op.text
    if (op.boundary === "semantic") flush()
  }
  flush()
  return chunks
}

function textOpBoundary(previous: string, next: string): string {
  void previous
  void next
  // Text ops from live streams are byte chunks, not syntax or paragraph
  // boundaries. MarkdownView parses the exact concatenated text into
  // paragraphs, links, lists, and code blocks; inferred newlines here corrupt
  // split Markdown constructs such as `[file.ts](/abs/file.ts:572)`.
  return ""
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

function currentTranscriptHasRunningToolActivity(messages: readonly MessageEntry[]): boolean {
  let lastUserIndex = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      lastUserIndex = i
      break
    }
  }
  for (const message of messages.slice(lastUserIndex + 1)) {
    if (message.role !== "assistant") continue
    for (const op of normalizeCommandSessionOps(message.ops)) {
      if (op.kind === "tool" && op.result === undefined) return true
    }
  }
  return false
}

function ExchangeItem({
  m,
  showDebug,
  onDisclosureToggle,
  suppressGenericInterruptedBanner,
}: {
  m: MessageEntry
  showDebug: boolean
  onDisclosureToggle?: () => void
  suppressGenericInterruptedBanner?: boolean
}): React.ReactElement {
  // Background-job system messages: user-role entries with a "bg-" turnId
  // prefix AND the BACKGROUND_MESSAGE_PREFIX text prefix.
  if (isBackgroundSystemMessage(m)) {
    const row = (
      <TimestampedRow timestamp={formatTime(m.ts)} side="left">
        <BackgroundSystemRow text={m.text} />
      </TimestampedRow>
    )
    return <RawInspector payload={m}>{row}</RawInspector>
  }
  if (m.role === "user") {
    const row = (
      <TimestampedRow timestamp={formatTime(m.ts)} side="right">
        <Chat.Prompt text={m.text} additionalContext={m.additionalContext} showDebug={showDebug} />
      </TimestampedRow>
    )
    return m.additionalContext ? (
      <RawInspector payload={{ text: m.text, raw: m.additionalContext }}>{row}</RawInspector>
    ) : (
      row
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
            <ExpandableSystemRow
              text={m.text}
              details={details}
              rawPayload={{ text: m.text, raw: details }}
              onDisclosureToggle={onDisclosureToggle}
            />
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
  return (
    <Chat.MessageGroup>
      {runs.map((run, runIdx) => (
        // gap=0 inside a run → consecutive tool calls (or coalesced text
        // ops) render contiguously. The outer `gap={1}` only applies
        // BETWEEN runs.
        <Chat.Block key={runIdx}>
          {run.kind === "tool" && isHighContentToolRun(run.ops) ? (
            <ChatMessageSummaryForOps
              ops={run.ops.map(({ op }) => op)}
              timestamp={formatTime(m.ts)}
              onDisclosureToggle={onDisclosureToggle}
            />
          ) : run.kind === "tool" ? (
            <Chat.Tool>
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
            </Chat.Tool>
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
                      <Chat.Message text={chunk.text} />
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
                  <Chat.Thought text={text} />
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
        </Chat.Block>
      ))}
      {m.stopReason === "interrupted" && !suppressGenericInterruptedBanner ? (
        <Chat.Summary>
          <TimestampedRow timestamp={formatTime(m.ts)} side="left">
            <InterruptedRow />
          </TimestampedRow>
        </Chat.Summary>
      ) : null}
    </Chat.MessageGroup>
  )
}

function isBackgroundSystemMessage(m: MessageEntry): boolean {
  const id = m.id as string
  return (
    m.role === "user" && (id.startsWith("bg-") || id.startsWith("int-")) && m.text.startsWith(BACKGROUND_MESSAGE_PREFIX)
  )
}

function isEscInterruptSystemMessage(m: MessageEntry): boolean {
  return (
    isBackgroundSystemMessage(m) &&
    m.text.slice(BACKGROUND_MESSAGE_PREFIX.length).trimStart().startsWith("interrupted by Esc:")
  )
}

function textNeedsStandaloneSpacing(text: string): boolean {
  return /\n[ \t]*\n/.test(text)
}

function isVisibleAssistantText(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length === 0) return false
  return !/^[.。]+$/.test(trimmed)
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
    notificationEntries?: readonly ChannelNotification[]
    sessionMetadata?: SessionHistoryMetadata
    /** Display name for the running agent. Forwarded to the inline
     *  ActivityIndicator so the spawning-state label can read
     *  "Spawning Claude Code v<version>…". Bead: km-cr94. */
    agentLabel?: string | null
    /** CLI version string from session-init (e.g. "2.1.119"). Forwarded
     *  to ActivityIndicator. `null` until session-init resolves. */
    agentVersion?: string | null
    /** Chat panes follow the latest turn; natural-height story previews can disable ListView. */
    follow?: "end" | "none" | false
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

  const showActivity =
    status !== "idle" &&
    status !== "ended" &&
    !(status === "tool-running" && currentTranscriptHasRunningToolActivity(messages))
  const hasEscInterruptSystemMessage = messages.some(isEscInterruptSystemMessage)
  const { visibleItems, contentItems, items, renderItems, topPadding, bottomPadding, listEpoch } = useMemo(
    () =>
      projectSessionUpdateTranscript({
        messages,
        notificationEntries,
        sessionMetadata,
        showActivity,
        paddingY,
        paddingTop,
        paddingBottom,
        isBackgroundSystemMessage,
      }),
    [messages, notificationEntries, paddingBottom, paddingTop, paddingY, sessionMetadata, showActivity],
  )
  useEffect(() => {
    const kindOf = (item: TranscriptRenderItem): string => {
      if (isGrouped(item)) return `group:${item.kind}:${item.items.length}`
      if (isTranscriptPadding(item)) return `padding:${item.id}:${item.height}`
      if (isLiveActivityTail(item)) return "activity"
      if (isChatNotificationGroup(item)) return `notification:${item.entries.length}`
      if (isChatLifecycleItem(item)) return "session-metadata"
      if (isAssistantActivitySegment(item)) return `assistant-activity:${item.ops.length}`
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
  const renderSessionItem = (item: TranscriptItem, _i: number): React.ReactNode =>
    isTranscriptPadding(item) ? (
      renderPadding(item.height)
    ) : isLiveActivityTail(item) ? (
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
          <ChatMessageSummaryForOps ops={liveActivityOps} onDisclosureToggle={pauseFollowForDisclosure} />
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
    ) : isChatNotificationGroup(item) ? (
      <Chat.Notification>
        <NotificationStack entries={item.entries} />
      </Chat.Notification>
    ) : isChatLifecycleItem(item) ? (
      <RawInspector payload={item.data}>
        <Chat.Metadata>
          <SessionMetadataRow data={item.data} />
        </Chat.Metadata>
      </RawInspector>
    ) : isAssistantActivitySegment(item) ? (
      <RawInspector payload={{ kind: "assistant-activity", messageId: item.message.id, activityOps: item.ops }}>
        {shouldSummarizeActivityOps(item.ops) ? (
          <ChatMessageSummaryForOps
            ops={item.ops}
            timestamp={formatTime(item.message.ts)}
            onDisclosureToggle={pauseFollowForDisclosure}
          />
        ) : (
          <InlineActivityDetails
            ops={item.ops}
            timestamp={formatTime(item.message.ts)}
            onDisclosureToggle={pauseFollowForDisclosure}
          />
        )}
      </RawInspector>
    ) : item.role === "assistant" || item.role === "system" || item.role === "user" ? (
      // Assistant turns wrap each op (text/tool) individually inside
      // ExchangeItem so the hover popover shows ONLY the hovered op,
      // not the whole turn's combined JSON. System/user rows provide their
      // own disclosure/raw surfaces when they have hidden payloads, so do
      // not wrap the whole exchange again here.
      <ExchangeItem
        m={item}
        showDebug={showDebug}
        onDisclosureToggle={pauseFollowForDisclosure}
        suppressGenericInterruptedBanner={hasEscInterruptSystemMessage}
      />
    ) : (
      <RawInspector payload={item}>
        <ExchangeItem
          m={item}
          showDebug={showDebug}
          onDisclosureToggle={pauseFollowForDisclosure}
          suppressGenericInterruptedBanner={hasEscInterruptSystemMessage}
        />
      </RawInspector>
    )
  const renderGroupedTranscriptItem = (item: TranscriptRenderItem, i: number): React.ReactNode =>
    isGrouped(item) &&
    item.kind === "assistant-tool-activity" &&
    shouldSummarizeActivityOps(
      item.items.flatMap((child) =>
        isLiveActivityTail(child) || isChatNotificationGroup(child) || isChatLifecycleItem(child)
          ? []
          : isAssistantActivitySegment(child)
            ? child.ops
            : isTranscriptPadding(child)
              ? []
              : child.ops,
      ),
    ) ? (
      <RawInspector payload={assistantActivityPayload(item.items)}>
        <ChatMessageSummaryForOps
          timestamp={formatTime(item.items.flatMap((child) => itemTimestamp(child) ?? [])[0] ?? 0)}
          onDisclosureToggle={pauseFollowForDisclosure}
          ops={item.items.flatMap((child) =>
            isLiveActivityTail(child) || isChatNotificationGroup(child) || isChatLifecycleItem(child)
              ? []
              : isAssistantActivitySegment(child)
                ? child.ops
                : isTranscriptPadding(child)
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
            {renderGroupedTranscriptItem(item, i)}
          </Box>
        ))}
      </Box>
    )
    return hasContentLayout ? body : <Chat.Session>{body}</Chat.Session>
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
      renderItem={renderGroupedTranscriptItem}
    />
  )
  return hasContentLayout ? list : <Chat.Session>{list}</Chat.Session>
})
