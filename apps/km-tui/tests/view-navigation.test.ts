/**
 * ViewNavigation Tests
 *
 * Tests the cards view navigation policy — the core of the navigation refactor.
 * Uses createFakeRepo + a mock GridNavigator.
 *
 * NOTE: This is a pure state test (no screen assertions). It belongs in km-board
 * but can't move yet because the source module (view-navigation.ts) lives in
 * km-tui/src. Move this test when view-navigation.ts migrates to @km/board.
 */

import { describe, it, expect } from "vitest"
import { createFakeRepo } from "@km/storage"
import { item } from "./helpers/board-test.ts"
import { createCardsViewNavigation, createDetailViewNavigation, type NavState } from "../src/view-navigation.ts"
import { deriveCursorAncestors } from "../src/cursor-store.ts"
import { createGridNavigator } from "@km/board"

function makeState(
  cursorNodeId: string,
  rootId: string | null = "board",
  opts?: { ignoredNodeIds?: Set<string> },
): NavState {
  return {
    cursorNodeId,
    rootId,
    foldDepths: new Map(),
    collapsedNodes: new Set(),
    ignoredNodeIds: opts?.ignoredNodeIds,
  }
}

describe("CardsViewNavigation", () => {
  const nav = createCardsViewNavigation()

  describe("vertical navigation (j/k)", () => {
    const nodes = item("board", item("col0", item("c0"), item("c1"), item("c2")), item("col1", item("c3")))
    const repo = createFakeRepo({ nodes })
    const registry = createGridNavigator()

    it("j from board → first column", () => {
      const target = nav.navigate("down", makeState("board"), repo, registry)
      expect(target).toBe("col0")
    })

    it("j from column → first card", () => {
      const target = nav.navigate("down", makeState("col0"), repo, registry)
      expect(target).toBe("c0")
    })

    it("j from card → next sibling", () => {
      const target = nav.navigate("down", makeState("c0"), repo, registry)
      expect(target).toBe("c1")
    })

    it("j from last card → null", () => {
      const target = nav.navigate("down", makeState("c2"), repo, registry)
      expect(target).toBeNull()
    })

    it("k from card → previous sibling", () => {
      const target = nav.navigate("up", makeState("c1"), repo, registry)
      expect(target).toBe("c0")
    })

    it("k from first card → column header", () => {
      const target = nav.navigate("up", makeState("c0"), repo, registry)
      expect(target).toBe("col0")
    })

    it("k from column → board", () => {
      const target = nav.navigate("up", makeState("col0"), repo, registry)
      expect(target).toBe("board")
    })

    it("k from board → null", () => {
      const target = nav.navigate("up", makeState("board"), repo, registry)
      expect(target).toBeNull()
    })

    it("j from empty column → null", () => {
      const emptyNodes = item("board", item("col0"))
      const emptyRepo = createFakeRepo({ nodes: emptyNodes })
      const target = nav.navigate("down", makeState("col0"), emptyRepo, registry)
      expect(target).toBeNull()
    })

    it("j from board respects stickyX", () => {
      // Set stickyX to column 1
      registry.setStickyX(1)
      const target = nav.navigate("down", makeState("board"), repo, registry)
      expect(target).toBe("col1")
      registry.clearStickyX()
    })
  })

  describe("navigation with ignored nodes", () => {
    // Board with 3 columns: col0 is ignored
    const nodes = item("board", item("col0", item("c0")), item("col1", item("c1")), item("col2", item("c2")))
    const repo = createFakeRepo({ nodes })
    const registry = createGridNavigator()
    const ignored = new Set(["col0"])

    it("j from board skips ignored first column", () => {
      const target = nav.navigate("down", makeState("board", "board", { ignoredNodeIds: ignored }), repo, registry)
      expect(target).toBe("col1")
    })

    it("j from board skips ignored column even with stickyX=0", () => {
      registry.setStickyX(0)
      const target = nav.navigate("down", makeState("board", "board", { ignoredNodeIds: ignored }), repo, registry)
      // stickyX=0 points to col0 which is ignored — should go to col1
      expect(target).not.toBe("col0")
      registry.clearStickyX()
    })

    it("j/k round-trip returns to same column", () => {
      // j from board → col1, then k from col1 → board, then j again → should return to col1
      registry.clearStickyX()
      const state = makeState("board", "board", { ignoredNodeIds: ignored })

      const down1 = nav.navigate("down", state, repo, registry)
      expect(down1).toBe("col1")

      const up1 = nav.navigate("up", makeState(down1!, "board", { ignoredNodeIds: ignored }), repo, registry)
      expect(up1).toBe("board")

      const down2 = nav.navigate("down", state, repo, registry)
      expect(down2).toBe("col1") // should return to same column, not cycle
    })

    it("j between cards skips ignored cards", () => {
      const cardsNodes = item("board", item("col", item("a"), item("b"), item("c")))
      const cardsRepo = createFakeRepo({ nodes: cardsNodes })
      const ignoredCards = new Set(["b"])
      const target = nav.navigate(
        "down",
        makeState("a", "board", { ignoredNodeIds: ignoredCards }),
        cardsRepo,
        createGridNavigator(),
      )
      expect(target).toBe("c") // skips ignored "b"
    })

    it("k between cards skips ignored cards", () => {
      const cardsNodes = item("board", item("col", item("a"), item("b"), item("c")))
      const cardsRepo = createFakeRepo({ nodes: cardsNodes })
      const ignoredCards = new Set(["b"])
      const target = nav.navigate(
        "up",
        makeState("c", "board", { ignoredNodeIds: ignoredCards }),
        cardsRepo,
        createGridNavigator(),
      )
      expect(target).toBe("a") // skips ignored "b"
    })

    it("navigate never returns an ignored node", () => {
      // Runtime invariant: any navigation result should not be in ignoredNodeIds
      const target = nav.navigate("down", makeState("board", "board", { ignoredNodeIds: ignored }), repo, registry)
      expect(ignored.has(target!)).toBe(false)
    })
  })

  describe("horizontal navigation (h/l)", () => {
    const nodes = item(
      "board",
      item("col0", item("a0"), item("a1")),
      item("col1", item("b0"), item("b1"), item("b2")),
      item("col2", item("d0")),
    )
    const repo = createFakeRepo({ nodes })
    const registry = createGridNavigator()

    it("l from card → first card in next column (no positions)", () => {
      // stickyY must be set before horizontal nav (set by handleHorizontalNav in production)
      registry.setStickyY(5)
      const target = nav.navigate("right", makeState("a0"), repo, registry)
      expect(target).toBe("b0")
      registry.clearStickyY()
    })

    it("h from card → first card in prev column (no positions)", () => {
      registry.setStickyY(5)
      const target = nav.navigate("left", makeState("b0"), repo, registry)
      expect(target).toBe("a0")
      registry.clearStickyY()
    })

    it("h from first column card → null", () => {
      const target = nav.navigate("left", makeState("a0"), repo, registry)
      expect(target).toBeNull()
    })

    it("l from last column card → null", () => {
      const target = nav.navigate("right", makeState("d0"), repo, registry)
      expect(target).toBeNull()
    })

    it("h/l from board → null", () => {
      expect(nav.navigate("left", makeState("board"), repo, registry)).toBeNull()
      expect(nav.navigate("right", makeState("board"), repo, registry)).toBeNull()
    })

    it("l from column header → column header (no cards info)", () => {
      const target = nav.navigate("right", makeState("col0"), repo, registry)
      // From column header to next column header (no stickyY set)
      expect(target).toBe("col1")
    })

    it("l to empty column → column header", () => {
      const emptyNodes = item("board", item("col0", item("a0")), item("col1"))
      const emptyRepo = createFakeRepo({ nodes: emptyNodes })
      const target = nav.navigate("right", makeState("a0"), emptyRepo, registry)
      expect(target).toBe("col1")
    })

    it("h/l from cursor on ignored column → redirects to nearest visible column", () => {
      // Cursor is on col1 header, but col1 is ignored (e.g. Contacts.base filtered out).
      // Should not throw, should redirect to first visible column.
      const ignored = new Set(["col1"])
      const right = nav.navigate("right", makeState("b0", "board", { ignoredNodeIds: ignored }), repo, registry)
      expect(right).not.toBeNull()
      expect(ignored.has(right!)).toBe(false)

      const left = nav.navigate("left", makeState("b0", "board", { ignoredNodeIds: ignored }), repo, registry)
      expect(left).not.toBeNull()
      expect(ignored.has(left!)).toBe(false)
    })

    it("h/l from cursor on ignored column when all columns ignored → null", () => {
      const allIgnored = new Set(["col0", "col1", "col2"])
      const target = nav.navigate("right", makeState("b0", "board", { ignoredNodeIds: allIgnored }), repo, registry)
      expect(target).toBeNull()
    })
  })
})

describe("ghost cursor — index file nodes (km-nx8af)", () => {
  /**
   * When a folder column has an index file (e.g., early-orbit/early-orbit.md),
   * the view layer filters it from cardNodes (kNodeToColumnView). But navigation
   * uses repo.getChildren() directly, which includes the index file. If the
   * cursor lands on the invisible index file node, it becomes a "ghost cursor"
   * — the cursor exists but nothing is rendered for it.
   */
  const nav = createCardsViewNavigation()
  const grid = createGridNavigator()

  // Build a board with a folder column whose first child is its index file.
  // At the parent ("board") level, "project" is a column with cards:
  //   [project.md (index file), task-a, task-b]
  // The view filters out project.md, showing only [task-a, task-b].
  // Navigation must also skip project.md.
  const nodes: import("@km/core").KNode[] = [
    {
      id: "board",
      type: "h",
      item: true,
      fstype: "repo",
      name: "board",
      data: { name: "board", is_repo_root: true },
      parent_id: null,
      parent_idx: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    },
    {
      id: "project",
      type: "h",
      item: true,
      fstype: "folder",
      name: "project",
      data: { name: "project" },
      parent_id: "board",
      parent_idx: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    },
    {
      // Index file: same name as parent folder → findIndexFile matches this
      id: "project-md",
      type: "h",
      item: true,
      fstype: "mdfile",
      name: "project",
      data: { name: "project" },
      parent_id: "project",
      parent_idx: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    },
    {
      id: "task-a",
      type: "p",
      item: true,
      list_marker: "-",
      task_marker: "[ ]",
      task_status: "todo",
      content: "task-a",
      data: {},
      parent_id: "project",
      parent_idx: 1,
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    },
    {
      id: "task-b",
      type: "p",
      item: true,
      list_marker: "-",
      task_marker: "[ ]",
      task_status: "todo",
      content: "task-b",
      data: {},
      parent_id: "project",
      parent_idx: 2,
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    },
  ]
  const repo = createFakeRepo({ nodes })

  it("j from column header skips index file, lands on first visible card", () => {
    // Column header "project" → j should go to "task-a", not "project-md" (index file)
    const target = nav.navigate("down", makeState("project"), repo, grid)
    expect(target).not.toBe("project-md")
    expect(target).toBe("task-a")
  })

  it("j from card before index file skips it", () => {
    // If cursor is on task-a (parent_idx 1) and index file is at parent_idx 0,
    // j should go to task-b, not to the invisible index file.
    const target = nav.navigate("down", makeState("task-a"), repo, grid)
    expect(target).toBe("task-b")
  })

  it("k from card after index file skips it", () => {
    // k from task-a: previous sibling by parent_idx is project-md (index file),
    // but it should skip to column header instead
    const target = nav.navigate("up", makeState("task-a"), repo, grid)
    // Should go to column header, not to the invisible index file
    expect(target).not.toBe("project-md")
    expect(target).toBe("project")
  })

  it("j from last card → null (does not wrap to index file)", () => {
    const target = nav.navigate("down", makeState("task-b"), repo, grid)
    expect(target).toBeNull()
  })
})

describe("DetailViewNavigation", () => {
  const nav = createDetailViewNavigation()
  const grid = createGridNavigator()
  const nodes = item("root", item("child0"), item("child1"), item("child2"))
  const repo = createFakeRepo({ nodes })

  it("cursor === root, down → first child (bug: km-tui.detail-nav-ancestor)", () => {
    const target = nav.navigate("down", makeState("root", "root"), repo, grid)
    expect(target).toBe("child0")
  })

  it("cursor === root, up → null (boundary)", () => {
    const target = nav.navigate("up", makeState("root", "root"), repo, grid)
    expect(target).toBeNull()
  })

  it("j from first child → second child", () => {
    const target = nav.navigate("down", makeState("child0", "root"), repo, grid)
    expect(target).toBe("child1")
  })

  it("k from first child → root (parent)", () => {
    const target = nav.navigate("up", makeState("child0", "root"), repo, grid)
    expect(target).toBe("root")
  })

  it("j from last child → null (boundary)", () => {
    const target = nav.navigate("down", makeState("child2", "root"), repo, grid)
    expect(target).toBeNull()
  })

  it("left/right → null", () => {
    expect(nav.navigate("left", makeState("child0", "root"), repo, grid)).toBeNull()
    expect(nav.navigate("right", makeState("child0", "root"), repo, grid)).toBeNull()
  })

  it("j on heading with children → enters first child", () => {
    const nested = item("root", item("parent", item("child")), item("sibling"))
    const nestedRepo = createFakeRepo({ nodes: nested })
    // j from parent → first child (enters heading content)
    const target = nav.navigate("down", makeState("parent", "root"), nestedRepo, grid)
    expect(target).toBe("child")
  })

  it("j past last child → parent's next sibling", () => {
    const nested = item("root", item("parent", item("child")), item("sibling"))
    const nestedRepo = createFakeRepo({ nodes: nested })
    // j from child (last in parent) → sibling (bubbles up)
    const target = nav.navigate("down", makeState("child", "root"), nestedRepo, grid)
    expect(target).toBe("sibling")
  })
})

describe("deriveCursorAncestors", () => {
  const nodes: Record<string, { parent_id: string | null; type: string; item?: boolean }> = {
    board: { parent_id: null, type: "h", item: true },
    col1: { parent_id: "board", type: "h", item: true },
    A: { parent_id: "board", type: "h", item: true }, // After outdent
    B: { parent_id: "col1", type: "h", item: true },
    deep: { parent_id: "B", type: "h", item: true },
    para: { parent_id: "board", type: "p" }, // Body card
  }
  const getNode = (id: string) => nodes[id] ?? null

  it("column-level: oi child of root", () => {
    const result = deriveCursorAncestors(getNode, "board", "A")
    expect(result).toEqual({
      cursorCardNodeId: null,
      cursorColumnNodeId: "A",
      selectionLevel: "column",
    })
  })

  it("card-level: grandchild of root", () => {
    const result = deriveCursorAncestors(getNode, "board", "B")
    expect(result).toEqual({
      cursorCardNodeId: "B",
      cursorColumnNodeId: "col1",
      selectionLevel: "card",
    })
  })

  it("deep: cursor inside card", () => {
    const result = deriveCursorAncestors(getNode, "board", "deep")
    expect(result).toEqual({
      cursorCardNodeId: "B",
      cursorColumnNodeId: "col1",
      selectionLevel: "card",
    })
  })

  it("body card: non-oi child of root", () => {
    const result = deriveCursorAncestors(getNode, "board", "para")
    expect(result).toEqual({
      cursorCardNodeId: "para",
      cursorColumnNodeId: "__body__board",
      selectionLevel: "card",
    })
  })

  it("virtual body column header", () => {
    const result = deriveCursorAncestors(getNode, "board", "__body__board")
    expect(result).toEqual({
      cursorCardNodeId: null,
      cursorColumnNodeId: "__body__board",
      selectionLevel: "column",
    })
  })

  it("board level: null cursor", () => {
    const result = deriveCursorAncestors(getNode, "board", null)
    expect(result).toEqual({
      cursorCardNodeId: null,
      cursorColumnNodeId: null,
      selectionLevel: "board",
    })
  })
})
