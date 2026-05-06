import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box } from "silvery"
import { NotificationBlock, notificationBlockCountsFromMessages } from "../src/components/NotificationBlock.tsx"
import type { BackgroundTask } from "../src/controller.ts"
import type { MessageEntry } from "@km/agent-harness"

function runningTask(id = "bg-1"): BackgroundTask {
  return {
    id,
    turnId: `turn-${id}`,
    startedAt: Date.now() - 5_000,
    status: "running",
    events: [],
    snippet: "reviewing transcript display",
  }
}

function renderBlock(element: React.ReactElement) {
  const render = createRenderer({ cols: 100, rows: 12 })
  return render(
    <Box width={100} height={12} flexDirection="column">
      {element}
    </Box>,
  )
}

function messageWithTools(opts: {
  toolCalls: Array<{ id: string; name: string; input?: unknown }>
  toolResults?: Array<{ id: string }>
}): MessageEntry {
  return {
    id: "m-1",
    role: "assistant",
    ops: [],
    ts: Date.now(),
    text: "",
    toolCalls: opts.toolCalls,
    toolResults: opts.toolResults ?? [],
  } as unknown as MessageEntry
}

describe("NotificationBlock", () => {
  test("renders nothing when there is no notification work", () => {
    const app = renderBlock(
      <NotificationBlock
        counts={{ agentsRunning: 0, backgroundTasksRunning: 0, shellsRunning: 0 }}
        backgroundTasks={[]}
      />,
    )

    expect(app.text.trim()).toBe("")
  })

  test("renders compact running counts", () => {
    const app = renderBlock(
      <NotificationBlock
        counts={{ agentsRunning: 2, backgroundTasksRunning: 1, shellsRunning: 0 }}
        backgroundTasks={[runningTask()]}
      />,
    )

    expect(app.text).toContain("◇ 2 agents · ▣ 1 bg")
  })

  test("counts running sub-agents, background tasks, and shells from session state", () => {
    const messages = [
      messageWithTools({
        toolCalls: [
          { id: "task-1", name: "Task" },
          { id: "agent-1", name: "Agent" },
          { id: "bash-1", name: "Bash", input: { run_in_background: true } },
          { id: "done-task", name: "Task" },
        ],
        toolResults: [{ id: "done-task" }],
      }),
    ]

    expect(notificationBlockCountsFromMessages(messages, [runningTask()])).toEqual({
      agentsRunning: 2,
      backgroundTasksRunning: 1,
      shellsRunning: 1,
    })
  })

  test("clicking a chip opens inline detail", async () => {
    const app = renderBlock(
      <NotificationBlock
        counts={{ agentsRunning: 0, backgroundTasksRunning: 1, shellsRunning: 0 }}
        backgroundTasks={[runningTask()]}
      />,
    )

    const row = app.lines.findIndex((line) => line.includes("▣ 1 bg"))
    expect(row, app.text).toBeGreaterThanOrEqual(0)
    const col = app.lines[row]!.indexOf("▣ 1 bg")

    await app.click(col, row)

    expect(app.text).toContain("Background tasks")
    expect(app.text).toContain("reviewing transcript display")
  })
})
