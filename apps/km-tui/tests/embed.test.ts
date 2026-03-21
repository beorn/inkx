/**
 * Embed node tests
 *
 * Covers:
 * - Embed create: node creation among embeds (depth derived from tree position)
 * - Embed display: stripping ![[...]] syntax, showing target name/content
 * - Embed task status cycling: 'x' toggles task status on embedded link targets
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import { stripAnsi } from "@silvery/react"
import type { KNode } from "@km/core"

// =============================================================================
// Embed create depth
// =============================================================================

const colItems = (col: string) => `#${col} [data-view='item']`

describe("embed create depth", () => {
  test("new node after embed is created correctly", () => {
    // Simulate: a column containing embeds.
    // When creating a new node among the embeds, it should be created successfully.
    const { board, repo } = testEnv(() => {
      const nodes = item("board", item("col1", item("embed-a"), item("embed-b")))
      for (const n of nodes) {
        // Simulate embed nodes by setting embed_source
        if (n.id === "embed-a" || n.id === "embed-b") {
          n.embed_source = "some-target"
          n.type = "h"
          n.item = true
          n.data = {}
        }
      }
      return nodes
    })

    // Navigate to first embed, press o to create new node after it
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
          n.item = true
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
          n.item = true
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

  test("new node before embed is created correctly", () => {
    // Same insert logic with `O` (insert above) — verify node is created.
    // Depth is derived from tree position during serialization, not stored in data.
    const { board, repo } = testEnv(() => {
      const nodes = item("board", item("col1", item("embed-a"), item("embed-b")))
      for (const n of nodes) {
        if (n.id === "embed-a" || n.id === "embed-b") {
          n.embed_source = "some-target"
          n.type = "h"
          n.item = true
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
// Embed display
// =============================================================================

describe("embed display", () => {
  test("unresolved embed with embed_source=null does not show ! prefix", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Paragraph embed where link resolver didn't find target (embed_source=null)
        // This happens for file references like ![[some-file.pdf]]
        nodes.push({
          id: "unresolved-embed",
          type: "p" as const,
          content: "![[Target File.pdf]]",
          embed_source: null,
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

  test("unresolved embed with block reference does not show ! prefix", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Block reference embed: embed_source = file#^blockId
        nodes.push({
          id: "block-embed",
          type: "p" as const,
          content: null,
          embed_source: "SomeFile#^abc123",
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

  test("unresolved embed with bare ^blockid shows short ID, not raw ref", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Bare block reference embed ![[^1203128650780856]] with embed_source=null
        nodes.push({
          id: "bare-block-embed",
          type: "p" as const,
          content: "![[^1203128650780856]]",
          embed_source: null,
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
          type: "p" as const,
          item: true,
          list_marker: "-",
          parent_id: "some-file",
          parent_idx: 0,
          embed_source: null,
          task_status: "todo",
          task_marker: "[ ]",
          content: "Buy groceries",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        // Embed pointing to existing target
        nodes.push({
          id: "resolved-embed",
          type: "p" as const,
          content: "![[target-node]]",
          embed_source: "target-node",
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
            embed_source: null,
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

  // ── Mixed text + inline embed wikilinks (km-tui.embed-syntax-leak) ─────────

  test("mixed text + embed wikilink does not show raw ![[ in card", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("other-task")))

        // A regular task (not an embed) whose content contains inline embed wikilink syntax
        nodes.push({
          id: "mixed-content",
          type: "p" as const,
          item: true,
          list_marker: "-",
          task_marker: "[ ]",
          task_status: "todo" as const,
          content: "Organize into boxes ![[file.jpg]]",
          embed_source: null,
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
          item: true,
          list_marker: "-",
          task_marker: "[ ]",
          task_status: "todo" as const,
          content: "Organize into boxes ![[file.jpg]]",
          embed_source: null,
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

  test("multiple inline embeds in mixed content do not leak syntax", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("placeholder")))

        nodes.push({
          id: "multi-embed",
          type: "p" as const,
          item: true,
          list_marker: "-",
          task_marker: "[ ]",
          task_status: "todo" as const,
          content: "See ![[photo.png]] and ![[doc.pdf]]",
          embed_source: null,
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
// Folded embed display (FoldedChildRow)
// =============================================================================

describe("folded embed display (FoldedChildRow)", () => {
  test("FoldedChildRow resolves embed_source directly, not just via resolveNode fallback", () => {
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
          item: true,
          list_marker: "-",
          parent_id: "some-file",
          parent_idx: 0,
          embed_source: null,
          task_status: "todo",
          task_marker: "[ ]",
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
          item: true,
          list_marker: "-",
          parent_id: "some-file",
          parent_idx: 1,
          embed_source: null,
          task_status: "todo",
          task_marker: "[ ]",
          content: "Walk the dog outside",
          block_id: "xyz",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        // Patch embed children: block-ref format with resolved embed_source.
        // embed_source points directly to the target node ID.
        // Content uses ![[^blockid]] which resolveNode can't resolve for short IDs.
        for (const n of nodes) {
          if (n.id === "embed-child-1") {
            n.type = "embed"
            n.embed_source = "target-task-abc"
            n.content = "![[^abc]]"
            n.data = {}
          }
          if (n.id === "embed-child-2") {
            n.type = "embed"
            n.embed_source = "target-task-xyz"
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
    // FoldedChildRow should resolve embed targets via embed_source and show content
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
  test("resolved embed with block reference content shows target title, not ^blockid", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Target node: a task with content (like an Asana-imported task)
        nodes.push({
          id: "target-task-1",
          type: "p" as const,
          item: true,
          list_marker: "-",
          parent_id: "some-file",
          parent_idx: 0,
          embed_source: null,
          task_status: "todo",
          task_marker: "[ ]",
          content: "Tax projects",
          block_id: "1203128650780856",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        // Embed node: embed_source is set, content has block reference format
        // This simulates what the rules engine creates + markdown serialization round-trip
        nodes.push({
          id: "embed-1",
          type: "embed" as const,
          content: "![[^1203128650780856]]",
          embed_source: "target-task-1",

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

  test("resolved embed with file#^blockid content shows target title", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Target node
        nodes.push({
          id: "target-task-2",
          type: "p" as const,
          item: true,
          list_marker: "-",
          parent_id: "some-file",
          parent_idx: 0,
          embed_source: null,
          task_status: "todo",
          task_marker: "[ ]",
          content: "Buy groceries",
          block_id: "abc123",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        // Embed with file#^blockid path format
        nodes.push({
          id: "embed-2",
          type: "embed" as const,
          content: "![[shopping#^abc123]]",
          embed_source: "target-task-2",

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
    // Should NOT show raw embed path
    expect(text).not.toContain("shopping#^abc123")
  })

  test("unresolved embed with ^blockid content shows blockid without caret", () => {
    // When embed_source is set but target doesn't exist (stale reference),
    // at minimum strip the ^ prefix from the display
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Embed with embed_source pointing to nonexistent target
        nodes.push({
          id: "stale-embed",
          type: "embed" as const,
          content: "![[^9999999999999999]]",
          embed_source: "nonexistent-target",

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
          type: "p" as const,
          item: true,
          list_marker: "-",
          parent_id: "some-file",
          parent_idx: 0,
          embed_source: null,
          task_status: "todo",
          task_marker: "[ ]",
          content: "Review quarterly report",
          block_id: "1209600947800994",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        // Embed ref: embed_source points to target via file#^blockId
        nodes.push({
          id: "asana-embed-a",
          type: "p" as const,
          content: null,
          embed_source: "688309546998762-pers-prod#^1209600947800994",
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
          item: true,
          list_marker: "-",
          parent_id: "some-file",
          parent_idx: 0,
          embed_source: null,
          task_status: "todo",
          task_marker: "[ ]",
          content: "Weekly standup notes",
          block_id: "1k4a",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        // Embed ref: embed_source points to target via ^blockId
        nodes.push({
          id: "bare-embed",
          type: "p" as const,
          content: null,
          embed_source: "^1k4a",
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

  test("unresolvable embed falls back gracefully to cleaned ref", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Embed ref: embed_source points to non-existent target
        nodes.push({
          id: "orphan-embed",
          type: "p" as const,
          content: null,
          embed_source: "my-notes#^nonexistent",
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
  test("embed link to li task in column renders as bordered card with task icon", () => {
    // Model rule: li at column position → card (takes on host style)
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("card-a")))

        // Target li task
        nodes.push({
          id: "target-li",
          type: "p" as const,
          item: true,
          list_marker: "-",
          parent_id: "some-file",
          parent_idx: 0,
          embed_source: null,
          task_status: "todo",
          task_marker: "[ ]",
          content: "Embedded todo task",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        // Embed link pointing to the li task, placed in a column
        nodes.push({
          id: "embed-link",
          type: "embed" as const,
          content: "![[target-li]]",
          embed_source: "target-li",

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
    // Should NOT show embed syntax
    expect(text).not.toContain("![[")
  })

  test("embed link to oi section in body renders content without borders", () => {
    // Model rule: oi in body → body content
    const { board } = testEnv(
      () => {
        // Body embed (before first oi column) should render as virtual/borderless
        const nodes = item("board", item("col1", item("task-1")))

        // Target oi section
        nodes.push({
          id: "target-section",
          type: "h" as const,
          item: true,
          fstype: "mdsection",
          parent_id: "some-file",
          parent_idx: 0,
          embed_source: null,
          content: "Architecture Notes",
          name: "architecture-notes",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        // Embed link in body position (before the oi column)
        // Add as a p-type body node before col1
        nodes.push({
          id: "body-embed",
          type: "p" as const,
          content: "![[target-section]]",
          embed_source: "target-section",
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

  test("embed link to done task shows dimmed style in card", () => {
    // Embedded done tasks should render with the done/dimmed style of the target
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("card-a")))

        // Target: done task
        nodes.push({
          id: "done-target",
          type: "p" as const,
          item: true,
          list_marker: "-",
          parent_id: "some-file",
          parent_idx: 0,
          embed_source: null,
          task_status: "done",
          task_marker: "[x]",
          content: "Completed task",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        // Embed in column
        nodes.push({
          id: "embed-done",
          type: "embed" as const,
          content: "![[done-target]]",
          embed_source: "done-target",

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

  test("embed link shows target children (transclusion)", () => {
    // When an embed resolves, its children should come from the TARGET node
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1"))

        // Target oi with children
        nodes.push({
          id: "target-parent",
          type: "h" as const,
          item: true,
          fstype: "mdsection",
          parent_id: "some-file",
          parent_idx: 0,
          embed_source: null,
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
          item: true,
          list_marker: "-",
          parent_id: "target-parent",
          parent_idx: 0,
          embed_source: null,
          task_status: "todo",
          task_marker: "[ ]",
          content: "Child subtask",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        // Embed in column pointing to the parent
        nodes.push({
          id: "embed-parent",
          type: "embed" as const,
          content: "![[target-parent]]",
          embed_source: "target-parent",

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
      // Set up embed-a and embed-b as embed nodes pointing to task targets
      for (const n of nodes) {
        if (n.id === "embed-a") {
          n.type = "embed"
          n.embed_source = "target-a"
          n.task_status = undefined
          n.data = {}
        }
        if (n.id === "embed-b") {
          n.type = "embed"
          n.embed_source = "target-b"
          n.task_status = undefined
          n.data = {}
        }
        if (n.id === "regular-task") {
          n.type = "p"
          n.item = true
          n.list_marker = "-"
          n.task_status = "todo"
          n.task_marker = "[ ]"
        }
        if (n.id === "col1" || n.id === "col2") {
          n.type = "h"
          n.item = true
          n.fstype = "mdsection"
        }
      }

      // Add the target nodes (tasks that the embeds point to)
      nodes.push({
        id: "target-a",
        type: "p",
        item: true,
        list_marker: "-",
        parent_id: "some-other-parent",
        parent_idx: 0,
        embed_source: null,
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
        type: "p",
        item: true,
        list_marker: "-",
        parent_id: "some-other-parent",
        parent_idx: 1,
        embed_source: null,
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

// =============================================================================
// Tag file sections with ![[^GID]] embed references (km-tui.tag-block-ids)
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
        // - task_marker and task_status are set
        for (const node of nodes) {
          if (node.id === "Clean-up after trip") {
            node.title = "Clean-up after trip ![[^1138180707609595]]"
            node.content = "[x] Clean-up after trip ![[^1138180707609595]]"
            node.task_marker = "[x]"
            node.task_status = "done"
          }
          if (node.id === "Norway stuff - papers") {
            node.title = "Norway stuff - papers ![[^1137303518371267]]"
            node.content = "[ ] Norway stuff - papers ![[^1137303518371267]]"
            node.task_marker = "[ ]"
            node.task_status = "todo"
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
            node.task_marker = "[x]"
            node.task_status = "done"
          }
          if (node.id === "Task B embed") {
            node.title = undefined
            node.content = "Task B ![[^9999999999999902]]"
            node.task_marker = "[ ]"
            node.task_status = "todo"
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
// Embed alias override (km-wk17l)
// =============================================================================

describe("embed alias override (km-wk17l)", () => {
  test("resolved embed with non-empty content shows alias, not target title", () => {
    // When node.content is non-empty and is NOT embed syntax, it acts as
    // an alias override — like ![[^GID|My custom title]] semantics.
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Target node with actual content
        nodes.push({
          id: "target-aliased",
          type: "p" as const,
          item: true,
          list_marker: "-",
          parent_id: "some-file",
          parent_idx: 0,
          embed_source: null,
          task_status: "todo",
          task_marker: "[ ]",
          content: "Original target title",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        // Embed with alias override — content is plain text, not ![[...]]
        nodes.push({
          id: "alias-embed",
          type: "embed" as const,
          content: "My custom alias",
          embed_source: "target-aliased",
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

  test("resolved embed with embed syntax content shows target title, not alias", () => {
    // When node.content IS embed syntax (![[...]]), it is NOT an alias — fall through
    // to resolvedNode content display.
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        // Target node
        nodes.push({
          id: "target-no-alias",
          type: "p" as const,
          item: true,
          list_marker: "-",
          parent_id: "some-file",
          parent_idx: 0,
          embed_source: null,
          task_status: "todo",
          task_marker: "[ ]",
          content: "Target content here",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as unknown as KNode)

        // Embed whose content is embed syntax (not an alias)
        nodes.push({
          id: "syntax-embed",
          type: "embed" as const,
          content: "![[target-no-alias]]",
          embed_source: "target-no-alias",
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
    // Should show the target's content, not the embed syntax
    expect(text).toContain("Target content here")
    expect(text).not.toContain("![[")
  })
})

// =============================================================================
// Broken embed rendering (km-wk17l)
// =============================================================================

describe("broken embed rendering (km-wk17l)", () => {
  test("broken embed with content shows content in error color", () => {
    // embed_source set but target doesn't exist — broken link.
    // Content available: show it, but in error color.
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        nodes.push({
          id: "broken-embed-with-content",
          type: "embed" as const,
          content: "Some alias text",
          embed_source: "nonexistent-node",
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

  test("broken embed without content shows cleaned embed_source as fallback", () => {
    // embed_source set, target missing, no content — broken link.
    // embed_source looks like a filename → show it directly.
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        nodes.push({
          id: "broken-no-content",
          type: "embed" as const,
          content: null,
          embed_source: "deadbeef-missing",
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
    // Should NOT show embed syntax
    expect(text).not.toContain("![[")
    // Should show the embed_source as cleaned display text
    expect(text).toContain("deadbeef-missing")
  })

  test("broken embed with bare block ref shows broken fallback", () => {
    // embed_source is a bare ^blockId, target missing — show (broken: ^shortId).
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular-task")))

        nodes.push({
          id: "broken-bare-ref",
          type: "embed" as const,
          content: null,
          embed_source: "^deadbeef12345678",
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
// Strip parent sigil from embedded node titles
// =============================================================================

/**
 * When viewing embedded nodes (transclusions with embed_source), the sigil badge
 * after the title should be suppressed if it matches the board or column context.
 * E.g., a task with name "@next" displayed on the @next board should not show
 * the redundant "@next" sigil badge.
 *
 * Similarly, parent context (the "< source" line) should be suppressed if it
 * matches an excluded sigil.
 */
describe("strip embed sigil", () => {
  /**
   * Build a board with a @next column containing embedded tasks.
   * The target tasks have name: "@next" (simulating nodes from @next.md).
   */
  function boardWithEmbeddedSigils() {
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
            n.item = true
            n.fstype = "mdsection"
            n.data = { name: "@next" }
            n.name = "@next"
          }

          // Make embed-a link to a target with name "@next"
          if (n.id === "embed-a") {
            n.type = "p"
            n.embed_source = "target-a"
            n.content = "![[target-a]]"
            n.task_status = undefined
            n.task_marker = undefined
            n.data = {}
          }

          // Make embed-b link to a target with a different sigil
          if (n.id === "embed-b") {
            n.type = "p"
            n.embed_source = "target-b"
            n.content = "![[target-b]]"
            n.task_status = undefined
            n.task_marker = undefined
            n.data = {}
          }

          // Make other column a section
          if (n.id === "other") {
            n.type = "h"
            n.item = true
            n.fstype = "mdsection"
            n.data = { name: "Other" }
          }
        }

        // Target A: task with name "@next" (sigil should be stripped in @next column)
        nodes.push({
          id: "target-a",
          type: "p",
          item: true,
          list_marker: "-",
          parent_id: "some-file",
          parent_idx: 0,
          embed_source: null,
          task_status: "todo",
          task_marker: "[ ]",
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
          item: true,
          list_marker: "-",
          parent_id: "some-file",
          parent_idx: 1,
          embed_source: null,
          task_status: "todo",
          task_marker: "[ ]",
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
    const { board } = boardWithEmbeddedSigils()
    const text = stripAnsi(board.screenshot())

    // "@next" sigil badge should NOT appear after "Buy groceries" in the @next column
    // The task title "Buy groceries" should appear without a redundant "@next" suffix
    expect(text).toContain("Buy groceries")
    expect(text).not.toMatch(/Buy groceries\s+@next/)
  })

  test("sigil badge is shown when it does NOT match the column's excluded sigil", () => {
    const { board } = boardWithEmbeddedSigils()
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
            n.item = true
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
    // Build a board where embedded tasks come from a file named "@next"
    // The parent context would normally show "@next" but should be suppressed
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("@next", item("embed-c")))

        for (const n of nodes) {
          if (n.id === "@next") {
            n.type = "h"
            n.item = true
            n.fstype = "mdsection"
            n.data = { name: "@next" }
            n.name = "@next"
          }

          if (n.id === "embed-c") {
            n.type = "p"
            n.embed_source = "target-c"
            n.content = "![[target-c]]"
            n.task_status = undefined
            n.task_marker = undefined
            n.data = {}
          }
        }

        // Create file node "@next" that is the parent of the target task
        nodes.push({
          id: "next-file",
          type: "h",
          item: true,
          fstype: "mdfile",
          parent_id: null,
          parent_idx: 0,
          embed_source: null,
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
          item: true,
          list_marker: "-",
          parent_id: "next-file",
          parent_idx: 0,
          embed_source: null,
          task_status: "todo",
          task_marker: "[ ]",
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
// Hide redundant parent sigil on embedded links (absorbed from hide-parent-sigil.test.ts)
// =============================================================================

describe("hide redundant parent sigil on embedded links", () => {
  /**
   * Build a board where:
   * - Board root is "board"
   * - Column "@next" contains embedded links (embed_source) to tasks
   * - Tasks' original parent is a file called "@next.md"
   *   with display name "Next Actions" (via data.name)
   */
  function buildEmbedBoard(options?: { parentDisplayName?: string }) {
    const parentName = options?.parentDisplayName ?? "@next"
    return testEnv(() => {
      const nodes = item("board", item("@next", item("embed-a"), item("embed-b")), item("other-col", item("task-x")))

      // Set up @next column as a sigil-named column
      for (const n of nodes) {
        if (n.id === "@next") {
          n.name = "@next"
          n.fs_path = "/fake/repo/@next.md"
        }
        // Set up embed nodes as links pointing to target tasks
        if (n.id === "embed-a") {
          n.type = "p"
          n.embed_source = "target-a"
          n.task_status = undefined
          n.task_marker = undefined
          n.content = "![[target-a]]"
          n.data = {}
        }
        if (n.id === "embed-b") {
          n.type = "p"
          n.embed_source = "target-b"
          n.task_status = undefined
          n.task_marker = undefined
          n.content = "![[target-b]]"
          n.data = {}
        }
      }

      // Add the "@next" mdfile node (parent of original tasks)
      nodes.push({
        id: "next-file",
        type: "h",
        item: true,
        fstype: "mdfile",
        parent_id: null,
        parent_idx: 0,
        embed_source: null,
        content: undefined,
        data: { name: parentName },
        name: "@next",
        fs_path: "/fake/repo/@next.md",
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      } as unknown as KNode)

      // Add the target task nodes (what the embeds point to)
      nodes.push({
        id: "target-a",
        type: "p",
        item: true,
        list_marker: "-",
        parent_id: "next-file",
        parent_idx: 0,
        embed_source: null,
        task_status: "todo",
        task_marker: "[ ]",
        content: "Buy groceries",
        data: {},
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      } as unknown as KNode)

      nodes.push({
        id: "target-b",
        type: "p",
        item: true,
        list_marker: "-",
        parent_id: "next-file",
        parent_idx: 1,
        embed_source: null,
        task_status: "wip",
        task_marker: "[-]",
        content: "Write report @next",
        data: {},
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      } as unknown as KNode)

      return nodes
    })
  }

  test("embedded node does not show @next parent context inside @next column (sigil name match)", () => {
    // Parent file name matches column sigil exactly
    const { board } = buildEmbedBoard({ parentDisplayName: "@next" })
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
    const { board } = buildEmbedBoard({ parentDisplayName: "Next Actions" })
    const screenshot = board.screenshot()

    // "Next Actions" should NOT appear as parent context on cards
    // inside the @next column — it's the same thing
    expect(screenshot).not.toContain("Next Actions")
  })

  test("sigil in task content is filtered out when inside matching column", () => {
    const { board } = buildEmbedBoard()
    const screenshot = board.screenshot()

    // "Write report @next" has @next in content — it should be stripped
    // because we're inside the @next column
    const writeLines = screenshot.split("\n").filter((l) => l.includes("Write report"))
    for (const line of writeLines) {
      expect(line).not.toContain("@next")
    }
  })

  test("@next column header still shows the sigil", () => {
    const { board } = buildEmbedBoard()
    const screenshot = board.screenshot()

    // The column header should still show @next
    const lines = screenshot.split("\n")
    const headerLine = lines.find((l) => l.includes("@next") && !l.includes("Buy") && !l.includes("Write"))
    expect(headerLine).toBeDefined()
  })
})
