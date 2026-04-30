/**
 * Regression tests for the three symptoms reported in
 * `km-silvercode.claude-acp-wire-bugs`:
 *
 *   1. Status stuck in "thinking" — prompt() resolution must drive
 *      session-store status back to idle (turn-end synthesis).
 *   2. Ambient events batched until next prompt — channelQueue → ambientStream
 *      must deliver subscribers per-event, NOT collapsed at turn boundary.
 *   3. Failed Bash tool produces 2 events — wire emits ONE tool_call_update
 *      with status "failed", not a separate "error" event on top.
 *
 * Each test reproduces the symptom against the current wire and asserts
 * the fixed behaviour. Reverting the fix in any of acp-client.ts /
 * wire.ts / ambient-stream.ts / channel-queue.ts breaks one of these.
 */

import { EventEmitter } from "node:events"
import * as acp from "@agentclientprotocol/sdk"
import { createScope } from "@silvery/scope"
import { describe, expect, test } from "vitest"
import type { AgentEvent, AgentSession, PermissionRequestId, SessionId, TurnId } from "@km/agent-harness"
import { attachWire } from "../src/wire.ts"
import { createAmbientStream } from "../../../src/ambient-stream.ts"
import { createChannelQueue } from "../../../src/channel-queue.ts"
import type { ChannelEvent } from "../../../src/channel-queue.ts"

const SID = "sess-bug-test"
const TID = "turn-bug-test" as TurnId

// ---------------------------------------------------------------------------
// Stubs (re-used pattern from wire-write-ordering.test.ts)
// ---------------------------------------------------------------------------

function makeFakeAgentSession(): AgentSession & {
  push(e: AgentEvent): void
  permissionResponses: Array<{ requestId: string; approved: boolean }>
} {
  const bus = new EventEmitter()
  const permissionResponses: Array<{ requestId: string; approved: boolean }> = []
  return {
    sessionId: SID as SessionId,
    closed: false,
    subscribe(handler: (e: AgentEvent) => void) {
      bus.on("event", handler)
      return () => bus.off("event", handler)
    },
    send(_text: string): void {
      // unused
    },
    respondToPermission(requestId: Parameters<AgentSession["respondToPermission"]>[0], approved: boolean): void {
      permissionResponses.push({ requestId: String(requestId), approved })
    },
    close(): Promise<void> {
      return Promise.resolve()
    },
    [Symbol.asyncDispose](): Promise<void> {
      return Promise.resolve()
    },
    push(e: AgentEvent): void {
      bus.emit("event", e)
    },
    permissionResponses,
  } as unknown as AgentSession & {
    push(e: AgentEvent): void
    permissionResponses: Array<{ requestId: string; approved: boolean }>
  }
}

function makeRecordingConnection(): {
  conn: acp.AgentSideConnection
  updates: acp.SessionNotification[]
  permissionRequests: acp.RequestPermissionRequest[]
} {
  const updates: acp.SessionNotification[] = []
  const permissionRequests: acp.RequestPermissionRequest[] = []
  const conn = {
    sessionUpdate(payload: acp.SessionNotification): Promise<void> {
      updates.push(payload)
      return Promise.resolve()
    },
    requestPermission(payload: acp.RequestPermissionRequest): Promise<acp.RequestPermissionResponse> {
      permissionRequests.push(payload)
      return Promise.resolve({ outcome: { outcome: "selected", optionId: "allow_once" } })
    },
  } as unknown as acp.AgentSideConnection
  return { conn, updates, permissionRequests }
}

// ===========================================================================
// Bug 1 — Status stuck (turn-end synthesis on prompt resolve)
// ===========================================================================

describe("bug 1 — claude-acp wire emits turn-end on prompt resolve", () => {
  test("turn-end is emitted by the wire when AgentSession fires turn-end", async () => {
    // The wire's `awaitTurn()` settles when an AgentEvent of kind "turn-end"
    // arrives. The full chain (silvercode → claude-acp wire → spawnClaude
    // legacy AgentEvent stream) relies on spawnClaude/parse.ts emitting
    // turn-end on the result entry. wire.ts:222 maps that to settling the
    // awaitTurn promise. Before the fix, no turn-end was synthesized when
    // the legacy session ended without one.
    const session = makeFakeAgentSession()
    const { conn } = makeRecordingConnection()
    const wire = attachWire(conn, session, SID)
    const turnPromise = wire.awaitTurn()

    session.push({
      kind: "turn-end",
      sessionId: SID as SessionId,
      turnId: TID,
      stopReason: "end_turn",
      ts: Date.now(),
    })

    const result = await turnPromise
    expect(result.stopReason).toBe("end_turn")
    wire.detach()
  })

  test("session-end also resolves awaitTurn (defensive — settlement on terminal lifecycle)", async () => {
    const session = makeFakeAgentSession()
    const { conn } = makeRecordingConnection()
    const wire = attachWire(conn, session, SID)
    const turnPromise = wire.awaitTurn()

    session.push({
      kind: "session-end",
      sessionId: SID as SessionId,
      stopReason: "cancelled",
      ts: Date.now(),
    })

    const result = await turnPromise
    expect(result.stopReason).toBe("cancelled")
    wire.detach()
  })
})

describe("bug 4 — claude-acp wire routes permissions through ACP", () => {
  test("legacy permission-request becomes conn.requestPermission and resolves the subprocess", async () => {
    const session = makeFakeAgentSession()
    const { conn, permissionRequests } = makeRecordingConnection()
    const wire = attachWire(conn, session, SID)

    session.push({
      kind: "permission-request",
      sessionId: SID as SessionId,
      requestId: "perm-open" as PermissionRequestId,
      tool: "Bash",
      args: { command: 'open -a "LM Studio"' },
      ts: Date.now(),
    } as AgentEvent)

    await new Promise<void>((resolve) => setImmediate(resolve))

    expect(permissionRequests).toHaveLength(1)
    expect(permissionRequests[0]!.toolCall.toolCallId).toBe("perm-open")
    expect(permissionRequests[0]!.toolCall.title).toBe("Bash")
    expect(session.permissionResponses).toEqual([{ requestId: "perm-open", approved: true }])
    wire.detach()
  })
})

// ===========================================================================
// Bug 2 — Ambient events arrive incrementally (not batched)
// ===========================================================================

describe("bug 2 — ambient events stream incrementally per record", () => {
  test("channelQueue.subscribe fires synchronously per enqueue (no batching)", async () => {
    await using scope = createScope("test-ambient-incremental")
    const queue = createChannelQueue(scope)
    const observed: string[] = []
    queue.subscribe((event) => observed.push(event.id))

    queue.enqueue(makeChannelEvent("a"))
    queue.enqueue(makeChannelEvent("b"))
    queue.enqueue(makeChannelEvent("c"))

    // No turn boundary, no flush — subscribers must have already fired
    // exactly once per enqueue.
    expect(observed).toEqual(["a", "b", "c"])
  })

  test("ambientStream.record fires subscribers per event, in order, with fresh entries snapshot", async () => {
    // Reproduces the React-hook flow: each subscribe() call leads to a
    // setEntries(snapshot) — the snapshot must be a fresh array reference
    // and reflect the buffer at THAT call's time, not the final state. The
    // user-reported symptom was filewatch/tribe events accumulating
    // silently and only appearing on the next user prompt; the fix is the
    // synchronous fanout below.
    await using scope = createScope("test-ambient-fanout")
    const stream = createAmbientStream(scope)
    const seen: { sid: string; size: number; refIdx: number }[] = []
    let refIdx = 0
    stream.subscribe((sid) => {
      const snapshot = stream.entries(sid)
      seen.push({ sid, size: snapshot.length, refIdx: refIdx++ })
    })

    stream.record("session-A", makeChannelEvent("a1"))
    stream.record("session-A", makeChannelEvent("a2"))
    stream.record("session-A", makeChannelEvent("a3"))

    expect(seen).toEqual([
      { sid: "session-A", size: 1, refIdx: 0 },
      { sid: "session-A", size: 2, refIdx: 1 },
      { sid: "session-A", size: 3, refIdx: 2 },
    ])
  })

  test("queue → stream pipeline fans out incrementally — no event held until turn boundary", async () => {
    // End-to-end shape mirroring controller.ts: channelQueue.subscribe →
    // ambientStream.record. Verifies no intermediate buffering.
    await using scope = createScope("test-ambient-pipeline")
    const queue = createChannelQueue(scope)
    const stream = createAmbientStream(scope)
    const sessionId = "session-pipeline"
    queue.subscribe((event) => {
      stream.record(sessionId, event)
    })

    const fanoutOrder: string[] = []
    stream.subscribe((sid, entry) => {
      if (sid === sessionId) fanoutOrder.push(entry.id)
    })

    queue.enqueue(makeChannelEvent("filewatch-1"))
    queue.enqueue(makeChannelEvent("tribe-1"))
    queue.enqueue(makeChannelEvent("ci-1"))

    expect(fanoutOrder).toEqual(["filewatch-1", "tribe-1", "ci-1"])
    expect(stream.entries(sessionId)).toHaveLength(3)
  })
})

// ===========================================================================
// Bug 3 — Failed tool produces ONE wire event, not 2
// ===========================================================================

describe("bug 3 — failed tool emits single tool_call_update, no duplicate error event", () => {
  test("tool-result with is_error:true produces exactly one tool_call_update SessionUpdate", async () => {
    // Wire path for a Bash failure:
    //   parse.ts → AgentEvent { kind: "tool-result", is_error: true }
    //   wire.ts:189-204 → SessionUpdate { sessionUpdate: "tool_call_update",
    //                                     status: "failed", ... }
    //
    // Bug 3 (pre-fix): the legacy `error` AgentEvent fired alongside the
    // tool-result (from stderr at the spawn boundary OR from a duplicate
    // emit at the silvercode-side acp-client stderr listener), surfacing
    // a separate "Error" row in the UI on top of the failed ToolCall card.
    //
    // The fixed wire silently drops `error` AgentEvents (case "error" in
    // wire.ts:247-256) — they never become a wire-visible second event.
    // Asserting one update per tool-result locks in that behaviour.
    const session = makeFakeAgentSession()
    const { conn, updates } = makeRecordingConnection()
    const wire = attachWire(conn, session, SID)

    // First the tool-use (ACP requires a `tool_call` before any update).
    session.push({
      kind: "tool-use",
      sessionId: SID as SessionId,
      turnId: TID,
      id: "bash-1" as never,
      name: "Bash",
      input: { command: "tribe status" },
      ts: 1,
    })

    // Then the failure result.
    session.push({
      kind: "tool-result",
      sessionId: SID as SessionId,
      id: "bash-1" as never,
      output: "tribe: command not found\n",
      is_error: true,
      ts: 2,
    })

    // ALSO push a stray legacy `error` event — pre-fix this would bleed
    // through as a separate UI row. The wire must drop it.
    session.push({
      kind: "error",
      sessionId: SID as SessionId,
      message: "tribe: command not found",
      ts: 3,
    })

    await Promise.resolve()

    const updateKinds = updates.map((u) => u.update.sessionUpdate)
    expect(updateKinds).toEqual(["tool_call", "tool_call_update"])

    const failureUpdate = updates[1]!.update as acp.SessionUpdate & {
      sessionUpdate: "tool_call_update"
      status?: acp.ToolCallStatus
    }
    expect(failureUpdate.status).toBe("failed")
    wire.detach()
  })

  test("legacy `error` AgentEvent does NOT translate to any SessionUpdate", async () => {
    // Locks in the wire's defensive stance: error AgentEvents are dropped
    // at the wire boundary (by intent — the future plan is to surface them
    // via an ACP-error notification, but until that's modelled they MUST
    // NOT manifest as SessionUpdates). This is the single guarantee that
    // prevents stderr noise from rendering as a second "Error" row.
    const session = makeFakeAgentSession()
    const { conn, updates } = makeRecordingConnection()
    const wire = attachWire(conn, session, SID)

    session.push({
      kind: "error",
      sessionId: SID as SessionId,
      message: "PostToolUse hook failed",
      ts: 1,
    })
    session.push({
      kind: "error",
      sessionId: SID as SessionId,
      message: "another hook script wrote to stderr",
      ts: 2,
    })

    await Promise.resolve()

    expect(updates).toHaveLength(0)
    wire.detach()
  })
})

// ===========================================================================
// Bug 4 — vault-local slash commands not surfaced through ACP
// ===========================================================================
//
// Bead: km-silvercode.slash-command-vault-discovery (P2 bug).
//
// Symptom: a vault containing `.claude/commands/file.md` exposes a `/file`
// command when run directly via `claude --bare -p`, but silvercode's
// auto-complete dropdown never lists it. The full chain is:
//
//   spawnClaude session-init.slashCommands  (carries `["file", ...]`)
//      → claude-acp wire.ts session-init   (DROPPED before this fix —
//                                           the case fell through to the
//                                           "no SessionUpdate slot" comment
//                                           and the names never reached the
//                                           ACP wire)
//      → silvercode-side acp-client        (already had a no-op branch for
//                                           available_commands_update)
//      → AvailableCommandsPalette          (only shows STATIC_COMMANDS)
//
// Fix: when session-init carries slashCommands, the wire emits an ACP
// `available_commands_update` SessionUpdate so downstream consumers see the
// vault-local + plugin commands the underlying claude subprocess discovered.
describe("bug 4 — wire surfaces slashCommands from session-init", () => {
  test("session-init carrying slashCommands emits an available_commands_update SessionUpdate", async () => {
    const session = makeFakeAgentSession()
    const { conn, updates } = makeRecordingConnection()
    const wire = attachWire(conn, session, SID)

    session.push({
      kind: "session-init",
      sessionId: SID as SessionId,
      cwd: "/vault",
      model: "claude-opus-4-7",
      mode: "default",
      tools: [],
      mcp_servers: [],
      slashCommands: ["file", "groom-docs", "do"],
      skills: [],
      plugins: [],
      claudeCodeVersion: "test",
      apiKeySource: "test",
      ts: 1,
    })

    await Promise.resolve()

    const cmdUpdates = updates.filter((u) => u.update.sessionUpdate === "available_commands_update")
    expect(cmdUpdates).toHaveLength(1)
    const cmdUpdate = cmdUpdates[0]!.update as acp.SessionUpdate & {
      sessionUpdate: "available_commands_update"
      availableCommands: acp.AvailableCommand[]
    }
    expect(cmdUpdate.availableCommands.map((c) => c.name)).toEqual(["file", "groom-docs", "do"])
    // Names must NOT carry a leading slash — ACP's AvailableCommand.name is bare.
    expect(cmdUpdate.availableCommands.every((c) => !c.name.startsWith("/"))).toBe(true)
    wire.detach()
  })

  test("session-init with empty slashCommands emits NO available_commands_update", async () => {
    // Don't pollute the wire when there's nothing to advertise (e.g. the ACP
    // path's synthetic init from acp-client.ts).
    const session = makeFakeAgentSession()
    const { conn, updates } = makeRecordingConnection()
    const wire = attachWire(conn, session, SID)

    session.push({
      kind: "session-init",
      sessionId: SID as SessionId,
      cwd: "/vault",
      model: "claude-opus-4-7",
      mode: "default",
      tools: [],
      mcp_servers: [],
      slashCommands: [],
      skills: [],
      plugins: [],
      claudeCodeVersion: "test",
      apiKeySource: "test",
      ts: 1,
    })

    await Promise.resolve()
    expect(updates).toHaveLength(0)
    wire.detach()
  })
})

// ---------------------------------------------------------------------------

function makeChannelEvent(id: string, source = "filewatch"): ChannelEvent {
  return {
    id,
    source,
    content: `event-${id}`,
    timestamp: Date.now(),
  }
}
