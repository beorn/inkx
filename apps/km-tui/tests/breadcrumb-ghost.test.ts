/**
 * P2 Bug: km-tui.breadcrumb-ghost — Breadcrumb shows ghost prefix char
 *
 * After horizontal navigation (l to enter column, h to go back), the
 * breadcrumb path prepends a ghost character from the previous column name.
 * E.g., "CTaskNotes" instead of "TaskNotes" where "C" came from a previously
 * selected item starting with "C".
 *
 * This is a rendering artifact — the inkx buffer retains stale characters
 * from a previous frame when the new content is shorter.
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("P2: Breadcrumb ghost prefix after navigation", () => {
  test("top-bar breadcrumb has no ghost prefix after horizontal navigation", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Alpha Column", item("a1"), item("a2")),
          item("Beta Column", item("b1"), item("b2")),
          item("Gamma Column", item("c1"), item("c2")),
        ),
      { columns: 120, rows: 24 },
    )

    // Check initial top bar - should contain "board"
    const initialTopBar = board.q("#top-bar").textContent()
    expect(initialTopBar).toContain("board")

    // Navigate right into columns and back
    board.press("l") // move to Beta Column
    const topBarAtBeta = board.q("#top-bar").textContent()
    expect(topBarAtBeta).toContain("Beta Column")
    expect(topBarAtBeta).not.toContain("ABeta")

    board.press("l") // move to Gamma Column
    const topBarAtGamma = board.q("#top-bar").textContent()
    expect(topBarAtGamma).toContain("Gamma Column")
    expect(topBarAtGamma).not.toContain("BGamma")

    board.press("h") // back to Beta Column
    const topBarAfterBack1 = board.q("#top-bar").textContent()
    expect(topBarAfterBack1).toContain("Beta Column")
    expect(topBarAfterBack1).not.toContain("GBeta")

    board.press("h") // back to Alpha Column
    const topBarAfterBack2 = board.q("#top-bar").textContent()
    expect(topBarAfterBack2).toContain("Alpha Column")
    expect(topBarAfterBack2).not.toContain("BAlpha")
  })

  test("breadcrumb screen buffer has no ghost chars after navigation", () => {
    // Verify at the screen/buffer level — the actual rendered output
    const { board } = testEnv(() => item("board", item("Projects", item("p1")), item("TaskNotes", item("t1"))), {
      columns: 80,
      rows: 24,
    })

    // Navigate to TaskNotes column then back
    board.press("l") // to TaskNotes

    // Capture screen at TaskNotes - top bar should show TaskNotes, not "PTaskNotes"
    const screenAtTask = board.screenshot()
    const topLineAtTask = screenAtTask.split("\n")[0] ?? ""
    expect(topLineAtTask).toContain("TaskNotes")
    expect(topLineAtTask).not.toContain("PTaskNotes")

    board.press("h") // back to Projects

    // Check screen for ghost prefix: "TProjects" would indicate bleed
    const screenBack = board.screenshot()
    const topLineBack = screenBack.split("\n")[0] ?? ""
    expect(topLineBack).toContain("Projects")
    expect(topLineBack).not.toContain("TProjects")
  })

  test("top-bar text shrinks cleanly without trailing ghost chars", () => {
    // When switching from a long path to a short path, the buffer should
    // not show leftover chars from the longer text
    const { board } = testEnv(
      () => item("board", item("Short", item("s1")), item("VeryLongColumnNameThatTakesSpace", item("v1"))),
      { columns: 80, rows: 24 },
    )

    // Navigate to the long-named column
    board.press("l") // to VeryLongColumnNameThatTakesSpace
    const topBarLong = board.q("#top-bar").textContent()
    expect(topBarLong).toContain("VeryLongColumnNameThatTakesSpace")

    // Navigate back to the short-named column
    board.press("h") // to Short
    const topBarShort = board.q("#top-bar").textContent()
    expect(topBarShort).toContain("Short")

    // The buffer text for the top line should NOT contain trailing chars
    // from "VeryLongColumnNameThatTakesSpace"
    const screenShort = board.screenshot()
    const topLineShort = screenShort.split("\n")[0] ?? ""
    expect(topLineShort).not.toContain("VeryLong")
    expect(topLineShort).not.toContain("ThatTakes")
    // Also check for ghost prefix
    expect(topLineShort).not.toContain("VShort")
  })

  test("no ghost prefix after rapid h/l/h/l navigation (ainbox/CTaskNotes regression)", () => {
    // km-tui.breadcrumb-ghost: user saw "ainbox" instead of "inbox",
    // "CTaskNotes" instead of "TaskNotes" — first char of previous column
    // leaks into the new breadcrumb. Test rapid h/l cycles with names that
    // start with different chars.
    const { board } = testEnv(
      () => item("board", item("Calendar", item("c1")), item("inbox", item("i1")), item("TaskNotes", item("t1"))),
      { columns: 100, rows: 24 },
    )

    // Rapid navigation: Calendar -> inbox -> TaskNotes -> inbox -> Calendar
    board.press("l") // to inbox
    let topLine = board.screenshot().split("\n")[0] ?? ""
    expect(topLine).toContain("inbox")
    expect(topLine).not.toContain("Cinbox")
    expect(topLine).not.toContain("ainbox")

    board.press("l") // to TaskNotes
    topLine = board.screenshot().split("\n")[0] ?? ""
    expect(topLine).toContain("TaskNotes")
    expect(topLine).not.toContain("iTaskNotes")
    expect(topLine).not.toContain("CTaskNotes")

    board.press("h") // back to inbox
    topLine = board.screenshot().split("\n")[0] ?? ""
    expect(topLine).toContain("inbox")
    expect(topLine).not.toContain("Tinbox")
    expect(topLine).not.toContain("ainbox")

    board.press("h") // back to Calendar
    topLine = board.screenshot().split("\n")[0] ?? ""
    expect(topLine).toContain("Calendar")
    expect(topLine).not.toContain("iCalendar")

    // Second round: rapid back-and-forth
    board.press("l").press("l").press("h").press("h")
    topLine = board.screenshot().split("\n")[0] ?? ""
    expect(topLine).toContain("Calendar")
    expect(topLine).not.toContain("iCalendar")
    expect(topLine).not.toContain("TCalendar")

    // Buffer-level check: no ghost chars in the top bar region
    board.expectNoGhostChars({ x: 0, y: 0, width: 100, height: 1 })
  })
})
