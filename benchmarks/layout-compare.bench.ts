/**
 * Flexily vs Yoga Comparison Benchmarks
 *
 * Compares layout performance between:
 * - Flexily (pure JavaScript)
 * - Yoga (WebAssembly via yoga-wasm-web)
 *
 * Run: bun bench
 */

import { bench, describe, beforeAll } from "vitest"
import * as Flexily from "flexily"
import initYoga, { type Yoga } from "yoga-wasm-web"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"

// ============================================================================
// Yoga Setup
// ============================================================================

let yoga: Yoga

// Find yoga.wasm in node_modules
const wasmPath = join(
  dirname(import.meta.dirname || "."),
  "node_modules/yoga-wasm-web/dist/yoga.wasm",
)

beforeAll(async () => {
  const wasmBuffer = readFileSync(wasmPath)
  yoga = await initYoga(wasmBuffer)
})

// ============================================================================
// Tree Generators - Flexily
// ============================================================================

function flexilyFlatTree(nodeCount: number): Flexily.Node {
  const root = Flexily.Node.create()
  root.setWidth(1000)
  root.setHeight(1000)
  root.setFlexDirection(Flexily.FLEX_DIRECTION_COLUMN)

  for (let i = 0; i < nodeCount; i++) {
    const child = Flexily.Node.create()
    child.setHeight(10)
    child.setFlexGrow(1)
    root.insertChild(child, i)
  }

  return root
}

function flexilyDeepTree(depth: number): Flexily.Node {
  const root = Flexily.Node.create()
  root.setWidth(1000)
  root.setHeight(1000)

  let current = root
  for (let i = 0; i < depth; i++) {
    const child = Flexily.Node.create()
    child.setFlexGrow(1)
    child.setPadding(Flexily.EDGE_LEFT, 1)
    current.insertChild(child, 0)
    current = child
  }

  return root
}

function flexilyKanbanTree(cardsPerColumn: number): Flexily.Node {
  const root = Flexily.Node.create()
  root.setWidth(120)
  root.setHeight(40)
  root.setFlexDirection(Flexily.FLEX_DIRECTION_ROW)
  root.setGap(Flexily.GUTTER_ALL, 1)

  for (let col = 0; col < 3; col++) {
    const column = Flexily.Node.create()
    column.setFlexGrow(1)
    column.setFlexDirection(Flexily.FLEX_DIRECTION_COLUMN)
    column.setGap(Flexily.GUTTER_ALL, 1)

    const header = Flexily.Node.create()
    header.setHeight(1)
    column.insertChild(header, 0)

    for (let card = 0; card < cardsPerColumn; card++) {
      const cardNode = Flexily.Node.create()
      cardNode.setHeight(3)
      cardNode.setPadding(Flexily.EDGE_LEFT, 1)
      column.insertChild(cardNode, card + 1)
    }

    root.insertChild(column, col)
  }

  return root
}

// ============================================================================
// Tree Generators - Yoga
// ============================================================================

function yogaFlatTree(nodeCount: number) {
  const root = yoga.Node.create()
  root.setWidth(1000)
  root.setHeight(1000)
  root.setFlexDirection(yoga.FLEX_DIRECTION_COLUMN)

  for (let i = 0; i < nodeCount; i++) {
    const child = yoga.Node.create()
    child.setHeight(10)
    child.setFlexGrow(1)
    root.insertChild(child, i)
  }

  return root
}

function yogaDeepTree(depth: number) {
  const root = yoga.Node.create()
  root.setWidth(1000)
  root.setHeight(1000)

  let current = root
  for (let i = 0; i < depth; i++) {
    const child = yoga.Node.create()
    child.setFlexGrow(1)
    child.setPadding(yoga.EDGE_LEFT, 1)
    current.insertChild(child, 0)
    current = child
  }

  return root
}

function yogaKanbanTree(cardsPerColumn: number) {
  const root = yoga.Node.create()
  root.setWidth(120)
  root.setHeight(40)
  root.setFlexDirection(yoga.FLEX_DIRECTION_ROW)
  root.setGap(yoga.GUTTER_ALL, 1)

  for (let col = 0; col < 3; col++) {
    const column = yoga.Node.create()
    column.setFlexGrow(1)
    column.setFlexDirection(yoga.FLEX_DIRECTION_COLUMN)
    column.setGap(yoga.GUTTER_ALL, 1)

    const header = yoga.Node.create()
    header.setHeight(1)
    column.insertChild(header, 0)

    for (let card = 0; card < cardsPerColumn; card++) {
      const cardNode = yoga.Node.create()
      cardNode.setHeight(3)
      cardNode.setPadding(yoga.EDGE_LEFT, 1)
      column.insertChild(cardNode, card + 1)
    }

    root.insertChild(column, col)
  }

  return root
}

// ============================================================================
// Benchmarks - Create + Layout (fair comparison)
// ============================================================================

describe("Flexily vs Yoga - Flat Hierarchy", () => {
  for (const nodeCount of [100, 500, 1000]) {
    bench(`Flexily: ${nodeCount} nodes - create + layout`, () => {
      const tree = flexilyFlatTree(nodeCount)
      tree.calculateLayout(1000, 1000, Flexily.DIRECTION_LTR)
    })

    bench(`Yoga: ${nodeCount} nodes - create + layout`, () => {
      const tree = yogaFlatTree(nodeCount)
      tree.calculateLayout(1000, 1000, yoga.DIRECTION_LTR)
      tree.freeRecursive()
    })
  }
})

describe("Flexily vs Yoga - Deep Hierarchy", () => {
  for (const depth of [20, 50, 100]) {
    bench(`Flexily: ${depth} levels deep - create + layout`, () => {
      const tree = flexilyDeepTree(depth)
      tree.calculateLayout(1000, 1000, Flexily.DIRECTION_LTR)
    })

    bench(`Yoga: ${depth} levels deep - create + layout`, () => {
      const tree = yogaDeepTree(depth)
      tree.calculateLayout(1000, 1000, yoga.DIRECTION_LTR)
      tree.freeRecursive()
    })
  }
})

describe("Flexily vs Yoga - Kanban (TUI Pattern)", () => {
  for (const cardsPerCol of [10, 50, 100]) {
    const totalNodes = 3 + 3 * (1 + cardsPerCol)

    bench(`Flexily: Kanban 3×${cardsPerCol} (~${totalNodes} nodes)`, () => {
      const tree = flexilyKanbanTree(cardsPerCol)
      tree.calculateLayout(120, 40, Flexily.DIRECTION_LTR)
    })

    bench(`Yoga: Kanban 3×${cardsPerCol} (~${totalNodes} nodes)`, () => {
      const tree = yogaKanbanTree(cardsPerCol)
      tree.calculateLayout(120, 40, yoga.DIRECTION_LTR)
      tree.freeRecursive()
    })
  }
})

// ============================================================================
// Benchmarks - Layout Only (pre-created trees)
// ============================================================================

describe("Flexily vs Yoga - Layout Only (no allocation)", () => {
  let flexilyTree: Flexily.Node
  let yogaTree: ReturnType<typeof yogaKanbanTree>

  beforeAll(() => {
    flexilyTree = flexilyKanbanTree(50)
    yogaTree = yogaKanbanTree(50)
  })

  bench("Flexily: Kanban 3×50 - layout only", () => {
    flexilyTree.markDirty()
    flexilyTree.calculateLayout(120, 40, Flexily.DIRECTION_LTR)
  })

  bench("Yoga: Kanban 3×50 - layout only", () => {
    yogaTree.markDirty()
    yogaTree.calculateLayout(120, 40, yoga.DIRECTION_LTR)
  })
})
