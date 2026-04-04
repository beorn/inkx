import { describe, expect, it } from "vitest"
import type {
  ID,
  Modifiers,
  PointerHelpers,
  PointerOrigin,
  PointerState,
  PressHit,
  SelectionEffect,
} from "../src/types.ts"
import { applyPointerEvent } from "../src/pointer.ts"

// --- Test helpers ---

const id = (s: string) => s as ID
const A = id("A")
const B = id("B")
const C = id("C")

const IDLE: PointerState = { phase: "idle" }

const NO_MODS: Modifiers = { shift: false, cmd: false, opt: false }
const CMD: Modifiers = { shift: false, cmd: true, opt: false }
const SHIFT: Modifiers = { shift: true, cmd: false, opt: false }

function hitEmpty(): PressHit {
  return { kind: "empty" }
}
function hitNode(nodeId: ID): PressHit {
  return { kind: "node", nodeId }
}
function hitText(nodeId: ID, offset: number): PressHit {
  return { kind: "text", nodeId, offset }
}

function origin(x = 10, y = 10): PointerOrigin {
  return { x, y }
}

function makeHelpers(overrides: Partial<PointerHelpers> = {}): PointerHelpers {
  return {
    hitTest: () => hitEmpty(),
    nodesInRect: () => [],
    dragThreshold: 5,
    ...overrides,
  }
}

function effectTypes(effects: SelectionEffect[]): string[] {
  return effects.map((e) => e.type)
}

// --- Click flows ---

describe("click flows (pointer down + up, no movement)", () => {
  it("click on empty => deselect", () => {
    const helpers = makeHelpers()
    const [ptr1, fx1] = applyPointerEvent(
      IDLE,
      {
        type: "pointerDown",
        hit: hitEmpty(),
        origin: origin(),
        modifiers: NO_MODS,
        isSelected: false,
      },
      helpers,
    )
    expect(ptr1.phase).toBe("pointing-empty")
    expect(fx1).toEqual([])

    const [ptr2, fx2] = applyPointerEvent(
      ptr1,
      { type: "pointerUp", modifiers: NO_MODS },
      helpers,
    )
    expect(ptr2.phase).toBe("idle")
    expect(effectTypes(fx2)).toEqual(["deselect"])
  })

  it("click on unselected node => select", () => {
    const helpers = makeHelpers()
    const [ptr1] = applyPointerEvent(
      IDLE,
      {
        type: "pointerDown",
        hit: hitNode(A),
        origin: origin(),
        modifiers: NO_MODS,
        isSelected: false,
      },
      helpers,
    )
    expect(ptr1.phase).toBe("pointing-node")

    const [ptr2, fx2] = applyPointerEvent(
      ptr1,
      { type: "pointerUp", modifiers: NO_MODS },
      helpers,
    )
    expect(ptr2.phase).toBe("idle")
    expect(fx2).toEqual([{ type: "node.select", ids: [A] }])
  })

  it("cmd-click on unselected node => toggle", () => {
    const helpers = makeHelpers()
    const [ptr1] = applyPointerEvent(
      IDLE,
      {
        type: "pointerDown",
        hit: hitNode(A),
        origin: origin(),
        modifiers: NO_MODS,
        isSelected: false,
      },
      helpers,
    )

    const [, fx2] = applyPointerEvent(
      ptr1,
      { type: "pointerUp", modifiers: CMD },
      helpers,
    )
    expect(fx2).toEqual([{ type: "node.select", ids: [A], toggle: true }])
  })

  it("shift-click on unselected node => extend", () => {
    const helpers = makeHelpers()
    const [ptr1] = applyPointerEvent(
      IDLE,
      {
        type: "pointerDown",
        hit: hitNode(A),
        origin: origin(),
        modifiers: NO_MODS,
        isSelected: false,
      },
      helpers,
    )

    const [, fx2] = applyPointerEvent(
      ptr1,
      { type: "pointerUp", modifiers: SHIFT },
      helpers,
    )
    expect(fx2).toEqual([{ type: "node.extend", cursor: A }])
  })

  it("click on selected node => reselect (collapse multi)", () => {
    const helpers = makeHelpers()
    const [ptr1] = applyPointerEvent(
      IDLE,
      {
        type: "pointerDown",
        hit: hitNode(B),
        origin: origin(),
        modifiers: NO_MODS,
        isSelected: true,
      },
      helpers,
    )
    expect(ptr1.phase).toBe("pointing-selection")

    const [ptr2, fx2] = applyPointerEvent(
      ptr1,
      { type: "pointerUp", modifiers: NO_MODS },
      helpers,
    )
    expect(ptr2.phase).toBe("idle")
    expect(fx2).toEqual([{ type: "node.select", ids: [B] }])
  })

  it("click on text => text edit", () => {
    const helpers = makeHelpers()
    const [ptr1] = applyPointerEvent(
      IDLE,
      {
        type: "pointerDown",
        hit: hitText(A, 5),
        origin: origin(),
        modifiers: NO_MODS,
        isSelected: false,
      },
      helpers,
    )
    expect(ptr1.phase).toBe("pointing-text")

    const [ptr2, fx2] = applyPointerEvent(
      ptr1,
      { type: "pointerUp", modifiers: NO_MODS },
      helpers,
    )
    expect(ptr2.phase).toBe("idle")
    expect(fx2).toEqual([{ type: "text.edit", nodeId: A, offset: 5 }])
  })
})

// --- Drag flows ---

describe("drag flows", () => {
  it("drag from empty => area select", () => {
    const helpers = makeHelpers({
      nodesInRect: () => [A, B],
      hitTest: () => hitEmpty(),
    })

    // Pointer down
    const [ptr1] = applyPointerEvent(
      IDLE,
      {
        type: "pointerDown",
        hit: hitEmpty(),
        origin: origin(0, 0),
        modifiers: NO_MODS,
        isSelected: false,
      },
      helpers,
    )

    // Move past threshold
    const [ptr2, fx2] = applyPointerEvent(
      ptr1,
      { type: "pointerMove", x: 100, y: 100, modifiers: NO_MODS },
      helpers,
    )
    expect(ptr2.phase).toBe("dragging-area")
    expect(effectTypes(fx2)).toEqual(["drag.start"])

    // Continue moving: area selects nodes
    const [ptr3, fx3] = applyPointerEvent(
      ptr2,
      { type: "pointerMove", x: 150, y: 150, modifiers: NO_MODS },
      helpers,
    )
    expect(ptr3.phase).toBe("dragging-area")
    expect(effectTypes(fx3)).toContain("node.select")

    // Pointer up: drag end
    const [ptr4, fx4] = applyPointerEvent(
      ptr3,
      { type: "pointerUp", modifiers: NO_MODS },
      helpers,
    )
    expect(ptr4.phase).toBe("idle")
    expect(effectTypes(fx4)).toEqual(["drag.end"])
  })

  it("drag from empty with cmd => area toggle", () => {
    const helpers = makeHelpers({
      nodesInRect: () => [A],
      hitTest: () => hitEmpty(),
    })

    const [ptr1] = applyPointerEvent(
      IDLE,
      {
        type: "pointerDown",
        hit: hitEmpty(),
        origin: origin(0, 0),
        modifiers: NO_MODS,
        isSelected: false,
      },
      helpers,
    )
    const [ptr2] = applyPointerEvent(
      ptr1,
      { type: "pointerMove", x: 100, y: 100, modifiers: NO_MODS },
      helpers,
    )

    // Move with cmd modifier
    const [, fx3] = applyPointerEvent(
      ptr2,
      { type: "pointerMove", x: 150, y: 150, modifiers: CMD },
      helpers,
    )
    const selectEffect = fx3.find((e) => e.type === "node.select") as
      | (SelectionEffect & { type: "node.select" })
      | undefined
    expect(selectEffect).toBeDefined()
    expect(selectEffect!.toggle).toBe(true)
  })

  it("drag from text => text drag with range extension", () => {
    const helpers = makeHelpers({
      hitTest: (x) => hitText(A, Math.floor(x / 10)),
    })

    // Pointer down on text
    const [ptr1] = applyPointerEvent(
      IDLE,
      {
        type: "pointerDown",
        hit: hitText(A, 3),
        origin: origin(30, 10),
        modifiers: NO_MODS,
        isSelected: false,
      },
      helpers,
    )

    // Move past threshold
    const [ptr2, fx2] = applyPointerEvent(
      ptr1,
      { type: "pointerMove", x: 80, y: 10, modifiers: NO_MODS },
      helpers,
    )
    expect(ptr2.phase).toBe("dragging-text")
    expect(effectTypes(fx2)).toContain("text.edit")
    expect(effectTypes(fx2)).toContain("drag.start")

    // Continue text drag: extend text range
    const [ptr3, fx3] = applyPointerEvent(
      ptr2,
      { type: "pointerMove", x: 100, y: 10, modifiers: NO_MODS },
      helpers,
    )
    expect(ptr3.phase).toBe("dragging-text")
    expect(fx3).toEqual([{ type: "text.select", cursor: 10 }])
  })

  it("drag from unselected node => preselect + manipulation-drag", () => {
    const helpers = makeHelpers({ dragThreshold: 5 })

    const [ptr1] = applyPointerEvent(
      IDLE,
      {
        type: "pointerDown",
        hit: hitNode(A),
        origin: origin(10, 10),
        modifiers: NO_MODS,
        isSelected: false,
      },
      helpers,
    )

    // Move past threshold — triggers preselect + manipulation-drag
    const [ptr2, fx2] = applyPointerEvent(
      ptr1,
      { type: "pointerMove", x: 50, y: 50, modifiers: NO_MODS },
      helpers,
    )
    expect(ptr2.phase).toBe("idle") // manipulation drag goes back to idle (app handles)
    expect(effectTypes(fx2)).toEqual(["node.select", "manipulation-drag"])
  })

  it("drag from selected node => manipulation-drag (no reselect)", () => {
    const helpers = makeHelpers({ dragThreshold: 5 })

    const [ptr1] = applyPointerEvent(
      IDLE,
      {
        type: "pointerDown",
        hit: hitNode(B),
        origin: origin(10, 10),
        modifiers: NO_MODS,
        isSelected: true,
      },
      helpers,
    )

    const [ptr2, fx2] = applyPointerEvent(
      ptr1,
      { type: "pointerMove", x: 50, y: 50, modifiers: NO_MODS },
      helpers,
    )
    expect(ptr2.phase).toBe("idle")
    expect(effectTypes(fx2)).toEqual(["manipulation-drag"])
  })
})

// --- Morphing ---

describe("morphing during drag", () => {
  it("area drag morphs to text when hitting text region", () => {
    let hitResult: PressHit = hitEmpty()
    const helpers = makeHelpers({
      hitTest: () => hitResult,
      nodesInRect: () => [A],
    })

    // Start area drag
    const [ptr1] = applyPointerEvent(
      IDLE,
      {
        type: "pointerDown",
        hit: hitEmpty(),
        origin: origin(0, 0),
        modifiers: NO_MODS,
        isSelected: false,
      },
      helpers,
    )
    const [ptr2] = applyPointerEvent(
      ptr1,
      { type: "pointerMove", x: 100, y: 100, modifiers: NO_MODS },
      helpers,
    )
    expect(ptr2.phase).toBe("dragging-area")

    // Hit test now returns text
    hitResult = hitText(A, 7)
    const [ptr3, fx3] = applyPointerEvent(
      ptr2,
      { type: "pointerMove", x: 120, y: 120, modifiers: NO_MODS },
      helpers,
    )
    expect(ptr3.phase).toBe("dragging-text")
    expect(effectTypes(fx3)).toContain("text.edit")
  })

  it("text drag morphs to area when leaving text region", () => {
    let hitResult: PressHit = hitText(A, 5)
    const helpers = makeHelpers({
      hitTest: () => hitResult,
      nodesInRect: () => [B],
    })

    // Start text drag
    const [ptr1] = applyPointerEvent(
      IDLE,
      {
        type: "pointerDown",
        hit: hitText(A, 3),
        origin: origin(30, 10),
        modifiers: NO_MODS,
        isSelected: false,
      },
      helpers,
    )
    const [ptr2] = applyPointerEvent(
      ptr1,
      { type: "pointerMove", x: 80, y: 10, modifiers: NO_MODS },
      helpers,
    )
    expect(ptr2.phase).toBe("dragging-text")

    // Hit test now returns empty (left text region)
    hitResult = hitEmpty()
    const [ptr3, fx3] = applyPointerEvent(
      ptr2,
      { type: "pointerMove", x: 200, y: 200, modifiers: NO_MODS },
      helpers,
    )
    expect(ptr3.phase).toBe("dragging-area")
    expect(effectTypes(fx3)).toContain("sub.clear")
    expect(effectTypes(fx3)).toContain("node.select")
  })
})

// --- Escape ---

describe("escape", () => {
  it("escape from pointing-empty => idle, no effects", () => {
    const helpers = makeHelpers()
    const [ptr1] = applyPointerEvent(
      IDLE,
      {
        type: "pointerDown",
        hit: hitEmpty(),
        origin: origin(),
        modifiers: NO_MODS,
        isSelected: false,
      },
      helpers,
    )

    const [ptr2, fx2] = applyPointerEvent(ptr1, { type: "escape" }, helpers)
    expect(ptr2.phase).toBe("idle")
    expect(fx2).toEqual([])
  })

  it("escape from pointing-node => idle, no effects", () => {
    const helpers = makeHelpers()
    const [ptr1] = applyPointerEvent(
      IDLE,
      {
        type: "pointerDown",
        hit: hitNode(A),
        origin: origin(),
        modifiers: NO_MODS,
        isSelected: false,
      },
      helpers,
    )

    const [ptr2, fx2] = applyPointerEvent(ptr1, { type: "escape" }, helpers)
    expect(ptr2.phase).toBe("idle")
    expect(fx2).toEqual([])
  })

  it("escape from pointing-selection => idle, no effects", () => {
    const helpers = makeHelpers()
    const [ptr1] = applyPointerEvent(
      IDLE,
      {
        type: "pointerDown",
        hit: hitNode(B),
        origin: origin(),
        modifiers: NO_MODS,
        isSelected: true,
      },
      helpers,
    )
    expect(ptr1.phase).toBe("pointing-selection")

    const [ptr2, fx2] = applyPointerEvent(ptr1, { type: "escape" }, helpers)
    expect(ptr2.phase).toBe("idle")
    expect(fx2).toEqual([])
  })

  it("escape from dragging-area => drag.cancel", () => {
    const helpers = makeHelpers()
    const [ptr1] = applyPointerEvent(
      IDLE,
      {
        type: "pointerDown",
        hit: hitEmpty(),
        origin: origin(0, 0),
        modifiers: NO_MODS,
        isSelected: false,
      },
      helpers,
    )
    const [ptr2] = applyPointerEvent(
      ptr1,
      { type: "pointerMove", x: 100, y: 100, modifiers: NO_MODS },
      helpers,
    )

    const [ptr3, fx3] = applyPointerEvent(ptr2, { type: "escape" }, helpers)
    expect(ptr3.phase).toBe("idle")
    expect(effectTypes(fx3)).toEqual(["drag.cancel"])
  })

  it("escape from dragging-text => drag.cancel", () => {
    const helpers = makeHelpers({
      hitTest: () => hitText(A, 5),
    })
    const [ptr1] = applyPointerEvent(
      IDLE,
      {
        type: "pointerDown",
        hit: hitText(A, 3),
        origin: origin(30, 10),
        modifiers: NO_MODS,
        isSelected: false,
      },
      helpers,
    )
    const [ptr2] = applyPointerEvent(
      ptr1,
      { type: "pointerMove", x: 80, y: 10, modifiers: NO_MODS },
      helpers,
    )

    const [ptr3, fx3] = applyPointerEvent(ptr2, { type: "escape" }, helpers)
    expect(ptr3.phase).toBe("idle")
    expect(effectTypes(fx3)).toEqual(["drag.cancel"])
  })
})

// --- Double-click ---

describe("doubleClick", () => {
  it("double-click on node => text.edit at offset 0", () => {
    const helpers = makeHelpers()
    const [ptr, fx] = applyPointerEvent(
      IDLE,
      { type: "doubleClick", hit: hitNode(A) },
      helpers,
    )
    expect(ptr.phase).toBe("idle")
    expect(fx).toEqual([{ type: "text.edit", nodeId: A, offset: 0 }])
  })

  it("double-click on text => text.edit at offset", () => {
    const helpers = makeHelpers()
    const [ptr, fx] = applyPointerEvent(
      IDLE,
      { type: "doubleClick", hit: hitText(A, 7) },
      helpers,
    )
    expect(ptr.phase).toBe("idle")
    expect(fx).toEqual([{ type: "text.edit", nodeId: A, offset: 7 }])
  })

  it("double-click on empty => no effects", () => {
    const helpers = makeHelpers()
    const [ptr, fx] = applyPointerEvent(
      IDLE,
      { type: "doubleClick", hit: hitEmpty() },
      helpers,
    )
    expect(ptr.phase).toBe("idle")
    expect(fx).toEqual([])
  })
})

// --- Below threshold: no drag ---

describe("below threshold movement", () => {
  it("small movement from pointing-empty => stays pointing", () => {
    const helpers = makeHelpers({ dragThreshold: 10 })
    const [ptr1] = applyPointerEvent(
      IDLE,
      {
        type: "pointerDown",
        hit: hitEmpty(),
        origin: origin(50, 50),
        modifiers: NO_MODS,
        isSelected: false,
      },
      helpers,
    )

    const [ptr2, fx2] = applyPointerEvent(
      ptr1,
      { type: "pointerMove", x: 52, y: 52, modifiers: NO_MODS },
      helpers,
    )
    expect(ptr2.phase).toBe("pointing-empty")
    expect(fx2).toEqual([])
  })

  it("small movement from pointing-text => stays pointing", () => {
    const helpers = makeHelpers({ dragThreshold: 10 })
    const [ptr1] = applyPointerEvent(
      IDLE,
      {
        type: "pointerDown",
        hit: hitText(A, 3),
        origin: origin(50, 50),
        modifiers: NO_MODS,
        isSelected: false,
      },
      helpers,
    )

    const [ptr2, fx2] = applyPointerEvent(
      ptr1,
      { type: "pointerMove", x: 52, y: 52, modifiers: NO_MODS },
      helpers,
    )
    expect(ptr2.phase).toBe("pointing-text")
    expect(fx2).toEqual([])
  })

  it("small movement from pointing-node => stays pointing", () => {
    const helpers = makeHelpers({ dragThreshold: 10 })
    const [ptr1] = applyPointerEvent(
      IDLE,
      {
        type: "pointerDown",
        hit: hitNode(A),
        origin: origin(50, 50),
        modifiers: NO_MODS,
        isSelected: false,
      },
      helpers,
    )

    const [ptr2, fx2] = applyPointerEvent(
      ptr1,
      { type: "pointerMove", x: 52, y: 52, modifiers: NO_MODS },
      helpers,
    )
    expect(ptr2.phase).toBe("pointing-node")
    expect(fx2).toEqual([])
  })

  it("small movement from pointing-selection => stays pointing", () => {
    const helpers = makeHelpers({ dragThreshold: 10 })
    const [ptr1] = applyPointerEvent(
      IDLE,
      {
        type: "pointerDown",
        hit: hitNode(B),
        origin: origin(50, 50),
        modifiers: NO_MODS,
        isSelected: true,
      },
      helpers,
    )

    const [ptr2, fx2] = applyPointerEvent(
      ptr1,
      { type: "pointerMove", x: 52, y: 52, modifiers: NO_MODS },
      helpers,
    )
    expect(ptr2.phase).toBe("pointing-selection")
    expect(fx2).toEqual([])
  })
})

// --- Events in idle that aren't pointerDown or doubleClick ---

describe("no-op events", () => {
  it("pointerUp in idle => no-op", () => {
    const helpers = makeHelpers()
    const [ptr, fx] = applyPointerEvent(
      IDLE,
      { type: "pointerUp", modifiers: NO_MODS },
      helpers,
    )
    expect(ptr.phase).toBe("idle")
    expect(fx).toEqual([])
  })

  it("pointerMove in idle => no-op", () => {
    const helpers = makeHelpers()
    const [ptr, fx] = applyPointerEvent(
      IDLE,
      { type: "pointerMove", x: 50, y: 50, modifiers: NO_MODS },
      helpers,
    )
    expect(ptr.phase).toBe("idle")
    expect(fx).toEqual([])
  })

  it("escape in idle => no-op", () => {
    const helpers = makeHelpers()
    const [ptr, fx] = applyPointerEvent(
      IDLE,
      { type: "escape" },
      helpers,
    )
    expect(ptr.phase).toBe("idle")
    expect(fx).toEqual([])
  })
})
