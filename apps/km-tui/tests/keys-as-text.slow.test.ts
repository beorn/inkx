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
import { createTestApp } from "./helpers/test-app.ts"
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
  test("h/l/j/k navigation does not insert characters into card content", async () => {
    // Create a board with columns and cards — simple case
    using app = createTestApp(
      item(
        "board",
        item("col1", item("Task Alpha"), item("Task Beta"), item("Task Gamma")),
        item("col2", item("Task Delta"), item("Task Epsilon")),
      ),
    )

    // Verify initial content is correct
    expect(app.repo.getNode("Task Alpha")?.content).toBe("Task Alpha")
    expect(app.repo.getNode("Task Delta")?.content).toBe("Task Delta")

    // Navigate extensively
    await app.press("l") // right to col2
    await app.press("h") // back to col1
    await app.press("j") // down to Task Beta
    await app.press("j") // down to Task Gamma
    await app.press("l") // right to col2
    await app.press("j") // down to Task Epsilon
    await app.press("k") // up to Task Delta
    await app.press("h") // left to col1
    await app.press("k") // up to Task Beta
    await app.press("k") // up to Task Alpha
    await app.press("l") // right again
    await app.press("h") // left again

    // After all navigation, NO card content should be modified
    expect(app.repo.getNode("Task Alpha")?.content).toBe("Task Alpha")
    expect(app.repo.getNode("Task Beta")?.content).toBe("Task Beta")
    expect(app.repo.getNode("Task Gamma")?.content).toBe("Task Gamma")
    expect(app.repo.getNode("Task Delta")?.content).toBe("Task Delta")
    expect(app.repo.getNode("Task Epsilon")?.content).toBe("Task Epsilon")
  })

  test("navigation with body paragraphs does not corrupt text", async () => {
    // Cards with body content (paragraphs) — closer to real vault structure
    // The bug specifically affects body text during navigation
    using app = createTestApp(
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
      { cols: 120, rows: 40 },
    )

    // Verify initial paragraph content
    expect(app.repo.getNode("Status: Not started depends on enrollment")?.content).toBe(
      "Status: Not started depends on enrollment",
    )
    expect(app.repo.getNode("Health Savings Account provides triple tax advantage")?.content).toBe(
      "Health Savings Account provides triple tax advantage",
    )
    expect(app.repo.getNode("Important notes about this task go here")?.content).toBe(
      "Important notes about this task go here",
    )

    // Navigate extensively — matching the real reproduction sequence
    await app.press("l") // right to col2
    await app.press("l") // right (boundary or further)
    await app.press("h") // left
    await app.press("h") // left
    await app.press("h") // left (boundary)
    await app.press("j") // down
    await app.press("l") // right
    await app.press("l") // right
    await app.press("h") // left
    await app.press("h") // left
    await app.press("k") // up
    await app.press("l") // right
    await app.press("j") // down
    await app.press("k") // up
    await app.press("h") // left

    // After navigation, ALL paragraph content must be UNCHANGED
    // The bug would insert 'h', 'l', 'j', 'k' chars into paragraph text
    expect(app.repo.getNode("Status: Not started depends on enrollment")?.content).toBe(
      "Status: Not started depends on enrollment",
    )
    expect(app.repo.getNode("Health Savings Account provides triple tax advantage")?.content).toBe(
      "Health Savings Account provides triple tax advantage",
    )
    expect(app.repo.getNode("Important notes about this task go here")?.content).toBe(
      "Important notes about this task go here",
    )
    expect(app.repo.getNode("More details about the fourth item")?.content).toBe("More details about the fourth item")
  })

  test("view mode switching (v) does not corrupt card text", async () => {
    using app = createTestApp(
      item(
        "board",
        item("col1", item("Important task with long content")),
        item("col2", item("Another critical item here")),
      ),
    )

    const originalContent1 = app.repo.getNode("Important task with long content")?.content
    const originalContent2 = app.repo.getNode("Another critical item here")?.content

    // Switch view modes and navigate — matches reproduction sequence
    await app.press("l") // navigate right
    await app.press("v")
    await app.press("v") // switch to columns view
    await app.press("v")
    await app.press("v") // switch to tabs view
    await app.press("v")
    await app.press("v") // back to cards view
    await app.press("h") // navigate left
    await app.press("j") // navigate down (even if only one card)
    await app.press("k") // navigate up

    // Content must remain unchanged
    expect(app.repo.getNode("Important task with long content")?.content).toBe(originalContent1)
    expect(app.repo.getNode("Another critical item here")?.content).toBe(originalContent2)
  })

  test("zoom in/out (z/Z) with navigation does not corrupt card text", async () => {
    // This test matches the exact reproduction: navigate, then zoom in with 'e',
    // and verify content before and after zoom
    using app = createTestApp(
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
      { cols: 120, rows: 40 },
    )

    // Navigate around
    await app.press("l") // right to Tasks column
    await app.press("j") // down to Task Two
    await app.press("h") // left to Projects
    await app.press("j") // down to Project Beta
    await app.press("l") // right to Tasks
    await app.press("k") // up to Task One

    // Verify content not corrupted BEFORE zoom
    expect(app.repo.getNode("Alpha project description here")?.content).toBe("Alpha project description here")
    expect(app.repo.getNode("Beta project description here")?.content).toBe("Beta project description here")
    expect(app.repo.getNode("First task details go here")?.content).toBe("First task details go here")
    expect(app.repo.getNode("Second task details go here")?.content).toBe("Second task details go here")

    // Zoom in (z) then escape back out
    await app.press("z") // zoom into Task One

    // Content should still be intact after zoom
    expect(app.repo.getNode("First task details go here")?.content).toBe("First task details go here")

    await app.press("Z") // exit zoom (zoom out)

    // Navigate more after zoom
    await app.press("h")
    await app.press("j")
    await app.press("l")
    await app.press("k")

    // All content still intact
    expect(app.repo.getNode("Alpha project description here")?.content).toBe("Alpha project description here")
    expect(app.repo.getNode("Beta project description here")?.content).toBe("Beta project description here")
    expect(app.repo.getNode("First task details go here")?.content).toBe("First task details go here")
    expect(app.repo.getNode("Second task details go here")?.content).toBe("Second task details go here")
  })

  test("search open/close (/ then Escape) does not corrupt card text", async () => {
    using app = createTestApp(
      item("board", item("col1", item("Search target task")), item("col2", item("Another task here"))),
    )

    // Navigate, open search, close it, navigate more
    await app.press("l") // right
    await app.press("h") // left
    await app.press("cmd+f") // open search
    await app.press("Escape") // close search
    await app.press("l") // right again
    await app.press("h") // left again

    // Content must remain unchanged
    expect(app.repo.getNode("Search target task")?.content).toBe("Search target task")
    expect(app.repo.getNode("Another task here")?.content).toBe("Another task here")
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
    const cursor = deriveCursorIndices(cols, pane.sel.node.cursor() as string | null, ni)
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

  test("empty card heading does not capture j/k as text input", () => {
    // P1 Bug: km-tui.empty-card-key-capture
    // Empty heading sections (## Empty Section with no children) auto-enter
    // edit mode, causing j/k navigation keys to be inserted as text.
    const { board, repo } = testEnv(
      () =>
        item(
          "board",
          item(
            "col1",
            item("Task Above"),
            item("Empty Section"), // heading with NO children — the problematic case
            item("Task Below"),
          ),
          item("col2", item("Other task")),
        ),
      { columns: 120, rows: 40 },
    )

    // Navigate down to "Empty Section"
    board.press("j") // move to Empty Section

    // CRITICAL: Must NOT be in edit mode — empty cards should not auto-enter edit
    board.expectNotEditing()

    // Press k — should navigate UP, not insert "k" into heading
    board.press("k")
    board.expectNotEditing()
    expect(repo.getNode("Empty Section")?.content).toBe("Empty Section")

    // Navigate back to Empty Section
    board.press("j")

    // Press j — should navigate DOWN, not insert "j" into heading
    board.press("j")
    board.expectNotEditing()
    expect(repo.getNode("Empty Section")?.content).toBe("Empty Section")

    // Navigate to Empty Section again and try h/l
    board.press("k") // back to Empty Section
    board.press("l") // should navigate to col2, not insert "l"
    board.expectNotEditing()
    expect(repo.getNode("Empty Section")?.content).toBe("Empty Section")
  })

  test("Enter to edit then Escape preserves content on navigation", () => {
    // This tests the inline edit path: Enter to start editing, Escape to cancel,
    // then navigate. The concern is that after exiting edit mode, inlineEditBlock
    // might not be properly cleared, leaving textInputFocused=true.
    // Uses leaf items (no children) to match real li card data where content is set.
    const { board, repo } = testEnv(
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
