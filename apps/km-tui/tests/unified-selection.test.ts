/**
 * Unified Selection foundation tests.
 *
 * Covers the km-all.unified-selection Phase 0 deliverables:
 * - Selection union type compiles
 * - setSelection() dispatch maps to @silvery/selection writers
 * - One entry point replaces three-channel coordination
 */
import { describe, expect, test, vi } from "vitest"
import {
  dispatchSelection,
  gapSelect,
  isCaret,
  isGap,
  isNode,
  isNone,
  isText,
  nodeSelect,
  nodesSelect,
  NO_SELECTION,
  textCaret,
  textRange,
  type Selection,
  type SelectionDispatch,
} from "../src/state/selection.ts"
import type { ID } from "@silvery/selection"

function createMockDispatch() {
  const calls: { method: string; args: unknown[] }[] = []
  const record = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args })
  }
  const ctx: SelectionDispatch = {
    sel: {
      node: { select: record("node.select") as never },
      text: {
        edit: record("text.edit") as never,
        deselect: record("text.deselect") as never,
      },
      deselect: record("deselect") as never,
    },
  }
  return { ctx, calls }
}

describe("Selection constructors", () => {
  test("textCaret has matching anchor/focus", () => {
    const s = textCaret("n1", 5)
    expect(isCaret(s)).toBe(true)
    expect(s.anchor.offset).toBe(5)
    expect(s.focus.offset).toBe(5)
  })

  test("textRange captures anchor → focus", () => {
    const s = textRange("n1", 2, 7)
    expect(s.anchor).toEqual({ nodeId: "n1", offset: 2 })
    expect(s.focus).toEqual({ nodeId: "n1", offset: 7 })
    expect(isCaret(s)).toBe(false)
  })

  test("nodeSelect is single-id", () => {
    const s = nodeSelect("n1")
    expect(s.ids).toEqual(["n1"])
    expect(s.anchor).toBe("n1")
  })

  test("nodesSelect accepts multi-id + anchor", () => {
    const s = nodesSelect(["n1", "n2", "n3"], "n2")
    expect(s.ids).toEqual(["n1", "n2", "n3"])
    expect(s.anchor).toBe("n2")
  })

  test("nodesSelect defaults anchor to first id", () => {
    const s = nodesSelect(["n1", "n2"])
    expect(s.anchor).toBe("n1")
  })

  test("gapSelect captures adjacent node + side", () => {
    const s = gapSelect("n1", "before")
    expect(isGap(s)).toBe(true)
    expect(s.nodeId).toBe("n1")
    expect(s.position).toBe("before")
  })

  test("NO_SELECTION is canonical empty", () => {
    expect(isNone(NO_SELECTION)).toBe(true)
  })
})

describe("Selection type guards", () => {
  test("discriminate by type field", () => {
    const selections: Selection[] = [
      textCaret("n1", 0),
      nodeSelect("n1"),
      gapSelect("n1", "after"),
      NO_SELECTION,
    ]
    expect(selections.map((s) => [isText(s), isNode(s), isGap(s), isNone(s)])).toEqual([
      [true, false, false, false],
      [false, true, false, false],
      [false, false, true, false],
      [false, false, false, true],
    ])
  })
})

describe("dispatchSelection — one entry point, three writers", () => {
  test("text caret → sel.text.edit(nodeId, offset)", () => {
    const { ctx, calls } = createMockDispatch()
    dispatchSelection(ctx, textCaret("n1", 5))
    expect(calls).toEqual([{ method: "text.edit", args: ["n1", 5] }])
  })

  test("text range uses focus offset (SlateJS convention)", () => {
    const { ctx, calls } = createMockDispatch()
    dispatchSelection(ctx, textRange("n1", 2, 7))
    expect(calls).toEqual([{ method: "text.edit", args: ["n1", 7] }])
  })

  test("node selection → sel.node.select(ids)", () => {
    const { ctx, calls } = createMockDispatch()
    dispatchSelection(ctx, nodesSelect(["n1", "n2"]))
    expect(calls).toEqual([{ method: "node.select", args: [["n1", "n2"]] }])
  })

  test("empty node selection → sel.deselect() (stronger: clears cursor too)", () => {
    const { ctx, calls } = createMockDispatch()
    dispatchSelection(ctx, { type: "node", ids: [] })
    expect(calls).toEqual([{ method: "deselect", args: [] }])
  })

  test("gap selection → sel.text.deselect() (preserves cursor)", () => {
    const { ctx, calls } = createMockDispatch()
    dispatchSelection(ctx, gapSelect("n1", "before"))
    expect(calls).toEqual([{ method: "text.deselect", args: [] }])
  })

  test("NO_SELECTION → sel.text.deselect() (exits sub-selection, preserves cursor)", () => {
    const { ctx, calls } = createMockDispatch()
    dispatchSelection(ctx, NO_SELECTION)
    expect(calls).toEqual([{ method: "text.deselect", args: [] }])
  })
})

describe("dispatchSelection — replaces paired-op coordination", () => {
  test("text selection collapses node.select + text.edit into one call", () => {
    // BEFORE: two imperative calls that callers had to pair
    //   ctx.sel.node.select([id])
    //   ctx.sel.text.edit(id, offset)
    // AFTER: one dispatch
    //   ctx.setSelection(textCaret(id, offset))
    //
    // @silvery/selection's text.edit already ensures the node is selected
    // (see sub-text.ts). So dispatch collapses to a single text.edit call.
    const { ctx, calls } = createMockDispatch()
    dispatchSelection(ctx, textCaret("n1", 0))
    expect(calls.map((c) => c.method)).toEqual(["text.edit"])
  })

  test("NO_SELECTION maps to a single text.deselect (preserves cursor)", () => {
    // BEFORE: ctx.sel.text.deselect()
    // AFTER:  ctx.setSelection(NO_SELECTION)
    const { ctx, calls } = createMockDispatch()
    dispatchSelection(ctx, NO_SELECTION)
    expect(calls.length).toBe(1)
  })
})

describe("Selection union compiles in consumer code", () => {
  // Compile-time check: variables of type Selection hold all four variants.
  test("all four variants are assignable to Selection", () => {
    const a: Selection = textCaret("n1", 0)
    const b: Selection = nodeSelect("n1")
    const c: Selection = gapSelect("n1", "before")
    const d: Selection = NO_SELECTION
    // Use them so TS doesn't complain
    expect([a.type, b.type, c.type, d.type]).toEqual(["text", "node", "gap", "none"])
  })

  test("ID brand flows through dispatch", () => {
    // This is mostly a compile-time test — dispatchSelection casts to ID<string>
    // internally, so callers can pass plain strings.
    const { ctx, calls } = createMockDispatch()
    const id: string = "n1" // plain string from handler code
    dispatchSelection(ctx, nodeSelect(id))
    expect(calls[0]?.args[0]).toEqual(["n1" as ID])
  })
})

describe("setSelection behaviour matches ctx shape", () => {
  // Ensures the dispatcher-vs-OpCtx wiring stays in sync. When board-app.ts
  // builds OpCtx, the `setSelection` method is: (selection) => dispatchSelection(ctx, selection)
  test("a minimal ctx shim dispatches through the same paths", () => {
    const { ctx, calls } = createMockDispatch()
    const setSelection = (selection: Selection) => dispatchSelection(ctx, selection)

    setSelection(textCaret("a", 3))
    setSelection(nodeSelect("b"))
    setSelection(NO_SELECTION)

    expect(calls).toEqual([
      { method: "text.edit", args: ["a", 3] },
      { method: "node.select", args: [["b"]] },
      { method: "text.deselect", args: [] },
    ])
  })

  test("spy validates the OpCtx wiring pattern used in board-app.ts", () => {
    // Pattern under test:
    //   setSelection: (selection) => dispatchSelection({ sel: s.sel }, selection)
    const sel = {
      node: { select: vi.fn() },
      text: { edit: vi.fn(), deselect: vi.fn() },
      deselect: vi.fn(),
    } as unknown as SelectionDispatch["sel"]

    const setSelection = (selection: Selection) => dispatchSelection({ sel }, selection)

    setSelection(textCaret("x", 0))
    expect(sel.text.edit).toHaveBeenCalledWith("x", 0)

    setSelection(nodesSelect(["x", "y"]))
    expect(sel.node.select).toHaveBeenCalledWith(["x", "y"])

    setSelection(NO_SELECTION)
    expect(sel.text.deselect).toHaveBeenCalled()
  })
})
