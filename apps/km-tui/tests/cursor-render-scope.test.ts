import { afterEach, describe, expect, test } from "vitest"
import type { RenderProbeEvent } from "../src/render-probe.ts"
import { createDriverTest, item } from "./helpers/board-test.ts"

function cursorScopeFixture() {
  const cards = Array.from({ length: 24 }, (_, i) =>
    item(`task-${i}`, item(`task-${i}-child-a`), item(`task-${i}-child-b`)),
  )
  return item("board", item("col-a", ...cards), item("col-b", item("other-0"), item("other-1")))
}

afterEach(() => {
  globalThis.__kmTuiRenderProbe = undefined
})

describe("cursor render scope", () => {
  test("plain vertical cursor movement does not re-render BoardCore", () => {
    const events: RenderProbeEvent[] = []
    globalThis.__kmTuiRenderProbe = (event) => events.push(event)

    const { board } = createDriverTest(() => cursorScopeFixture(), {
      columns: 120,
      rows: 40,
      incremental: true,
    })

    events.length = 0
    board.command("cursor_down")

    const boardCoreRenders = events.filter((event) => event.component === "BoardCore")
    expect(boardCoreRenders).toHaveLength(0)
  })

  test("plain vertical cursor movement keeps TreeNode rendering local", () => {
    const events: RenderProbeEvent[] = []
    globalThis.__kmTuiRenderProbe = (event) => events.push(event)

    const { board } = createDriverTest(() => cursorScopeFixture(), {
      columns: 120,
      rows: 40,
      incremental: true,
    })

    events.length = 0
    board.command("cursor_down")

    const renderedNodeIds = new Set(
      events
        .filter(
          (event): event is Extract<RenderProbeEvent, { component: "TreeNode" }> => event.component === "TreeNode",
        )
        .map((event) => event.nodeId),
    )
    expect(renderedNodeIds.size).toBeLessThanOrEqual(12)
  })
})
