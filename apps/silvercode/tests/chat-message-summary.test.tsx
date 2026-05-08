import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box } from "silvery"
import type { ToolCall as ToolCallType, ToolCallId, ToolCallStatus, ToolKind } from "@km/agent-harness"
import {
  ChatMessageSummary,
  type ChatMessageSummaryActivity,
  type ChatMessageSummaryItem,
} from "../src/components/ChatMessageSummary.tsx"

function toolId(value: string): ToolCallId {
  return value as ToolCallId
}

function activityStatus(status: ToolCallStatus): ChatMessageSummaryActivity["status"] {
  if (status === "in_progress" || status === "pending") return "running"
  if (status === "failed") return "failed"
  return "completed"
}

function item(init: {
  id: string
  title: string
  kind: ToolKind
  status?: ToolCallStatus
  contentText?: string
  errorMessage?: string
}): ChatMessageSummaryItem {
  const status = init.status ?? "completed"
  const toolCall: ToolCallType = {
    toolCallId: toolId(init.id),
    title: init.title,
    kind: init.kind,
    status,
    content: init.contentText ? [{ type: "content", content: { type: "text", text: init.contentText } }] : undefined,
  }
  return {
    id: init.id,
    activity: { id: init.id, status: activityStatus(status) },
    toolCall,
    errorMessage: init.errorMessage,
  }
}

function renderSummary(items: readonly ChatMessageSummaryItem[], defaultExpanded = false) {
  const renderer = createRenderer({ cols: 100, rows: 24 })
  return renderer(
    <Box width={100} height={24} flexDirection="column">
      <ChatMessageSummary items={items} defaultExpanded={defaultExpanded} />
    </Box>,
  )
}

describe("ChatMessageSummary", () => {
  test("summarizes grouped tool activity without backend message fixtures", () => {
    const app = renderSummary([
      item({ id: "read", title: "Read src/components/ChatBlockList.tsx", kind: "read" }),
      item({ id: "cmd", title: "bun vitest run apps/silvercode/tests/chat-block-list.test.tsx", kind: "execute" }),
      item({ id: "edit", title: "Edited src/components/ChatBlockList.tsx (+4 -1)", kind: "edit" }),
    ])

    expect(app.text).toContain("Read 1 file")
    expect(app.text).toContain("Ran 1 command")
    expect(app.text).toContain("Edited 1 file +4 -1")
  })

  test("shows active phrasing for running tools", () => {
    const app = renderSummary([
      item({ id: "active-read", title: "Read src/chat/project-transcript.ts", kind: "read", status: "in_progress" }),
    ])

    expect(app.text).toContain("Reading 1 file...")
  })

  test("expanded detail preserves tool content and errors", () => {
    const app = renderSummary(
      [
        item({
          id: "failed-command",
          title: "bun vitest run apps/silvercode/tests/missing.test.tsx",
          kind: "execute",
          status: "failed",
          contentText: "No test files found, exiting with code 1",
          errorMessage: "No test files found, exiting with code 1",
        }),
      ],
      true,
    )

    expect(app.text).toContain("No test files found")
    expect(app.text).toContain("Ran 1 command")
  })
})
