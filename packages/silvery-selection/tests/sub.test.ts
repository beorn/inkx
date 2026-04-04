import { describe, expect, it } from "vitest"
import { effect } from "alien-signals"
import { createSelection } from "../src/store.ts"
import type { ID, SelectionApp, TextSelection } from "../src/types.ts"

// --- Test helpers ---

const id = (s: string) => s as ID
const A = id("A")
const B = id("B")
const C = id("C")
const D = id("D")
const E = id("E")

function flatApp(nodes: ID[] = [A, B, C, D, E]): SelectionApp {
  return {
    tree: {
      walkOrder(_root: ID | null) {
        return nodes
      },
      parent(_id: ID) {
        return undefined
      },
      children(_id: ID) {
        return []
      },
    },
  }
}

// --- text accessor ---

describe("text accessor", () => {
  it("returns null when not in text mode", () => {
    const sel = createSelection(flatApp())
    expect(sel.text()).toBeNull()
  })

  it("returns TextSelection when in text mode", () => {
    const sel = createSelection(flatApp())
    sel.node.select([A])
    sel.text.edit(A, 5)
    const t = sel.text()
    expect(t).not.toBeNull()
    expect(t!.kind).toBe("text")
    expect(t!.nodeId).toBe(A)
    expect(t!.cursor).toBe(5)
  })

  describe("edit", () => {
    it("enters text mode", () => {
      const sel = createSelection(flatApp())
      sel.node.select([A])
      sel.text.edit(A, 3)
      expect(sel.kind()).toBe("text")
      expect(sel.text()!.cursor).toBe(3)
    })

    it("ensures node is selected when editing", () => {
      const sel = createSelection(flatApp())
      // No node selected; editing B should select it first
      sel.text.edit(B, 0)
      expect(sel.node.ids().has(B)).toBe(true)
      expect(sel.text()!.nodeId).toBe(B)
    })

    it("preserves existing multi-selection when node already selected", () => {
      const sel = createSelection(flatApp())
      sel.node.select([A, B, C])
      sel.text.edit(A, 0)
      // A was already selected, so multi-selection from applyTextEdit preserves nodes
      expect(sel.text()!.nodeId).toBe(A)
    })
  })

  describe("select", () => {
    it("moves text cursor", () => {
      const sel = createSelection(flatApp())
      sel.node.select([A])
      sel.text.edit(A, 0)
      sel.text.select(7)
      expect(sel.text()!.cursor).toBe(7)
    })

    it("sets text range with anchor", () => {
      const sel = createSelection(flatApp())
      sel.node.select([A])
      sel.text.edit(A, 0)
      sel.text.select(10, 3)
      expect(sel.text()!.cursor).toBe(10)
      expect(sel.text()!.anchor).toBe(3)
    })

    it("no-op when not in text mode", () => {
      const sel = createSelection(flatApp())
      sel.node.select([A])
      sel.text.select(5) // should not throw or change anything
      expect(sel.kind()).toBe("node")
    })
  })

  describe("deselect", () => {
    it("exits text mode, preserves node selection", () => {
      const sel = createSelection(flatApp())
      sel.node.select([A])
      sel.text.edit(A, 0)
      sel.text.deselect()
      expect(sel.kind()).toBe("node")
      expect(sel.node.cursor()).toBe(A)
      expect(sel.text()).toBeNull()
    })

    it("no-op when not in text mode", () => {
      const sel = createSelection(flatApp())
      sel.node.select([A])
      sel.text.deselect() // should not throw
      expect(sel.kind()).toBe("node")
    })
  })

  describe("kind transitions", () => {
    it("idle -> node -> text -> node -> idle", () => {
      const sel = createSelection(flatApp())
      expect(sel.kind()).toBe("idle")

      sel.node.select([A])
      expect(sel.kind()).toBe("node")

      sel.text.edit(A, 0)
      expect(sel.kind()).toBe("text")

      sel.text.deselect()
      expect(sel.kind()).toBe("node")

      sel.deselect()
      expect(sel.kind()).toBe("idle")
    })

    it("text -> node on node.select", () => {
      const sel = createSelection(flatApp())
      sel.node.select([A])
      sel.text.edit(A, 0)
      expect(sel.kind()).toBe("text")

      sel.node.select([B])
      expect(sel.kind()).toBe("node")
    })
  })
})

// --- path accessor ---

describe("path accessor", () => {
  it("returns null when not in path mode", () => {
    const sel = createSelection(flatApp())
    expect(sel.path()).toBeNull()
  })

  it("returns PathSelection when sub is path", () => {
    const sel = createSelection(flatApp())
    sel.node.select([A])
    // Manually set sub to path
    sel.sub = { kind: "path", shapeId: A, pointIds: [B, C] }
    expect(sel.path()).not.toBeNull()
    expect(sel.path()!.kind).toBe("path")
    expect(sel.kind()).toBe("path")
  })

  it("deselect exits path mode", () => {
    const sel = createSelection(flatApp())
    sel.node.select([A])
    sel.sub = { kind: "path", shapeId: A, pointIds: [B] }
    expect(sel.kind()).toBe("path")

    sel.path.deselect()
    expect(sel.kind()).toBe("node")
    expect(sel.path()).toBeNull()
  })

  it("deselect is no-op when not in path mode", () => {
    const sel = createSelection(flatApp())
    sel.node.select([A])
    sel.path.deselect() // should not throw or change anything
    expect(sel.kind()).toBe("node")
  })

  it("edit and select are stubs (no-ops)", () => {
    const sel = createSelection(flatApp())
    sel.path.edit() // should not throw
    sel.path.select() // should not throw
    expect(sel.kind()).toBe("idle")
  })
})

// --- crop accessor ---

describe("crop accessor", () => {
  it("returns null when not in crop mode", () => {
    const sel = createSelection(flatApp())
    expect(sel.crop()).toBeNull()
  })

  it("returns CropSelection when sub is crop", () => {
    const sel = createSelection(flatApp())
    sel.node.select([A])
    sel.sub = { kind: "crop", objectId: A, rect: { x: 0, y: 0, w: 100, h: 100 } }
    expect(sel.crop()).not.toBeNull()
    expect(sel.crop()!.kind).toBe("crop")
    expect(sel.kind()).toBe("crop")
  })

  it("deselect exits crop mode", () => {
    const sel = createSelection(flatApp())
    sel.node.select([A])
    sel.sub = { kind: "crop", objectId: A, rect: { x: 0, y: 0, w: 50, h: 50 } }
    expect(sel.kind()).toBe("crop")

    sel.crop.deselect()
    expect(sel.kind()).toBe("node")
    expect(sel.crop()).toBeNull()
  })

  it("deselect is no-op when not in crop mode", () => {
    const sel = createSelection(flatApp())
    sel.node.select([A])
    sel.crop.deselect() // should not throw
    expect(sel.kind()).toBe("node")
  })

  it("edit and select are stubs (no-ops)", () => {
    const sel = createSelection(flatApp())
    sel.crop.edit() // should not throw
    sel.crop.select() // should not throw
    expect(sel.kind()).toBe("idle")
  })
})

// --- sub (writable signal) ---

describe("sub (writable signal)", () => {
  it("read returns null initially", () => {
    const sel = createSelection(flatApp())
    expect(sel.sub).toBeNull()
    expect(sel.subComputed()).toBeNull()
  })

  it("write enters sub-selection", () => {
    const sel = createSelection(flatApp())
    sel.node.select([A])
    sel.sub = { kind: "text", nodeId: A, cursor: 5 }
    expect(sel.sub).toEqual({ kind: "text", nodeId: A, cursor: 5 })
    expect(sel.kind()).toBe("text")
  })

  it("write null exits sub-selection", () => {
    const sel = createSelection(flatApp())
    sel.node.select([A])
    sel.sub = { kind: "text", nodeId: A, cursor: 0 }
    sel.sub = null
    expect(sel.sub).toBeNull()
    expect(sel.kind()).toBe("node")
  })
})

// --- Signal reactivity with sub ---

describe("sub-selection reactivity", () => {
  it("text() computed reacts to text mode changes", () => {
    const sel = createSelection(flatApp())
    const values: (TextSelection | null)[] = []

    const cleanup = effect(() => {
      values.push(sel.text())
    })

    sel.node.select([A]) // text() stays null (sub unchanged)
    sel.text.edit(A, 0) // text() becomes text(0)
    sel.text.select(5) // text() becomes text(5)
    sel.text.deselect() // text() becomes null

    // null (initial), text(0), text(5), null
    // node.select doesn't change sub so text() stays null (no re-fire)
    expect(values.length).toBe(4)
    expect(values[0]).toBeNull() // initial
    expect(values[1]!.cursor).toBe(0) // after edit
    expect(values[2]!.cursor).toBe(5) // after select
    expect(values[3]).toBeNull() // after deselect
    cleanup()
  })
})
