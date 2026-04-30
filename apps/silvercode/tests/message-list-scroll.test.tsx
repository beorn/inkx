import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box } from "silvery"
import type { MessageEntry, TurnId } from "@km/agent-harness"
import { SessionUpdateList } from "../src/components/SessionUpdateList.tsx"

function userMessage(id: string, text: string, ts: number): MessageEntry {
  return {
    id: id as TurnId,
    role: "user",
    ops: [{ kind: "text", text }],
    text,
    toolCalls: [],
    toolResults: [],
    ts,
  } as unknown as MessageEntry
}

function assistantMessage(id: string, text: string, ts: number): MessageEntry {
  return {
    id: id as TurnId,
    role: "assistant",
    ops: [{ kind: "text", text }],
    text,
    toolCalls: [],
    toolResults: [],
    ts,
  } as unknown as MessageEntry
}

function renderList(messages: MessageEntry[], rows = 18) {
  const renderer = createRenderer({ cols: 90, rows })
  return renderer(
    <Box width={90} height={rows} flexDirection="column">
      <SessionUpdateList
        messages={messages}
        status="idle"
        turnStartedAt={null}
        inputTokens={0}
        outputTokens={0}
        pendingPermissions={0}
        inFlightTool={null}
        sessionId="scroll-test"
        onApprove={() => {}}
        onDeny={() => {}}
      />
    </Box>,
  )
}

describe("SessionUpdateList scroll", () => {
  test("wheel-up from resumed tail keeps transcript content visible", async () => {
    const long = `data:image/png;base64,${"a".repeat(5000)}`
    const messages: MessageEntry[] = [
      assistantMessage("a-long", long, 1000),
      ...Array.from({ length: 36 }, (_, i) =>
        i % 2 === 0
          ? userMessage(`u-${i}`, `prompt ${i}`, 1010 + i)
          : assistantMessage(`a-${i}`, `response ${i}`, 1010 + i),
      ),
    ]
    const app = renderList(messages)

    expect(app.text).toContain("response 35")

    for (let i = 0; i < 180; i++) {
      await app.wheel(20, 9, -1)
    }

    expect(app.text.includes("data:image") || app.text.includes("prompt ") || app.text.includes("response ")).toBe(true)
  })
})
