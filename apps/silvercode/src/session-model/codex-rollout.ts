import { z } from "zod"

const recordSchema = z.record(z.string(), z.unknown())

const knownTopLevelTypes = ["session_meta", "event_msg", "response_item", "turn_context", "compacted"] as const
const knownEventMsgTypes = [
  "agent_message_content_delta",
  "agent_message_delta",
  "agent_reasoning",
  "agent_reasoning_delta",
  "agent_reasoning_raw_content",
  "agent_reasoning_raw_content_delta",
  "agent_reasoning_section_break",
  "apply_patch_approval_request",
  "background_event",
  "collab_agent_interaction_begin",
  "collab_agent_interaction_end",
  "collab_agent_spawn_begin",
  "collab_agent_spawn_end",
  "collab_close_begin",
  "collab_close_end",
  "collab_resume_begin",
  "collab_resume_end",
  "collab_waiting_begin",
  "collab_waiting_end",
  "context_compacted",
  "deprecation_notice",
  "dynamic_tool_call_request",
  "dynamic_tool_call_response",
  "elicitation_request",
  "entered_review_mode",
  "error",
  "exec_approval_request",
  "exec_command_begin",
  "exec_command_end",
  "exec_command_output_delta",
  "exited_review_mode",
  "get_history_entry_response",
  "guardian_assessment",
  "hook_completed",
  "hook_started",
  "image_generation_begin",
  "image_generation_end",
  "item_completed",
  "item_started",
  "list_skills_response",
  "mcp_list_tools_response",
  "mcp_startup_complete",
  "mcp_startup_update",
  "mcp_tool_call_begin",
  "mcp_tool_call_end",
  "model_rerout",
  "model_verification",
  "patch_apply_begin",
  "patch_apply_end",
  "patch_apply_updated",
  "plan_delta",
  "plan_update",
  "raw_response_item",
  "reasoning_content_delta",
  "reasoning_raw_content_delta",
  "realtime_conversation_closed",
  "realtime_conversation_list_voices_response",
  "realtime_conversation_realtime",
  "realtime_conversation_sdp",
  "realtime_conversation_started",
  "request_user_input",
  "session_configured",
  "shutdown_complete",
  "skills_update_available",
  "stream_error",
  "task_started",
  "task_complete",
  "terminal_interaction",
  "thread_name_updated",
  "thread_rolled_back",
  "turn_diff",
  "turn_aborted",
  "undo_completed",
  "undo_started",
  "user_message",
  "agent_message",
  "token_count",
  "view_image_tool_call",
  "web_search_begin",
  "web_search_end",
  "warning",
] as const
const knownResponseItemTypes = [
  "compaction",
  "custom_tool_call",
  "custom_tool_call_output",
  "execution",
  "function_call",
  "function_call_output",
  "ghost_commit",
  "ghost_snapshot",
  "image_generation_call",
  "message",
  "other",
  "reasoning",
  "summary",
  "tool_search_output",
  "web_search_call",
] as const

export const codexEventMsgPayloadSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("agent_message_content_delta") }).passthrough(),
  z.object({ type: z.literal("agent_message_delta") }).passthrough(),
  z.object({ type: z.literal("agent_reasoning") }).passthrough(),
  z.object({ type: z.literal("agent_reasoning_delta") }).passthrough(),
  z.object({ type: z.literal("agent_reasoning_raw_content") }).passthrough(),
  z.object({ type: z.literal("agent_reasoning_raw_content_delta") }).passthrough(),
  z.object({ type: z.literal("agent_reasoning_section_break") }).passthrough(),
  z.object({ type: z.literal("apply_patch_approval_request") }).passthrough(),
  z.object({ type: z.literal("background_event") }).passthrough(),
  z.object({ type: z.literal("collab_agent_interaction_begin") }).passthrough(),
  z.object({ type: z.literal("collab_agent_interaction_end") }).passthrough(),
  z.object({ type: z.literal("collab_agent_spawn_begin") }).passthrough(),
  z.object({ type: z.literal("collab_agent_spawn_end") }).passthrough(),
  z.object({ type: z.literal("collab_close_begin") }).passthrough(),
  z.object({ type: z.literal("collab_close_end") }).passthrough(),
  z.object({ type: z.literal("collab_resume_begin") }).passthrough(),
  z.object({ type: z.literal("collab_resume_end") }).passthrough(),
  z.object({ type: z.literal("collab_waiting_begin") }).passthrough(),
  z.object({ type: z.literal("collab_waiting_end") }).passthrough(),
  z.object({ type: z.literal("context_compacted") }).passthrough(),
  z.object({ type: z.literal("deprecation_notice") }).passthrough(),
  z.object({ type: z.literal("dynamic_tool_call_request") }).passthrough(),
  z.object({ type: z.literal("dynamic_tool_call_response") }).passthrough(),
  z.object({ type: z.literal("elicitation_request") }).passthrough(),
  z.object({ type: z.literal("entered_review_mode") }).passthrough(),
  z.object({ type: z.literal("error") }).passthrough(),
  z.object({ type: z.literal("exec_approval_request") }).passthrough(),
  z.object({ type: z.literal("exec_command_begin") }).passthrough(),
  z.object({ type: z.literal("task_started"), turn_id: z.string().optional() }).passthrough(),
  z.object({ type: z.literal("task_complete"), turn_id: z.string().optional() }).passthrough(),
  z.object({ type: z.literal("turn_aborted"), turn_id: z.string().optional() }).passthrough(),
  z.object({ type: z.literal("user_message"), message: z.string().optional() }).passthrough(),
  z.object({ type: z.literal("agent_message") }).passthrough(),
  z.object({ type: z.literal("token_count") }).passthrough(),
  z
    .object({
      type: z.literal("view_image_tool_call"),
      call_id: z.string().optional(),
      path: z.string().optional(),
    })
    .passthrough(),
  z.object({ type: z.literal("web_search_begin"), call_id: z.string().optional() }).passthrough(),
  z.object({ type: z.literal("web_search_end"), call_id: z.string().optional() }).passthrough(),
  z
    .object({
      type: z.literal("exec_command_end"),
      call_id: z.string().optional(),
      parsed_cmd: z.unknown().optional(),
      aggregated_output: z.unknown().optional(),
      stdout: z.unknown().optional(),
      stderr: z.unknown().optional(),
      command: z.unknown().optional(),
      cwd: z.string().optional(),
      exit_code: z.unknown().optional(),
      status: z.unknown().optional(),
    })
    .passthrough(),
  z.object({ type: z.literal("exec_command_output_delta") }).passthrough(),
  z.object({ type: z.literal("exited_review_mode") }).passthrough(),
  z.object({ type: z.literal("get_history_entry_response") }).passthrough(),
  z.object({ type: z.literal("guardian_assessment") }).passthrough(),
  z.object({ type: z.literal("hook_completed") }).passthrough(),
  z.object({ type: z.literal("hook_started") }).passthrough(),
  z.object({ type: z.literal("image_generation_begin") }).passthrough(),
  z.object({ type: z.literal("image_generation_end") }).passthrough(),
  z.object({ type: z.literal("item_completed") }).passthrough(),
  z.object({ type: z.literal("item_started") }).passthrough(),
  z.object({ type: z.literal("list_skills_response") }).passthrough(),
  z.object({ type: z.literal("mcp_list_tools_response") }).passthrough(),
  z.object({ type: z.literal("mcp_startup_complete") }).passthrough(),
  z.object({ type: z.literal("mcp_startup_update") }).passthrough(),
  z.object({ type: z.literal("mcp_tool_call_begin") }).passthrough(),
  z.object({ type: z.literal("mcp_tool_call_end") }).passthrough(),
  z.object({ type: z.literal("model_rerout") }).passthrough(),
  z.object({ type: z.literal("model_verification") }).passthrough(),
  z.object({ type: z.literal("patch_apply_begin") }).passthrough(),
  z
    .object({
      type: z.literal("patch_apply_end"),
      call_id: z.string().optional(),
      stdout: z.unknown().optional(),
      stderr: z.unknown().optional(),
      success: z.boolean().optional(),
      changes: z.unknown().optional(),
      status: z.unknown().optional(),
    })
    .passthrough(),
  z.object({ type: z.literal("patch_apply_updated") }).passthrough(),
  z.object({ type: z.literal("plan_delta") }).passthrough(),
  z.object({ type: z.literal("plan_update") }).passthrough(),
  z.object({ type: z.literal("raw_response_item") }).passthrough(),
  z.object({ type: z.literal("reasoning_content_delta") }).passthrough(),
  z.object({ type: z.literal("reasoning_raw_content_delta") }).passthrough(),
  z.object({ type: z.literal("realtime_conversation_closed") }).passthrough(),
  z.object({ type: z.literal("realtime_conversation_list_voices_response") }).passthrough(),
  z.object({ type: z.literal("realtime_conversation_realtime") }).passthrough(),
  z.object({ type: z.literal("realtime_conversation_sdp") }).passthrough(),
  z.object({ type: z.literal("realtime_conversation_started") }).passthrough(),
  z.object({ type: z.literal("request_user_input") }).passthrough(),
  z.object({ type: z.literal("session_configured") }).passthrough(),
  z.object({ type: z.literal("shutdown_complete") }).passthrough(),
  z.object({ type: z.literal("skills_update_available") }).passthrough(),
  z.object({ type: z.literal("stream_error") }).passthrough(),
  z.object({ type: z.literal("terminal_interaction") }).passthrough(),
  z.object({ type: z.literal("thread_name_updated") }).passthrough(),
  z.object({ type: z.literal("thread_rolled_back") }).passthrough(),
  z.object({ type: z.literal("turn_diff") }).passthrough(),
  z.object({ type: z.literal("undo_completed") }).passthrough(),
  z.object({ type: z.literal("undo_started") }).passthrough(),
  z.object({ type: z.literal("warning") }).passthrough(),
])

export const codexResponseMessagePayloadSchema = z.object({
  type: z.literal("message"),
  role: z.enum(["assistant", "user", "developer", "system"]),
  content: z.unknown().optional(),
})

export const codexResponseItemPayloadSchema = z.discriminatedUnion("type", [
  codexResponseMessagePayloadSchema.passthrough(),
  z.object({ type: z.literal("compaction") }).passthrough(),
  z
    .object({
      type: z.literal("function_call"),
      call_id: z.string().optional(),
      name: z.string().optional(),
      arguments: z.unknown().optional(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal("function_call_output"),
      call_id: z.string().optional(),
      output: z.unknown().optional(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal("custom_tool_call"),
      call_id: z.string().optional(),
      name: z.string().optional(),
      input: z.unknown().optional(),
      status: z.string().optional(),
      error: z.unknown().optional(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal("custom_tool_call_output"),
      call_id: z.string().optional(),
      output: z.unknown().optional(),
    })
    .passthrough(),
  z.object({ type: z.literal("execution") }).passthrough(),
  z.object({ type: z.literal("ghost_commit") }).passthrough(),
  z.object({ type: z.literal("ghost_snapshot") }).passthrough(),
  z.object({ type: z.literal("image_generation_call") }).passthrough(),
  z.object({ type: z.literal("other") }).passthrough(),
  z.object({ type: z.literal("web_search_call") }).passthrough(),
  z.object({ type: z.literal("reasoning") }).passthrough(),
  z.object({ type: z.literal("summary") }).passthrough(),
  z.object({ type: z.literal("tool_search_output") }).passthrough(),
])

export const codexLineSchema = z.discriminatedUnion("type", [
  z
    .object({
      timestamp: z.string().optional(),
      type: z.literal("session_meta"),
      payload: recordSchema.default({}),
    })
    .passthrough(),
  z
    .object({
      timestamp: z.string().optional(),
      type: z.literal("event_msg"),
      payload: codexEventMsgPayloadSchema,
    })
    .passthrough(),
  z
    .object({
      timestamp: z.string().optional(),
      type: z.literal("response_item"),
      payload: codexResponseItemPayloadSchema,
    })
    .passthrough(),
  z
    .object({
      timestamp: z.string().optional(),
      type: z.literal("turn_context"),
      payload: recordSchema.default({}),
    })
    .passthrough(),
  z
    .object({
      timestamp: z.string().optional(),
      type: z.literal("compacted"),
      payload: recordSchema.default({}),
    })
    .passthrough(),
])

export type CodexRolloutLine = z.infer<typeof codexLineSchema>
export type CodexEventMsgPayload = z.infer<typeof codexEventMsgPayloadSchema>
export type CodexResponseItemPayload = z.infer<typeof codexResponseItemPayloadSchema>
export type CodexResponseMessagePayload = z.infer<typeof codexResponseMessagePayloadSchema>

export class CodexRolloutParseError extends Error {
  constructor(
    readonly path: string,
    readonly lineNumber: number,
    message: string,
  ) {
    super(`--resume: ${path}:${lineNumber}: ${message}`)
    this.name = "CodexRolloutParseError"
  }
}

function typeOf(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined
  const type = (value as { type?: unknown }).type
  return typeof type === "string" ? type : undefined
}

function payloadTypeOf(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined
  const payload = (value as { payload?: unknown }).payload
  return typeOf(payload)
}

function describeParseFailure(raw: unknown, error: z.ZodError): string {
  const topLevelType = typeOf(raw)
  const payloadType = payloadTypeOf(raw)

  if (topLevelType && !(knownTopLevelTypes as readonly string[]).includes(topLevelType)) {
    return (
      `unsupported Codex transcript record type "${topLevelType}". ` +
      `silvercode only knows: ${knownTopLevelTypes.join(", ")}. ` +
      `This is Codex transcript schema drift; update the resume parser to classify the new record as replayed or ignored.`
    )
  }

  if (topLevelType === "event_msg" && payloadType && !(knownEventMsgTypes as readonly string[]).includes(payloadType)) {
    return (
      `unsupported Codex event_msg payload.type "${payloadType}". ` +
      `silvercode only knows: ${knownEventMsgTypes.join(", ")}. ` +
      `This is Codex transcript schema drift; update the resume parser to classify the new event as replayed or ignored.`
    )
  }

  if (
    topLevelType === "response_item" &&
    payloadType &&
    !(knownResponseItemTypes as readonly string[]).includes(payloadType)
  ) {
    return (
      `unsupported Codex response_item payload.type "${payloadType}". ` +
      `silvercode only knows: ${knownResponseItemTypes.join(", ")}. ` +
      `This is Codex transcript schema drift; update the resume parser to classify the new item as replayed or ignored.`
    )
  }

  return `invalid Codex transcript line: ${z.prettifyError(error)}`
}

export function parseCodexRolloutLine(path: string, line: string, lineNumber: number): CodexRolloutLine {
  let raw: unknown
  try {
    raw = JSON.parse(line)
  } catch (err) {
    throw new CodexRolloutParseError(path, lineNumber, `unparseable JSONL line: ${(err as Error).message}`)
  }

  const parsed = codexLineSchema.safeParse(raw)
  if (!parsed.success) {
    throw new CodexRolloutParseError(path, lineNumber, describeParseFailure(raw, parsed.error))
  }
  return parsed.data
}

export function commandText(command: unknown): string | null {
  if (typeof command === "string") return command
  if (Array.isArray(command)) return command.filter((part) => typeof part === "string").join(" ")
  return null
}

export function parseCustomToolOutput(raw: unknown): unknown {
  if (typeof raw !== "string") return raw ?? ""
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === "object" && "output" in parsed) {
      const output = (parsed as { output?: unknown }).output
      return output ?? raw
    }
  } catch {
    // Codex sometimes stores plain text here; keep it verbatim.
  }
  return raw
}
