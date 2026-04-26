/**
 * Boundary adapter — the **only** module in silvercode allowed to import types
 * from `@agentclientprotocol/sdk`. Everywhere else (components, session store,
 * adapters, signals) imports from `./acp-types.ts`.
 *
 * The conversion is mostly identity at v1 because silvercode's canonical types
 * deliberately mirror ACP's structural shape (same field names, same
 * discriminated-union tags, same string-literal enums). When the ACP SDK type
 * surface churns (it has, twice in 5 months — see parent bead km-silvercode.acp)
 * the diff lands in this file, not in the rest of the codebase.
 *
 * If a future ACP version introduces a tag silvercode doesn't model yet,
 * `acpToSilvercode` throws — that's the signal to add the variant to
 * `acp-types.ts` and the round-trip test in `tests/acp-boundary.test.ts`.
 */

import type * as schema from "@agentclientprotocol/sdk"
import type * as sc from "./acp-types.ts"

// ---------------------------------------------------------------------------
// Branded id casts — silvercode brands its ids; ACP's SessionId / ToolCallId
// are bare strings. The brand is a compile-time tag, no runtime cost.
// ---------------------------------------------------------------------------

const asSessionId = (s: schema.SessionId): sc.SessionId => s as sc.SessionId
const asToolCallId = (s: schema.ToolCallId): sc.ToolCallId => s as sc.ToolCallId
const asPermissionOptionId = (s: schema.PermissionOptionId): sc.PermissionOptionId => s as sc.PermissionOptionId
const asSessionModeId = (s: schema.SessionModeId): sc.SessionModeId => s as sc.SessionModeId

// ---------------------------------------------------------------------------
// SessionUpdate — the central discriminated union. v1 boundary is structurally
// identity for every variant; we strip ACP's `_meta` field (silvercode doesn't
// model it) and pass everything else through with branded ids.
// ---------------------------------------------------------------------------

export function acpToSilvercode(update: schema.SessionUpdate): sc.SessionUpdate {
  switch (update.sessionUpdate) {
    case "user_message_chunk":
    case "agent_message_chunk":
    case "agent_thought_chunk":
      return {
        sessionUpdate: update.sessionUpdate,
        content: acpContentBlockToSilvercode(update.content),
        messageId: update.messageId ?? null,
      }
    case "tool_call":
      return {
        sessionUpdate: "tool_call",
        toolCallId: asToolCallId(update.toolCallId),
        title: update.title,
        kind: update.kind,
        status: update.status,
        locations: update.locations?.map(acpToolCallLocationToSilvercode),
        content: update.content?.map(acpToolCallContentToSilvercode),
        rawInput: update.rawInput,
        rawOutput: update.rawOutput,
      }
    case "tool_call_update":
      return {
        sessionUpdate: "tool_call_update",
        toolCallId: asToolCallId(update.toolCallId),
        title: update.title,
        kind: update.kind,
        status: update.status,
        locations: update.locations == null ? update.locations : update.locations.map(acpToolCallLocationToSilvercode),
        content: update.content == null ? update.content : update.content.map(acpToolCallContentToSilvercode),
        rawInput: update.rawInput,
        rawOutput: update.rawOutput,
      }
    case "plan":
      return {
        sessionUpdate: "plan",
        entries: update.entries.map(acpPlanEntryToSilvercode),
      }
    case "available_commands_update":
      return {
        sessionUpdate: "available_commands_update",
        availableCommands: update.availableCommands.map(acpAvailableCommandToSilvercode),
      }
    case "current_mode_update":
      return {
        sessionUpdate: "current_mode_update",
        currentModeId: asSessionModeId(update.currentModeId),
      }
    case "config_option_update":
      return {
        sessionUpdate: "config_option_update",
        configOptions: update.configOptions,
      }
    case "session_info_update":
      return {
        sessionUpdate: "session_info_update",
        title: update.title,
        updatedAt: update.updatedAt,
      }
    case "usage_update":
      return {
        sessionUpdate: "usage_update",
        size: update.size,
        used: update.used,
        cost: update.cost ? { amount: update.cost.amount, currency: update.cost.currency } : update.cost,
      }
    default: {
      // Exhaustiveness check — if the SDK adds a new variant we don't model,
      // TypeScript narrows `update` to `never` here. At runtime we throw to
      // surface the mismatch loudly during integration testing.
      const exhaustive: never = update
      throw new Error(`acpToSilvercode: unknown SessionUpdate variant ${JSON.stringify(exhaustive)}`)
    }
  }
}

export function silvercodeToAcp(update: sc.SessionUpdate): schema.SessionUpdate {
  switch (update.sessionUpdate) {
    case "user_message_chunk":
    case "agent_message_chunk":
    case "agent_thought_chunk":
      return {
        sessionUpdate: update.sessionUpdate,
        content: silvercodeContentBlockToAcp(update.content),
        messageId: update.messageId ?? null,
      }
    case "tool_call":
      return {
        sessionUpdate: "tool_call",
        toolCallId: update.toolCallId,
        title: update.title,
        kind: update.kind,
        status: update.status,
        locations: update.locations?.map(silvercodeToolCallLocationToAcp),
        content: update.content?.map(silvercodeToolCallContentToAcp),
        rawInput: update.rawInput,
        rawOutput: update.rawOutput,
      }
    case "tool_call_update":
      return {
        sessionUpdate: "tool_call_update",
        toolCallId: update.toolCallId,
        title: update.title,
        kind: update.kind,
        status: update.status,
        locations: update.locations == null ? update.locations : update.locations.map(silvercodeToolCallLocationToAcp),
        content: update.content == null ? update.content : update.content.map(silvercodeToolCallContentToAcp),
        rawInput: update.rawInput,
        rawOutput: update.rawOutput,
      }
    case "plan":
      return {
        sessionUpdate: "plan",
        entries: update.entries.map(silvercodePlanEntryToAcp),
      }
    case "available_commands_update":
      return {
        sessionUpdate: "available_commands_update",
        availableCommands: update.availableCommands.map(silvercodeAvailableCommandToAcp),
      }
    case "current_mode_update":
      return {
        sessionUpdate: "current_mode_update",
        currentModeId: update.currentModeId,
      }
    case "config_option_update":
      return {
        sessionUpdate: "config_option_update",
        // silvercode keeps configOptions opaque; ACP types it as
        // SessionConfigOption[]. Cast at the boundary — full typed-config UI
        // lives in components, not here.
        configOptions: update.configOptions as schema.SessionConfigOption[],
      }
    case "session_info_update":
      return {
        sessionUpdate: "session_info_update",
        title: update.title,
        updatedAt: update.updatedAt,
      }
    case "usage_update":
      return {
        sessionUpdate: "usage_update",
        size: update.size,
        used: update.used,
        cost: update.cost ? { amount: update.cost.amount, currency: update.cost.currency } : update.cost,
      }
    default: {
      const exhaustive: never = update
      throw new Error(`silvercodeToAcp: unknown SessionUpdate variant ${JSON.stringify(exhaustive)}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Content blocks
// ---------------------------------------------------------------------------

export function acpContentBlockToSilvercode(block: schema.ContentBlock): sc.ContentBlock {
  switch (block.type) {
    case "text":
      return { type: "text", text: block.text, annotations: block.annotations }
    case "image":
      return {
        type: "image",
        data: block.data,
        mimeType: block.mimeType,
        uri: block.uri,
        annotations: block.annotations,
      }
    case "audio":
      return {
        type: "audio",
        data: block.data,
        mimeType: block.mimeType,
        annotations: block.annotations,
      }
    case "resource_link":
      return {
        type: "resource_link",
        name: block.name,
        uri: block.uri,
        description: block.description,
        mimeType: block.mimeType,
        size: block.size,
        title: block.title,
        annotations: block.annotations,
      }
    case "resource":
      return {
        type: "resource",
        resource: acpEmbeddedResourceResourceToSilvercode(block.resource),
        annotations: block.annotations,
      }
    default: {
      const exhaustive: never = block
      throw new Error(`acpContentBlockToSilvercode: unknown ContentBlock type ${JSON.stringify(exhaustive)}`)
    }
  }
}

export function silvercodeContentBlockToAcp(block: sc.ContentBlock): schema.ContentBlock {
  switch (block.type) {
    case "text":
      return { type: "text", text: block.text, annotations: block.annotations }
    case "image":
      return {
        type: "image",
        data: block.data,
        mimeType: block.mimeType,
        uri: block.uri,
        annotations: block.annotations,
      }
    case "audio":
      return {
        type: "audio",
        data: block.data,
        mimeType: block.mimeType,
        annotations: block.annotations,
      }
    case "resource_link":
      return {
        type: "resource_link",
        name: block.name,
        uri: block.uri,
        description: block.description,
        mimeType: block.mimeType,
        size: block.size,
        title: block.title,
        annotations: block.annotations,
      }
    case "resource":
      return {
        type: "resource",
        resource: silvercodeEmbeddedResourceResourceToAcp(block.resource),
        annotations: block.annotations,
      }
    default: {
      const exhaustive: never = block
      throw new Error(`silvercodeContentBlockToAcp: unknown ContentBlock type ${JSON.stringify(exhaustive)}`)
    }
  }
}

function acpEmbeddedResourceResourceToSilvercode(res: schema.EmbeddedResourceResource): sc.EmbeddedResourceResource {
  if ("text" in res) {
    return { uri: res.uri, text: res.text, mimeType: res.mimeType }
  }
  return { uri: res.uri, blob: res.blob, mimeType: res.mimeType }
}

function silvercodeEmbeddedResourceResourceToAcp(res: sc.EmbeddedResourceResource): schema.EmbeddedResourceResource {
  if ("text" in res) {
    return { uri: res.uri, text: res.text, mimeType: res.mimeType }
  }
  return { uri: res.uri, blob: res.blob, mimeType: res.mimeType }
}

// ---------------------------------------------------------------------------
// Tool-call content / location
// ---------------------------------------------------------------------------

function acpToolCallLocationToSilvercode(loc: schema.ToolCallLocation): sc.ToolCallLocation {
  return { path: loc.path, line: loc.line }
}

function silvercodeToolCallLocationToAcp(loc: sc.ToolCallLocation): schema.ToolCallLocation {
  return { path: loc.path, line: loc.line }
}

function acpToolCallContentToSilvercode(content: schema.ToolCallContent): sc.ToolCallContent {
  switch (content.type) {
    case "content":
      return { type: "content", content: acpContentBlockToSilvercode(content.content) }
    case "diff":
      return {
        type: "diff",
        path: content.path,
        newText: content.newText,
        oldText: content.oldText,
      }
    case "terminal":
      return { type: "terminal", terminalId: content.terminalId }
    default: {
      const exhaustive: never = content
      throw new Error(`acpToolCallContentToSilvercode: unknown ToolCallContent ${JSON.stringify(exhaustive)}`)
    }
  }
}

function silvercodeToolCallContentToAcp(content: sc.ToolCallContent): schema.ToolCallContent {
  switch (content.type) {
    case "content":
      return { type: "content", content: silvercodeContentBlockToAcp(content.content) }
    case "diff":
      return {
        type: "diff",
        path: content.path,
        newText: content.newText,
        oldText: content.oldText,
      }
    case "terminal":
      return { type: "terminal", terminalId: content.terminalId }
    default: {
      const exhaustive: never = content
      throw new Error(`silvercodeToolCallContentToAcp: unknown ToolCallContent ${JSON.stringify(exhaustive)}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

function acpPlanEntryToSilvercode(entry: schema.PlanEntry): sc.PlanEntry {
  return { content: entry.content, priority: entry.priority, status: entry.status }
}

function silvercodePlanEntryToAcp(entry: sc.PlanEntry): schema.PlanEntry {
  return { content: entry.content, priority: entry.priority, status: entry.status }
}

// ---------------------------------------------------------------------------
// Slash commands
// ---------------------------------------------------------------------------

function acpAvailableCommandToSilvercode(cmd: schema.AvailableCommand): sc.AvailableCommand {
  return {
    name: cmd.name,
    description: cmd.description,
    input: cmd.input ? { hint: cmd.input.hint } : cmd.input,
  }
}

function silvercodeAvailableCommandToAcp(cmd: sc.AvailableCommand): schema.AvailableCommand {
  return {
    name: cmd.name,
    description: cmd.description,
    input: cmd.input ? { hint: cmd.input.hint } : cmd.input,
  }
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export function acpRequestPermissionToSilvercode(req: schema.RequestPermissionRequest): sc.RequestPermissionRequest {
  return {
    sessionId: asSessionId(req.sessionId),
    toolCall: {
      toolCallId: asToolCallId(req.toolCall.toolCallId),
      title: req.toolCall.title,
      kind: req.toolCall.kind,
      status: req.toolCall.status,
      locations: req.toolCall.locations?.map(acpToolCallLocationToSilvercode),
      content: req.toolCall.content?.map(acpToolCallContentToSilvercode),
      rawInput: req.toolCall.rawInput,
      rawOutput: req.toolCall.rawOutput,
    },
    options: req.options.map((o) => ({
      optionId: asPermissionOptionId(o.optionId),
      name: o.name,
      kind: o.kind,
    })),
  }
}

export function silvercodeRequestPermissionToAcp(req: sc.RequestPermissionRequest): schema.RequestPermissionRequest {
  return {
    sessionId: req.sessionId,
    toolCall: {
      toolCallId: req.toolCall.toolCallId,
      title: req.toolCall.title,
      kind: req.toolCall.kind,
      status: req.toolCall.status,
      locations: req.toolCall.locations?.map(silvercodeToolCallLocationToAcp),
      content: req.toolCall.content?.map(silvercodeToolCallContentToAcp),
      rawInput: req.toolCall.rawInput,
      rawOutput: req.toolCall.rawOutput,
    },
    options: req.options.map((o) => ({ optionId: o.optionId, name: o.name, kind: o.kind })),
  }
}

export function acpRequestPermissionResponseToSilvercode(
  resp: schema.RequestPermissionResponse,
): sc.RequestPermissionResponse {
  return { outcome: acpOutcomeToSilvercode(resp.outcome) }
}

export function silvercodeRequestPermissionResponseToAcp(
  resp: sc.RequestPermissionResponse,
): schema.RequestPermissionResponse {
  return { outcome: silvercodeOutcomeToAcp(resp.outcome) }
}

function acpOutcomeToSilvercode(outcome: schema.RequestPermissionOutcome): sc.RequestPermissionOutcome {
  if (outcome.outcome === "cancelled") return { outcome: "cancelled" }
  return { outcome: "selected", optionId: asPermissionOptionId(outcome.optionId) }
}

function silvercodeOutcomeToAcp(outcome: sc.RequestPermissionOutcome): schema.RequestPermissionOutcome {
  if (outcome.outcome === "cancelled") return { outcome: "cancelled" }
  return { outcome: "selected", optionId: outcome.optionId }
}

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

export function acpAgentCapabilitiesToSilvercode(caps: schema.AgentCapabilities): sc.AgentCapabilities {
  return {
    loadSession: caps.loadSession,
    promptCapabilities: caps.promptCapabilities
      ? {
          audio: caps.promptCapabilities.audio,
          embeddedContext: caps.promptCapabilities.embeddedContext,
          image: caps.promptCapabilities.image,
        }
      : undefined,
  }
}

export function silvercodeAgentCapabilitiesToAcp(caps: sc.AgentCapabilities): schema.AgentCapabilities {
  return {
    loadSession: caps.loadSession,
    promptCapabilities: caps.promptCapabilities
      ? {
          audio: caps.promptCapabilities.audio,
          embeddedContext: caps.promptCapabilities.embeddedContext,
          image: caps.promptCapabilities.image,
        }
      : undefined,
  }
}

export function acpClientCapabilitiesToSilvercode(caps: schema.ClientCapabilities): sc.ClientCapabilities {
  return {
    fs: caps.fs ? { readTextFile: caps.fs.readTextFile, writeTextFile: caps.fs.writeTextFile } : undefined,
    terminal: caps.terminal,
  }
}

export function silvercodeClientCapabilitiesToAcp(caps: sc.ClientCapabilities): schema.ClientCapabilities {
  return {
    fs: caps.fs ? { readTextFile: caps.fs.readTextFile, writeTextFile: caps.fs.writeTextFile } : undefined,
    terminal: caps.terminal,
  }
}
