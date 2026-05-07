/**
 * wire — write-ordering invariant
 *
 * The wire emits sessionUpdate notifications via `conn.sessionUpdate(...)`
 * (which returns a Promise) and resolves `awaitTurn()` on `turn-end`. The
 * invariant pinned here: when an event triggers BOTH a notification AND a
 * waiter resolve in the same callback frame, the notification's write
 * MUST complete before the waiter resolves — otherwise the prompt RPC
 * response can overtake the notification on the JSON-RPC wire and the
 * consumer side updates state out-of-order ("stuck thinking" symptom).
 *
 * Bead: km-silvercode.acp-wire-write-ordering.
 */

import { EventEmitter } from "node:events"
import * as acp from "@agentclientprotocol/sdk"
import type { AgentEvent, AgentSession, SessionId, TurnId } from "@km/agent-harness"
import { addWriter, setSuppressConsole } from "loggily"
import { describe, expect, test } from "vitest"
import { AcpWireWriteDrainTimeoutError, attachWire } from "../src/wire.ts"

/**
 * Stub AgentSession — exposes a `push(event)` method so the test can
 * inject events into the wire's subscribe callback synchronously.
 */
function makeFakeAgentSession(): AgentSession & { push(e: AgentEvent): void } {
  const bus = new EventEmitter()
  return {
    sessionId: "sess-test" as SessionId,
    closed: false,
    subscribe(handler: (e: AgentEvent) => void) {
      bus.on("event", handler)
      return () => bus.off("event", handler)
    },
    send(_text: string): void {
      // unused
    },
    respondToPermission(): void {
      // unused
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
  } as unknown as AgentSession & { push(e: AgentEvent): void }
}

/**
 * Stub AgentSideConnection — `sessionUpdate(...)` returns a Promise that
 * the test can resolve manually to simulate a slow JSON-RPC write. The
 * order in which sessionUpdate calls land vs. how the response is sent
 * is what the test pins.
 */
function makeFakeConnection(): {
  conn: acp.AgentSideConnection
  pendingUpdates: Array<{ resolve: () => void; payload: unknown }>
} {
  const pendingUpdates: Array<{ resolve: () => void; payload: unknown }> = []
  const conn = {
    sessionUpdate(payload: unknown): Promise<void> {
      return new Promise<void>((resolve) => {
        pendingUpdates.push({ resolve: () => resolve(), payload })
      })
    },
  } as unknown as acp.AgentSideConnection
  return { conn, pendingUpdates }
}

const SID = "sess-test"
const TID = "t-1" as TurnId

describe("wire write-ordering — settleNext drains pending sessionUpdate writes", () => {
  test("pending notification write completes before awaitTurn resolves", async () => {
    const session = makeFakeAgentSession()
    const { conn, pendingUpdates } = makeFakeConnection()
    const wire = attachWire(conn, session, SID)

    // Queue a turn waiter — represents the server's `prompt()` handler
    // awaiting the next turn-end.
    const turnPromise = wire.awaitTurn()

    // Track resolution order. The promise returned by `awaitTurn` MUST
    // settle AFTER all pending sessionUpdate writes have been resolved.
    const events: string[] = []
    void turnPromise.then(() => events.push("turn-resolved"))

    // 1. Push a tool-result event — wire emits a sessionUpdate notification.
    //    The fake connection's sessionUpdate Promise stays pending.
    session.push({
      kind: "tool-result",
      sessionId: SID as SessionId,
      id: "tool-1" as never,
      output: "stdout",
      is_error: false,
      ts: 1,
    })
    expect(pendingUpdates).toHaveLength(1)

    // 2. Push turn-end — settleNext is called, which MUST drain pending
    //    writes before resolving the waiter. So `turn-resolved` has NOT
    //    happened yet at this microtask boundary.
    session.push({
      kind: "turn-end",
      sessionId: SID as SessionId,
      turnId: TID,
      stopReason: "end_turn",
      ts: 2,
    })
    // Yield once — if the wire was naive (no drain), turn-resolved would
    // fire here. With drain in place, it must wait for pendingUpdates.
    await Promise.resolve()
    await Promise.resolve()
    expect(events, "turn-resolved fired before sessionUpdate write completed").toEqual([])

    // 3. Resolve the pending write. NOW the drain completes and the
    //    waiter resolves.
    pendingUpdates[0]!.resolve()
    events.push("write-resolved")
    await turnPromise
    expect(events).toEqual(["write-resolved", "turn-resolved"])

    wire.detach()
  })

  test("multiple pending writes — all drained before waiter resolves", async () => {
    const session = makeFakeAgentSession()
    const { conn, pendingUpdates } = makeFakeConnection()
    const wire = attachWire(conn, session, SID)

    const turnPromise = wire.awaitTurn()
    const events: string[] = []
    void turnPromise.then(() => events.push("turn-resolved"))

    // Three concurrent in-flight writes
    session.push({
      kind: "text-delta",
      sessionId: SID as SessionId,
      turnId: TID,
      blockIndex: 0,
      text: "hello ",
      ts: 1,
    })
    session.push({
      kind: "tool-use",
      sessionId: SID as SessionId,
      turnId: TID,
      id: "tool-1" as never,
      name: "Bash",
      input: {},
      ts: 2,
    })
    session.push({
      kind: "tool-result",
      sessionId: SID as SessionId,
      id: "tool-1" as never,
      output: "ok",
      is_error: false,
      ts: 3,
    })
    expect(pendingUpdates).toHaveLength(3)

    session.push({
      kind: "turn-end",
      sessionId: SID as SessionId,
      turnId: TID,
      stopReason: "end_turn",
      ts: 4,
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(events, "waiter resolved while writes still pending").toEqual([])

    // Resolve writes out of order — drain still waits for ALL.
    pendingUpdates[1]!.resolve()
    await Promise.resolve()
    expect(events).toEqual([])
    pendingUpdates[2]!.resolve()
    await Promise.resolve()
    expect(events).toEqual([])
    pendingUpdates[0]!.resolve()
    await turnPromise
    expect(events).toEqual(["turn-resolved"])

    wire.detach()
  })

  test("emit after settleNext doesn't deadlock the next waiter", async () => {
    const session = makeFakeAgentSession()
    const { conn, pendingUpdates } = makeFakeConnection()
    const wire = attachWire(conn, session, SID)

    // First turn — settle cleanly with no pending writes.
    const t1 = wire.awaitTurn()
    session.push({
      kind: "turn-end",
      sessionId: SID as SessionId,
      turnId: TID,
      stopReason: "end_turn",
      ts: 1,
    })
    await t1

    // Second turn — pending write from a tool-result must drain.
    const t2 = wire.awaitTurn()
    session.push({
      kind: "tool-result",
      sessionId: SID as SessionId,
      id: "tool-2" as never,
      output: "ok",
      is_error: false,
      ts: 2,
    })
    session.push({
      kind: "turn-end",
      sessionId: SID as SessionId,
      turnId: "t-2" as TurnId,
      stopReason: "end_turn",
      ts: 3,
    })
    pendingUpdates[pendingUpdates.length - 1]!.resolve()
    const r = await t2
    expect(r.stopReason).toBe("end_turn")

    wire.detach()
  })

  test("stuck notification write is logged and rejects awaitTurn", async () => {
    const session = makeFakeAgentSession()
    const conn = {
      sessionUpdate(_payload: unknown): Promise<void> {
        return new Promise<void>(() => {
          // Never resolves: models an ACP notification write promise that
          // has already put bytes on the wire but never settles.
        })
      },
    } as unknown as acp.AgentSideConnection
    const logs: string[] = []
    const unsubscribeLogs = addWriter({ ns: "silvercode:claude-acp:wire", level: "error" }, (formatted) => {
      logs.push(formatted)
    })
    setSuppressConsole(true)
    const wire = attachWire(conn, session, SID, { writeDrainTimeoutMs: 5 })

    try {
      const turnPromise = wire.awaitTurn()
      session.push({
        kind: "text-delta",
        sessionId: SID as SessionId,
        turnId: TID,
        blockIndex: 0,
        text: "visible answer",
        ts: 1,
      })
      session.push({
        kind: "turn-end",
        sessionId: SID as SessionId,
        turnId: TID,
        stopReason: "end_turn",
        ts: 2,
      })

      const result = await Promise.race([
        turnPromise.then(
          (value) => value,
          (err: unknown) => err,
        ),
        new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 50)),
      ])

      expect(result).toBeInstanceOf(AcpWireWriteDrainTimeoutError)
      expect(String((result as Error).message)).toContain("timed out")
      expect(logs.join("\n")).toContain("sessionUpdate write drain timed out")
    } finally {
      wire.detach()
      unsubscribeLogs()
      setSuppressConsole(false)
    }
  })
})
