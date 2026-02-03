/**
 * Explore columns view scrolling issues:
 * 1. ✓ FIXED: Content disappearing in scrolled columns (overflow:hidden clip bug)
 * 2. TODO: No vertical scroll indicator for columns (needs inkx borderless indicators)
 */

import React from "react"
import { createTestRenderer, stripAnsi } from "inkx/testing"
import { createFakeRepo } from "@km/storage"
import { Board } from "../src/views/Board.tsx"
import { buildBoardState } from "../src/state.ts"
import { createLayoutRegistry } from "../src/card-positions.ts"
import { RepoProvider } from "../src/repo-context.tsx"
import { ensureCommandSystemInitialized } from "../src/command-bridge.ts"
import type { KNode } from "@km/core"

// Create nodes with many items to trigger scrolling
function createManyItemsColumn(colName: string, itemCount: number): KNode[] {
  const items: KNode[] = []

  // Create column
  const col: KNode = {
    id: colName,
    content: colName,
    parent_id: "root",
    parent_idx: 0,
    type: "folder",
    data: {},
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
  }
  items.push(col)

  // Create items in column
  for (let i = 0; i < itemCount; i++) {
    items.push({
      id: `${colName}-item-${i}`,
      content: `${colName} Item ${i}`,
      parent_id: colName,
      parent_idx: i,
      type: "task",
      data: {},
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    })
  }

  return items
}

// Create a board with multiple columns, each with many items
function createScrollableBoard(): KNode[] {
  const root: KNode = {
    id: "root",
    content: "Board",
    parent_id: null,
    parent_idx: 0,
    type: "folder",
    data: { is_repo_root: true },
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
  }

  const nodes = [root]

  // Create 4 columns with different item counts
  const col1Items = createManyItemsColumn("col1", 30)
  const col2Items = createManyItemsColumn("col2", 25)
  const col3Items = createManyItemsColumn("col3", 20)
  const col4Items = createManyItemsColumn("col4", 35)

  // Set parent indices
  col1Items[0]!.parent_idx = 0
  col2Items[0]!.parent_idx = 1
  col3Items[0]!.parent_idx = 2
  col4Items[0]!.parent_idx = 3

  nodes.push(...col1Items, ...col2Items, ...col3Items, ...col4Items)

  return nodes
}

async function main() {
  console.log("=== Testing Columns View Scrolling ===\n")

  const nodes = createScrollableBoard()
  const repo = createFakeRepo({ nodes })
  const initialState = buildBoardState(repo, "root")

  ensureCommandSystemInitialized()

  const columns = 80
  const rows = 20  // Small height to force scrolling
  const render = createTestRenderer({ columns, rows })
  const registry = createLayoutRegistry()

  const result = render(
    React.createElement(RepoProvider, { repo,
      children: React.createElement(Board, {
        initialState,
        initialViewMode: "columns",
        dimensions: { columns, rows },
        onExit: () => {},
        layoutRegistry: registry,
      })
    })
  )

  console.log("Initial state:")
  console.log(result.text)
  console.log("\n---")

  // Move to col2 and scroll down
  await result.press("l")  // Move to col2

  console.log("\n=== Scrolling down 15 times in col2 ===\n")
  for (let i = 0; i < 15; i++) {
    await result.press("j")
  }

  const textAfterScroll = result.text
  console.log("After scroll:")
  console.log(textAfterScroll)

  // Verify col2 items have actual text content (not just bullets)
  const plainAfter = stripAnsi(textAfterScroll)
  const col2ContentLines = plainAfter.split("\n").filter(l => l.includes("col2 Item"))
  const hasFullContent = col2ContentLines.length > 0 && col2ContentLines.some(l => /col2 Item \d+/.test(l))

  console.log("\n=== Results ===")
  console.log("Col2 content lines found: " + col2ContentLines.length)
  console.log("Has full content (not just bullets): " + hasFullContent)

  if (!hasFullContent) {
    console.log("\n⚠️  BUG: Col2 items missing text content (only bullets visible)")
    process.exit(1)
  } else {
    console.log("\n✓ PASS: Col2 items render with full text content after scroll")
  }

  // Check for vertical scroll indicators
  const upIndicator = textAfterScroll.includes("▲") || textAfterScroll.includes("↑")
  const downIndicator = textAfterScroll.includes("▼") || textAfterScroll.includes("↓")
  console.log("\nVertical scroll indicators: up=" + upIndicator + ", down=" + downIndicator)
  if (!downIndicator) {
    console.log("Note: No vertical scroll indicator (inkx requires borders for indicators)")
  }
}

main().catch(console.error)
