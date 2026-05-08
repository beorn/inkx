import { z } from "zod"
import {
  CHAT_CHANNELS,
  type ChatChannelId,
  type ChatChannelState,
  type ChatDetailAccess,
  type ChatDisclosure,
  type ChatEvent,
  type ChatEventType,
  type ChatRole,
  type ChatSeverity,
  type ChatStatus,
  type ChatWidth,
} from "./types.ts"

type ChatEventOwner =
  | "message"
  | "message-block"
  | "tool"
  | "permission"
  | "plan"
  | "queue"
  | "notification"
  | "recap"
  | "session"
  | "status"
  | "error"
  | "debug"

type ChatEventProjection =
  | "state-only"
  | "message-leaf"
  | "activity-leaf"
  | "permission-leaf"
  | "plan-leaf"
  | "queue-leaf"
  | "notification-leaf"
  | "recap-leaf"
  | "status-leaf"
  | "error-leaf"
  | "debug-leaf"
  | "state-or-leaf"

export type ChatEventHandling = {
  defaultChannel: ChatChannelId
  allowedChannels: readonly ChatChannelId[]
  owner: ChatEventOwner
  projection: ChatEventProjection
  defaultDisclosure: ChatDisclosure
  width: ChatWidth
  detailAccess: readonly ChatDetailAccess[]
}

export const CHAT_EVENT_HANDLING = {
  "message.started": {
    defaultChannel: "transcript",
    allowedChannels: ["transcript", "debug"],
    owner: "message",
    projection: "state-only",
    defaultDisclosure: "expanded",
    width: "prose",
    detailAccess: ["cmd-hover"],
  },
  "message.block.added": {
    defaultChannel: "transcript",
    allowedChannels: ["transcript", "activity", "debug", "error"],
    owner: "message-block",
    projection: "message-leaf",
    defaultDisclosure: "expanded",
    width: "prose",
    detailAccess: ["expand", "cmd-hover"],
  },
  "message.completed": {
    defaultChannel: "transcript",
    allowedChannels: ["transcript", "debug"],
    owner: "message",
    projection: "state-only",
    defaultDisclosure: "collapsed",
    width: "prose",
    detailAccess: ["cmd-hover"],
  },
  "tool.started": {
    defaultChannel: "activity",
    allowedChannels: ["activity", "debug"],
    owner: "tool",
    projection: "activity-leaf",
    defaultDisclosure: "collapsed",
    width: "prose",
    detailAccess: ["expand", "cmd-hover"],
  },
  "tool.updated": {
    defaultChannel: "activity",
    allowedChannels: ["activity", "debug", "error"],
    owner: "tool",
    projection: "state-or-leaf",
    defaultDisclosure: "collapsed",
    width: "prose",
    detailAccess: ["expand", "cmd-hover"],
  },
  "tool.completed": {
    defaultChannel: "activity",
    allowedChannels: ["activity", "error", "debug"],
    owner: "tool",
    projection: "activity-leaf",
    defaultDisclosure: "adaptive",
    width: "prose",
    detailAccess: ["expand", "cmd-hover"],
  },
  "permission.requested": {
    defaultChannel: "permission",
    allowedChannels: ["permission"],
    owner: "permission",
    projection: "permission-leaf",
    defaultDisclosure: "expanded",
    width: "prose",
    detailAccess: ["expand", "cmd-hover"],
  },
  "permission.resolved": {
    defaultChannel: "permission",
    allowedChannels: ["permission", "debug"],
    owner: "permission",
    projection: "state-only",
    defaultDisclosure: "collapsed",
    width: "prose",
    detailAccess: ["cmd-hover"],
  },
  "plan.updated": {
    defaultChannel: "plan",
    allowedChannels: ["plan", "debug"],
    owner: "plan",
    projection: "state-or-leaf",
    defaultDisclosure: "adaptive",
    width: "prose",
    detailAccess: ["expand", "cmd-hover"],
  },
  "queue.updated": {
    defaultChannel: "queue",
    allowedChannels: ["queue", "debug"],
    owner: "queue",
    projection: "state-or-leaf",
    defaultDisclosure: "adaptive",
    width: "prose",
    detailAccess: ["expand", "cmd-hover"],
  },
  "notification.received": {
    defaultChannel: "notification",
    allowedChannels: ["notification", "debug", "error"],
    owner: "notification",
    projection: "notification-leaf",
    defaultDisclosure: "collapsed",
    width: "prose",
    detailAccess: ["expand", "cmd-hover"],
  },
  "recap.recorded": {
    defaultChannel: "notification",
    allowedChannels: ["notification", "debug"],
    owner: "recap",
    projection: "recap-leaf",
    defaultDisclosure: "collapsed",
    width: "prose",
    detailAccess: ["expand", "cmd-hover"],
  },
  "session.updated": {
    defaultChannel: "debug",
    allowedChannels: ["status", "debug"],
    owner: "session",
    projection: "state-only",
    defaultDisclosure: "collapsed",
    width: "prose",
    detailAccess: ["cmd-hover"],
  },
  "status.updated": {
    defaultChannel: "status",
    allowedChannels: ["status", "debug", "error"],
    owner: "status",
    projection: "state-or-leaf",
    defaultDisclosure: "collapsed",
    width: "prose",
    detailAccess: ["expand", "cmd-hover"],
  },
  "error.raised": {
    defaultChannel: "error",
    allowedChannels: ["error"],
    owner: "error",
    projection: "error-leaf",
    defaultDisclosure: "expanded",
    width: "prose",
    detailAccess: ["expand", "cmd-hover"],
  },
  "debug.recorded": {
    defaultChannel: "debug",
    allowedChannels: ["debug"],
    owner: "debug",
    projection: "debug-leaf",
    defaultDisclosure: "collapsed",
    width: "prose",
    detailAccess: ["expand", "cmd-hover"],
  },
} satisfies Record<ChatEventType, ChatEventHandling>

export function chatEventHandlingFor(type: ChatEventType): ChatEventHandling {
  return CHAT_EVENT_HANDLING[type]
}

export function visibleChatEvents<T extends ChatEvent>(
  events: readonly T[],
  channels: Readonly<Record<string, ChatChannelState | undefined>>,
): T[] {
  return events.filter((event) => {
    const state = channels[event.channel]
    return state !== undefined && state.visible && !state.muted
  })
}

const channelSchema = z.enum(CHAT_CHANNELS)
const roleSchema = z.enum(["user", "assistant", "system"] satisfies ChatRole[])
const severitySchema = z.enum(["info", "warning", "error"] satisfies ChatSeverity[])
const statusSchema = z.enum(["pending", "running", "done", "failed", "cancelled"] satisfies ChatStatus[])
const idSchema = z.string().min(1)
const textSchema = z.string()
const labelSchema = z.string().min(1)
const rawRefSchema = z
  .object({
    id: idSchema,
    source: z.enum(["agent", "adapter", "local", "replay", "restore"]),
    label: labelSchema.optional(),
    raw: z.unknown().optional(),
  })
  .strict()

const eventIdsSchema = z.array(idSchema).min(1).readonly()
const attachmentSchema = z
  .object({
    kind: z.enum(["file", "image", "url", "resource"]),
    label: labelSchema,
    uri: idSchema.optional(),
    mimeType: idSchema.optional(),
  })
  .strict()
const messageBlockSchema = z.discriminatedUnion("type", [
  z.object({ id: idSchema, type: z.literal("text"), text: textSchema, eventIds: eventIdsSchema }).strict(),
  z.object({ id: idSchema, type: z.literal("reasoning"), text: textSchema, eventIds: eventIdsSchema }).strict(),
  z
    .object({ id: idSchema, type: z.literal("attachment"), attachment: attachmentSchema, eventIds: eventIdsSchema })
    .strict(),
  z.object({ id: idSchema, type: z.literal("tool-ref"), toolId: idSchema, eventIds: eventIdsSchema }).strict(),
])

const planStepSchema = z
  .object({
    id: idSchema,
    content: textSchema.min(1),
    status: z.enum(["pending", "in_progress", "completed", "cancelled"]),
    priority: z.enum(["high", "medium", "low"]).optional(),
    parentId: idSchema.optional(),
  })
  .strict()
const planSchema = z.object({ steps: z.array(planStepSchema).readonly(), eventIds: eventIdsSchema }).strict()
const promptSchema = z
  .object({
    id: idSchema,
    label: labelSchema,
    status: z.enum(["queued", "running", "done", "cancelled"]),
    eventIds: eventIdsSchema,
  })
  .strict()
const promptQueueSchema = z.object({ prompts: z.array(promptSchema).readonly(), eventIds: eventIdsSchema }).strict()
const notificationSchema = z
  .object({
    source: idSchema,
    title: labelSchema.optional(),
    body: textSchema.min(1),
    actionable: z.boolean().optional(),
  })
  .strict()

function requireAtLeastOne(
  ctx: z.RefinementCtx,
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): void {
  if (keys.some((key) => value[key] !== undefined)) return
  ctx.addIssue({
    code: "custom",
    message: `expected at least one of ${keys.join(", ")}`,
  })
}

function eventSchema(type: ChatEventType, payload: z.ZodType<unknown>): z.ZodType {
  return z
    .object({
      id: idSchema,
      type: z.literal(type),
      channel: channelSchema,
      ts: z.number().finite(),
      sessionId: idSchema,
      agentEventId: idSchema.optional(),
      payload,
      rawRefs: z.array(rawRefSchema).readonly(),
    })
    .strict()
    .superRefine((event, ctx) => {
      const handling = chatEventHandlingFor(type)
      if (!handling.allowedChannels.includes(event.channel)) {
        ctx.addIssue({
          code: "custom",
          path: ["channel"],
          message: `channel "${event.channel}" is invalid for ${type}; expected one of ${handling.allowedChannels.join(", ")}`,
        })
      }
    })
}

export const chatEventSchema = z.union([
  eventSchema("message.started", z.object({ messageId: idSchema, role: roleSchema }).strict()),
  eventSchema(
    "message.block.added",
    z.object({ messageId: idSchema, blockId: idSchema, block: messageBlockSchema }).strict(),
  ),
  eventSchema("message.completed", z.object({ messageId: idSchema }).strict()),
  eventSchema(
    "tool.started",
    z.object({ toolId: idSchema, name: labelSchema, input: z.unknown().optional() }).strict(),
  ),
  eventSchema(
    "tool.updated",
    z
      .object({ toolId: idSchema, status: statusSchema.optional(), outputDelta: z.unknown().optional() })
      .strict()
      .superRefine((payload, ctx) => requireAtLeastOne(ctx, payload, ["status", "outputDelta"])),
  ),
  eventSchema(
    "tool.completed",
    z
      .object({
        toolId: idSchema,
        status: z.enum(["done", "failed", "cancelled"]),
        output: z.unknown().optional(),
      })
      .strict(),
  ),
  eventSchema(
    "permission.requested",
    z
      .object({
        permissionId: idSchema,
        toolId: idSchema.optional(),
        prompt: textSchema.min(1),
        options: z.array(labelSchema).min(1).readonly(),
      })
      .strict(),
  ),
  eventSchema(
    "permission.resolved",
    z.object({ permissionId: idSchema, decision: z.enum(["approved", "rejected", "cancelled"]) }).strict(),
  ),
  eventSchema("plan.updated", z.object({ plan: planSchema }).strict()),
  eventSchema("queue.updated", z.object({ promptQueue: promptQueueSchema }).strict()),
  eventSchema("notification.received", notificationSchema),
  eventSchema("recap.recorded", z.object({ text: textSchema.min(1), raw: z.unknown().optional() }).strict()),
  eventSchema(
    "session.updated",
    z
      .object({
        title: labelSchema.optional(),
        titleSource: z.enum(["custom", "ai", "agent"]).optional(),
        model: labelSchema.optional(),
        mode: labelSchema.optional(),
        cwd: labelSchema.optional(),
      })
      .strict()
      .superRefine((payload, ctx) => requireAtLeastOne(ctx, payload, ["title", "model", "mode", "cwd"])),
  ),
  eventSchema("status.updated", z.object({ status: textSchema.min(1), severity: severitySchema.optional() }).strict()),
  eventSchema(
    "error.raised",
    z.object({ message: textSchema.min(1), severity: severitySchema.optional(), raw: z.unknown().optional() }).strict(),
  ),
  eventSchema("debug.recorded", z.object({ label: labelSchema, raw: z.unknown() }).strict()),
])

export function parseChatEvent(input: unknown): ChatEvent {
  return chatEventSchema.parse(input) as ChatEvent
}
