import { describe, test, expect } from "vitest"
import React from "react"
import { createRenderer } from "inkx/testing"
import { createFakeRepo } from "@km/storage"
import type { KNode } from "@km/core"
import { DetailPane } from "../src/views/DetailPane.tsx"
import { RepoProvider } from "../src/repo-context.tsx"

const render = createRenderer({ cols: 40, rows: 30 })

const nodeDefaults = {
  parent_idx: 0,
  embed_source: null,
  data: {},
  created_at: Date.now(),
  updated_at: Date.now(),
  version: "test",
} as const

function createTestNode(overrides: Partial<KNode> & { id: string; type: KNode["type"]; content: string }): KNode {
  return { parent_id: null, ...nodeDefaults, ...overrides } as KNode
}

function renderDetailPane(repo: ReturnType<typeof createFakeRepo>, node: KNode, width: number, height: number) {
  const detailPane = React.createElement(DetailPane, { node, width, height })
  return render(React.createElement(RepoProvider, { repo, children: detailPane }))
}

/** Assert no line breaks mid-word across consecutive lines */
function assertNoMidWordBreaks(lines: string[]) {
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i]!.trimEnd()
    const nextLine = lines[i + 1]!.trimStart()
    if (!line || !nextLine) continue
    const lastChar = line[line.length - 1] ?? ""
    const firstChar = nextLine[0] ?? ""
    const isMidWord = /[a-zA-Z]/.test(lastChar) && /[a-zA-Z]/.test(firstChar)
    expect(isMidWord, `Line "${line}" breaks mid-word into "${nextLine}"`).toBe(false)
  }
}

describe("DetailPane word wrapping", () => {
  test("body text wraps at word boundaries, not mid-word", () => {
    const nodes = [
      createTestNode({ id: "task1", type: "p", item: true, content: "Test task" }),
      createTestNode({
        id: "body1",
        type: "p",
        content:
          "This is a long paragraph that should wrap at word boundaries and not split words in the middle of any word",
        parent_id: "task1",
      }),
    ]
    const repo = createFakeRepo({ nodes })
    const task = repo.getNode("task1")!
    const app = renderDetailPane(repo, task, 40, 30)

    const allLines = app.text.split("\n")
    const bodyLines = allLines.filter((l) => {
      const t = l.trim()
      return (
        t.includes("This is") ||
        t.includes("paragraph") ||
        t.includes("boundaries") ||
        t.includes("split") ||
        t.includes("middle")
      )
    })

    expect(bodyLines.length).toBeGreaterThan(1)
    assertNoMidWordBreaks(bodyLines)
  })

  test("metadata value text does not overflow the pane width", () => {
    const nodes = [
      createTestNode({
        id: "task1",
        type: "p",
        item: true,
        content: "Test",
        task_status: "todo",
        data: {
          custom_field: "This is a very long metadata value that definitely exceeds the available width",
        },
      }),
    ]
    const repo = createFakeRepo({ nodes })
    const task = repo.getNode("task1")!
    const app = renderDetailPane(repo, task, 40, 30)

    // No rendered line should exceed the pane width (40 cols)
    const allLines = app.text.split("\n")
    for (const line of allLines) {
      // Use trimEnd to ignore trailing spaces but check visible content width
      expect(line.length).toBeLessThanOrEqual(40)
    }
  })

  test("subitem body wraps at word boundaries", () => {
    const nodes = [
      createTestNode({ id: "parent1", type: "h", item: true, content: "Parent task" }),
      createTestNode({
        id: "sub1",
        type: "p",
        item: true,
        content: "Subtask one",
        parent_id: "parent1",
        task_status: "todo",
        task_marker: "[ ]",
      }),
      createTestNode({
        id: "sub1-body",
        type: "p",
        content: "This subtask body has quite a lot of text that needs to wrap properly at word boundaries",
        parent_id: "sub1",
      }),
    ]
    const repo = createFakeRepo({ nodes })
    const parent = repo.getNode("parent1")!
    const app = renderDetailPane(repo, parent, 40, 30)

    const allLines = app.text.split("\n")
    const bodyLines = allLines.filter((l) => {
      const t = l.trim()
      return t.includes("subtask body") || t.includes("properly") || t.includes("boundaries")
    })

    expect(bodyLines.length).toBeGreaterThan(0)
    assertNoMidWordBreaks(bodyLines)
  })

  test("narrow detail pane still wraps at word boundaries", () => {
    const narrowRender = createRenderer({ cols: 30, rows: 30 })
    const nodes = [
      createTestNode({ id: "task1", type: "p", item: true, content: "Important project review meeting" }),
      createTestNode({
        id: "body1",
        type: "p",
        content:
          "We need to discuss the quarterly budget review and finalize the deployment schedule before the deadline",
        parent_id: "task1",
      }),
    ]
    const repo = createFakeRepo({ nodes })
    const task = repo.getNode("task1")!
    const detailPane = React.createElement(DetailPane, { node: task, width: 30, height: 30 })
    const app = narrowRender(React.createElement(RepoProvider, { repo, children: detailPane }))

    const allLines = app.text.split("\n")
    const bodyLines = allLines.filter((l) => {
      const t = l.trim()
      return (
        t.includes("discuss") ||
        t.includes("quarterly") ||
        t.includes("budget") ||
        t.includes("finalize") ||
        t.includes("deployment") ||
        t.includes("deadline")
      )
    })

    expect(bodyLines.length).toBeGreaterThan(1)
    assertNoMidWordBreaks(bodyLines)
  })
})
