/**
 * Card background inheritance test — zebra pattern bug
 *
 * When the cursor is on a card, the card Box gets a faint selectedBg tint
 * (6% primary blend). Sub-items within the card should ALL inherit this tint.
 * If some rows show the tint and others don't, we get a "zebra pattern."
 *
 * This test uses termless to verify the actual ANSI output through a real
 * terminal emulator (xterm.js). The virtual buffer might handle bg inheritance
 * differently from the ANSI output path.
 *
 * Requires a truecolor theme (Nord) because selectedBg() returns undefined
 * for ANSI-16 themes (no hex bg available).
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createTermless, createRenderer } from "@silvery/test"
import "@termless/test/matchers"
import { StoreContext } from "@silvery/create"
import { createFocusManager, FocusManagerContext, ThemeProvider } from "@silvery/ag-react"
import type { SignalStoreApi as StoreApi } from "../src/state/signal-store.ts"
import { createSignalStore } from "../src/state/signal-store.ts"
import { createFakeRepo, createStoreFromRepo, withReactive } from "@km/storage"
import { StoreProvider } from "../src/state/store-context.tsx"
import { createBoardState } from "../src/board/board-types.ts"
import { createToastQueue } from "@km/core"
import { BoardApp } from "../src/views/Board.tsx"
import { createInitialUIState } from "../src/state/ui-reducer.ts"
import { createGridNavigator } from "@km/board"
import { RepoProvider } from "../src/repo-context.tsx"
import { ensureCommandSystemInitialized } from "../src/board/command-bridge.ts"
import { getChordState } from "@km/commands"
import { resetDialogGuard } from "../src/dialog-guard.ts"
import { resetBoardAppState } from "../src/board/board-app.ts"
import { defaultDarkTheme } from "@silvery/theme"
import { selectedBg } from "../src/theme.ts"
import { item } from "./helpers/board-test.ts"
import {
  createBoardAppStoreState,
  getActiveBoardPane,
  type BoardAppStore,
  type CreateBoardAppStoreParams,
} from "../src/state/board-app-store.ts"

/** Helper to create React elements without JSX */
const h = (type: any, props: any, ...children: any[]): React.ReactElement =>
  React.createElement(
    type,
    children.length === 1 ? { ...props, children: children[0] } : children.length > 0 ? { ...props, children } : props,
  )

/** Render a board with truecolor theme and return virtual buffer result */
function renderBoardWithTruecolor(options: {
  nodes: ReturnType<typeof item>
  cursor: string
  cols?: number
  rows?: number
}) {
  const { nodes, cursor, cols = 80, rows = 24 } = options
  const repo = createFakeRepo({ nodes })
  const rootId = nodes[0]!.id

  // Reset module-level state
  ensureCommandSystemInitialized()
  getChordState().cancel()
  resetDialogGuard()
  resetBoardAppState()

  const navigator = createGridNavigator()
  const toastQueue = createToastQueue()

  const storeParams: CreateBoardAppStoreParams = {
    repo,
    toastQueue,
    navigator,
    initialBoardState: createBoardState(rootId, repo.path, new Set<string>()),
    initialCursor: cursor,
    initialUIState: createInitialUIState({ columns: cols, rows }),
    initialViewMode: "cards",
    dimensions: { columns: cols, rows },
  }

  const store = createSignalStore<BoardAppStore>(createBoardAppStoreState(storeParams))
  const reactiveStore = withReactive(createStoreFromRepo(repo))
  const focusManager = createFocusManager()

  const theme = defaultDarkTheme
  const expectedCardBg = selectedBg(theme)

  const render = createRenderer({ cols, rows, singlePassLayout: true })
  const boardAppElement = React.createElement(BoardApp, {
    initialViewMode: "cards" as const,
    toastQueue,
    navigator,
  })

  const result = render(
    h(
      ThemeProvider,
      { theme },
      h(
        StoreContext.Provider,
        { value: store as StoreApi<unknown> },
        h(
          FocusManagerContext.Provider,
          { value: focusManager },
          h(StoreProvider, { store: reactiveStore }, h(RepoProvider, { repo, children: boardAppElement })),
        ),
      ),
    ),
    { incremental: false },
  )

  return { result, store, theme, expectedCardBg }
}

/** Get bg color at the position of a label in the screen text */
function getBgAtLabel(screenText: string, label: string, cellFn: (col: number, row: number) => { bg: any }) {
  const lines = screenText.split("\n")
  const row = lines.findIndex((line) => line.includes(label))
  if (row < 0) return null
  const col = lines[row]!.indexOf(label)
  return { bg: cellFn(col, row).bg, row, col }
}

describe("card bg inheritance (zebra pattern bug)", () => {
  test("all sub-items within cursor card have consistent bg in virtual buffer", () => {
    const nodes = item(
      "board",
      item(
        "column",
        item(
          "card-title",
          item.section("Section1", item("sub-item-1"), item("sub-item-2")),
          item.section("Section2", item("sub-item-3")),
        ),
      ),
    )

    const { result, theme, expectedCardBg } = renderBoardWithTruecolor({
      nodes,
      cursor: "card-title",
    })

    // Verify rendering
    expect(result.text).toContain("card-title")
    expect(result.text).toContain("Section1")
    expect(result.text).toContain("sub-item-1")
    expect(expectedCardBg, "selectedBg must return a hex color with truecolor theme").toBeTruthy()

    // Collect bg colors from virtual buffer for each sub-item
    const subLabels = ["Section1", "sub-item-1", "sub-item-2", "Section2", "sub-item-3"]
    const subItemBgs = subLabels.map((label) => {
      const info = getBgAtLabel(result.text, label, (col, row) => result.term.cell(col, row))
      expect(info, `"${label}" should be visible on screen`).not.toBeNull()
      return { label, ...info! }
    })

    // All sub-items should have the same bg
    const firstBg = JSON.stringify(subItemBgs[0]!.bg)
    const allSame = subItemBgs.every((b) => JSON.stringify(b.bg) === firstBg)
    const bgSummary = subItemBgs.map((b) => `${b.label}=${JSON.stringify(b.bg)}`).join(", ")

    expect(allSame, `Zebra pattern in virtual buffer: ${bgSummary}`).toBe(true)

    // Verify sub-items have a non-null bg (card bg is inherited)
    const hasAnyBg = subItemBgs.some((b) => b.bg !== null && b.bg !== undefined)
    expect(
      hasAnyBg,
      `No sub-items inherited the card bg. Expected selectedBg (${expectedCardBg}) but all have null bg.`,
    ).toBe(true)
  })

  test("all sub-items within cursor card have consistent bg in termless (ANSI output)", () => {
    const nodes = item(
      "board",
      item(
        "column",
        item(
          "card-title",
          item.section("Section1", item("sub-item-1"), item("sub-item-2")),
          item.section("Section2", item("sub-item-3")),
        ),
      ),
    )

    const cols = 80
    const rows = 24
    const { result, expectedCardBg } = renderBoardWithTruecolor({
      nodes,
      cursor: "card-title",
      cols,
      rows,
    })

    // Feed ANSI output through termless for real terminal emulation
    using term = createTermless({ cols, rows })
    term.write("\x1b[H") // home cursor
    term.write(result.ansi)

    // Verify termless received the content
    expect(term.screen).toContainText("Section1")

    // Collect bg colors from termless cells for each sub-item
    const termText = term.screen!.getText()
    const subLabels = ["Section1", "sub-item-1", "sub-item-2", "Section2", "sub-item-3"]
    const termBgs = subLabels
      .map((label) => {
        const lines = termText.split("\n")
        const row = lines.findIndex((line: string) => line.includes(label))
        if (row < 0) return null
        const col = lines[row]!.indexOf(label)
        // termless cell(row, col) — row-first order
        const cell = term.cell!(row, col)
        return { label, bg: cell.bg, row, col }
      })
      .filter((b): b is NonNullable<typeof b> => b !== null)

    expect(termBgs.length, "at least some sub-items should be visible in termless").toBeGreaterThan(0)

    // All visible sub-items should have the same bg
    const firstBg = JSON.stringify(termBgs[0]!.bg)
    const allSame = termBgs.every((b) => JSON.stringify(b.bg) === firstBg)
    const bgSummary = termBgs.map((b) => `${b.label}=${JSON.stringify(b.bg)}`).join(", ")

    expect(allSame, `Zebra pattern in termless output: ${bgSummary}`).toBe(true)

    // Verify the bg is non-null (card tint inherited)
    const hasAnyBg = termBgs.some((b) => b.bg !== null && b.bg !== undefined)
    expect(
      hasAnyBg,
      `No sub-items got a bg in termless. Card bg (${expectedCardBg}) not reaching children via ANSI.`,
    ).toBe(true)
  })

  test("card bg matches expected selectedBg tint (not multiSelectedBg)", () => {
    const nodes = item("board", item("column", item("card-title", item.section("Section1", item("sub-item-1")))))

    const { result, store, expectedCardBg, theme } = renderBoardWithTruecolor({
      nodes,
      cursor: "card-title",
    })

    expect(expectedCardBg).toBeTruthy()

    // Verify cursor state: cursor should be on "card-title"
    const pane = getActiveBoardPane(store.getState())
    expect(pane).toBeTruthy()
    const cursorId = pane!.sel.node.cursor() as string | null
    expect(cursorId, "cursor should be on card-title").toBe("card-title")

    // Check a sub-item's bg in the virtual buffer
    const info = getBgAtLabel(result.text, "sub-item-1", (col, row) => result.term.cell(col, row))
    expect(info, "sub-item-1 should be visible").not.toBeNull()

    // The sub-item bg should match selectedBg from the card container.
    // selectedBg = blend(bg, primary, 0.06) = #393D45
    // multiSelectedBg = blend(bg, primary, 0.14) = #48494B
    // If the cell shows multiSelectedBg, isNodeSelected is incorrectly true.
    if (info!.bg !== null && typeof info!.bg === "object") {
      const actual = info!.bg as { r: number; g: number; b: number }
      const hex = expectedCardBg!
      const expectedR = parseInt(hex.slice(1, 3), 16)
      const expectedG = parseInt(hex.slice(3, 5), 16)
      const expectedB = parseInt(hex.slice(5, 7), 16)

      const maxDiff = Math.max(
        Math.abs(actual.r - expectedR),
        Math.abs(actual.g - expectedG),
        Math.abs(actual.b - expectedB),
      )

      // Allow small tolerance for rounding in color math
      expect(
        maxDiff,
        `Sub-item bg (${actual.r},${actual.g},${actual.b}) does not match ` +
          `selectedBg=${hex} (${expectedR},${expectedG},${expectedB}), diff=${maxDiff}. ` +
          `If bg is (72,73,75)=#48494B, that's multiSelectedBg (14% blend) ` +
          `instead of selectedBg (6%) — isNodeSelected may be incorrectly true.`,
      ).toBeLessThanOrEqual(2)
    }
  })

  test("cursor on card-title: all rows including sections have bg, not just leaf items", () => {
    // More complex fixture with deeper nesting
    const nodes = item(
      "board",
      item(
        "column",
        item(
          "deep-card",
          item.section("SectionA", item("leaf-1"), item("leaf-2"), item.folder("SubFolder", item("nested-1"))),
          item.section("SectionB", item("leaf-3")),
          item("standalone-item"),
        ),
      ),
    )

    const { result, expectedCardBg } = renderBoardWithTruecolor({
      nodes,
      cursor: "deep-card",
    })

    expect(result.text).toContain("deep-card")
    expect(expectedCardBg).toBeTruthy()

    // Check all visible items within the card
    const allLabels = ["SectionA", "leaf-1", "leaf-2", "SubFolder", "SectionB", "leaf-3", "standalone-item"]

    const visibleBgs: { label: string; bg: any }[] = []
    for (const label of allLabels) {
      const info = getBgAtLabel(result.text, label, (col, row) => result.term.cell(col, row))
      if (info) {
        visibleBgs.push({ label, bg: info.bg })
      }
    }

    expect(visibleBgs.length, "at least some items should be visible").toBeGreaterThan(0)

    // All visible items should have the same bg
    const firstBg = JSON.stringify(visibleBgs[0]!.bg)
    const allSame = visibleBgs.every((b) => JSON.stringify(b.bg) === firstBg)
    const bgSummary = visibleBgs.map((b) => `${b.label}=${JSON.stringify(b.bg)}`).join(", ")

    expect(allSame, `Zebra pattern with deep nesting: ${bgSummary}`).toBe(true)
  })
})
