import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box } from "silvery"
import { Chat } from "../src/components/Chat.tsx"
import { ChatBlockList } from "../src/components/ChatBlockList.tsx"
import type { ChatEventId, ChatLeaf, ChatNodeId } from "../src/chat/types.ts"

function id<T>(value: string): T {
  return value as T
}

function messageLeaf(role: "assistant" | "user", text: string, init: Partial<ChatLeaf> = {}): ChatLeaf {
  return {
    id: id<ChatNodeId>(`leaf-${role}-${text.slice(0, 8)}`),
    type: "message",
    track: "transcript",
    eventIds: [id<ChatEventId>(`event-${role}`)],
    width: "prose",
    defaultDisclosure: "collapsed",
    detailAccess: [],
    rawRefs: [],
    props: { role, text },
    ...init,
  } as unknown as ChatLeaf
}

function render(leaves: readonly ChatLeaf[], cols = 100, rows = 24) {
  const renderer = createRenderer({ cols, rows })
  return renderer(
    <Box width={cols} height={rows} flexDirection="column">
      <Chat.Session>
        <ChatBlockList leaves={leaves} follow={false} />
      </Chat.Session>
    </Box>,
  )
}

function sameRgb(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function backgroundRunBounds(
  app: ReturnType<typeof render>,
  row: number,
  col: number,
): { left: number; right: number } {
  const bg = app.cell(col, row).bg
  expect(bg, "target cell should have a prompt bubble background").not.toBeNull()
  let left = col
  while (left > 0 && sameRgb(app.cell(left - 1, row).bg, bg)) left--
  let right = col
  while (right + 1 < app.width && sameRgb(app.cell(right + 1, row).bg, bg)) right++
  return { left, right }
}

describe("ChatBlockList content layout", () => {
  test("user prompt bubbles retain a contiguous right-aligned background run", () => {
    const app = render([messageLeaf("user", "right edge")], 100, 12)
    const row = app.lines.findIndex((line) => line.includes("right edge"))
    expect(row, app.text).toBeGreaterThanOrEqual(0)
    const col = app.lines[row]!.indexOf("right edge")
    const bounds = backgroundRunBounds(app, row, col)

    expect(bounds.left, app.text).toBeLessThan(col)
    expect(bounds.right, app.text).toBeGreaterThan(col + "right edge".length - 1)
    expect(bounds.right, app.text).toBeLessThan(app.width - 1)
  })

  test("assistant prose keeps bullets and code blocks together through ChatBlockList", () => {
    const app = render([messageLeaf("assistant", "Plan:\n\n- keep bullet with context\n\n```ts\nconst value = 1\n```")])

    expect(app.text).toContain("Plan:")
    expect(app.text).toContain("keep bullet with context")
    expect(app.text).toContain("const value = 1")
  })
})
