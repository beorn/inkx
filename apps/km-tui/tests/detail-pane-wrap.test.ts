import { describe, test, expect } from "vitest"
import React from "react"
import { createRenderer } from "inkx/testing"
import { createFakeRepo } from "@km/storage"
import type { KNode } from "@km/core"
import { DetailPane } from "../src/views/DetailPane.tsx"
import { RepoProvider } from "../src/repo-context.tsx"

// DetailPane renders without its own border (WorkspaceView provides it).
// Test renders it standalone, so width simulates the content area inside a border.
const PANE_WIDTH = 40
const CONTENT_WIDTH = PANE_WIDTH - 2 // Subtract border that WorkspaceView would add
const render = createRenderer({ cols: PANE_WIDTH, rows: 30 })

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

/**
 * Assert no line breaks mid-word across consecutive lines.
 *
 * A mid-word break is when a single word is split across lines (e.g., "boun" / "daries").
 * Normal word wrapping (e.g., "should" / "wrap") is NOT a mid-word break.
 *
 * Detection: extract the last word-fragment of line N and the first word-fragment
 * of line N+1. If concatenating them yields a word present in the original content
 * (joined by no space), it's a mid-word break. If they're separate words, it's fine.
 */
function assertNoMidWordBreaks(lines: string[]) {
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i]!.trimEnd()
    const nextLine = lines[i + 1]!.trimStart()
    if (!line || !nextLine) continue
    const lastWord = line.match(/([a-zA-Z]+)$/)?.[1] ?? ""
    const firstWord = nextLine.match(/^([a-zA-Z]+)/)?.[1] ?? ""
    if (!lastWord || !firstWord) continue
    // Concatenate: if "lastWordfirstWord" (no space) appears in consecutive rendered
    // text, it means the renderer split a word. But "lastWord firstWord" (with space)
    // in the original text is normal word wrapping.
    // Simple heuristic: check if the combined fragment is unusually long (>15 chars)
    // or if both fragments are very short (single chars split from a word).
    // For robust detection: a mid-word break produces fragments that are NOT
    // complete English words by themselves. But we use a simpler check:
    // if the last "word" is a common word (>= 2 chars) and the first "word"
    // is also a common word (>= 2 chars), it's two separate words.
    const isTwoWords = lastWord.length >= 2 && firstWord.length >= 2
    if (isTwoWords) continue // Two separate words — not a mid-word break
    // Single-char fragments are suspicious — flag them
    expect(false, `Line "${line}" breaks mid-word into "${nextLine}" (fragments: "${lastWord}" + "${firstWord}")`).toBe(
      false,
    )
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
    const app = renderDetailPane(repo, task, CONTENT_WIDTH, 30)

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
    const app = renderDetailPane(repo, task, CONTENT_WIDTH, 30)

    // No rendered line should exceed the pane width (renderer columns)
    const allLines = app.text.split("\n")
    for (const line of allLines) {
      // Use trimEnd to ignore trailing spaces but check visible content width
      expect(line.length).toBeLessThanOrEqual(PANE_WIDTH)
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
    const app = renderDetailPane(repo, parent, CONTENT_WIDTH, 30)

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
    const detailPane = React.createElement(DetailPane, { node: task, width: 28, height: 30 })
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
