/**
 * Round-trip tests for the ACP ↔ silvercode boundary adapter.
 *
 * Discipline:
 *   - Every `SessionUpdate` variant must round-trip without loss.
 *   - Every `ToolKind` literal must survive the round trip.
 *   - Every `PermissionOptionKind` literal must survive the round trip.
 *   - Every `ContentBlock` variant must round-trip.
 *   - Every `ToolCallContent` variant must round-trip.
 *   - Every `RequestPermissionOutcome` variant must round-trip.
 *
 * The test imports ACP SDK types directly *only* to construct the inputs —
 * proving that the adapter accepts the upstream type surface as written.
 */

import type * as schema from "@agentclientprotocol/sdk"
import { describe, expect, test } from "vitest"
import {
  acpContentBlockToSilvercode,
  acpRequestPermissionResponseToSilvercode,
  acpRequestPermissionToSilvercode,
  acpToSilvercode,
  silvercodeContentBlockToAcp,
  silvercodeRequestPermissionResponseToAcp,
  silvercodeRequestPermissionToAcp,
  silvercodeToAcp,
} from "../src/acp-boundary.ts"

// ---------------------------------------------------------------------------
// SessionUpdate — exhaustive coverage of every variant.
// ---------------------------------------------------------------------------

const sessionUpdateFixtures: schema.SessionUpdate[] = [
  {
    sessionUpdate: "user_message_chunk",
    content: { type: "text", text: "hello" },
    messageId: "msg-1",
  },
  {
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: "hi back" },
    messageId: "msg-2",
  },
  {
    sessionUpdate: "agent_thought_chunk",
    content: { type: "text", text: "let me think" },
    messageId: null,
  },
  {
    sessionUpdate: "tool_call",
    toolCallId: "tc-1",
    title: "Read /etc/hosts",
    kind: "read",
    status: "pending",
    locations: [{ path: "/etc/hosts", line: 42 }],
    content: [{ type: "content", content: { type: "text", text: "loaded" } }],
    rawInput: { path: "/etc/hosts" },
  },
  {
    sessionUpdate: "tool_call_update",
    toolCallId: "tc-1",
    status: "completed",
    title: null,
    kind: null,
    locations: null,
    content: [
      {
        type: "diff",
        path: "/tmp/x",
        oldText: "a",
        newText: "b",
      },
    ],
    rawOutput: { ok: true },
  },
  {
    sessionUpdate: "plan",
    entries: [
      { content: "Step 1", priority: "high", status: "pending" },
      { content: "Step 2", priority: "medium", status: "in_progress" },
      { content: "Step 3", priority: "low", status: "completed" },
    ],
  },
  {
    sessionUpdate: "available_commands_update",
    availableCommands: [
      { name: "/help", description: "show help" },
      {
        name: "/research",
        description: "research a topic",
        input: { hint: "topic" },
      },
    ],
  },
  {
    sessionUpdate: "current_mode_update",
    currentModeId: "plan",
  },
  {
    sessionUpdate: "config_option_update",
    configOptions: [],
  },
  {
    sessionUpdate: "session_info_update",
    title: "Demo",
    updatedAt: "2026-04-26T12:00:00Z",
  },
  {
    sessionUpdate: "usage_update",
    size: 200_000,
    used: 12_345,
    cost: { amount: 0.42, currency: "USD" },
  },
]

describe("acpToSilvercode / silvercodeToAcp — SessionUpdate round-trip", () => {
  for (const fixture of sessionUpdateFixtures) {
    test(`${fixture.sessionUpdate} round-trips structurally`, () => {
      const silvercode = acpToSilvercode(fixture)
      expect(silvercode.sessionUpdate).toBe(fixture.sessionUpdate)
      const back = silvercodeToAcp(silvercode)
      expect(back).toEqual(fixture)
    })
  }

  test("all 11 SessionUpdate variants are covered", () => {
    const seen = new Set(sessionUpdateFixtures.map((u) => u.sessionUpdate))
    expect(seen).toEqual(
      new Set([
        "user_message_chunk",
        "agent_message_chunk",
        "agent_thought_chunk",
        "tool_call",
        "tool_call_update",
        "plan",
        "available_commands_update",
        "current_mode_update",
        "config_option_update",
        "session_info_update",
        "usage_update",
      ]),
    )
  })
})

// ---------------------------------------------------------------------------
// ToolKind — every literal in the union round-trips.
// ---------------------------------------------------------------------------

const toolKinds: schema.ToolKind[] = [
  "read",
  "edit",
  "delete",
  "move",
  "search",
  "execute",
  "think",
  "fetch",
  "switch_mode",
  "other",
]

describe("ToolKind round-trip", () => {
  for (const kind of toolKinds) {
    test(`ToolKind '${kind}' survives via tool_call`, () => {
      const update: schema.SessionUpdate = {
        sessionUpdate: "tool_call",
        toolCallId: "tc-x",
        title: "x",
        kind,
        status: "pending",
      }
      const sc = acpToSilvercode(update)
      expect(sc.sessionUpdate).toBe("tool_call")
      if (sc.sessionUpdate !== "tool_call") throw new Error("narrow")
      expect(sc.kind).toBe(kind)
      const back = silvercodeToAcp(sc)
      expect(back).toEqual(update)
    })
  }
})

// ---------------------------------------------------------------------------
// PermissionOptionKind — every literal in the union round-trips.
// ---------------------------------------------------------------------------

const permissionKinds: schema.PermissionOptionKind[] = ["allow_once", "allow_always", "reject_once", "reject_always"]

describe("PermissionOptionKind round-trip", () => {
  for (const kind of permissionKinds) {
    test(`PermissionOptionKind '${kind}' survives RequestPermissionRequest`, () => {
      const req: schema.RequestPermissionRequest = {
        sessionId: "sess-1",
        toolCall: { toolCallId: "tc-perm", title: "Confirm" },
        options: [{ optionId: `opt-${kind}`, name: kind, kind }],
      }
      const sc = acpRequestPermissionToSilvercode(req)
      expect(sc.options[0].kind).toBe(kind)
      const back = silvercodeRequestPermissionToAcp(sc)
      expect(back).toEqual(req)
    })
  }
})

// ---------------------------------------------------------------------------
// ContentBlock — every variant.
// ---------------------------------------------------------------------------

const contentBlocks: schema.ContentBlock[] = [
  { type: "text", text: "hello" },
  { type: "image", data: "base64data", mimeType: "image/png" },
  { type: "audio", data: "base64audio", mimeType: "audio/wav" },
  {
    type: "resource_link",
    name: "readme",
    uri: "file:///tmp/README.md",
    mimeType: "text/markdown",
  },
  {
    type: "resource",
    resource: { uri: "file:///tmp/x.txt", text: "body", mimeType: "text/plain" },
  },
  {
    type: "resource",
    resource: { uri: "file:///tmp/x.bin", blob: "Zm9v", mimeType: "application/octet-stream" },
  },
]

describe("ContentBlock round-trip", () => {
  for (const block of contentBlocks) {
    test(`ContentBlock type='${block.type}' round-trips`, () => {
      const sc = acpContentBlockToSilvercode(block)
      expect(sc.type).toBe(block.type)
      const back = silvercodeContentBlockToAcp(sc)
      expect(back).toEqual(block)
    })
  }
})

// ---------------------------------------------------------------------------
// RequestPermissionOutcome — both variants.
// ---------------------------------------------------------------------------

describe("RequestPermissionOutcome round-trip", () => {
  test("cancelled", () => {
    const resp: schema.RequestPermissionResponse = { outcome: { outcome: "cancelled" } }
    const sc = acpRequestPermissionResponseToSilvercode(resp)
    expect(sc.outcome.outcome).toBe("cancelled")
    expect(silvercodeRequestPermissionResponseToAcp(sc)).toEqual(resp)
  })

  test("selected", () => {
    const resp: schema.RequestPermissionResponse = {
      outcome: { outcome: "selected", optionId: "allow-once" },
    }
    const sc = acpRequestPermissionResponseToSilvercode(resp)
    expect(sc.outcome.outcome).toBe("selected")
    expect(silvercodeRequestPermissionResponseToAcp(sc)).toEqual(resp)
  })
})

// ---------------------------------------------------------------------------
// ToolCallContent — every variant inside a tool_call_update.
// ---------------------------------------------------------------------------

describe("ToolCallContent round-trip via tool_call", () => {
  const variants: schema.ToolCallContent[] = [
    { type: "content", content: { type: "text", text: "hello" } },
    { type: "diff", path: "/tmp/x", oldText: "a", newText: "b" },
    { type: "terminal", terminalId: "term-1" },
  ]
  for (const v of variants) {
    test(`ToolCallContent type='${v.type}'`, () => {
      const update: schema.SessionUpdate = {
        sessionUpdate: "tool_call",
        toolCallId: "tc",
        title: "x",
        content: [v],
      }
      const sc = acpToSilvercode(update)
      const back = silvercodeToAcp(sc)
      expect(back).toEqual(update)
    })
  }
})
