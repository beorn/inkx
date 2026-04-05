/**
 * P1 Bug: km-tui.keys-as-text — Navigation keys captured as text input
 *
 * When navigating with h/l/j/k in cards view, the key characters get
 * inserted into the focused card's body text, corrupting in-memory content.
 *
 * Reproduction: Navigate h/l/j/k across columns with cards that have body
 * paragraphs, then verify card content is unchanged. The bug causes
 * "Status: Not started" to become "Stalus: Not gtarted" as nav keys
 * are inserted at cursor positions.
 */

import { act } from "react"
import { describe, test, expect } from "vitest"
import { item, testEnv } from "/Users/beorn/Code/pim/km/apps/km-tui/tests/helpers/board-test.ts"
import { activeEditTargetRef } from "@silvery/ag-react"
import { dialogTargetRef } from "../src/dialog-target.ts"
import { deriveColumnsFromRepo, buildNodeIndex, deriveCursorIndices } from "../src/hooks/use-columns.ts"
import { getActiveBoardPane, type BoardAppStore } from "../src/state/board-app-store.ts"
import { dispatchCommandById } from "../src/board/board-app.ts"
import type { SignalStoreApi as StoreApi } from "../src/state/signal-store.ts"

/**
 * Open the search dialog via the "search" command.
 * After dispatching, press Backspace to flush the silvery render pipeline.
 */
function openSearchDialog(store: StoreApi<BoardAppStore>, board: ReturnType<typeof testEnv>["board"]) {
  act(() => {
    dispatchCommandById("search", store.getState as () => BoardAppStore)
    store.setState((s) => s)
  })
  board.press("Backspace") // flush silvery render pipeline
}

describe("P1: Navigation keys must not corrupt card text", () => {
  test("h/l/j/k navigation does not insert characters into card content", () => {
    // Create a board with columns and cards — simple case
    const { board, repo } = testEnv(() =>
      item(
        "board",
        item("col1", item("Task Alpha"), item("Task Beta"), item("Task Gamma")),
        item("col2", item("Task Delta"), item("Task Epsilon")),
      ),
    )

    // Verify initial content is correct
    expect(repo.getNode("Task Alpha")?.content).toBe("Task Alpha")
    expect(repo.getNode("Task Delta")?.content).toBe("Task Delta")

    // Navigate extensively
    board
      .press("l") // right to col2
      .press("h") // back to col1
      .press("j") // down to Task Beta
      .press("j") // down to Task Gamma
      .press("l") // right to col2
      .press("j") // down to Task Epsilon
      .press("k") // up to Task Delta
      .press("h") // left to col1
      .press("k") // up to Task Beta
      .press("k") // up to Task Alpha
      .press("l") // right again
      .press("h") // left again

    // After all navigation, NO card content should be modified
    expect(repo.getNode("Task Alpha")?.content).toBe("Task Alpha")
    expect(repo.getNode("Task Beta")?.content).toBe("Task Beta")
    expect(repo.getNode("Task Gamma")?.content).toBe("Task Gamma")
    expect(repo.getNode("Task Delta")?.content).toBe("Task Delta")
    expect(repo.getNode("Task Epsilon")?.content).toBe("Task Epsilon")
  })

  test("navigation with body paragraphs does not corrupt text", () => {
    // Cards with body content (paragraphs) — closer to real vault structure
    // The bug specifically affects body text during navigation
    const { board, repo } = testEnv(
      () =>
        item(
          "board",
          item(
            "col1",
            item("Task with body", item.p("Status: Not started depends on enrollment")),
            item("Another task", item.p("Health Savings Account provides triple tax advantage")),
          ),
          item(
            "col2",
            item("Third task", item.p("Important notes about this task go here")),
            item("Fourth task", item.p("More details about the fourth item")),
          ),
        ),
      { columns: 120, rows: 40 },
    )

    // Verify initial paragraph content
    expect(repo.getNode("Status: Not started depends on enrollment")?.content).toBe(
      "Status: Not started depends on enrollment",
    )
    expect(repo.getNode("Health Savings Account provides triple tax advantage")?.content).toBe(
      "Health Savings Account provides triple tax advantage",
    )
    expect(repo.getNode("Important notes about this task go here")?.content).toBe(
      "Important notes about this task go here",
    )

    // Navigate extensively — matching the real reproduction sequence
    board
      .press("l") // right to col2
      .press("l") // right (boundary or further)
      .press("h") // left
      .press("h") // left
      .press("h") // left (boundary)
      .press("j") // down
      .press("l") // right
      .press("l") // right
      .press("h") // left
      .press("h") // left
      .press("k") // up
      .press("l") // right
      .press("j") // down
      .press("k") // up
      .press("h") // left

    // After navigation, ALL paragraph content must be UNCHANGED
    // The bug would insert 'h', 'l', 'j', 'k' chars into paragraph text
    expect(repo.getNode("Status: Not started depends on enrollment")?.content).toBe(
      "Status: Not started depends on enrollment",
    )
    expect(repo.getNode("Health Savings Account provides triple tax advantage")?.content).toBe(
      "Health Savings Account provides triple tax advantage",
    )
    expect(repo.getNode("Important notes about this task go here")?.content).toBe(
      "Important notes about this task go here",
    )
    expect(repo.getNode("More details about the fourth item")?.content).toBe("More details about the fourth item")
  })

  test("view mode switching (v) does not corrupt card text", () => {
    const { board, repo } = testEnv(() =>
      item(
        "board",
        item("col1", item("Important task with long content")),
        item("col2", item("Another critical item here")),
      ),
    )

    const originalContent1 = repo.getNode("Important task with long content")?.content
    const originalContent2 = repo.getNode("Another critical item here")?.content

    // Switch view modes and navigate — matches reproduction sequence
    board
      .press("l") // navigate right
      .press("v")
      .press("v") // switch to columns view
      .press("v")
      .press("v") // switch to tabs view
      .press("v")
      .press("v") // back to cards view
      .press("h") // navigate left
      .press("j") // navigate down (even if only one card)
      .press("k") // navigate up

    // Content must remain unchanged
    expect(repo.getNode("Important task with long content")?.content).toBe(originalContent1)
    expect(repo.getNode("Another critical item here")?.content).toBe(originalContent2)
  })

  test("zoom in/out (z/Z) with navigation does not corrupt card text", () => {
    // This test matches the exact reproduction: navigate, then zoom in with 'e',
    // and verify content before and after zoom
    const { board, repo } = testEnv(
      () =>
        item(
          "board",
          item(
            "Projects",
            item("Project Alpha", item.p("Alpha project description here")),
            item("Project Beta", item.p("Beta project description here")),
          ),
          item(
            "Tasks",
            item("Task One", item.p("First task details go here")),
            item("Task Two", item.p("Second task details go here")),
          ),
        ),
      { columns: 120, rows: 40 },
    )

    // Navigate around
    board
      .press("l") // right to Tasks column
      .press("j") // down to Task Two
      .press("h") // left to Projects
      .press("j") // down to Project Beta
      .press("l") // right to Tasks
      .press("k") // up to Task One

    // Verify content not corrupted BEFORE zoom
    expect(repo.getNode("Alpha project description here")?.content).toBe("Alpha project description here")
    expect(repo.getNode("Beta project description here")?.content).toBe("Beta project description here")
    expect(repo.getNode("First task details go here")?.content).toBe("First task details go here")
    expect(repo.getNode("Second task details go here")?.content).toBe("Second task details go here")

    // Zoom in (z) then escape back out
    board.press("z") // zoom into Task One

    // Content should still be intact after zoom
    expect(repo.getNode("First task details go here")?.content).toBe("First task details go here")

    board.press("Z") // exit zoom (zoom out)

    // Navigate more after zoom
    board.press("h").press("j").press("l").press("k")

    // All content still intact
    expect(repo.getNode("Alpha project description here")?.content).toBe("Alpha project description here")
    expect(repo.getNode("Beta project description here")?.content).toBe("Beta project description here")
    expect(repo.getNode("First task details go here")?.content).toBe("First task details go here")
    expect(repo.getNode("Second task details go here")?.content).toBe("Second task details go here")
  })

  test("search open/close (/ then Escape) does not corrupt card text", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("Search target task")), item("col2", item("Another task here"))),
    )

    // Navigate, open search, close it, navigate more
    board
      .press("l") // right
      .press("h") // left
      .press("cmd+f") // open search
      .press("Escape") // close search
      .press("l") // right again
      .press("h") // left again

    // Content must remain unchanged
    expect(repo.getNode("Search target task")?.content).toBe("Search target task")
    expect(repo.getNode("Another task here")?.content).toBe("Another task here")
  })

  test("search select via Enter does not enter edit mode or corrupt text", () => {
    // P1 Bug: km-tui.keys-as-text — After selecting a search result with Enter,
    // the Enter propagates and triggers inline edit mode on the target card.
    // Subsequent j/k/h/l keys then insert into the title instead of navigating.
    const { board, repo, store } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("Alpha task"), item("Beta task")),
          item("col2", item("Gamma task"), item("Delta task")),
        ),
      { columns: 120, rows: 40 },
    )

    // Verify starting state
    board.expectNotEditing()
    expect(store.getState().ui.showSearchDialog).toBe(false)

    // Open search dialog via command dispatch (cmd+f opens local find, not search dialog)
    openSearchDialog(store, board)
    expect(store.getState().ui.showSearchDialog).toBe(true)

    // Type a query that matches "Delta task"
    for (const ch of "Delta") board.press(ch)

    // Verify search found something (dialog still open, results showing)
    const screenDuringSearch = board.screenshot()
    expect(screenDuringSearch).toContain("Delta")

    // Select the result with Enter
    board.press("Enter")

    // Dialog should be closed
    expect(store.getState().ui.showSearchDialog).toBe(false)

    // Verify cursor is on the selected node (derive layout on demand)
    const s = store.getState()
    const pane = getActiveBoardPane(s)!
    const cols = deriveColumnsFromRepo(s.repo, pane.rootId, pane.foldDepths)
    const ni = buildNodeIndex(cols)
    const cursor = deriveCursorIndices(cols, (pane.sel.node.cursor() as string | null), ni)
    const col = cols[cursor.colIndex]
    const card = col?.cardNodes[cursor.cardIndex]
    const selectedNode = card ?? col?.node ?? null
    expect(selectedNode?.content).toBe("Delta task")

    // CRITICAL: Must NOT be in inline edit mode
    board.expectNotEditing()

    // CRITICAL: activeEditTargetRef must be null (no text editing target)
    // If this is non-null, keystrokes would go to a text editor
    expect(activeEditTargetRef.current).toBeNull()

    // CRITICAL: dialogTargetRef must be null (dialog fully unmounted)
    expect(dialogTargetRef.current).toBeNull()

    // Navigate with j — should move cursor, not insert 'j' into title
    board.press("j")

    // Verify NO content corruption — all titles must be unchanged
    expect(repo.getNode("Alpha task")?.content).toBe("Alpha task")
    expect(repo.getNode("Beta task")?.content).toBe("Beta task")
    expect(repo.getNode("Gamma task")?.content).toBe("Gamma task")
    expect(repo.getNode("Delta task")?.content).toBe("Delta task")

    // Also verify we're still not in edit mode after navigation
    board.expectNotEditing()
  })

  test("rapid Enter after search confirm does not trigger inline edit (grace period)", () => {
    // P1 Bug: If Enter propagates or user double-taps Enter, the second Enter
    // would trigger ENTER_INLINE_EDIT on the card selected by search.
    // The dialog confirm grace period should suppress this.
    const { board, repo, store } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("Alpha task"), item("Beta task")),
          item("col2", item("Gamma task"), item("Delta task")),
        ),
      { columns: 120, rows: 40 },
    )

    // Open search dialog, type query, select result
    openSearchDialog(store, board)
    for (const ch of "Delta") board.press(ch)
    board.press("Enter") // Confirms search, closes dialog

    // Immediately press Enter again (simulating double-tap or propagation).
    // The grace period uses a one-shot flag (not a time window), so it
    // suppresses the next ENTER_INLINE_EDIT regardless of system load.
    board.press("Enter")

    // CRITICAL: Should NOT be in inline edit mode despite the second Enter
    board.expectNotEditing()

    // Navigate to confirm we're in normal mode
    board.press("j")
    board.press("k")

    // Content must remain unchanged
    expect(repo.getNode("Alpha task")?.content).toBe("Alpha task")
    expect(repo.getNode("Delta task")?.content).toBe("Delta task")
  })

  test("Enter to edit then Escape preserves content on navigation", () => {
    // This tests the inline edit path: Enter to start editing, Escape to cancel,
    // then navigate. The concern is that after exiting edit mode, inlineEditBlock
    // might not be properly cleared, leaving textInputFocused=true.
    // Uses leaf items (no children) to match real li card data where content is set.
    const { board, repo, store } = testEnv(
      () => item("board", item("col1", item("Editable task"), item("Second task")), item("col2", item("Other task"))),
      { columns: 120, rows: 40 },
    )

    // Verify we start in normal mode (no inline edit)
    board.expectNotEditing()

    // Enter inline edit on the first card title
    board.press("Enter") // start editing "Editable task"

    // Verify inline edit is now active
    board.expectEditing()

    // Cancel edit
    board.press("Escape") // should exit inline edit

    // Verify inline edit state is fully cleared
    board.expectNotEditing()

    // Now navigate — if inlineEditBlock leaked, these keys would insert as text
    board.press("j").press("l").press("k").press("h")

    // Content must be unchanged — no stray 'j', 'l', 'k', 'h' chars
    expect(repo.getNode("Editable task")?.content).toBe("Editable task")
    expect(repo.getNode("Second task")?.content).toBe("Second task")
    expect(repo.getNode("Other task")?.content).toBe("Other task")
  })
})
