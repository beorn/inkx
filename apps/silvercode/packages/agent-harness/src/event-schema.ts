import { z } from "zod"
import type { AgentEvent } from "./events.ts"

const idSchema = z.string().min(1)
const tsSchema = z.number().finite()

const tokenCountsSchema = z
  .object({
    input_tokens: z.number().finite().nonnegative().optional(),
    output_tokens: z.number().finite().nonnegative().optional(),
    cache_creation_input_tokens: z.number().finite().nonnegative().optional(),
    cache_read_input_tokens: z.number().finite().nonnegative().optional(),
    total_cost_usd: z.number().finite().nonnegative().optional(),
  })
  .strict()

const permissionOptionSchema = z
  .object({
    optionId: idSchema,
    name: z.string(),
    kind: z.enum(["allow_once", "allow_always", "reject_once", "reject_always"]),
  })
  .strict()

const planEntrySchema = z
  .object({
    id: idSchema.optional(),
    content: z.string().min(1),
    status: z.enum(["pending", "in_progress", "completed", "cancelled"]),
    activeForm: z.string().optional(),
    priority: z.enum(["high", "medium", "low"]).optional(),
    parentId: idSchema.optional(),
    providerEntryId: idSchema.optional(),
  })
  .strict()

const contentBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }).strict(),
  z
    .object({
      type: z.literal("tool_use"),
      id: idSchema,
      name: z.string().min(1),
      input: z.unknown(),
      mcp_server: idSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("tool_result"),
      tool_use_id: idSchema,
      output: z.unknown(),
      is_error: z.boolean().optional(),
    })
    .strict(),
  z.object({ type: z.literal("thinking"), text: z.string() }).strict(),
  z
    .object({
      type: z.literal("image"),
      mediaType: z.string().min(1),
      bytes: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z.object({ type: z.literal("raw"), label: z.string().min(1), raw: z.unknown() }).strict(),
])

export const agentEventSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("session-init"),
      sessionId: idSchema,
      cwd: z.string(),
      model: z.string(),
      mode: z.string(),
      tools: z.array(z.string()),
      mcp_servers: z.array(z.string()),
      slashCommands: z.array(z.string()),
      skills: z.array(z.string()),
      plugins: z.array(z.string()),
      claudeCodeVersion: z.string(),
      apiKeySource: z.string(),
      ts: tsSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("turn-start"),
      sessionId: idSchema,
      turnId: idSchema,
      role: z.enum(["user", "assistant"]),
      ts: tsSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("text-delta"),
      sessionId: idSchema,
      turnId: idSchema,
      blockIndex: z.number().int().nonnegative(),
      text: z.string(),
      ts: tsSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("thinking-delta"),
      sessionId: idSchema,
      turnId: idSchema,
      blockIndex: z.number().int().nonnegative(),
      text: z.string(),
      ts: tsSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("tool-use"),
      sessionId: idSchema,
      turnId: idSchema,
      id: idSchema,
      name: z.string().min(1),
      input: z.unknown(),
      mcp_server: idSchema.optional(),
      ts: tsSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("tool-result"),
      sessionId: idSchema,
      id: idSchema,
      output: z.unknown(),
      is_error: z.boolean().optional(),
      ts: tsSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("permission-request"),
      sessionId: idSchema,
      requestId: idSchema,
      tool: z.string().min(1),
      args: z.unknown(),
      options: z.array(permissionOptionSchema).optional(),
      ts: tsSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("permission-decision"),
      sessionId: idSchema,
      requestId: idSchema,
      approved: z.boolean(),
      ts: tsSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("liveness-check"),
      sessionId: idSchema,
      ts: tsSchema,
      staleAfterMs: z.number().finite().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("turn-end"),
      sessionId: idSchema,
      turnId: idSchema,
      stopReason: z.string().optional(),
      usage: tokenCountsSchema.optional(),
      ts: tsSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("assistant-message"),
      sessionId: idSchema,
      turnId: idSchema,
      content: z.array(contentBlockSchema),
      ts: tsSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("user-message"),
      sessionId: idSchema,
      turnId: idSchema,
      text: z.string(),
      additionalContext: z.string().optional(),
      ts: tsSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("raw-transcript"),
      sessionId: idSchema,
      turnId: idSchema,
      label: z.string().min(1),
      raw: z.unknown(),
      ts: tsSchema,
    })
    .strict(),
  z.object({ kind: z.literal("status"), sessionId: idSchema, status: z.string().min(1), ts: tsSchema }).strict(),
  z
    .object({
      kind: z.literal("plan-update"),
      sessionId: idSchema,
      source: z.enum(["claude-todowrite", "codex-plan", "acp-plan", "opencode-plan", "manual"]),
      entries: z.array(planEntrySchema),
      messageId: idSchema.optional(),
      activityId: idSchema.optional(),
      toolCallId: idSchema.optional(),
      providerEventId: idSchema.optional(),
      providerTurnId: idSchema.optional(),
      ts: tsSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("slash-commands-update"),
      sessionId: idSchema,
      slashCommands: z.array(z.string()),
      ts: tsSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("session-end"),
      sessionId: idSchema,
      stopReason: z.string().optional(),
      usage: tokenCountsSchema.optional(),
      costUsd: z.number().finite().nonnegative().optional(),
      durationMs: z.number().finite().nonnegative().optional(),
      ts: tsSchema,
    })
    .strict(),
  z.object({ kind: z.literal("handoff"), from: idSchema, to: idSchema, context: z.unknown(), ts: tsSchema }).strict(),
  z
    .object({
      kind: z.literal("km-reference"),
      sessionId: idSchema,
      nodeId: idSchema,
      relation: z.enum(["context", "decision", "output"]),
      ts: tsSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("session-lifecycle"),
      sessionId: idSchema,
      state: z.enum(["started", "paused", "resumed", "ended"]),
      ts: tsSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("error"),
      sessionId: idSchema,
      message: z.string().min(1),
      raw: z.unknown().optional(),
      ts: tsSchema,
    })
    .strict(),
])

export function parseAgentEvent(input: unknown): AgentEvent {
  return agentEventSchema.parse(input) as AgentEvent
}
