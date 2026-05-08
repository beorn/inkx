import { z } from "zod"
import {
  CHAT_TRACKS,
  type ChatTrackId,
  type ChatTrackState,
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
  defaultTrack: ChatTrackId
  allowedTracks: readonly ChatTrackId[]
  owner: ChatEventOwner
  projection: ChatEventProjection
  defaultDisclosure: ChatDisclosure
  width: ChatWidth
  detailAccess: readonly ChatDetailAccess[]
}

export const CHAT_EVENT_HANDLING = {
  "message.started": {
    defaultTrack: "transcript",
    allowedTracks: ["transcript", "debug"],
    owner: "message",
    projection: "state-only",
    defaultDisclosure: "expanded",
    width: "prose",
    detailAccess: ["cmd-hover"],
  },
  "message.block.added": {
    defaultTrack: "transcript",
    allowedTracks: ["transcript", "activity", "debug", "error"],
    owner: "message-block",
    projection: "message-leaf",
    defaultDisclosure: "expanded",
    width: "prose",
    detailAccess: ["expand", "cmd-hover"],
  },
  "message.completed": {
    defaultTrack: "transcript",
    allowedTracks: ["transcript", "debug"],
    owner: "message",
    projection: "state-only",
    defaultDisclosure: "collapsed",
    width: "prose",
    detailAccess: ["cmd-hover"],
  },
  "tool.started": {
    defaultTrack: "activity",
    allowedTracks: ["activity", "debug"],
    owner: "tool",
    projection: "activity-leaf",
    defaultDisclosure: "collapsed",
    width: "prose",
    detailAccess: ["expand", "cmd-hover"],
  },
  "tool.updated": {
    defaultTrack: "activity",
    allowedTracks: ["activity", "debug", "error"],
    owner: "tool",
    projection: "state-or-leaf",
    defaultDisclosure: "collapsed",
    width: "prose",
    detailAccess: ["expand", "cmd-hover"],
  },
  "tool.completed": {
    defaultTrack: "activity",
    allowedTracks: ["activity", "error", "debug"],
    owner: "tool",
    projection: "activity-leaf",
    defaultDisclosure: "adaptive",
    width: "prose",
    detailAccess: ["expand", "cmd-hover"],
  },
  "permission.requested": {
    defaultTrack: "permission",
    allowedTracks: ["permission"],
    owner: "permission",
    projection: "permission-leaf",
    defaultDisclosure: "expanded",
    width: "prose",
    detailAccess: ["expand", "cmd-hover"],
  },
  "permission.resolved": {
    defaultTrack: "permission",
    allowedTracks: ["permission", "debug"],
    owner: "permission",
    projection: "state-only",
    defaultDisclosure: "collapsed",
    width: "prose",
    detailAccess: ["cmd-hover"],
  },
  "plan.updated": {
    defaultTrack: "plan",
    allowedTracks: ["plan", "debug"],
    owner: "plan",
    projection: "state-or-leaf",
    defaultDisclosure: "adaptive",
    width: "prose",
    detailAccess: ["expand", "cmd-hover"],
  },
  "queue.updated": {
    defaultTrack: "queue",
    allowedTracks: ["queue", "debug"],
    owner: "queue",
    projection: "state-or-leaf",
    defaultDisclosure: "adaptive",
    width: "prose",
    detailAccess: ["expand", "cmd-hover"],
  },
  "notification.received": {
    defaultTrack: "notification",
    allowedTracks: ["notification", "debug", "error"],
    owner: "notification",
    projection: "notification-leaf",
    defaultDisclosure: "collapsed",
    width: "prose",
    detailAccess: ["expand", "cmd-hover"],
  },
  "recap.recorded": {
    defaultTrack: "notification",
    allowedTracks: ["notification", "debug"],
    owner: "recap",
    projection: "recap-leaf",
    defaultDisclosure: "collapsed",
    width: "prose",
    detailAccess: ["expand", "cmd-hover"],
  },
  "session.updated": {
    defaultTrack: "debug",
    allowedTracks: ["status", "debug"],
    owner: "session",
    projection: "state-only",
    defaultDisclosure: "collapsed",
    width: "prose",
    detailAccess: ["cmd-hover"],
  },
  "status.updated": {
    defaultTrack: "status",
    allowedTracks: ["status", "debug", "error"],
    owner: "status",
    projection: "state-or-leaf",
    defaultDisclosure: "collapsed",
    width: "prose",
    detailAccess: ["expand", "cmd-hover"],
  },
  "error.raised": {
    defaultTrack: "error",
    allowedTracks: ["error"],
    owner: "error",
    projection: "error-leaf",
    defaultDisclosure: "expanded",
    width: "prose",
    detailAccess: ["expand", "cmd-hover"],
  },
  "debug.recorded": {
    defaultTrack: "debug",
    allowedTracks: ["debug"],
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
  tracks: Readonly<Record<string, ChatTrackState | undefined>>,
): T[] {
  return events.filter((event) => {
    const state = tracks[event.track]
    return state !== undefined && state.visible && !state.muted
  })
}

const trackSchema = z.enum(CHAT_TRACKS)
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
  z.object({ id: idSchema, type: z.literal("thought"), text: textSchema, eventIds: eventIdsSchema }).strict(),
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
      track: trackSchema,
      ts: z.number().finite(),
      sessionId: idSchema,
      agentEventId: idSchema.optional(),
      payload,
      rawRefs: z.array(rawRefSchema).readonly(),
    })
    .strict()
    .superRefine((event, ctx) => {
      const handling = chatEventHandlingFor(type)
      if (!handling.allowedTracks.includes(event.track)) {
        ctx.addIssue({
          code: "custom",
          path: ["track"],
          message: `track "${event.track}" is invalid for ${type}; expected one of ${handling.allowedTracks.join(", ")}`,
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
