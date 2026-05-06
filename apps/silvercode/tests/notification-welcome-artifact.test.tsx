import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box } from "silvery"
import type { AgentEvent, SessionId, TurnId } from "@km/agent-harness"
import { createSilvercodeController } from "../src/controller.ts"
import { ChatPane } from "../src/components/ChatPane.tsx"
import { makeNotificationEventId } from "../src/notification-adapters/types.ts"
import { createFakeSession } from "../src/test/fake-session.ts"

const SESSION = "notification-artifact-session" as SessionId

function sessionInit(): AgentEvent {
  return {
    kind: "session-init",
    sessionId: SESSION,
    cwd: "/tmp/silvercode-notification-artifact-test",
    model: "test-model",
    mode: "auto",
    tools: [],
    mcp_servers: [],
    slashCommands: [],
    skills: [],
    plugins: [],
    claudeCodeVersion: "test-version",
    apiKeySource: "test",
    ts: 1_000,
  }
}

describe("notification events around Welcome", () => {
  test("startup Tribe notification stays hidden on Welcome and later renders inside the content lane", async () => {
    const fake = createFakeSession()
    const controller = createSilvercodeController({
      cwd: "/tmp/silvercode-notification-artifact-test",
      model: "test-model",
      agent: "codex",
      bare: true,
      initialSessions: 0,
      spawnFactory: () => fake,
      disableNotificationAdapters: true,
      disableLegacyTribeSource: true,
    })
    const handle = await controller.spawnSession("s1")
    fake.emit(sessionInit())

    controller.channelQueue.enqueue({
      id: makeNotificationEventId("tribe"),
      source: "tribe",
      timestamp: 1_100,
      content: "[broadcast tribe] Committed: 407b30668 feat(silvercode): checkpoint chat layout plateau work",
      meta: { fromSessionId: "peer" },
    })

    const renderer = createRenderer({ cols: 132, rows: 32 })
    const tree = (
      <Box flexDirection="row" width={132} height={32}>
        <Box flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden">
          <ChatPane
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
      </Box>
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

    const notificationRow = app.lines.findIndex((line) => line.includes("Tribe") && line.includes("Committed"))
    const assistantRow = app.lines.findIndex((line) => line.includes("I will continue"))
    expect(notificationRow, app.text).toBeGreaterThanOrEqual(0)
    expect(assistantRow, app.text).toBeGreaterThan(notificationRow)
    expect(app.lines[notificationRow]!.indexOf("Tribe")).toBe(app.lines[assistantRow]!.indexOf("I will continue"))
    expect(app.lines[notificationRow]!.indexOf("Tribe")).toBeGreaterThan(2)
  })
})
