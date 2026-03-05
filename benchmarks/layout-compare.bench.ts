/**
 * Flexture vs Yoga Comparison Benchmarks
 *
 * Compares layout performance between:
 * - Flexture (pure JavaScript)
 * - Yoga (WebAssembly via yoga-wasm-web)
 *
 * Run: bun bench
 */

import { bench, describe, beforeAll } from "vitest"
import * as Flexture from "flexture"
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
// Tree Generators - Flexture
// ============================================================================

function flextureFlatTree(nodeCount: number): Flexture.Node {
  const root = Flexture.Node.create()
  root.setWidth(1000)
  root.setHeight(1000)
  root.setFlexDirection(Flexture.FLEX_DIRECTION_COLUMN)

  for (let i = 0; i < nodeCount; i++) {
    const child = Flexture.Node.create()
    child.setHeight(10)
    child.setFlexGrow(1)
    root.insertChild(child, i)
  }

  return root
}

function flextureDeepTree(depth: number): Flexture.Node {
  const root = Flexture.Node.create()
  root.setWidth(1000)
  root.setHeight(1000)

  let current = root
  for (let i = 0; i < depth; i++) {
    const child = Flexture.Node.create()
    child.setFlexGrow(1)
    child.setPadding(Flexture.EDGE_LEFT, 1)
    current.insertChild(child, 0)
    current = child
  }

  return root
}

function flextureKanbanTree(cardsPerColumn: number): Flexture.Node {
  const root = Flexture.Node.create()
  root.setWidth(120)
  root.setHeight(40)
  root.setFlexDirection(Flexture.FLEX_DIRECTION_ROW)
  root.setGap(Flexture.GUTTER_ALL, 1)

  for (let col = 0; col < 3; col++) {
    const column = Flexture.Node.create()
    column.setFlexGrow(1)
    column.setFlexDirection(Flexture.FLEX_DIRECTION_COLUMN)
    column.setGap(Flexture.GUTTER_ALL, 1)

    const header = Flexture.Node.create()
    header.setHeight(1)
    column.insertChild(header, 0)

    for (let card = 0; card < cardsPerColumn; card++) {
      const cardNode = Flexture.Node.create()
      cardNode.setHeight(3)
      cardNode.setPadding(Flexture.EDGE_LEFT, 1)
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

describe("Flexture vs Yoga - Flat Hierarchy", () => {
  for (const nodeCount of [100, 500, 1000]) {
    bench(`Flexture: ${nodeCount} nodes - create + layout`, () => {
      const tree = flextureFlatTree(nodeCount)
      tree.calculateLayout(1000, 1000, Flexture.DIRECTION_LTR)
    })

    bench(`Yoga: ${nodeCount} nodes - create + layout`, () => {
      const tree = yogaFlatTree(nodeCount)
      tree.calculateLayout(1000, 1000, yoga.DIRECTION_LTR)
      tree.freeRecursive()
    })
  }
})

describe("Flexture vs Yoga - Deep Hierarchy", () => {
  for (const depth of [20, 50, 100]) {
    bench(`Flexture: ${depth} levels deep - create + layout`, () => {
      const tree = flextureDeepTree(depth)
      tree.calculateLayout(1000, 1000, Flexture.DIRECTION_LTR)
    })

    bench(`Yoga: ${depth} levels deep - create + layout`, () => {
      const tree = yogaDeepTree(depth)
      tree.calculateLayout(1000, 1000, yoga.DIRECTION_LTR)
      tree.freeRecursive()
    })
  }
})

describe("Flexture vs Yoga - Kanban (TUI Pattern)", () => {
  for (const cardsPerCol of [10, 50, 100]) {
    const totalNodes = 3 + 3 * (1 + cardsPerCol)

    bench(`Flexture: Kanban 3×${cardsPerCol} (~${totalNodes} nodes)`, () => {
      const tree = flextureKanbanTree(cardsPerCol)
      tree.calculateLayout(120, 40, Flexture.DIRECTION_LTR)
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

describe("Flexture vs Yoga - Layout Only (no allocation)", () => {
  let flextureTree: Flexture.Node
  let yogaTree: ReturnType<typeof yogaKanbanTree>

  beforeAll(() => {
    flextureTree = flextureKanbanTree(50)
    yogaTree = yogaKanbanTree(50)
  })

  bench("Flexture: Kanban 3×50 - layout only", () => {
    flextureTree.markDirty()
    flextureTree.calculateLayout(120, 40, Flexture.DIRECTION_LTR)
  })

  bench("Yoga: Kanban 3×50 - layout only", () => {
    yogaTree.markDirty()
    yogaTree.calculateLayout(120, 40, yoga.DIRECTION_LTR)
  })
})
