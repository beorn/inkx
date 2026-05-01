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

function systemMessage(id: string, text: string, ts: number): MessageEntry {
  return {
    id: id as TurnId,
    role: "system",
    ops: [{ kind: "text", text }],
    text,
    toolCalls: [],
    toolResults: [],
    ts,
  } as unknown as MessageEntry
}

function renderList(messages: MessageEntry[], rows = 18, follow: "end" | false = "end") {
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
        follow={follow}
      />
    </Box>,
  )
}

function lineIndex(lines: string[], needle: string): number {
  return lines.findIndex((line) => line.includes(needle))
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

    for (let i = 0; i < 8; i++) {
      await app.wheel(20, 9, -1)
    }

    expect(app.text.includes("data:image") || app.text.includes("prompt ") || app.text.includes("response ")).toBe(true)
  })

  test("adjacent user messages render without an outer blank row between them", () => {
    const app = renderList([userMessage("u-1", "first user", 1000), userMessage("u-2", "second user", 1001)], 12, false)

    const first = lineIndex(app.lines, "first user")
    const second = lineIndex(app.lines, "second user")

    expect(first).toBeGreaterThanOrEqual(0)
    expect(second).toBeGreaterThan(first)
    expect(second - first).toBe(3)
  })

  test("adjacent system messages render without an outer blank row between them", () => {
    const app = renderList(
      [systemMessage("s-1", "first system", 1000), systemMessage("s-2", "second system", 1001)],
      8,
      false,
    )

    const first = lineIndex(app.lines, "first system")
    const second = lineIndex(app.lines, "second system")

    expect(first).toBeGreaterThanOrEqual(0)
    expect(second).toBe(first + 1)
  })
})
