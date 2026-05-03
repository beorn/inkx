import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Screen } from "silvery"
import type { AgentEvent, SessionId, TurnId } from "@km/agent-harness"
import { createSilvercodeController } from "../src/controller.ts"
import { SessionCard } from "../src/components/SessionCard.tsx"
import { makeAmbientEventId } from "../src/ambient-adapters/types.ts"
import { createFakeSession } from "../src/test/fake-session.ts"

const SESSION = "ambient-artifact-session" as SessionId

function sessionInit(): AgentEvent {
  return {
    kind: "session-init",
    sessionId: SESSION,
    cwd: "/tmp/silvercode-ambient-artifact-test",
    model: "test-model",
    mode: "auto",
    tools: [],
    mcp_servers: [],
    slashCommands: [],
    skills: [],
    plugins: [],
    ts: 1_000,
  }
}

describe("ambient events around Welcome", () => {
  test("startup Tribe ambient stays hidden on Welcome and later renders inside the content lane", async () => {
    const fake = createFakeSession()
    const controller = createSilvercodeController({
      cwd: "/tmp/silvercode-ambient-artifact-test",
      model: "test-model",
      agent: "codex",
      initialSessions: 0,
      spawnFactory: () => fake,
      disableAmbientAdapters: true,
      disableLegacyTribeSource: true,
    })
    const handle = await controller.spawnSession("s1")
    fake.emit(sessionInit())

    controller.channelQueue.enqueue({
      id: makeAmbientEventId("tribe"),
      source: "tribe",
      timestamp: 1_100,
      content: '[broadcast tribe] Committed: 407b30668 feat(silvercode): checkpoint chat layout plateau work',
      meta: { fromSessionId: "peer" },
    })

    const renderer = createRenderer({ cols: 132, rows: 32 })
    const tree = (
      <Screen flexDirection="row">
        <Box flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden">
          <SessionCard
            handle={handle}
            controller={controller}
            agent="codex"
            isFocused
            onFocus={() => {}}
            onApprove={() => {}}
            onDeny={() => {}}
            follow={false}
          />
        </Box>
      </Screen>
    )

    const app = renderer(tree)
    expect(app.text).not.toContain("Tribe")
    expect(app.text).not.toContain("Committed: 407b30668")

    fake.emit({
      kind: "user-message",
      sessionId: SESSION,
      turnId: "u1" as TurnId,
      text: "please continue",
      ts: 2_000,
    })
    fake.emit({
      kind: "turn-start",
      sessionId: SESSION,
      turnId: "a1" as TurnId,
      role: "assistant",
      ts: 3_000,
    })
    fake.emit({
      kind: "text-delta",
      sessionId: SESSION,
      turnId: "a1" as TurnId,
      blockIndex: 0,
      text: "I will continue from the checkpoint.",
      ts: 3_100,
    })
    fake.emit({
      kind: "turn-end",
      sessionId: SESSION,
      turnId: "a1" as TurnId,
      stopReason: "end_turn",
      ts: 3_200,
    })
    renderer(tree)

    const ambientRow = app.lines.findIndex((line) => line.includes("Tribe") && line.includes("Committed"))
    const assistantRow = app.lines.findIndex((line) => line.includes("I will continue"))
    expect(ambientRow, app.text).toBeGreaterThanOrEqual(0)
    expect(assistantRow, app.text).toBeGreaterThan(ambientRow)
    expect(app.lines[ambientRow]!.indexOf("Tribe")).toBe(app.lines[assistantRow]!.indexOf("I will continue"))
    expect(app.lines[ambientRow]!.indexOf("Tribe")).toBeGreaterThan(2)
  })
})
