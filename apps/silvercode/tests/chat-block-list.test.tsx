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

function leaf<T extends ChatLeaf["type"]>(
  type: T,
  props: Extract<ChatLeaf, { type: T }>["props"],
  init: Partial<ChatLeaf> = {},
): Extract<ChatLeaf, { type: T }> {
  return {
    id: id<ChatNodeId>(`leaf-${type}`),
    type,
    track: init.track ?? "transcript",
    eventIds: [id<ChatEventId>(`event-${type}`)],
    width: "prose",
    defaultDisclosure: "collapsed",
    detailAccess: ["expand", "cmd-hover"],
    rawRefs: [{ id: `raw-${type}`, source: "agent", raw: { type, props } }],
    props,
    ...init,
  } as Extract<ChatLeaf, { type: T }>
}

function render(leaves: readonly ChatLeaf[]) {
  const renderApp = createRenderer({ cols: 100, rows: 24 })
  return renderApp(
    <Box width={100} height={24} flexDirection="column">
      <Chat.Session>
        <ChatBlockList leaves={leaves} follow={false} />
      </Chat.Session>
    </Box>,
  )
}

describe("ChatBlockList", () => {
  test("renders projected transcript, notification, and Debug block leaves", () => {
    const app = render([
      leaf("message", { role: "assistant", text: "Done" }),
      leaf("queue", { action: "updated" }, { track: "debug" }),
      leaf("recap", { text: "RECAP · previous work" }, { track: "notification" }),
      leaf("file-snapshot", { files: ["src/app.ts"] }, { track: "debug" }),
    ])

    expect(app.text).toContain("Done")
    expect(app.text).toContain("Queue updated")
    expect(app.text).toContain("RECAP · previous work")
    expect(app.text).toContain("File history snapshot: 1 files")
  })
})
