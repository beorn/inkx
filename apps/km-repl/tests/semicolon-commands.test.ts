/**
 * Tests for semicolon-separated commands in km sh -c mode
 *
 * Verifies that state is properly preserved between commands when using
 * semicolon-separated command lists (e.g., 'j; j; state')
 */

import { describe, test, expect } from "vitest"
import { runShell, createBoardState, serializeState } from "../src/index.ts"
import type { TNode, OutputEvent } from "../src/index.ts"

// Helper to create a simple test tree
function createTestTree(): TNode[] {
  return [
    {
      id: "section-1",
      type: "h",
      item: {},
      parent_id: null,
      parent_idx: 0,
      embed_source: null,
      name: "tasks",
      title: "Tasks",
      priority: undefined,
      due_at: undefined,
      start_at: undefined,
      content: "",
      rules: undefined,
      data: {},
      created_at: 0,
      updated_at: 0,
      version: "",
      children: [
        {
          id: "task-a",
          type: "p",
          item: { task: { marker: "[ ]" as const, status: "todo" as const } },
          parent_id: "section-1",
          parent_idx: 0,
          embed_source: null,
          name: "task-a",
          title: "Task A",
          priority: undefined,
          due_at: undefined,
          start_at: undefined,
          content: "",
          rules: undefined,
          data: {},
          created_at: 0,
          updated_at: 0,
          version: "",
          children: [],
          childCount: 0,
          childrenLoaded: true,
          isTask: true,
          depth: 1,
        },
        {
          id: "task-b",
          type: "p",
          item: { task: { marker: "[ ]" as const, status: "todo" as const } },
          parent_id: "section-1",
          parent_idx: 1,
          embed_source: null,
          name: "task-b",
          title: "Task B",
          priority: undefined,
          due_at: undefined,
          start_at: undefined,
          content: "",
          rules: undefined,
          data: {},
          created_at: 0,
          updated_at: 0,
          version: "",
          children: [],
          childCount: 0,
          childrenLoaded: true,
          isTask: true,
          depth: 1,
        },
        {
          id: "task-c",
          type: "p",
          item: { task: { marker: "[ ]" as const, status: "todo" as const } },
          parent_id: "section-1",
          parent_idx: 2,
          embed_source: null,
          name: "task-c",
          title: "Task C",
          priority: undefined,
          due_at: undefined,
          start_at: undefined,
          content: "",
          rules: undefined,
          data: {},
          created_at: 0,
          updated_at: 0,
          version: "",
          children: [],
          childCount: 0,
          childrenLoaded: true,
          isTask: true,
          depth: 1,
        },
      ],
      childCount: 3,
      childrenLoaded: true,
      isTask: false,
      depth: 0,
    },
    {
      id: "section-2",
      type: "h",
      item: {},
      parent_id: null,
      parent_idx: 1,
      embed_source: null,
      name: "done",
      title: "Done",
      priority: undefined,
      due_at: undefined,
      start_at: undefined,
      content: "",
      rules: undefined,
      data: {},
      created_at: 0,
      updated_at: 0,
      version: "",
      children: [
        {
          id: "task-d",
          type: "p",
          item: { task: { marker: "[ ]" as const, status: "todo" as const } },
          parent_id: "section-2",
          parent_idx: 0,
          embed_source: null,
          name: "task-d",
          title: "Task D",
          priority: undefined,
          due_at: undefined,
          start_at: undefined,
          content: "",
          rules: undefined,
          data: {},
          created_at: 0,
          updated_at: 0,
          version: "",
          children: [],
          childCount: 0,
          childrenLoaded: true,
          isTask: true,
          depth: 1,
        },
      ],
      childCount: 1,
      childrenLoaded: true,
      isTask: false,
      depth: 0,
    },
  ]
}

describe("Semicolon-separated commands", () => {
  test("single navigation command", async () => {
    const nodes = createTestTree()
    const initialState = createBoardState(nodes, null, "/test")

    const finalState = await runShell(["l"], initialState, {
      jsonMode: false,
      verbose: false,
    })

    expect(finalState.cursor).toEqual([0, 0])
  })

  test("two navigation commands with semicolon", async () => {
    const nodes = createTestTree()
    const initialState = createBoardState(nodes, null, "/test")

    // Parse semicolon-separated commands like sh.ts does
    const commands = "l; j".split(/[;\n]/).filter((c) => c.trim())

    const finalState = await runShell(commands, initialState, {
      jsonMode: false,
      verbose: false,
    })

    // After 'l' cursor should be at [0,0] (Task A)
    // After 'j' cursor should be at [0,1] (Task B)
    expect(finalState.cursor).toEqual([0, 1])
  })

  test("multiple navigation commands", async () => {
    const nodes = createTestTree()
    const initialState = createBoardState(nodes, null, "/test")

    const commands = "l; j; j".split(/[;\n]/).filter((c) => c.trim())

    const finalState = await runShell(commands, initialState, {
      jsonMode: false,
      verbose: false,
    })

    // Should end at [0,2] (Task C)
    expect(finalState.cursor).toEqual([0, 2])
  })

  test("navigation down and back up", async () => {
    const nodes = createTestTree()
    const initialState = createBoardState(nodes, null, "/test")

    const commands = "l; j; k".split(/[;\n]/).filter((c) => c.trim())

    const finalState = await runShell(commands, initialState, {
      jsonMode: false,
      verbose: false,
    })

    // Should end back at [0,0] (Task A)
    expect(finalState.cursor).toEqual([0, 0])
  })

  test("cross-column navigation", async () => {
    const nodes = createTestTree()
    const initialState = createBoardState(nodes, null, "/test")

    const commands = "h; j; l".split(/[;\n]/).filter((c) => c.trim())

    const finalState = await runShell(commands, initialState, {
      jsonMode: false,
      verbose: false,
    })

    // h: go to parent (column level) → [0]
    // j: next column → [1]
    // l: into column → [1,0] (Task D)
    expect(finalState.cursor).toEqual([1, 0])
  })

  test("state is preserved in JSON mode", async () => {
    const nodes = createTestTree()
    const initialState = createBoardState(nodes, null, "/test")

    const events: OutputEvent[] = []
    const output = (event: OutputEvent | string) => {
      if (typeof event !== "string") {
        events.push(event)
      }
    }

    const commands = "l; j".split(/[;\n]/).filter((c) => c.trim())

    await runShell(commands, initialState, {
      jsonMode: true,
      verbose: false,
      output,
    })

    // Find state change events
    const stateEvents = events.filter((e) => e.event === "state")
    expect(stateEvents.length).toBeGreaterThan(0)

    // Check final cursor position (last state event)
    const lastStateEvent = stateEvents[stateEvents.length - 1]
    expect(lastStateEvent).toBeDefined()

    if (lastStateEvent?.event === "state") {
      expect(lastStateEvent.state.cursor).toEqual([0, 1])
    }
  })
})
