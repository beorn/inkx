import { z } from "zod"

const recordSchema = z.record(z.string(), z.unknown())

export const codexEventMsgPayloadSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("task_started"), turn_id: z.string().optional() }).passthrough(),
  z.object({ type: z.literal("task_complete"), turn_id: z.string().optional() }).passthrough(),
  z.object({ type: z.literal("user_message"), message: z.string().optional() }).passthrough(),
  z.object({ type: z.literal("agent_message") }).passthrough(),
  z.object({ type: z.literal("token_count") }).passthrough(),
  z.object({ type: z.literal("context_compacted") }).passthrough(),
  z
    .object({
      type: z.literal("view_image_tool_call"),
      call_id: z.string().optional(),
      path: z.string().optional(),
    })
    .passthrough(),
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
])

export const codexResponseMessagePayloadSchema = z.object({
  type: z.literal("message"),
  role: z.enum(["assistant", "user", "developer", "system"]),
  content: z.unknown().optional(),
})

export const codexResponseItemPayloadSchema = z.discriminatedUnion("type", [
  codexResponseMessagePayloadSchema.passthrough(),
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
  z.object({ type: z.literal("reasoning") }).passthrough(),
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

export function parseCodexRolloutLine(path: string, line: string, lineNumber: number): CodexRolloutLine {
  let raw: unknown
  try {
    raw = JSON.parse(line)
  } catch (err) {
    throw new CodexRolloutParseError(path, lineNumber, `unparseable JSONL line: ${(err as Error).message}`)
  }

  const parsed = codexLineSchema.safeParse(raw)
  if (!parsed.success) {
    throw new CodexRolloutParseError(
      path,
      lineNumber,
      `invalid Codex transcript line: ${z.prettifyError(parsed.error)}`,
    )
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
