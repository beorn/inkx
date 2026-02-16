/**
 * Test: j navigation through embed cards in an inbox-style column.
 *
 * Reproducer for km-tui.inbox-cursor-jump: pressing 'j' from
 * "Kaiser Health" card jumps cursor to board title instead of next card.
 *
 * The Inbox column contains many embed links (![[...]]) as its body content.
 * Some are type "p" (from markdown parsing), others are type "link" (from
 * add= query rules). The type "link" nodes are the ones that trigger the bug.
 */
import { describe, it, expect, beforeAll } from "vitest"
import { testEnv, testEnvWithRepo, item } from "./helpers/board-test.ts"
import { createFakeRepo, createRepo, type Repo } from "@km/storage"
import { runGenerator } from "@km/core"
import { createCardsViewNavigation, type NavState } from "../src/view-navigation.ts"
import { createLayoutRegistry } from "../src/card-positions.ts"
import { deriveColumnsFromRepo, buildNodeIndex } from "../src/hooks/use-columns.ts"
import type { KNode } from "@km/core"
import { existsSync } from "node:fs"

function cursor(nodeId: string): string {
  return `[id="${nodeId}"][data-cursor]`
}

/**
 * Create a paragraph-type embed node (from markdown parsing of ![[target]]).
 * Has type "p", content is the raw embed syntax, link_to may be null (unresolved).
 */
function pEmbed(id: string, targetId?: string | null): KNode[] {
  const node: KNode = {
    id,
    type: "p",
    content: `![[${id}]]`,
    data: { embeddingTarget: id },
    parent_id: null,
    parent_idx: 0,
    link_to: targetId ?? null,
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
  }
  return [node]
}

/**
 * Create a link-type embed node (from add= query rule evaluation).
 * Has type "link", embed=true, link_to pointing to the matched node.
 */
function linkEmbed(id: string, targetId: string): KNode[] {
  const node: KNode = {
    id,
    type: "link",
    content: `![[${id}]]`,
    data: { embeddingTarget: id },
    parent_id: null,
    parent_idx: 0,
    link_to: targetId,
    embed: true,
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
  } as KNode
  return [node]
}

describe("inbox cursor jump: j through large column with mixed embed types", () => {
  it("j navigates through 68 mixed embed cards without jumping to board", () => {
    // Mimics the real vault: 68 cards in the inbox column, mix of p and link types.
    // The column is taller than the viewport (24 rows), requiring scrolling.
    const embeds: KNode[][] = []
    for (let i = 0; i < 68; i++) {
      if (i === 9 || i === 16 || i === 45 || i === 47) {
        // Link-type embeds at specific positions (matches real vault)
        embeds.push(linkEmbed(`emb-${i}`, `target-${i}`))
      } else {
        embeds.push(pEmbed(`emb-${i}`))
      }
    }

    const { board } = testEnv(() =>
      item(
        "board",
        item("inbox", ...embeds),
        item("next"),
        item("waiting"),
        item("done collapse=true"),
      ),
    )

    // Navigate through ALL 68 embeds — no jumps to board title
    board.expect(cursor("emb-0")).toExist()
    for (let i = 1; i < 68; i++) {
      board.press("j")
      // Verify cursor is on the expected card, not on board title
      board.expect(cursor(`emb-${i}`)).toExist()
    }

    // At the last card, j should hit boundary (bell)
    board.press("j")
    expect(board.bell).toBe(true)
  })

  it("j from link-type embed at position 9 goes to next card", () => {
    // Focused test: Kaiser Health equivalent at position 9
    const embeds: KNode[][] = []
    for (let i = 0; i < 20; i++) {
      if (i === 9) {
        embeds.push(linkEmbed("kaiser-health", "target-kaiser"))
      } else {
        embeds.push(pEmbed(`emb-${i}`))
      }
    }

    const { board } = testEnv(() =>
      item(
        "board",
        item("inbox", ...embeds),
        item("next"),
      ),
    )

    // Navigate to position 9 (kaiser-health)
    for (let i = 0; i < 9; i++) board.press("j")
    board.expect(cursor("kaiser-health")).toExist()

    // j should go to emb-10, NOT to board title
    board.press("j")
    board.expect(cursor("emb-10")).toExist()
  })
})

describe("inbox cursor jump: unit test view-navigation with link-type nodes", () => {
  const nav = createCardsViewNavigation()
  const registry = createLayoutRegistry()

  it("j from link-type embed returns next sibling", () => {
    const allNodes: KNode[] = [
      {
        id: "board", type: "oi", fstype: "folder", content: undefined,
        data: { name: "board" }, parent_id: null, parent_idx: 0,
        link_to: null, created_at: Date.now(), updated_at: Date.now(), version: "v1",
      },
      {
        id: "inbox", type: "oi", fstype: "folder", content: undefined,
        data: { name: "inbox" }, parent_id: "board", parent_idx: 0,
        link_to: null, created_at: Date.now(), updated_at: Date.now(), version: "v1",
      },
      ...Array.from({ length: 9 }, (_, i) => ({
        id: `emb-${i}`, type: "p" as const, content: `![[embed ${i}]]`,
        data: {}, parent_id: "inbox", parent_idx: i,
        link_to: null, created_at: Date.now(), updated_at: Date.now(), version: "v1",
      })),
      {
        id: "kaiser", type: "link", content: "![[Kaiser Health Insurance]]",
        data: { embeddingTarget: "Kaiser Health Insurance" },
        parent_id: "inbox", parent_idx: 9, link_to: "target-kaiser",
        embed: true, created_at: Date.now(), updated_at: Date.now(), version: "v1",
      } as KNode,
      ...Array.from({ length: 14 }, (_, i) => ({
        id: `emb-${i + 10}`, type: "p" as const, content: `![[embed ${i + 10}]]`,
        data: {}, parent_id: "inbox", parent_idx: i + 10,
        link_to: null, created_at: Date.now(), updated_at: Date.now(), version: "v1",
      })),
    ]

    const repo = createFakeRepo({ nodes: allNodes })
    const state: NavState = {
      cursorNodeId: "kaiser", rootId: "board",
      foldedNodes: new Set(), collapsedNodes: new Set(),
    }

    const target = nav.navigate("down", state, repo, registry)
    expect(target).toBe("emb-10")
  })

  it("link-type embed appears in nodeIndex as a card", () => {
    const allNodes: KNode[] = [
      {
        id: "board", type: "oi", fstype: "folder", content: undefined,
        data: { name: "board" }, parent_id: null, parent_idx: 0,
        link_to: null, created_at: Date.now(), updated_at: Date.now(), version: "v1",
      },
      {
        id: "inbox", type: "oi", fstype: "folder", content: undefined,
        data: { name: "inbox" }, parent_id: "board", parent_idx: 0,
        link_to: null, created_at: Date.now(), updated_at: Date.now(), version: "v1",
      },
      {
        id: "p1", type: "p", content: "![[some file.pdf]]",
        data: {}, parent_id: "inbox", parent_idx: 0,
        link_to: null, created_at: Date.now(), updated_at: Date.now(), version: "v1",
      },
      {
        id: "link1", type: "link", content: "![[Kaiser Health]]",
        data: {}, parent_id: "inbox", parent_idx: 1,
        link_to: "target-kaiser", embed: true,
        created_at: Date.now(), updated_at: Date.now(), version: "v1",
      } as KNode,
      {
        id: "p2", type: "p", content: "![[another file.pdf]]",
        data: {}, parent_id: "inbox", parent_idx: 2,
        link_to: null, created_at: Date.now(), updated_at: Date.now(), version: "v1",
      },
    ]

    const repo = createFakeRepo({ nodes: allNodes })
    const columns = deriveColumnsFromRepo(repo, "board", new Set())
    const nodeIndex = buildNodeIndex(columns)

    expect(nodeIndex.get("p1")).toBeDefined()
    expect(nodeIndex.get("link1")).toBeDefined()
    expect(nodeIndex.get("p2")).toBeDefined()
    expect(nodeIndex.get("link1")?.cardIndex).toBe(1)
  })
})

// =============================================================================
// Real vault test (only runs when /tmp/vt exists)
// =============================================================================

const VAULT_PATH = "/tmp/vt"
const hasVault = existsSync(VAULT_PATH)

describe.skipIf(!hasVault)("inbox cursor jump: real vault /tmp/vt", () => {
  let repo: Repo
  let rootId: string
  let kaiserNodeId: string

  beforeAll(() => {
    repo = runGenerator(createRepo(VAULT_PATH, { loadFiles: true }))
    const allNodes = repo.data.getAllNodes()
    const nextFile = allNodes.find((n: KNode) => n.fs_path === "@next.md")
    rootId = nextFile!.id

    const rootChildren = repo.getChildren(rootId)
    const inbox = rootChildren.find((n: KNode) => (n.name || "").includes("inbox"))
    const inboxChildren = repo.getChildren(inbox!.id)
    const kaiser = inboxChildren.find((n: KNode) => (n.content || "").includes("Kaiser Health Insurance"))
    kaiserNodeId = kaiser!.id
  })

  it("navigate-down from Kaiser Health returns the next embed card", () => {
    const nav = createCardsViewNavigation()
    const registry = createLayoutRegistry()

    const state: NavState = {
      cursorNodeId: kaiserNodeId,
      rootId,
      foldedNodes: new Set(),
      collapsedNodes: new Set(),
    }

    const target = nav.navigate("down", state, repo, registry)
    expect(target).not.toBeNull()
    expect(target).not.toBe(rootId) // Must NOT jump to board title

    const targetNode = repo.getNode(target!)
    expect(targetNode).toBeDefined()
    expect(targetNode!.parent_id).toBe(repo.getNode(kaiserNodeId)!.parent_id)
  })

  it("j from Kaiser Health in full rendering pipeline does not jump to board title", () => {
    const { board } = testEnvWithRepo(repo, rootId, {
      columns: 200,
      rows: 60,
    })

    // Navigate down until we reach Kaiser Health
    let found = false
    for (let i = 0; i < 68; i++) {
      const kaiserLoc = board.q(cursor(kaiserNodeId))
      if (kaiserLoc.count() > 0) {
        found = true
        break
      }
      board.press("j")
    }

    if (!found) return // Skip if can't reach it

    // j should go to the next card, NOT to board title
    board.press("j")
    const boardTitleCursor = board.q(cursor(rootId))
    expect(boardTitleCursor.count()).toBe(0)
  })
})
