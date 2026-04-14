/**
 * Regression: km-tui.folder-card-empty-title
 *
 * Folders without an _index.md (e.g., ~/Bear/Vault/areas/@home/, @family/)
 * were rendering with empty/dim titles in card view. Production loader sets
 * folder nodes with name+content set to the folder basename, but the rendering
 * pipeline excluded those values via sigil-based mention stripping.
 */
import { describe, it, expect } from "vitest"
import type { KNode } from "@km/core"
import { createTestApp } from "./helpers/test-app.ts"

const FOLDER_BASE = {
  type: "h" as const,
  item: {},
  fstype: "folder" as const,
  embed_of: null,
  data: {},
  created_at: 0,
  updated_at: 0,
  version: "v1",
}

function folderNode(id: string, name: string, parentId: string | null, parentIdx: number): KNode {
  return {
    ...FOLDER_BASE,
    id,
    fs_path: id,
    name,
    content: name,
    parent_id: parentId,
    parent_idx: parentIdx,
  }
}

function mdFileNode(id: string, name: string, title: string, parentId: string, parentIdx: number): KNode {
  return {
    ...FOLDER_BASE,
    fstype: "mdfile" as const,
    id,
    fs_path: id,
    name,
    title,
    parent_id: parentId,
    parent_idx: parentIdx,
  }
}

describe("folder card title (km-tui.folder-card-empty-title)", () => {
  it("renders card whose title is the column sigil (@work) with non-empty text", () => {
    // Mirrors ~/Bear/Vault/areas/@work/ — column = @work, card = README.md whose H1 is "@work".
    // Bug: column-level sigil exclusion ([@work]) strips the @work mention from the
    // card title via InlineMention, leaving an EMPTY card title row.
    const areas = folderNode("areas-id", "areas", null, 0)
    const work = folderNode("work-id", "@work", "areas-id", 0)
    const readme: KNode = {
      ...FOLDER_BASE,
      fstype: "mdfile" as const,
      id: "readme-id",
      fs_path: "areas/@work/README.md",
      name: "README",
      title: "@work",
      content: "@work",
      parent_id: "work-id",
      parent_idx: 0,
    }
    const nodes = [areas, work, readme]

    using app = createTestApp(nodes)
    // The README.md card title should still show "@work" — the user needs SOME title text.
    // (Previously: the InlineMention was excluded as redundant with the column header,
    //  which left a blank card title row.)
    const card = app.node("readme-id")
    expect(card.exists).toBe(true)
    expect(card.visible).toBe(true)
    expect(card.text).toContain("@work")
  })
})
