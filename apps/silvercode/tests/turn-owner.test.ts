import type { AgentEvent, SessionId, TurnId } from "@km/agent-harness"
import { describe, expect, test } from "vitest"
import { createTurnOwner } from "../src/runtime/turn-owner.ts"

const SESSION = "turn-owner-test" as SessionId

function initEvent(): AgentEvent {
  return {
    kind: "session-init",
    sessionId: SESSION,
    cwd: "/tmp/fake",
    model: "claude-sonnet-4-6",
    mode: "auto",
    tools: [],
    mcp_servers: [],
    slashCommands: [],
    skills: [],
    plugins: [],
    claudeCodeVersion: "2.1.119",
    apiKeySource: "OAuth",
    ts: 1000,
  }
}

function turnStart(turnId: string): AgentEvent {
  return { kind: "turn-start", sessionId: SESSION, turnId: turnId as TurnId, role: "assistant", ts: 1010 }
}

function turnEnd(turnId: string): AgentEvent {
  return { kind: "turn-end", sessionId: SESSION, turnId: turnId as TurnId, stopReason: "end_turn", ts: 1020 }
}

describe("TurnOwner", () => {
  test("allows resume-attach sends before a fresh provider event arrives", () => {
    const owner = createTurnOwner({ acceptsInputWhileActive: true })

    expect(owner.phase()).toBe("created")
    expect(owner.submitUserText("resume follow-up")).toEqual({ kind: "start", text: "resume follow-up" })
    expect(owner.hasPendingStart()).toBe(true)
  })

  test("holds a second prompt until the first provider acknowledgement", () => {
    const owner = createTurnOwner({ acceptsInputWhileActive: true })
    owner.observeProviderEvent(initEvent())

    expect(owner.submitUserText("first")).toEqual({ kind: "start", text: "first" })
    expect(owner.hasPendingStart()).toBe(true)
    expect(owner.submitUserText("second")).toEqual({ kind: "queued", text: "second" })

    expect(owner.observeProviderEvent(turnStart("a1"))).toMatchObject({
      acknowledgedStart: true,
      shouldRetryQueue: true,
    })
    expect(owner.flushQueue()).toEqual({ kind: "start", text: "second" })
  })

  test("lets stdin-buffering transports accept active-turn followups after acknowledgement", () => {
    const owner = createTurnOwner({ acceptsInputWhileActive: true })
    owner.observeProviderEvent(initEvent())
    owner.submitUserText("first")
    owner.observeProviderEvent(turnStart("a1"))

    expect(owner.phase()).toBe("active")
    expect(owner.submitUserText("second")).toEqual({ kind: "start", text: "second" })
    expect(owner.submitUserText("third")).toEqual({ kind: "start", text: "third" })
    expect(owner.queuedText()).toBe("")
  })

  test("keeps normal single-flight submits queued until the active turn settles", () => {
    const owner = createTurnOwner({ acceptsInputWhileActive: false })
    owner.observeProviderEvent(initEvent())
    owner.submitUserText("first")
    owner.observeProviderEvent(turnStart("a1"))

    expect(owner.submitUserText("second")).toEqual({ kind: "queued", text: "second" })

    expect(owner.observeProviderEvent(turnEnd("a1"))).toMatchObject({ shouldRetryQueue: true })
    expect(owner.flushQueue()).toEqual({ kind: "start", text: "second" })
  })

  test("manual flush bypasses active-turn waiting but not pending acknowledgement", () => {
    const owner = createTurnOwner({ acceptsInputWhileActive: false })
    owner.observeProviderEvent(initEvent())
    owner.submitUserText("first")
    owner.observeProviderEvent(turnStart("a1"))

    owner.setQueuedText("second")
    expect(owner.flushQueue({ force: true })).toEqual({ kind: "start", text: "second" })
    owner.setQueuedText("third")
    expect(owner.flushQueue({ force: true })).toEqual({ kind: "noop", reason: "backpressure" })
  })

  test("clears an unacknowledged local start after send failure", () => {
    const owner = createTurnOwner({ acceptsInputWhileActive: true })
    owner.observeProviderEvent(initEvent())

    owner.submitUserText("first")
    owner.setQueuedText("second")
    expect(owner.flushQueue({ force: true })).toEqual({ kind: "noop", reason: "backpressure" })

    expect(owner.abandonPendingStart()).toBe(true)
    expect(owner.flushQueue({ force: true })).toEqual({ kind: "start", text: "second" })
  })
})
