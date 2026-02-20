/**
 * Embed node tests
 *
 * Covers:
 * - Embed create depth: correct section depth when creating nodes among embeds
 * - Embed display: stripping ![[...]] syntax, showing target name/content
 * - Embed task status cycling: 'x' toggles task status on embedded link targets
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import { stripAnsi } from "inkx"
import type { KNode } from "@km/core"

// =============================================================================
// Embed create depth
// =============================================================================

const colItems = (col: string) => `#${col} [data-view='item']`

describe("embed create depth", () => {
  test("new node after embed gets parent depth + 1", () => {
    // Simulate: an H2 column (depth=2) containing embeds (no depth)
    // When creating a new node among the embeds, it should get depth=3
    // (parent depth 2 + 1), NOT depth=2 (the default).
    const { board, repo } = testEnv(() => {
      const nodes = item("board", item("col1", item("embed-a"), item("embed-b")))
      // Set parent column to depth=2 (simulates an H2 section)
      for (const n of nodes) {
        if (n.id === "col1") {
          n.data = { ...n.data, depth: 2 }
        }
        // Embeds have no depth — simulate by leaving data.depth unset
        // and setting link_to (what makes them embeds in the real app)
        if (n.id === "embed-a" || n.id === "embed-b") {
          n.link_to = "some-target"
          n.type = "oi"
          n.data = {} // no depth, like real embeds
        }
      }
      return nodes
    })

    // Navigate to first embed, press n to create new node after it
    board.press("n")
    board.press("Escape") // exit inline edit

    const items = board.q(colItems("col1"))
    expect(items.count()).toBe(3)

    // The new node (at position 1, between embed-a and embed-b) should
    // have depth=3 (parent col depth=2 + 1), NOT depth=2
    const newNodeId = items.nth(1).getAttribute("id")
    expect(newNodeId).toBeDefined()
    expect(newNodeId).not.toBe("embed-a")
    expect(newNodeId).not.toBe("embed-b")

    const newNode = repo.getNode(newNodeId!)
    expect(newNode).toBeTruthy()
    expect(newNode!.data?.depth).toBe(3)
  })

  test("new node after section sibling inherits sibling depth", () => {
    // When siblings have explicit depth, the new node should inherit it
    // directly (not compute from parent).
    const { board, repo } = testEnv(() => {
      const nodes = item("board", item("col1", item("sec-a"), item("sec-b")))
      // Parent column is H1 (depth=1 would be unusual, let's use a more
      // realistic H2 parent with H3 children)
      for (const n of nodes) {
        if (n.id === "col1") {
          n.data = { ...n.data, depth: 2 }
        }
        if (n.id === "sec-a" || n.id === "sec-b") {
          n.type = "oi"
          n.data = { depth: 3 }
        }
      }
      return nodes
    })

    // Navigate to sec-a, press n
    board.press("n")
    board.press("Escape")

    const items = board.q(colItems("col1"))
    expect(items.count()).toBe(3)

    const newNodeId = items.nth(1).getAttribute("id")
    expect(newNodeId).toBeDefined()

    const newNode = repo.getNode(newNodeId!)
    expect(newNode).toBeTruthy()
    // Should inherit sibling depth=3 directly
    expect(newNode!.data?.depth).toBe(3)
  })

  test("new node at board root level gets depth 2", () => {
    // When the parent column has no depth (file node), children should
    // default to depth=2 (standard H2 under a file).
    const { board, repo } = testEnv(() => {
      const nodes = item("board", item("col1", item("child-a"), item("child-b")))
      // col1 has no depth (simulates a file node)
      // children also have no depth (e.g., paragraphs or embeds)
      for (const n of nodes) {
        if (n.id === "child-a" || n.id === "child-b") {
          n.type = "oi"
          n.data = {} // no depth
        }
      }
      return nodes
    })

    board.press("n")
    board.press("Escape")

    const items = board.q(colItems("col1"))
    expect(items.count()).toBe(3)

    const newNodeId = items.nth(1).getAttribute("id")
    expect(newNodeId).toBeDefined()

    const newNode = repo.getNode(newNodeId!)
    expect(newNode).toBeTruthy()
    // Parent has no depth (file), so default is 2
    expect(newNode!.data?.depth).toBe(2)
  })

  test("new node before embed also gets correct depth", () => {
    // Same bug could occur with `p` (insert above) — verify it uses
    // siblingOrParentDepth too.
    const { board, repo } = testEnv(() => {
      const nodes = item("board", item("col1", item("embed-a"), item("embed-b")))
      for (const n of nodes) {
        if (n.id === "col1") {
          n.data = { ...n.data, depth: 2 }
        }
        if (n.id === "embed-a" || n.id === "embed-b") {
          n.link_to = "some-target"
          n.type = "oi"
          n.data = {}
        }
      }
      return nodes
    })

    // Press p to insert before current node
    board.press("p")
    board.press("Escape")

    const items = board.q(colItems("col1"))
    expect(items.count()).toBe(3)

    // The new node (at position 0, before embed-a) should get depth=3
    const newNodeId = items.nth(0).getAttribute("id")
    expect(newNodeId).toBeDefined()
    expect(newNodeId).not.toBe("embed-a")
    expect(newNodeId).not.toBe("embed-b")

    const newNode = repo.getNode(newNodeId!)
    expect(newNode).toBeTruthy()
    expect(newNode!.data?.depth).toBe(3)
  })
})

// =============================================================================
// Embed display
// =============================================================================

describe("embed display", () => {
  test("unresolved embed with link_to=null does not show ! prefix", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Paragraph embed where link resolver didn't find target (link_to=null)
        // This happens for file references like ![[some-file.pdf]]
        nodes.push({
          id: "unresolved-embed",
          type: "p" as const,
          content: "![[Target File.pdf]]",
          link_to: null,
          parent_id: "col1",
          parent_idx: 1,
          data: { embeddingTarget: "Target File.pdf" },
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    // Should show the target name without ! prefix
    expect(text).toContain("Target File.pdf")
    // Should NOT show the ! prefix
    expect(text).not.toContain("!Target")
    expect(text).not.toContain("![[")
  })

  test("unresolved embed with block reference does not show ! prefix", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Block reference embed like ![[SomeFile#^abc123]]
        nodes.push({
          id: "block-embed",
          type: "p" as const,
          content: "![[SomeFile#^abc123]]",
          link_to: null,
          parent_id: "col1",
          parent_idx: 1,
          data: { embeddingTarget: "SomeFile" },
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    // Should NOT show the ! prefix
    expect(text).not.toContain("!SomeFile")
    expect(text).not.toContain("![[")
    // Should show the file name, not the block ref
    expect(text).toContain("SomeFile")
    expect(text).not.toContain("^abc123")
  })

  test("unresolved embed with bare ^blockid shows short ID, not raw ref", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Bare block reference embed ![[^1203128650780856]] with link_to=null
        nodes.push({
          id: "bare-block-embed",
          type: "p" as const,
          content: "![[^1203128650780856]]",
          link_to: null,
          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    // Should NOT show the raw block reference with caret
    expect(text).not.toMatch(/\^1203128650780856/)
    // Should NOT show the embed syntax
    expect(text).not.toContain("![[")
  })

  test("resolved embed shows target content without ! prefix", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Target node exists
        nodes.push({
          id: "target-node",
          type: "li" as const,
          list_marker: "-",
          parent_id: "some-file",
          parent_idx: 0,
          link_to: null,
          task_status: "todo",
          task_marker: "[ ]",
          content: "Buy groceries",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as KNode)

        // Embed pointing to existing target
        nodes.push({
          id: "resolved-embed",
          type: "p" as const,
          content: "![[target-node]]",
          link_to: "target-node",
          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    // Should show target's content
    expect(text).toContain("Buy groceries")
    // Should NOT show ! prefix or embed syntax
    expect(text).not.toContain("![[")
    expect(text).not.toContain("!Buy")
  })

  test("multiple unresolved embeds in same column strip ! prefix", () => {
    const { board } = testEnv(
      () => {
        // Column has a regular task plus unresolved embeds
        const nodes = item("board", item("col1", item("regular-task")))

        // Multiple unresolved embeds (simulating real-world @next.md with PDFs)
        const embeds = ["![[2025 Tax Return.pdf]]", "![[Insurance Card.pdf]]", "![[Bank Statement.pdf]]"]

        embeds.forEach((content, idx) => {
          nodes.push({
            id: `embed-${idx}`,
            type: "p" as const,
            content,
            link_to: null,
            parent_id: "col1",
            parent_idx: idx + 1,
            data: {},
            created_at: Date.now(),
            updated_at: Date.now(),
            version: "v1",
          } as KNode)
        })

        return nodes
      },
      { columns: 80, rows: 30 },
    )

    const text = stripAnsi(board.screenshot())
    // Should show clean names without ! prefix
    expect(text).toContain("2025 Tax Return.pdf")
    expect(text).toContain("Insurance Card.pdf")
    expect(text).toContain("Bank Statement.pdf")
    // No ! prefixes on content lines
    const lines = text.split("\n")
    const contentLines = lines.filter((l) => l.includes("Tax") || l.includes("Insurance") || l.includes("Bank"))
    for (const line of contentLines) {
      expect(line).not.toContain("!Tax")
      expect(line).not.toContain("!Insurance")
      expect(line).not.toContain("!Bank")
    }
  })
})

// =============================================================================
// Link title resolution (km-tui.link-title)
// =============================================================================

describe("link title resolution", () => {
  test("resolved embed with block reference content shows target title, not ^blockid", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Target node: a task with content (like an Asana-imported task)
        nodes.push({
          id: "target-task-1",
          type: "li" as const,
          list_marker: "-",
          parent_id: "some-file",
          parent_idx: 0,
          link_to: null,
          task_status: "todo",
          task_marker: "[ ]",
          content: "Tax projects",
          block_id: "1203128650780856",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as KNode)

        // Embed node: link_to is set, content has block reference format
        // This simulates what the rules engine creates + markdown serialization round-trip
        nodes.push({
          id: "embed-1",
          type: "link" as const,
          content: "![[^1203128650780856]]",
          link_to: "target-task-1",
          embed: true,
          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    // Should show the target's content "Tax projects"
    expect(text).toContain("Tax projects")
    // Should NOT show the raw block reference
    expect(text).not.toMatch(/\^1203128650780856/)
  })

  test("resolved embed with file#^blockid content shows target title", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Target node
        nodes.push({
          id: "target-task-2",
          type: "li" as const,
          list_marker: "-",
          parent_id: "some-file",
          parent_idx: 0,
          link_to: null,
          task_status: "todo",
          task_marker: "[ ]",
          content: "Buy groceries",
          block_id: "abc123",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as KNode)

        // Embed with file#^blockid path format
        nodes.push({
          id: "embed-2",
          type: "link" as const,
          content: "![[shopping#^abc123]]",
          link_to: "target-task-2",
          embed: true,
          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    // Should show target content
    expect(text).toContain("Buy groceries")
    // Should NOT show raw embed path
    expect(text).not.toContain("shopping#^abc123")
  })

  test("unresolved embed with ^blockid content shows blockid without caret", () => {
    // When link_to is set but target doesn't exist (stale reference),
    // at minimum strip the ^ prefix from the display
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Embed with link_to pointing to nonexistent target
        nodes.push({
          id: "stale-embed",
          type: "link" as const,
          content: "![[^9999999999999999]]",
          link_to: "nonexistent-target",
          embed: true,
          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    // Should NOT show the raw caret-prefixed block ID
    expect(text).not.toMatch(/\^9999999999999999/)
  })
})

// =============================================================================
// Unresolved Asana embed display (P1 — raw embed IDs in card titles)
// =============================================================================

describe("unresolved Asana embed display", () => {
  test("Failure Mode A: file#^blockId resolves to target title, not raw workspace slug", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Target node that the embed should resolve to
        // Use block_id value as the node ID so fakeRepo.resolveNode finds it
        nodes.push({
          id: "1209600947800994",
          type: "li" as const,
          list_marker: "-",
          parent_id: "some-file",
          parent_idx: 0,
          link_to: null,
          task_status: "todo",
          task_marker: "[ ]",
          content: "Review quarterly report",
          block_id: "1209600947800994",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as KNode)

        // Unresolved embed: link_to is null (block_id not found during import)
        // Content is in the Asana file#^blockId format
        nodes.push({
          id: "asana-embed-a",
          type: "p" as const,
          content: "![[688309546998762-pers-prod#^1209600947800994]]",
          link_to: null,
          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    // Should show the target's actual title
    expect(text).toContain("Review quarterly report")
    // Should NOT show the raw Asana workspace slug
    expect(text).not.toContain("688309546998762-pers-prod")
    // Should NOT show the raw block reference
    expect(text).not.toMatch(/\^1209600947800994/)
  })

  test("Failure Mode B: bare ^blockId resolves to target title, not short ID", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Target node (ID matches the block_id for fakeRepo resolution)
        nodes.push({
          id: "1k4a",
          type: "li" as const,
          list_marker: "-",
          parent_id: "some-file",
          parent_idx: 0,
          link_to: null,
          task_status: "todo",
          task_marker: "[ ]",
          content: "Weekly standup notes",
          block_id: "1k4a",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as KNode)

        // Unresolved embed: bare block ref with link_to=null
        nodes.push({
          id: "bare-embed",
          type: "p" as const,
          content: "![[^1k4a]]",
          link_to: null,
          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    // Should show the target's actual title
    expect(text).toContain("Weekly standup notes")
    // Should NOT show the truncated node ID fallback
    expect(text).not.toContain("(bare-emb")
    // Should NOT show the raw block ref
    expect(text).not.toContain("^1k4a")
  })

  test("unresolvable embed falls back gracefully to cleaned ref", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Embed with file#^blockId where the target doesn't exist at all
        nodes.push({
          id: "orphan-embed",
          type: "p" as const,
          content: "![[my-notes#^nonexistent]]",
          link_to: null,
          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    // Should fall back to showing the file name (cleaned ref), not the block ID
    expect(text).toContain("my-notes")
    // Should NOT show the block ref
    expect(text).not.toContain("^nonexistent")
  })
})

// =============================================================================
// Embed task status cycling (km-79kld)
// =============================================================================

describe("embed task status cycling (km-79kld)", () => {
  /** Build a board where embeds link to task nodes */
  function embedTaskBoard() {
    const env = testEnv(() => {
      const nodes = item(
        "board",
        item("col1", item("embed-a"), item("embed-b"), item("regular-task")),
        item("col2", item("task-x")),
      )
      // Set up embed-a and embed-b as link nodes pointing to task targets
      for (const n of nodes) {
        if (n.id === "embed-a") {
          n.type = "p"
          n.link_to = "target-a"
          n.task_status = undefined
          n.data = {}
        }
        if (n.id === "embed-b") {
          n.type = "p"
          n.link_to = "target-b"
          n.task_status = undefined
          n.data = {}
        }
        if (n.id === "regular-task") {
          n.type = "li"
          n.list_marker = "-"
          n.task_status = "todo"
          n.task_marker = "[ ]"
        }
        if (n.id === "col1" || n.id === "col2") {
          n.type = "oi"
          n.fstype = "mdsection"
          n.data = { depth: 2 }
        }
      }

      // Add the target nodes (tasks that the embeds point to)
      nodes.push({
        id: "target-a",
        type: "li",
        list_marker: "-",
        parent_id: "some-other-parent",
        parent_idx: 0,
        link_to: null,
        task_status: "todo",
        task_marker: "[ ]",
        content: "Target task A",
        data: {},
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      })
      nodes.push({
        id: "target-b",
        type: "li",
        list_marker: "-",
        parent_id: "some-other-parent",
        parent_idx: 1,
        link_to: null,
        task_status: "done",
        task_marker: "[x]",
        content: "Target task B",
        data: {},
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      })

      return nodes
    })
    return env
  }

  test("x toggles task status on embed link targeting a task", () => {
    const { board, repo } = embedTaskBoard()

    // Cursor starts on embed-a (first card in col1)
    // embed-a links to target-a which has task_status: "todo"
    const targetBefore = repo.getNode("target-a")
    expect(targetBefore?.task_status).toBe("todo")

    // Press x to toggle task done
    board.press("x")

    // target-a should now cycle to next status
    const targetAfter = repo.getNode("target-a")
    expect(targetAfter?.task_status).not.toBe("todo")
  })

  test("x on regular task node still works", () => {
    const { board, repo } = embedTaskBoard()

    // Navigate to regular-task (3rd card in col1)
    board.press("j") // embed-b
    board.press("j") // regular-task

    const before = repo.getNode("regular-task")
    expect(before?.task_status).toBe("todo")

    board.press("x")

    const after = repo.getNode("regular-task")
    expect(after?.task_status).not.toBe("todo")
  })

  test("x on embed link targeting done task toggles to todo", () => {
    const { board, repo } = embedTaskBoard()

    // Navigate to embed-b (2nd card in col1)
    board.press("j")

    const targetBefore = repo.getNode("target-b")
    expect(targetBefore?.task_status).toBe("done")

    board.press("x")

    // toggle_task_done: done -> todo
    const targetAfter = repo.getNode("target-b")
    expect(targetAfter?.task_status).not.toBe("done")
  })
})
