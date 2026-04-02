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
import { createFakeRepo, type Repo } from "@km/storage"
import type { KNode } from "@km/core"
import { item } from "./helpers/board-test.ts"
import { createCardsViewNavigation, createDetailViewNavigation, type NavState } from "../src/view-navigation.ts"
import { buildViewTree, buildViewIndex, classifyCursorFromViewIndex, createGridNavigator } from "@km/board"

function makeState(
  cursorNodeId: string,
  repo: Repo,
  rootId: string | null = "board",
  opts?: { hiddenNodeIds?: Set<string> },
): NavState {
  const viewTree = buildViewTree(repo, rootId, new Map())
  const viewIndex = buildViewIndex(viewTree)
  return {
    cursorNodeId,
    rootId,
    foldDepths: new Map(),
    collapsedNodes: new Set(),
    hiddenNodeIds: opts?.hiddenNodeIds,
    viewTree,
    viewIndex,
  }
}

describe("CardsViewNavigation", () => {
  const nav = createCardsViewNavigation()

  describe("vertical navigation (j/k)", () => {
    const nodes = item("board", item("col0", item("c0"), item("c1"), item("c2")), item("col1", item("c3")))
    const repo = createFakeRepo({ nodes })
    const registry = createGridNavigator()

    it("j from board → first column", () => {
      const target = nav.navigate("down", makeState("board", repo), repo, registry)
      expect(target).toBe("col0")
    })

    it("j from column → first card", () => {
      const target = nav.navigate("down", makeState("col0", repo), repo, registry)
      expect(target).toBe("c0")
    })

    it("j from card → next sibling", () => {
      const target = nav.navigate("down", makeState("c0", repo), repo, registry)
      expect(target).toBe("c1")
    })

    it("j from last card → null", () => {
      const target = nav.navigate("down", makeState("c2", repo), repo, registry)
      expect(target).toBeNull()
    })

    it("k from card → previous sibling", () => {
      const target = nav.navigate("up", makeState("c1", repo), repo, registry)
      expect(target).toBe("c0")
    })

    it("k from first card → column header", () => {
      const target = nav.navigate("up", makeState("c0", repo), repo, registry)
      expect(target).toBe("col0")
    })

    it("k from column → board", () => {
      const target = nav.navigate("up", makeState("col0", repo), repo, registry)
      expect(target).toBe("board")
    })

    it("k from board → null", () => {
      const target = nav.navigate("up", makeState("board", repo), repo, registry)
      expect(target).toBeNull()
    })

    it("j from empty column → null", () => {
      const emptyNodes = item("board", item("col0"))
      const emptyRepo = createFakeRepo({ nodes: emptyNodes })
      const target = nav.navigate("down", makeState("col0", emptyRepo), emptyRepo, registry)
      expect(target).toBeNull()
    })

    it("j from board respects stickyX", () => {
      registry.setStickyX(1)
      const target = nav.navigate("down", makeState("board", repo), repo, registry)
      expect(target).toBe("col1")
      registry.clearStickyX()
    })
  })

  describe("navigation with hidden nodes", () => {
    const nodes = item("board", item("col0", item("c0")), item("col1", item("c1")), item("col2", item("c2")))
    const repo = createFakeRepo({ nodes })
    const registry = createGridNavigator()
    const hidden = new Set(["col0"])

    it("j from board skips hidden first column", () => {
      const target = nav.navigate("down", makeState("board", repo, "board", { hiddenNodeIds: hidden }), repo, registry)
      expect(target).toBe("col1")
    })

    it("j from board skips hidden column even with stickyX=0", () => {
      registry.setStickyX(0)
      const target = nav.navigate("down", makeState("board", repo, "board", { hiddenNodeIds: hidden }), repo, registry)
      expect(target).not.toBe("col0")
      registry.clearStickyX()
    })

    it("j/k round-trip returns to same column", () => {
      registry.clearStickyX()
      const state = makeState("board", repo, "board", { hiddenNodeIds: hidden })
      const down1 = nav.navigate("down", state, repo, registry)
      expect(down1).toBe("col1")
      const up1 = nav.navigate("up", makeState(down1!, repo, "board", { hiddenNodeIds: hidden }), repo, registry)
      expect(up1).toBe("board")
      const down2 = nav.navigate("down", state, repo, registry)
      expect(down2).toBe("col1")
    })

    it("j between cards skips hidden cards", () => {
      const cardsNodes = item("board", item("col", item("a"), item("b"), item("c")))
      const cardsRepo = createFakeRepo({ nodes: cardsNodes })
      const hiddenCards = new Set(["b"])
      const target = nav.navigate(
        "down",
        makeState("a", cardsRepo, "board", { hiddenNodeIds: hiddenCards }),
        cardsRepo,
        createGridNavigator(),
      )
      expect(target).toBe("c")
    })

    it("k between cards skips hidden cards", () => {
      const cardsNodes = item("board", item("col", item("a"), item("b"), item("c")))
      const cardsRepo = createFakeRepo({ nodes: cardsNodes })
      const hiddenCards = new Set(["b"])
      const target = nav.navigate(
        "up",
        makeState("c", cardsRepo, "board", { hiddenNodeIds: hiddenCards }),
        cardsRepo,
        createGridNavigator(),
      )
      expect(target).toBe("a")
    })

    it("navigate never returns an hidden node", () => {
      const target = nav.navigate("down", makeState("board", repo, "board", { hiddenNodeIds: hidden }), repo, registry)
      expect(hidden.has(target!)).toBe(false)
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
      registry.setStickyY(5)
      const target = nav.navigate("right", makeState("a0", repo), repo, registry)
      expect(target).toBe("b0")
      registry.clearStickyY()
    })

    it("h from card → first card in prev column (no positions)", () => {
      registry.setStickyY(5)
      const target = nav.navigate("left", makeState("b0", repo), repo, registry)
      expect(target).toBe("a0")
      registry.clearStickyY()
    })

    it("h from first column card → null", () => {
      const target = nav.navigate("left", makeState("a0", repo), repo, registry)
      expect(target).toBeNull()
    })

    it("l from last column card → null", () => {
      const target = nav.navigate("right", makeState("d0", repo), repo, registry)
      expect(target).toBeNull()
    })

    it("h/l from board → null", () => {
      expect(nav.navigate("left", makeState("board", repo), repo, registry)).toBeNull()
      expect(nav.navigate("right", makeState("board", repo), repo, registry)).toBeNull()
    })

    it("l from column header → column header (no cards info)", () => {
      const target = nav.navigate("right", makeState("col0", repo), repo, registry)
      expect(target).toBe("col1")
    })

    it("l to empty column → column header", () => {
      const emptyNodes = item("board", item("col0", item("a0")), item("col1"))
      const emptyRepo = createFakeRepo({ nodes: emptyNodes })
      const target = nav.navigate("right", makeState("a0", emptyRepo), emptyRepo, registry)
      expect(target).toBe("col1")
    })

    it("h/l from cursor on hidden column → redirects to nearest visible column", () => {
      const hidden = new Set(["col1"])
      const right = nav.navigate("right", makeState("b0", repo, "board", { hiddenNodeIds: hidden }), repo, registry)
      expect(right).not.toBeNull()
      expect(hidden.has(right!)).toBe(false)
      const left = nav.navigate("left", makeState("b0", repo, "board", { hiddenNodeIds: hidden }), repo, registry)
      expect(left).not.toBeNull()
      expect(hidden.has(left!)).toBe(false)
    })

    it("h/l from cursor on hidden column when all columns hidden → null", () => {
      const allIgnored = new Set(["col0", "col1", "col2"])
      const target = nav.navigate(
        "right",
        makeState("b0", repo, "board", { hiddenNodeIds: allIgnored }),
        repo,
        registry,
      )
      expect(target).toBeNull()
    })
  })
})

describe("ghost cursor — index file nodes (km-nx8af)", () => {
  const nav = createCardsViewNavigation()
  const grid = createGridNavigator()

  const nodes: import("@km/core").KNode[] = [
    {
      id: "board",
      type: "h",
      item: {},
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
      item: {},
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
      id: "project-md",
      type: "h",
      item: {},
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
      item: { list: "-", task: { status: "todo", marker: "[ ]" } },
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
      item: { list: "-", task: { status: "todo", marker: "[ ]" } },
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
    const target = nav.navigate("down", makeState("project", repo), repo, grid)
    expect(target).not.toBe("project-md")
    expect(target).toBe("task-a")
  })

  it("j from card before index file skips it", () => {
    const target = nav.navigate("down", makeState("task-a", repo), repo, grid)
    expect(target).toBe("task-b")
  })

  it("k from card after index file skips it", () => {
    const target = nav.navigate("up", makeState("task-a", repo), repo, grid)
    expect(target).not.toBe("project-md")
    expect(target).toBe("project")
  })

  it("j from last card → null (does not wrap to index file)", () => {
    const target = nav.navigate("down", makeState("task-b", repo), repo, grid)
    expect(target).toBeNull()
  })
})

describe("DetailViewNavigation", () => {
  const nav = createDetailViewNavigation()
  const grid = createGridNavigator()
  const nodes = item("root", item("child0"), item("child1"), item("child2"))
  const repo = createFakeRepo({ nodes })

  it("cursor === root, down → first child (bug: km-tui.detail-nav-ancestor)", () => {
    const target = nav.navigate("down", makeState("root", repo, "root"), repo, grid)
    expect(target).toBe("child0")
  })

  it("cursor === root, up → null (boundary)", () => {
    const target = nav.navigate("up", makeState("root", repo, "root"), repo, grid)
    expect(target).toBeNull()
  })

  it("j from first child → second child", () => {
    const target = nav.navigate("down", makeState("child0", repo, "root"), repo, grid)
    expect(target).toBe("child1")
  })

  it("k from first child → root (parent)", () => {
    const target = nav.navigate("up", makeState("child0", repo, "root"), repo, grid)
    expect(target).toBe("root")
  })

  it("j from last child → null (boundary)", () => {
    const target = nav.navigate("down", makeState("child2", repo, "root"), repo, grid)
    expect(target).toBeNull()
  })

  it("left/right → null", () => {
    expect(nav.navigate("left", makeState("child0", repo, "root"), repo, grid)).toBeNull()
    expect(nav.navigate("right", makeState("child0", repo, "root"), repo, grid)).toBeNull()
  })

  it("j on heading with children → enters first child", () => {
    const nested = item("root", item("parent", item("child")), item("sibling"))
    const nestedRepo = createFakeRepo({ nodes: nested })
    const target = nav.navigate("down", makeState("parent", nestedRepo, "root"), nestedRepo, grid)
    expect(target).toBe("child")
  })

  it("j past last child → parent's next sibling", () => {
    const nested = item("root", item("parent", item("child")), item("sibling"))
    const nestedRepo = createFakeRepo({ nodes: nested })
    const target = nav.navigate("down", makeState("child", nestedRepo, "root"), nestedRepo, grid)
    expect(target).toBe("sibling")
  })
})

describe("classifyCursorFromViewIndex", () => {
  const baseNodes = item("board", item("col1", item("B", item("deep"))), item("A", item("A-child")))
  const now = Date.now()
  const bodyPara: KNode = {
    id: "para",
    type: "p",
    parent_id: "board",
    parent_idx: -1,
    title: "",
    content: "body text",
    data: {},
    fstype: "mdsection",
    created_at: now,
    updated_at: now,
    version: "",
  }
  const repo = createFakeRepo({ nodes: [bodyPara, ...baseNodes] })

  function classify(nodeId: string | null) {
    const vTree = buildViewTree(repo, "board", new Map())
    const vIndex = buildViewIndex(vTree)
    return classifyCursorFromViewIndex(vIndex, nodeId)
  }

  it("column-level: oi child of root", () => {
    const result = classify("A")
    expect(result).toEqual({ cursorCardNodeId: null, cursorColumnNodeId: "A", selectionLevel: "column" })
  })

  it("card-level: grandchild of root", () => {
    const result = classify("B")
    expect(result).toEqual({ cursorCardNodeId: "B", cursorColumnNodeId: "col1", selectionLevel: "card" })
  })

  it("deep: cursor inside card", () => {
    const result = classify("deep")
    expect(result).toEqual({ cursorCardNodeId: "B", cursorColumnNodeId: "col1", selectionLevel: "card" })
  })

  it("body card: non-oi child of root", () => {
    const result = classify("para")
    expect(result).toEqual({ cursorCardNodeId: "para", cursorColumnNodeId: "__body__board", selectionLevel: "card" })
  })

  it("virtual body column header", () => {
    const result = classify("__body__board")
    expect(result).toEqual({ cursorCardNodeId: null, cursorColumnNodeId: "__body__board", selectionLevel: "column" })
  })

  it("board level: null cursor", () => {
    const result = classify(null)
    expect(result).toEqual({ cursorCardNodeId: null, cursorColumnNodeId: null, selectionLevel: "board" })
  })
})
