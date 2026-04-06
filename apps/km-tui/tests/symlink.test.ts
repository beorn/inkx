/**
 * Symlink node tests
 *
 * Covers:
 * - Symlink create: node creation among symlinks (depth derived from tree position)
 * - Symlink display: stripping ![[...]] syntax, showing target name/content
 * - Symlink task status cycling: 'x' toggles task status on symlinked link targets
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import { getActiveBoardPane } from "../src/state/board-app-store.ts"
import { stripAnsi } from "@silvery/ag-react"
import type { KNode } from "@km/core"

// =============================================================================
// Symlink create depth
// =============================================================================

const colItems = (col: string) => `#${col} [data-view='item']`

describe("symlink create depth", () => {
  test("new node after symlink is created correctly", () => {
    // Simulate: a column containing symlinks.
    // When creating a new node among the symlinks, it should be created successfully.
    const { board, repo } = testEnv(() => {
      const nodes = item("board", item("col1", item("embed-a"), item("embed-b")))
      for (const n of nodes) {
        // Simulate symlink nodes by setting symlink_to
        if (n.id === "embed-a" || n.id === "embed-b") {
          n.symlink_to = "some-target"
          n.type = "h"
          n.item = {}
          n.data = {}
        }
      }
      return nodes
    })

    // Navigate to first symlink, press o to create new node after it
    board.command("insert_below")
    board.press("Escape") // exit inline edit

    const items = board.q(colItems("col1"))
    expect(items.count()).toBe(3)

    // The new node (at position 1, between embed-a and embed-b)
    const newNodeId = items.nth(1).getAttribute("id")
    expect(newNodeId).toBeDefined()
    expect(newNodeId).not.toBe("embed-a")
    expect(newNodeId).not.toBe("embed-b")

    const newNode = repo.getNode(newNodeId!)
    expect(newNode).toBeTruthy()
  })

  test("new node after section sibling is created correctly", () => {
    // When creating a new node between section siblings, it should be
    // created successfully. Depth is derived from tree position during
    // serialization, not stored in data.
    const { board, repo } = testEnv(() => {
      const nodes = item("board", item("col1", item("sec-a"), item("sec-b")))
      for (const n of nodes) {
        if (n.id === "sec-a" || n.id === "sec-b") {
          n.type = "h"
          n.item = {}
        }
      }
      return nodes
    })

    // Navigate to sec-a, press o
    board.command("insert_below")
    board.press("Escape")

    const items = board.q(colItems("col1"))
    expect(items.count()).toBe(3)

    const newNodeId = items.nth(1).getAttribute("id")
    expect(newNodeId).toBeDefined()

    const newNode = repo.getNode(newNodeId!)
    expect(newNode).toBeTruthy()
  })

  test("new node at board root level is created correctly", () => {
    // When creating a new node in a column, it should succeed.
    const { board, repo } = testEnv(() => {
      const nodes = item("board", item("col1", item("child-a"), item("child-b")))
      for (const n of nodes) {
        if (n.id === "child-a" || n.id === "child-b") {
          n.type = "h"
          n.item = {}
          n.data = {}
        }
      }
      return nodes
    })

    board.command("insert_below")
    board.press("Escape")

    const items = board.q(colItems("col1"))
    expect(items.count()).toBe(3)

    const newNodeId = items.nth(1).getAttribute("id")
    expect(newNodeId).toBeDefined()

    const newNode = repo.getNode(newNodeId!)
    expect(newNode).toBeTruthy()
  })

  test("new node before symlink is created correctly", () => {
    // Same insert logic with `O` (insert above) — verify node is created.
    // Depth is derived from tree position during serialization, not stored in data.
    const { board, repo } = testEnv(() => {
      const nodes = item("board", item("col1", item("embed-a"), item("embed-b")))
      for (const n of nodes) {
        if (n.id === "embed-a" || n.id === "embed-b") {
          n.symlink_to = "some-target"
          n.type = "h"
          n.item = {}
          n.data = {}
        }
      }
      return nodes
    })

    // Press O to insert before current node
    board.command("insert_above")
    board.press("Escape")

    const items = board.q(colItems("col1"))
    expect(items.count()).toBe(3)

    // The new node (at position 0, before embed-a)
    const newNodeId = items.nth(0).getAttribute("id")
    expect(newNodeId).toBeDefined()
    expect(newNodeId).not.toBe("embed-a")
    expect(newNodeId).not.toBe("embed-b")

    const newNode = repo.getNode(newNodeId!)
    expect(newNode).toBeTruthy()
  })
})

// =============================================================================
// Embed click — sub-item routing (km-tui.embed-click-jump)
// =============================================================================

describe("clicking an embed sub-item", () => {
  test("dispatchBoard SELECT with click hint routes cursor to the embed's column, not the target's column", () => {
    // Bug: when a card embeds another node (![[target]]), clicking a sub-item
    // rendered inside the embed used to put the cursor in the TARGET node's
    // column. The repo parent_id chain walks back to the target's column,
    // not the embed's column. The click handler must pass cardNodeId (the
    // visual card it dispatched from) so dispatchBoard can route correctly
    // via the lens.
    const { board, store } = testEnv(
      () => {
        // col1 has an embed pointing to target-x in col2.
        // col2 has target-x as a card with sub-items sub-a, sub-b.
        const nodes = item("board", item("col1", item("anchor")), item("col2"))

        nodes.push({
          id: "target-x",
          type: "h" as const,
          item: {},
          parent_id: "col2",
          parent_idx: 0,
          symlink_to: null,
          content: "Target X",
          data: { name: "Target X" },
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)
        nodes.push({
          id: "sub-a",
          type: "p" as const,
          item: { list: "-", task: { status: "todo", marker: "[ ]" } },
          parent_id: "target-x",
          parent_idx: 0,
          symlink_to: null,
          content: "sub-a",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)
        nodes.push({
          id: "sub-b",
          type: "p" as const,
          item: { list: "-", task: { status: "todo", marker: "[ ]" } },
          parent_id: "target-x",
          parent_idx: 1,
          symlink_to: null,
          content: "sub-b",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        // Embed in col1 pointing to target-x
        nodes.push({
          id: "embed-x",
          type: "h" as const,
          item: {},
          parent_id: "col1",
          parent_idx: 1,
          symlink_to: "target-x",
          content: "![[target-x]]",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        return nodes
      },
      { columns: 100, rows: 30 },
    )

    // Sanity: both columns rendered.
    board.expect("#col1").toExist()
    board.expect("#col2").toExist()
    board.expect("#embed-x").toExist()

    // Simulate the click handler dispatch: clicking sub-a inside the embed-x card.
    // The click handler computes targetId = "sub-a" (the sub-item) and
    // cardNodeId = "embed-x" (the containing card).
    const state = store.getState()
    state.dispatchBoard({
      type: "SELECT",
      nodeId: "sub-a",
      cardNodeId: "embed-x",
      cardHintSource: "click",
    })

    // After dispatch, cursor is sub-a. The visual card highlight (rendered as
    // the parent card with cursorInDescendant=true) should be embed-x in col1,
    // not target-x in col2.
    const pane = getActiveBoardPane(store.getState())!
    expect(pane.sel.node.cursor() as string | null).toBe("sub-a")

    // eslint-disable-next-line no-console
    console.log("---POST-CLICK---\n" + board.screenshot() + "\n---END---")
    // Find the cursor element in the rendered DOM and assert its x-coordinate
    // falls within col1's bounds, not col2's.
    const col1Box = board.q("[data-col-index='0'][data-column]").boundingBox()!
    const col2Box = board.q("[data-col-index='1'][data-column]").boundingBox()!
    const cursorEls = board.q("[data-cursor]").resolveAll()
    // eslint-disable-next-line no-console
    console.log("cursor count:", cursorEls.length, "rects:", cursorEls.map((e) => e.screenRect))
    const cursorEl = cursorEls[0]
    expect(cursorEl).toBeTruthy()
    const cursorRect = cursorEl!.screenRect
    expect(cursorRect).toBeTruthy()
    // Cursor should be inside col1's x range, not col2's.
    expect(cursorRect!.x).toBeGreaterThanOrEqual(col1Box.x)
    expect(cursorRect!.x).toBeLessThan(col2Box.x)
  })

})

// =============================================================================
// Symlink display
// =============================================================================

describe("symlink display", () => {
  test("unresolved symlink with symlink_to=null does not show ! prefix", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Paragraph symlink where link resolver didn't find target (symlink_to=null)
        // This happens for file references like ![[some-file.pdf]]
        nodes.push({
          id: "unresolved-embed",
          type: "p" as const,
          content: "![[Target File.pdf]]",
          symlink_to: null,
          parent_id: "col1",
          parent_idx: 1,
          data: { embeddingTarget: "Target File.pdf" },
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

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

  test("unresolved symlink with block reference does not show ! prefix", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Block reference symlink: symlink_to = file#^blockId
        nodes.push({
          id: "block-embed",
          type: "p" as const,
          content: null,
          symlink_to: "SomeFile#^abc123",
          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

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

  test("unresolved symlink with bare ^blockid shows short ID, not raw ref", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Bare block reference symlink ![[^1203128650780856]] with symlink_to=null
        nodes.push({
          id: "bare-block-embed",
          type: "p" as const,
          content: "![[^1203128650780856]]",
          symlink_to: null,
          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    // Should NOT show the raw block reference with caret
    expect(text).not.toMatch(/\^1203128650780856/)
    // Should NOT show the wiki-embed syntax
    expect(text).not.toContain("![[")
  })

  test("resolved symlink shows target content without ! prefix", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Target node exists
        nodes.push({
          id: "target-node",
          type: "p" as const,
          item: { list: "-", task: { status: "todo", marker: "[ ]" } },
          parent_id: "some-file",
          parent_idx: 0,
          symlink_to: null,
          content: "Buy groceries",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        // Symlink pointing to existing target
        nodes.push({
          id: "resolved-embed",
          type: "p" as const,
          content: "![[target-node]]",
          symlink_to: "target-node",
          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    // Should show target's content
    expect(text).toContain("Buy groceries")
    // Should NOT show ! prefix or wiki-embed syntax
    expect(text).not.toContain("![[")
    expect(text).not.toContain("!Buy")
  })

  test("multiple unresolved symlinks in same column strip ! prefix", () => {
    const { board } = testEnv(
      () => {
        // Column has a regular task plus unresolved symlinks
        const nodes = item("board", item("col1", item("regular-task")))

        // Multiple unresolved symlinks (simulating real-world @next.md with PDFs)
        const symlinks = ["![[2025 Tax Return.pdf]]", "![[Insurance Card.pdf]]", "![[Bank Statement.pdf]]"]

        symlinks.forEach((content, idx) => {
          nodes.push({
            id: `embed-${idx}`,
            type: "p" as const,
            content,
            symlink_to: null,
            parent_id: "col1",
            parent_idx: idx + 1,
            data: {},
            created_at: Date.now(),
            updated_at: Date.now(),
            version: "v1",
          } as unknown as KNode)
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

  // ── Mixed text + inline wiki-embed wikilinks (km-tui.embed-syntax-leak) ─────────

  test("mixed text + wiki-embed wikilink does not show raw ![[ in card", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("other-task")))

        // A regular task (not a symlink) whose content contains inline wiki-embed wikilink syntax
        nodes.push({
          id: "mixed-content",
          type: "p" as const,
          item: { list: "-", task: { status: "todo" as const, marker: "[ ]" } },
          content: "Organize into boxes ![[file.jpg]]",
          symlink_to: null,
          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    expect(text).toContain("Organize into boxes")
    expect(text).not.toContain("![[")
    expect(text).toContain("file.jpg")
  })

  test("top bar does not leak ![[ when navigating to mixed-content card", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("other-task")))

        nodes.push({
          id: "mixed-content",
          type: "p" as const,
          item: { list: "-", task: { status: "todo" as const, marker: "[ ]" } },
          content: "Organize into boxes ![[file.jpg]]",
          symlink_to: null,
          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    board.command("cursor_down")

    const text = stripAnsi(board.screenshot())
    expect(text).not.toContain("![[")
    expect(text).toContain("Organize into boxes")
  })

  test("multiple inline wiki-embeds in mixed content do not leak syntax", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("placeholder")))

        nodes.push({
          id: "multi-embed",
          type: "p" as const,
          item: { list: "-", task: { status: "todo" as const, marker: "[ ]" } },
          content: "See ![[photo.png]] and ![[doc.pdf]]",
          symlink_to: null,
          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    expect(text).not.toContain("![[")
    expect(text).toContain("photo.png")
    expect(text).toContain("doc.pdf")
  })
})

// =============================================================================
// Folded symlink display (FoldedChildRow)
// =============================================================================

describe("folded symlink display (FoldedChildRow)", () => {
  test("FoldedChildRow resolves symlink_to directly, not just via resolveNode fallback", () => {
    // Default fold depth = 1: card children render as FoldedChildRow (remainingDepth=0).
    // Bug: FoldedChildRow passed null for resolvedNode to getDisplayContent,
    // so it relied on the resolveNode fallback which doesn't always work
    // (e.g., short alphanumeric block IDs that don't match \d{5,} regex).
    const { board } = testEnv(
      () => {
        const nodes = item(
          "board",
          item("col1", item.folder("Parent Card", item("embed-child-1"), item("embed-child-2"))),
        )

        // Target nodes with short alphanumeric block_id (not matched by resolveNode's \d{5,} regex)
        nodes.push({
          id: "target-task-abc",
          type: "p" as const,
          item: { list: "-", task: { status: "todo", marker: "[ ]" } },
          parent_id: "some-file",
          parent_idx: 0,
          symlink_to: null,
          content: "Buy milk from store",
          block_id: "abc",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        nodes.push({
          id: "target-task-xyz",
          type: "p" as const,
          parent_id: "some-file",
          parent_idx: 1,
          symlink_to: null,
          content: "Walk the dog outside",
          block_id: "xyz",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        // Patch symlink children: block-ref format with resolved symlink_to.
        // symlink_to points directly to the target node ID.
        // Content uses ![[^blockid]] which resolveNode can't resolve for short IDs.
        for (const n of nodes) {
          if (n.id === "embed-child-1") {
            n.type = "p"
            n.symlink_to = "target-task-abc"
            n.content = "![[^abc]]"
            n.data = {}
          }
          if (n.id === "embed-child-2") {
            n.type = "p"
            n.symlink_to = "target-task-xyz"
            n.content = "![[^xyz]]"
            n.data = {}
          }
        }

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    // With default rootFoldDepth=1, card children render as FoldedChildRow initially
    const text = stripAnsi(board.screenshot())
    // FoldedChildRow should resolve symlink targets via symlink_to and show content
    expect(text).toContain("Buy milk")
    expect(text).toContain("Walk the dog")
    // Should NOT show raw block references or short ID fallback
    expect(text).not.toContain("^abc")
    expect(text).not.toContain("^xyz")
    expect(text).not.toContain("![[")
  })
})

// =============================================================================
// Link title resolution (km-tui.link-title)
// =============================================================================

describe("link title resolution", () => {
  test("resolved symlink with block reference content shows target title, not ^blockid", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Target node: a task with content (like an Asana-imported task)
        nodes.push({
          id: "target-task-1",
          type: "p" as const,
          item: { list: "-", task: { status: "todo", marker: "[ ]" } },
          parent_id: "some-file",
          parent_idx: 0,
          symlink_to: null,
          content: "Tax projects",
          block_id: "1203128650780856",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        // Symlink node: symlink_to is set, content has block reference format
        // This simulates what the rules engine creates + markdown serialization round-trip
        nodes.push({
          id: "embed-1",
          type: "p" as const,
          content: "![[^1203128650780856]]",
          symlink_to: "target-task-1",

          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

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

  test("resolved symlink with file#^blockid content shows target title", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Target node
        nodes.push({
          id: "target-task-2",
          type: "p" as const,
          item: { list: "-", task: { status: "todo", marker: "[ ]" } },
          parent_id: "some-file",
          parent_idx: 0,
          symlink_to: null,
          content: "Buy groceries",
          block_id: "abc123",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        // Symlink with file#^blockid path format
        nodes.push({
          id: "embed-2",
          type: "p" as const,
          content: "![[shopping#^abc123]]",
          symlink_to: "target-task-2",

          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    // Should show target content
    expect(text).toContain("Buy groceries")
    // Should NOT show raw symlink path
    expect(text).not.toContain("shopping#^abc123")
  })

  test("unresolved symlink with ^blockid content shows blockid without caret", () => {
    // When symlink_to is set but target doesn't exist (stale reference),
    // at minimum strip the ^ prefix from the display
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Symlink with symlink_to pointing to nonexistent target
        nodes.push({
          id: "stale-embed",
          type: "p" as const,
          content: "![[^9999999999999999]]",
          symlink_to: "nonexistent-target",

          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

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
// Unresolved Asana symlink display (P1 — raw symlink IDs in card titles)
// =============================================================================

describe("unresolved Asana symlink display", () => {
  test("Failure Mode A: file#^blockId resolves to target title, not raw workspace slug", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Target node that the symlink should resolve to
        // Use block_id value as the node ID so fakeRepo.resolveNode finds it
        nodes.push({
          id: "1209600947800994",
          type: "p" as const,
          item: { list: "-", task: { status: "todo", marker: "[ ]" } },
          parent_id: "some-file",
          parent_idx: 0,
          symlink_to: null,
          content: "Review quarterly report",
          block_id: "1209600947800994",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        // Symlink ref: symlink_to points to target via file#^blockId
        nodes.push({
          id: "asana-embed-a",
          type: "p" as const,
          content: null,
          symlink_to: "688309546998762-pers-prod#^1209600947800994",
          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

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
          type: "p" as const,
          item: { list: "-", task: { status: "todo", marker: "[ ]" } },
          parent_id: "some-file",
          parent_idx: 0,
          symlink_to: null,
          content: "Weekly standup notes",
          block_id: "1k4a",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        // Symlink ref: symlink_to points to target via ^blockId
        nodes.push({
          id: "bare-embed",
          type: "p" as const,
          content: null,
          symlink_to: "^1k4a",
          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

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

  test("unresolvable symlink falls back gracefully to cleaned ref", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Symlink ref: symlink_to points to non-existent target
        nodes.push({
          id: "orphan-embed",
          type: "p" as const,
          content: null,
          symlink_to: "my-notes#^nonexistent",
          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

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
// Context-dependent rendering (node-model-v2)
// =============================================================================

describe("context-dependent rendering", () => {
  test("symlink to li task in column renders as bordered card with task icon", () => {
    // Model rule: li at column position → card (takes on host style)
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("card-a")))

        // Target li task
        nodes.push({
          id: "target-li",
          type: "p" as const,
          item: { list: "-", task: { status: "todo", marker: "[ ]" } },
          parent_id: "some-file",
          parent_idx: 0,
          symlink_to: null,
          content: "Embedded todo task",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        // Symlink pointing to the li task, placed in a column
        nodes.push({
          id: "embed-link",
          type: "p" as const,
          content: "![[target-li]]",
          symlink_to: "target-li",

          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    // Should show the target's content
    expect(text).toContain("Embedded todo task")
    // Should NOT show wiki-embed syntax
    expect(text).not.toContain("![[")
  })

  test("symlink to oi section in body renders content without borders", () => {
    // Model rule: oi in body → body content
    const { board } = testEnv(
      () => {
        // Body symlink (before first oi column) should render as virtual/borderless
        const nodes = item("board", item("col1", item("task-1")))

        // Target oi section
        nodes.push({
          id: "target-section",
          type: "h" as const,
          item: {},
          fstype: "mdsection",
          parent_id: "some-file",
          parent_idx: 0,
          symlink_to: null,
          content: "Architecture Notes",
          name: "architecture-notes",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        // Symlink in body position (before the oi column)
        // Add as a p-type body node before col1
        nodes.push({
          id: "body-embed",
          type: "p" as const,
          content: "![[target-section]]",
          symlink_to: "target-section",
          parent_id: "board",
          parent_idx: -1, // before col1 (parent_idx=0)
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    // Should show the target's name
    expect(text).toContain("Architecture Notes")
  })

  test("symlink to done task shows dimmed style in card", () => {
    // Symlinked done tasks should render with the done/dimmed style of the target
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("card-a")))

        // Target: done task
        nodes.push({
          id: "done-target",
          type: "p" as const,
          item: { list: "-", task: { status: "done", marker: "[x]" } },
          parent_id: "some-file",
          parent_idx: 0,
          symlink_to: null,
          content: "Completed task",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        // Symlink in column
        nodes.push({
          id: "embed-done",
          type: "p" as const,
          content: "![[done-target]]",
          symlink_to: "done-target",

          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    // Should show the target's content
    expect(text).toContain("Completed task")
  })

  test("symlink shows target children (transclusion)", () => {
    // When a symlink resolves, its children should come from the TARGET node
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1"))

        // Target oi with children
        nodes.push({
          id: "target-parent",
          type: "h" as const,
          item: {},
          fstype: "mdsection",
          parent_id: "some-file",
          parent_idx: 0,
          symlink_to: null,
          content: "Parent Section",
          name: "parent-section",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        // Child of target
        nodes.push({
          id: "target-child",
          type: "p" as const,
          item: { list: "-", task: { status: "todo", marker: "[ ]" } },
          parent_id: "target-parent",
          parent_idx: 0,
          symlink_to: null,
          content: "Child subtask",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        // Symlink in column pointing to the parent
        nodes.push({
          id: "embed-parent",
          type: "p" as const,
          content: "![[target-parent]]",
          symlink_to: "target-parent",

          parent_id: "col1",
          parent_idx: 0,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    // Should show the target section name
    expect(text).toContain("Parent Section")
  })
})

// =============================================================================
// Symlink task status cycling (km-79kld)
// =============================================================================

describe("symlink task status cycling (km-79kld)", () => {
  /** Build a board where symlinks point to task nodes */
  function symlinkTaskBoard() {
    const env = testEnv(() => {
      const nodes = item(
        "board",
        item("col1", item("embed-a"), item("embed-b"), item("regular-task")),
        item("col2", item("task-x")),
      )
      // Set up embed-a and embed-b as symlink nodes pointing to task targets
      for (const n of nodes) {
        if (n.id === "embed-a") {
          n.type = "p"
          n.symlink_to = "target-a"
          n.item = { ...n.item, task: undefined }
          n.data = {}
        }
        if (n.id === "embed-b") {
          n.type = "p"
          n.symlink_to = "target-b"
          n.item = { ...n.item, task: undefined }
          n.data = {}
        }
        if (n.id === "regular-task") {
          n.type = "p"
          n.item = { list: "-", task: { status: "todo", marker: "[ ]" } }
        }
        if (n.id === "col1" || n.id === "col2") {
          n.type = "h"
          n.item = {}
          n.fstype = "mdsection"
        }
      }

      // Add the target nodes (tasks that the symlinks point to)
      nodes.push({
        id: "target-a",
        type: "p",
        item: { list: "-", task: { status: "todo", marker: "[ ]" } },
        parent_id: "some-other-parent",
        parent_idx: 0,
        symlink_to: null,
        content: "Target task A",
        data: {},
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      })
      nodes.push({
        id: "target-b",
        type: "p",
        item: { list: "-", task: { status: "done", marker: "[x]" } },
        parent_id: "some-other-parent",
        parent_idx: 1,
        symlink_to: null,
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

  test("x toggles task status on symlink targeting a task", () => {
    const { board, repo } = symlinkTaskBoard()

    // Cursor starts on embed-a (first card in col1)
    // embed-a links to target-a which has item.task.status: "todo"
    const targetBefore = repo.getNode("target-a")
    expect(targetBefore?.item?.task?.status).toBe("todo")

    // Press x to toggle task done
    board.press("x")

    // target-a should now cycle to next status
    const targetAfter = repo.getNode("target-a")
    expect(targetAfter?.item?.task?.status).not.toBe("todo")
  })

  test("x on regular task node still works", () => {
    const { board, repo } = symlinkTaskBoard()

    // Navigate to regular-task (3rd card in col1)
    board.press("j") // embed-b
    board.press("j") // regular-task

    const before = repo.getNode("regular-task")
    expect(before?.item?.task?.status).toBe("todo")

    board.press("x")

    const after = repo.getNode("regular-task")
    expect(after?.item?.task?.status).not.toBe("todo")
  })

  test("x on symlink targeting done task toggles to todo", () => {
    const { board, repo } = symlinkTaskBoard()

    // Navigate to embed-b (2nd card in col1)
    board.press("j")

    const targetBefore = repo.getNode("target-b")
    expect(targetBefore?.item?.task?.status).toBe("done")

    board.press("x")

    // toggle_task_done: done -> todo
    const targetAfter = repo.getNode("target-b")
    expect(targetAfter?.item?.task?.status).not.toBe("done")
  })
})

// =============================================================================
// Tag file sections with ![[^GID]] wiki-embed references (km-tui.tag-block-ids)
// =============================================================================

describe("tag file section display", () => {
  test("tag file sections show task title, not bare GID", () => {
    // Simulate a tag file (#home.md) parsed into the DB.
    // The markdown looks like:
    //   # #home
    //   ## [x] Clean-up after trip ![[^1138180707609595]]
    //   ## [ ] Norway stuff - papers ![[^1137303518371267]]
    //
    // After parsing, each heading becomes an mdsection node.
    // The board view should show "Clean-up after trip ![[^1138180707609595]]",
    // NOT the bare GID "1138180707609595".
    const now = Date.now()
    const { board } = testEnv(
      () => {
        // Root: tags folder
        const nodes = item(
          "tags-folder",
          // Column: #home tag file (mdfile)
          item.file(
            "#home",
            // Cards: mdsection items from parsed headings
            item.section("Clean-up after trip"),
            item.section("Norway stuff - papers"),
          ),
        )

        // Patch the section nodes to match what the parser produces for tag files:
        // - title includes the ![[^GID]] suffix
        // - content includes [x] marker prefix
        // - item.task.marker and item.task.status are set
        for (const node of nodes) {
          if (node.id === "Clean-up after trip") {
            node.title = "Clean-up after trip ![[^1138180707609595]]"
            node.content = "[x] Clean-up after trip ![[^1138180707609595]]"
            node.item = { ...node.item, task: { marker: "[x]", status: "done" } }
          }
          if (node.id === "Norway stuff - papers") {
            node.title = "Norway stuff - papers ![[^1137303518371267]]"
            node.content = "[ ] Norway stuff - papers ![[^1137303518371267]]"
            node.item = { ...node.item, task: { marker: "[ ]", status: "todo" } }
          }
        }

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    // Should show the task titles
    expect(text).toContain("Clean-up after trip")
    expect(text).toContain("Norway stuff")
    // Should NOT show bare numeric GIDs without task titles
    expect(text).not.toMatch(/(?<![[\w])1138180707609595(?![\]\w])/)
    expect(text).not.toMatch(/(?<![[\w])1137303518371267(?![\]\w])/)
  })

  test("tag file sections with content-only (no title) show task title", () => {
    // Some nodes may have content but no title field (e.g., from nodesToMarkdown round-trip)
    const { board } = testEnv(
      () => {
        const nodes = item(
          "tags-folder",
          item.file("#home", item.section("Task A embed"), item.section("Task B embed")),
        )

        for (const node of nodes) {
          if (node.id === "Task A embed") {
            node.title = undefined
            node.content = "Task A ![[^9999999999999901]]"
            node.item = { ...node.item, task: { marker: "[x]", status: "done" } }
          }
          if (node.id === "Task B embed") {
            node.title = undefined
            node.content = "Task B ![[^9999999999999902]]"
            node.item = { ...node.item, task: { marker: "[ ]", status: "todo" } }
          }
        }

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    expect(text).toContain("Task A")
    expect(text).toContain("Task B")
  })
})

// =============================================================================
// Symlink alias override (km-wk17l)
// =============================================================================

describe("symlink alias override (km-wk17l)", () => {
  test("resolved symlink with non-empty content shows alias, not target title", () => {
    // When node.content is non-empty and is NOT wiki-embed syntax, it acts as
    // an alias override — like ![[^GID|My custom title]] semantics.
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Target node with actual content
        nodes.push({
          id: "target-aliased",
          type: "p" as const,
          item: { list: "-", task: { status: "todo", marker: "[ ]" } },
          parent_id: "some-file",
          parent_idx: 0,
          symlink_to: null,
          content: "Original target title",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        // Symlink with alias override — content is plain text, not ![[...]]
        nodes.push({
          id: "alias-embed",
          type: "p" as const,
          content: "My custom alias",
          symlink_to: "target-aliased",
          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    // Should show the alias override, NOT the target's title
    expect(text).toContain("My custom alias")
    expect(text).not.toContain("Original target title")
  })

  test("resolved symlink with wiki-embed syntax content shows target title, not alias", () => {
    // When node.content IS wiki-embed syntax (![[...]]), it is NOT an alias — fall through
    // to resolvedNode content display.
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Target node
        nodes.push({
          id: "target-no-alias",
          type: "p" as const,
          item: { list: "-", task: { status: "todo", marker: "[ ]" } },
          parent_id: "some-file",
          parent_idx: 0,
          symlink_to: null,
          content: "Target content here",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        // Symlink whose content is wiki-embed syntax (not an alias)
        nodes.push({
          id: "syntax-embed",
          type: "p" as const,
          content: "![[target-no-alias]]",
          symlink_to: "target-no-alias",
          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    // Should show the target's content, not the wiki-embed syntax
    expect(text).toContain("Target content here")
    expect(text).not.toContain("![[")
  })
})

// =============================================================================
// Broken symlink rendering (km-wk17l)
// =============================================================================

describe("broken symlink rendering (km-wk17l)", () => {
  test("broken symlink with content shows content in error color", () => {
    // symlink_to set but target doesn't exist — broken link.
    // Content available: show it, but in error color.
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        nodes.push({
          id: "broken-embed-with-content",
          type: "p" as const,
          content: "Some alias text",
          symlink_to: "nonexistent-node",
          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    // Should display content even though target is broken
    expect(text).toContain("Some alias text")
  })

  test("broken symlink without content shows cleaned symlink_to as fallback", () => {
    // symlink_to set, target missing, no content — broken link.
    // symlink_to looks like a filename → show it directly.
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        nodes.push({
          id: "broken-no-content",
          type: "p" as const,
          content: null,
          symlink_to: "deadbeef-missing",
          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    // Should NOT show wiki-embed syntax
    expect(text).not.toContain("![[")
    // Should show the symlink_to as cleaned display text
    expect(text).toContain("deadbeef-missing")
  })

  test("broken symlink with bare block ref shows broken fallback", () => {
    // symlink_to is a bare ^blockId, target missing — show (broken: ^shortId).
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        nodes.push({
          id: "broken-bare-ref",
          type: "p" as const,
          content: null,
          symlink_to: "^deadbeef12345678",
          parent_id: "col1",
          parent_idx: 1,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    expect(text).not.toContain("![[")
    // Bare block ref can't be cleaned to something readable → broken fallback
    expect(text).toContain("broken:")
  })
})

// =============================================================================
// Strip parent sigil from symlinked node titles
// =============================================================================

/**
 * When viewing symlinked nodes (transclusions with symlink_to), the sigil badge
 * after the title should be suppressed if it matches the board or column context.
 * E.g., a task with name "@next" displayed on the @next board should not show
 * the redundant "@next" sigil badge.
 *
 * Similarly, parent context (the "< source" line) should be suppressed if it
 * matches an excluded sigil.
 */
describe("strip symlink sigil", () => {
  /**
   * Build a board with a @next column containing symlinked tasks.
   * The target tasks have name: "@next" (simulating nodes from @next.md).
   */
  function boardWithSymlinkedSigils() {
    return testEnv(
      () => {
        const nodes = item(
          "board",
          item("@next", item("embed-a"), item("embed-b")),
          item("other", item("regular-task")),
        )

        for (const n of nodes) {
          // Make @next column a proper section
          if (n.id === "@next") {
            n.type = "h"
            n.item = {}
            n.fstype = "mdsection"
            n.data = { name: "@next" }
            n.name = "@next"
          }

          // Make embed-a link to a target with name "@next"
          if (n.id === "embed-a") {
            n.type = "p"
            n.symlink_to = "target-a"
            n.content = "![[target-a]]"
            n.item = { ...n.item, task: undefined }
            n.data = {}
          }

          // Make embed-b link to a target with a different sigil
          if (n.id === "embed-b") {
            n.type = "p"
            n.symlink_to = "target-b"
            n.content = "![[target-b]]"
            n.item = { ...n.item, task: undefined }
            n.data = {}
          }

          // Make other column a section
          if (n.id === "other") {
            n.type = "h"
            n.item = {}
            n.fstype = "mdsection"
            n.data = { name: "Other" }
          }
        }

        // Target A: task with name "@next" (sigil should be stripped in @next column)
        nodes.push({
          id: "target-a",
          type: "p",
          item: { list: "-", task: { status: "todo", marker: "[ ]" } },
          parent_id: "some-file",
          parent_idx: 0,
          symlink_to: null,
          content: "Buy groceries",
          name: "@next",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        // Target B: task with name "@waiting" (different sigil, should NOT be stripped in @next column)
        nodes.push({
          id: "target-b",
          type: "p",
          parent_id: "some-file",
          parent_idx: 1,
          symlink_to: null,
          content: "Wait for reply",
          name: "@waiting",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )
  }

  test("sigil badge is suppressed when it matches the column's excluded sigil", () => {
    const { board } = boardWithSymlinkedSigils()
    const text = stripAnsi(board.screenshot())

    // "@next" sigil badge should NOT appear after "Buy groceries" in the @next column
    // The task title "Buy groceries" should appear without a redundant "@next" suffix
    expect(text).toContain("Buy groceries")
    expect(text).not.toMatch(/Buy groceries\s+@next/)
  })

  test("sigil badge is shown when it does NOT match the column's excluded sigil", () => {
    const { board } = boardWithSymlinkedSigils()
    const text = stripAnsi(board.screenshot())

    // "@waiting" sigil badge SHOULD still appear after "Wait for reply"
    // because the column excludes @next, not @waiting
    expect(text).toContain("Wait for reply")
    expect(text).toMatch(/Wait for reply\s+@waiting/)
  })

  test("inline @next sigil in card content is stripped inside @next column", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("@next", item("task-a"), item("task-b")))

        for (const n of nodes) {
          if (n.id === "@next") {
            n.type = "h"
            n.item = {}
            n.fstype = "mdsection"
            n.data = { name: "@next" }
            n.name = "@next"
          }
          // Tasks with @next inline in content
          if (n.id === "task-a") {
            n.content = "Buy groceries @next"
            n.name = "@next"
          }
          if (n.id === "task-b") {
            n.content = "Call dentist @next @urgent"
            n.name = "@next"
          }
        }

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())

    // Find card lines (contain marker) — skip top bar which shows full path
    const cardLines = text.split("\n").filter((l) => l.includes("\u25A1"))

    // Card with "Buy groceries" should NOT show @next
    const groceriesLine = cardLines.find((l) => l.includes("Buy groceries"))
    expect(groceriesLine).toBeDefined()
    expect(groceriesLine).not.toContain("@next")

    // Card with "Call dentist" should NOT show @next, but SHOULD show @urgent
    const dentistLine = cardLines.find((l) => l.includes("Call dentist"))
    expect(dentistLine).toBeDefined()
    expect(dentistLine).not.toContain("@next")
    expect(dentistLine).toContain("@urgent")
  })

  test("parent context is suppressed when it matches an excluded sigil", () => {
    // Build a board where symlinked tasks come from a file named "@next"
    // The parent context would normally show "@next" but should be suppressed
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("@next", item("embed-c")))

        for (const n of nodes) {
          if (n.id === "@next") {
            n.type = "h"
            n.item = {}
            n.fstype = "mdsection"
            n.data = { name: "@next" }
            n.name = "@next"
          }

          if (n.id === "embed-c") {
            n.type = "p"
            n.symlink_to = "target-c"
            n.content = "![[target-c]]"
            n.item = { ...n.item, task: undefined }
            n.data = {}
          }
        }

        // Create file node "@next" that is the parent of the target task
        nodes.push({
          id: "next-file",
          type: "h",
          item: {},
          fstype: "mdfile",
          parent_id: null,
          parent_idx: 0,
          symlink_to: null,
          content: "",
          name: "@next",
          fs_path: "/vault/@next.md",
          data: { name: "@next" },
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        // Target task that lives inside @next.md — parent context would be "@next"
        nodes.push({
          id: "target-c",
          type: "p",
          item: { list: "-", task: { status: "todo", marker: "[ ]" } },
          parent_id: "next-file",
          parent_idx: 0,
          symlink_to: null,
          content: "Call dentist",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())

    // Task content should be visible
    expect(text).toContain("Call dentist")
    // But "@next" as parent context should be suppressed (it's the column we're in)
    // In cards view, parent context appears as italic text above the title
    // In any case, "@next" should not appear as a context label near "Call dentist"
    const lines = text.split("\n")
    const taskLine = lines.findIndex((l) => l.includes("Call dentist"))
    if (taskLine > 0) {
      // The line above should NOT contain "@next" as parent context
      expect(lines[taskLine - 1]).not.toContain("@next")
    }
  })
})

// =============================================================================
// Hide redundant parent sigil on symlinks (absorbed from hide-parent-sigil.test.ts)
// =============================================================================

describe("hide redundant parent sigil on symlinks", () => {
  /**
   * Build a board where:
   * - Board root is "board"
   * - Column "@next" contains symlinks (symlink_to) to tasks
   * - Tasks' original parent is a file called "@next.md"
   *   with display name "Next Actions" (via data.name)
   */
  function buildSymlinkBoard(options?: { parentDisplayName?: string }) {
    const parentName = options?.parentDisplayName ?? "@next"
    return testEnv(() => {
      const nodes = item("board", item("@next", item("embed-a"), item("embed-b")), item("other-col", item("task-x")))

      // Set up @next column as a sigil-named column
      for (const n of nodes) {
        if (n.id === "@next") {
          n.name = "@next"
          n.fs_path = "/fake/repo/@next.md"
        }
        // Set up symlink nodes as links pointing to target tasks
        if (n.id === "embed-a") {
          n.type = "p"
          n.symlink_to = "target-a"
          n.item = { ...n.item, task: undefined }
          n.content = "![[target-a]]"
          n.data = {}
        }
        if (n.id === "embed-b") {
          n.type = "p"
          n.symlink_to = "target-b"
          n.item = { ...n.item, task: undefined }
          n.content = "![[target-b]]"
          n.data = {}
        }
      }

      // Add the "@next" mdfile node (parent of original tasks)
      nodes.push({
        id: "next-file",
        type: "h",
        item: {},
        fstype: "mdfile",
        parent_id: null,
        parent_idx: 0,
        symlink_to: null,
        content: undefined,
        data: { name: parentName },
        name: "@next",
        fs_path: "/fake/repo/@next.md",
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      } as unknown as KNode)

      // Add the target task nodes (what the symlinks point to)
      nodes.push({
        id: "target-a",
        type: "p",
        item: { list: "-", task: { status: "wip", marker: "[-]" } },
        parent_id: "next-file",
        parent_idx: 0,
        symlink_to: null,
        content: "Buy groceries",
        data: {},
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      } as unknown as KNode)

      nodes.push({
        id: "target-b",
        type: "p",
        parent_id: "next-file",
        parent_idx: 1,
        symlink_to: null,
        content: "Write report @next",
        data: {},
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      } as unknown as KNode)

      return nodes
    })
  }

  test("symlinked node does not show @next parent context inside @next column (sigil name match)", () => {
    // Parent file name matches column sigil exactly
    const { board } = buildSymlinkBoard({ parentDisplayName: "@next" })
    const screenshot = board.screenshot()

    // The task content should be visible
    expect(screenshot).toContain("Buy groceries")

    // @next should NOT appear on card lines (already inside @next column)
    const lines = screenshot.split("\n")
    const cardLines = lines.filter((l) => l.includes("Buy groceries") || l.includes("Write report"))
    for (const line of cardLines) {
      expect(line).not.toContain("@next")
    }
  })

  test("parent context with display name 'Next Actions' is suppressed inside @next column", () => {
    // Parent file has display name "Next Actions" (not the sigil "@next")
    // The parent context should still be suppressed because it refers to the same column
    const { board } = buildSymlinkBoard({ parentDisplayName: "Next Actions" })
    const screenshot = board.screenshot()

    // "Next Actions" should NOT appear as parent context on cards
    // inside the @next column — it's the same thing
    expect(screenshot).not.toContain("Next Actions")
  })

  test("sigil in task content is filtered out when inside matching column", () => {
    const { board } = buildSymlinkBoard()
    const screenshot = board.screenshot()

    // "Write report @next" has @next in content — it should be stripped
    // because we're inside the @next column
    const writeLines = screenshot.split("\n").filter((l) => l.includes("Write report"))
    for (const line of writeLines) {
      expect(line).not.toContain("@next")
    }
  })

  test("@next column header still shows the sigil", () => {
    const { board } = buildSymlinkBoard()
    const screenshot = board.screenshot()

    // The column header should still show @next
    const lines = screenshot.split("\n")
    const headerLine = lines.find((l) => l.includes("@next") && !l.includes("Buy") && !l.includes("Write"))
    expect(headerLine).toBeDefined()
  })
})

// =============================================================================
// Symlink transparency — detail pane shows target's metadata + children
// =============================================================================

describe("symlink transparency in detail pane", () => {
  /** Build a board where a symlink card points to a target node with children */
  function buildSymlinkDetailBoard() {
    const nodes = item("board", item("col1", item("regular-card"), item("embed-card")))
    // Target node (lives outside the board — e.g., in another file)
    const targetNode: KNode = {
      id: "target-node",
      type: "h",
      item: { task: { status: "wip", marker: "[/]" } },
      fstype: "mdsection",
      content: "Target Section",
      parent_id: null,
      parent_idx: 0,
      symlink_to: null,
      data: {},
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
      due_at: "2026-04-01",
    }
    // Target's children
    const targetChild1: KNode = {
      id: "target-child-1",
      type: "p",
      content: "Target Child Alpha",
      parent_id: "target-node",
      parent_idx: 0,
      symlink_to: null,
      data: {},
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }
    const targetChild2: KNode = {
      id: "target-child-2",
      type: "p",
      content: "Target Child Beta",
      parent_id: "target-node",
      parent_idx: 1,
      symlink_to: null,
      data: {},
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }
    // Make embed-card point to target-node
    for (const n of nodes) {
      if (n.id === "embed-card") {
        n.symlink_to = "target-node"
        n.content = ""
      }
    }
    nodes.push(targetNode, targetChild1, targetChild2)
    return nodes
  }

  test("detail pane for symlink card shows target's children", () => {
    const { board, store } = testEnv(buildSymlinkDetailBoard, {
      columns: 120,
      rows: 24,
    })

    // Navigate to the symlink card (second card in col1)
    board.command("cursor_down")

    // Open detail pane
    board.press("D")

    // Verify detail pane is open
    const ws = store.getState().workspace
    expect(ws.panes.has("main-detail")).toBe(true)

    // The detail pane's rootId should be the symlink card's ID
    const detailPane = ws.panes.get("main-detail")!
    expect((detailPane as any).rootId).toBe("embed-card")

    // But the rendered detail should show the TARGET's children
    const screenshot = board.screenshot()
    expect(screenshot).toContain("Target Child Alpha")
    expect(screenshot).toContain("Target Child Beta")
  })

  test("detail pane metadata shows target properties for symlink card", () => {
    const { board, store } = testEnv(buildSymlinkDetailBoard, {
      columns: 120,
      rows: 24,
    })

    // Navigate to the symlink card
    board.command("cursor_down")

    // Open detail pane
    board.press("D")

    // The rendered detail should show the target's metadata (task status, due date)
    const screenshot = board.screenshot()
    expect(screenshot).toContain("wip")
    // The symlink card itself has no item.task — this proves the target's metadata is shown
  })
})
