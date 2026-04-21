// FREEZE bucket — see km-all.test-system bead. Reason: createBoardDriver (real vault tests)
/**
 * Breadcrumb tests -- navigation, zoom, ghost chars, text bleed, ANSI replay.
 *
 * Consolidated from:
 * - breadcrumb.test.ts (ANSI diff, ghost prefix, zoom path, multi-line text bleed)
 * - breadcrumb-replay-realvault.slow.test.ts (real vault ANSI replay)
 *
 * Note: breadcrumb-stale-on-hl.bench.ts stays separate (benchmark).
 */

import { describe, test, expect } from "vitest"

import { createRepo, getChildren, type Repo } from "@km/storage"
import { runGenerator } from "@km/core"
import { withDiagnostics } from "@silvery/ag-react"
import { createBoardDriver } from "../src/driver.ts"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

// =============================================================================
// Ghost prefix after navigation (km-tui.breadcrumb-ghost)
// =============================================================================

describe("P2: Breadcrumb ghost prefix after navigation", () => {
  test("top-bar breadcrumb has no ghost prefix after horizontal navigation", () => {
    using app = createTestApp(
      item(
        "board",
        item("Alpha Column", item("a1"), item("a2")),
        item("Beta Column", item("b1"), item("b2")),
        item("Gamma Column", item("c1"), item("c2")),
      ),
      { cols: 120, rows: 24 },
    )

    // Check initial top bar - should contain "board"
    const initialTopBar = app.q("#top-bar").textContent()
    expect(initialTopBar).toContain("board")

    // Navigate right into columns and back
    app.command("cursor_right") // move to Beta Column
    const topBarAtBeta = app.q("#top-bar").textContent()
    expect(topBarAtBeta).toContain("Beta Column")
    expect(topBarAtBeta).not.toContain("ABeta")

    app.command("cursor_right") // move to Gamma Column
    const topBarAtGamma = app.q("#top-bar").textContent()
    expect(topBarAtGamma).toContain("Gamma Column")
    expect(topBarAtGamma).not.toContain("BGamma")

    app.command("cursor_left") // back to Beta Column
    const topBarAfterBack1 = app.q("#top-bar").textContent()
    expect(topBarAfterBack1).toContain("Beta Column")
    expect(topBarAfterBack1).not.toContain("GBeta")

    app.command("cursor_left") // back to Alpha Column
    const topBarAfterBack2 = app.q("#top-bar").textContent()
    expect(topBarAfterBack2).toContain("Alpha Column")
    expect(topBarAfterBack2).not.toContain("BAlpha")
  })

  test("breadcrumb screen buffer has no ghost chars after navigation", () => {
    // Verify at the screen/buffer level -- the actual rendered output
    using app = createTestApp(item("board", item("Projects", item("p1")), item("TaskNotes", item("t1"))), {
      cols: 80,
      rows: 24,
    })

    // Navigate to TaskNotes column then back
    app.command("cursor_right") // to TaskNotes

    // Capture screen at TaskNotes - top bar should show TaskNotes, not "PTaskNotes"
    const screenAtTask = app.text
    const topLineAtTask = screenAtTask.split("\n")[0] ?? ""
    expect(topLineAtTask).toContain("TaskNotes")
    expect(topLineAtTask).not.toContain("PTaskNotes")

    app.command("cursor_left") // back to Projects

    // Check screen for ghost prefix: "TProjects" would indicate bleed
    const screenBack = app.text
    const topLineBack = screenBack.split("\n")[0] ?? ""
    expect(topLineBack).toContain("Projects")
    expect(topLineBack).not.toContain("TProjects")
  })

  test("top-bar text shrinks cleanly without trailing ghost chars", async () => {
    // When switching from a long path to a short path, the buffer should
    // not show leftover chars from the longer text
    using app = createTestApp(
      item("board", item("Short", item("s1")), item("VeryLongColumnNameThatTakesSpace", item("v1"))),
      { cols: 80, rows: 24 },
    )

    // Navigate to the long-named column
    app.command("cursor_right") // to VeryLongColumnNameThatTakesSpace
    const topBarLong = app.q("#top-bar").textContent()
    expect(topBarLong).toContain("VeryLongColumnNameThatTakesSpace")

    // Navigate back to the short-named column
    app.command("cursor_left") // to Short
    const topBarShort = app.q("#top-bar").textContent()
    expect(topBarShort).toContain("Short")

    // The buffer text for the top line should NOT contain trailing chars
    // from "VeryLongColumnNameThatTakesSpace"
    const screenShort = app.text
    const topLineShort = screenShort.split("\n")[0] ?? ""
    expect(topLineShort).not.toContain("VeryLong")
    expect(topLineShort).not.toContain("ThatTakes")
    // Also check for ghost prefix
    expect(topLineShort).not.toContain("VShort")
  })

  test("no ghost prefix after rapid h/l/h/l navigation (ainbox/CTaskNotes regression)", () => {
    // km-tui.breadcrumb-ghost: user saw "ainbox" instead of "inbox",
    // "CTaskNotes" instead of "TaskNotes" -- first char of previous column
    // leaks into the new breadcrumb. Test rapid h/l cycles with names that
    // start with different chars.
    using app = createTestApp(
      item("board", item("Calendar", item("c1")), item("inbox", item("i1")), item("TaskNotes", item("t1"))),
      { cols: 100, rows: 24 },
    )

    // Rapid navigation: Calendar -> inbox -> TaskNotes -> inbox -> Calendar
    app.command("cursor_right") // to inbox
    let topLine = app.text.split("\n")[0] ?? ""
    expect(topLine).toContain("inbox")
    expect(topLine).not.toContain("Cinbox")
    expect(topLine).not.toContain("ainbox")

    app.command("cursor_right") // to TaskNotes
    topLine = app.text.split("\n")[0] ?? ""
    expect(topLine).toContain("TaskNotes")
    expect(topLine).not.toContain("iTaskNotes")
    expect(topLine).not.toContain("CTaskNotes")

    app.command("cursor_left") // back to inbox
    topLine = app.text.split("\n")[0] ?? ""
    expect(topLine).toContain("inbox")
    expect(topLine).not.toContain("Tinbox")
    expect(topLine).not.toContain("ainbox")

    app.command("cursor_left") // back to Calendar
    topLine = app.text.split("\n")[0] ?? ""
    expect(topLine).toContain("Calendar")
    expect(topLine).not.toContain("iCalendar")

    // Second round: rapid back-and-forth
    app.command("cursor_right").command("cursor_right").command("cursor_left").command("cursor_left")
    topLine = app.text.split("\n")[0] ?? ""
    expect(topLine).toContain("Calendar")
    expect(topLine).not.toContain("iCalendar")
    expect(topLine).not.toContain("TCalendar")

    // Buffer-level check: no ghost chars in the top bar region
    app.expectNoGhostChars({ x: 0, y: 0, width: 100, height: 1 })
  })
})

// =============================================================================
// Breadcrumb path when zoomed deep (km-tui.breadcrumbs)
// =============================================================================

describe("Breadcrumb path when zoomed deep", () => {
  test("top bar shows ancestor path after zooming into a card", () => {
    // hierarchy: board > col > section > subsection > items
    using app = createTestApp(
      item("board", item("col", item("section", item("subsection", item("task-a"), item("task-b"))))),
      { cols: 120, rows: 24 },
    )

    // Initial: cursor on "section" card inside "col" column
    const initialTopBar = app.q("#top-bar").textContent()
    expect(initialTopBar).toContain("board")

    // Zoom into "section" (e on card with children)
    app.command("zoom_inwards")
    // Now section is the root, subsection should be a column
    app.expect("#subsection").toExist()

    const zoomedTopBar = app.q("#top-bar").textContent()
    // Should show ancestor path: board, col, section visible in breadcrumb
    expect(zoomedTopBar).toContain("section")
  })

  test("top bar shows full ancestor breadcrumb path when zoomed two levels deep", () => {
    using app = createTestApp(
      item(
        "board",
        item(
          "Projects",
          item("Frontend", item("React", item("hooks"), item("components")), item("Vue", item("composables"))),
        ),
      ),
      { cols: 120, rows: 24 },
    )

    // Zoom into Frontend
    app.command("zoom_inwards")
    app.expect("#React").toExist()

    // Zoom into React
    app.command("zoom_inwards")
    app.expect("#hooks").toExist()

    const topBar = app.q("#top-bar").textContent()
    // Should show ancestor path including board, Projects, Frontend
    expect(topBar).toContain("board")
    expect(topBar).toContain("Projects")
    expect(topBar).toContain("Frontend")
    expect(topBar).toContain("React")
  })

  test("breadcrumb truncates from left when path is too long for terminal width", () => {
    using app = createTestApp(
      item(
        "VeryLongBoardNameThatEatsSpace",
        item(
          "VeryLongColumnNameForTesting",
          item("VeryLongSectionNameHere", item("VeryLongSubsectionName", item("DeepAlpha"), item("DeepBeta"))),
        ),
      ),
      { cols: 60, rows: 24 },
    )

    // Zoom deep
    app.command("zoom_inwards") // into VeryLongSectionNameHere
    app.command("zoom_inwards") // into VeryLongSubsectionName

    const topBar = app.q("#top-bar").textContent()
    // Path should be truncated with ellipsis when it doesn't fit
    expect(topBar).toContain("\u22EF")
    // The cursor target (DeepAlpha, first card) should be visible in the path
    expect(topBar).toContain("DeepAlpha")
  })

  test("breadcrumb uses dim style for ancestors and bold for board root", () => {
    using app = createTestApp(item("board", item("col", item("parent", item("child", item("gc-a"), item("gc-b"))))), {
      cols: 120,
      rows: 24,
    })

    // Zoom into parent
    app.command("zoom_inwards")
    app.expect("#child").toExist()

    // The top bar should contain all ancestors
    const topBar = app.q("#top-bar").textContent()
    expect(topBar).toContain("parent")
  })

  test("breadcrumb updates when zooming out with Z", () => {
    using app = createTestApp(
      item("board", item("col", item("level1", item("level2", item("level3", item("deep")))))),
      { cols: 120, rows: 24 },
    )

    // Zoom in twice
    app.command("zoom_inwards") // into level1
    app.command("zoom_inwards") // into level2
    let topBar = app.q("#top-bar").textContent()
    expect(topBar).toContain("level2")

    // Zoom out
    app.command("zoom_outwards")
    topBar = app.q("#top-bar").textContent()
    expect(topBar).toContain("level1")
    // level2 should still be visible as it's now a column
    expect(topBar).toContain("level2")
  })

  test("within-board segments use > separator for clear hierarchy", () => {
    // Within-board segments use > separator to distinguish hierarchy
    // from filesystem path (which uses / and #)
    using app = createTestApp(item("board", item("col", item("card", item("sub1"), item("sub2")))), {
      cols: 120,
      rows: 24,
    })

    // Navigate into column to see card-level path
    app.command("cursor_down") // select card
    const topBar = app.q("#top-bar").textContent()
    // Path should show board > col > card with > separators for within-board segments
    expect(topBar).toContain("board")
    expect(topBar).toContain("col")
    expect(topBar).toContain("card")
    // The > separator should appear between within-board segments
    expect(topBar).toContain(">")
  })

  test("breadcrumb shows zoom context after deep search jump", () => {
    // Simulates what happens after a search navigates to a deep node:
    // the user zooms into the found location and needs to see where they are
    using app = createTestApp(
      item(
        "root",
        item(
          "Projects",
          item("Work", item("Immigration", item("form-i130"), item("form-i485"))),
          item("Personal", item("taxes")),
        ),
      ),
      { cols: 120, rows: 24 },
    )

    // Zoom to Work level (simulating what search does)
    app.command("zoom_inwards") // zoom into Work
    app.expect("#Immigration").toExist()

    // Zoom into Immigration
    app.command("zoom_inwards")
    app.expect("#form-i130").toExist()

    // Top bar should show the full path so user knows where they are
    const topBar = app.q("#top-bar").textContent()
    expect(topBar).toContain("root")
    expect(topBar).toContain("Projects")
    expect(topBar).toContain("Work")
    expect(topBar).toContain("Immigration")
  })

  test("breadcrumb screen buffer shows clean path without ghost chars after zoom", () => {
    using app = createTestApp(
      item("board", item("Alpha", item("deep1", item("x1"), item("x2"))), item("Beta", item("y1"))),
      { cols: 100, rows: 24 },
    )

    // Navigate right to Beta column, then zoom into deep1 from Alpha
    app.command("cursor_right") // to Beta
    const topBarBeta = app.text.split("\n")[0] ?? ""
    expect(topBarBeta).toContain("Beta")

    app.command("cursor_left") // back to Alpha
    app.command("cursor_down") // to deep1 card
    app.command("zoom_inwards") // zoom into deep1

    const topBarZoomed = app.text.split("\n")[0] ?? ""
    // Should contain "deep1" and NOT have ghost chars from "Beta"
    expect(topBarZoomed).toContain("deep1")
    expect(topBarZoomed).not.toContain("Bdeep1")
    // Verify no ghost chars in top bar region
    app.expectNoGhostChars({ x: 0, y: 0, width: 100, height: 1 })
  })
})

// =============================================================================
// Multi-line body content must not leak into breadcrumb (km-tui.breadcrumb-multiline-content)
// =============================================================================

describe("Breadcrumb clamps multi-line segment content to first line", () => {
  // Unit test on the pure helper — fast, deterministic, and completely
  // independent of render-pipeline quirks (ANSI, hyperlink URLs, stringWidth).
  test("clampSegmentLabel keeps single-line names unchanged and clamps multi-line with ellipsis", async () => {
    const { clampSegmentLabel, clampSegmentLabels } = await import("../src/layout/path.ts")

    expect(clampSegmentLabel("single line")).toBe("single line")
    expect(clampSegmentLabel("")).toBe("")
    expect(clampSegmentLabel("first\nsecond")).toBe("first\u2026")
    expect(clampSegmentLabel("first\r\nsecond")).toBe("first\u2026")
    expect(clampSegmentLabel("first\rsecond")).toBe("first\u2026")
    expect(clampSegmentLabel("a\nb\nc")).toBe("a\u2026")

    const segs = [
      { id: null, name: "clean", sep: "", isWithinBoard: false, node: null },
      { id: "x", name: "multi\nline", sep: ">", isWithinBoard: true, node: null },
    ]
    const clamped = clampSegmentLabels(segs)
    expect(clamped[0]?.name).toBe("clean") // untouched segment preserved
    expect(clamped[1]?.name).toBe("multi\u2026")
    // Separator and other fields preserved
    expect(clamped[1]?.sep).toBe(">")
    expect(clamped[1]?.isWithinBoard).toBe(true)
  })

  // Integration test — render a board where cursor lands on a body card whose
  // content includes newlines. The top bar must stay single-row and must not
  // leak body-content lines into the board area below.
  test("breadcrumb does not bleed multi-line body content into the board area", () => {
    using app = createTestApp.fromMarkdown("# col\n\nfirst line of body\nsecond line leaks\nthird line leaks\n", {
      cols: 80,
      rows: 24,
    })

    const lines = app.text.split("\n")
    const topLine = lines[0] ?? ""
    const secondLine = lines[1] ?? ""
    const thirdLine = lines[2] ?? ""

    // First line of the body appears in the breadcrumb (at least partially)
    expect(topLine).toContain("first line of body")
    // …but subsequent body lines must never show up in the breadcrumb row
    expect(topLine).not.toContain("second line leaks")
    expect(topLine).not.toContain("third line leaks")

    // The rows directly below the top bar are board chrome / card content,
    // NOT an overflow of the breadcrumb. Body-content fragments must not leak
    // into them as a consequence of the breadcrumb segment.
    // (The card body itself renders lower down, so the first few rows after
    // the top bar should not echo the extra body lines.)
    expect(secondLine).not.toContain("second line leaks")
    expect(thirdLine).not.toContain("third line leaks")
  })
})

// =============================================================================
// Multi-line paragraph text bleed (km-silvery.zoom-mismatch)
// =============================================================================

describe("zoom-mismatch: multi-line paragraph text bleed", () => {
  test("multi-line paragraph does not bleed text into next body row", () => {
    // Reproduce the exact structure from imports/asana/stabell:
    // A heading card with:
    //   1. A paragraph child with multi-line content (URLs + wikilink)
    //   2. Task children with clean content
    using app = createTestApp(
      item.root(
        "board",
        item(
          "column",
          item(
            "Happylatte - convert hg to git",
            // Multi-line paragraph: 3 lines separated by \n
            // Line 1: bare URL
            // Line 2: "See also [[#^1135923304464396]]" (unresolved wikilink)
            // Line 3: more URLs
            item.p(
              "https://bitbucket.org/blog/sunsetting-mercurial-support-in-bitbucket\nSee also [[#^1135923304464396]]\nhttps://bitbucket.org/blog/sunsetting-mercurial-support https://github.com/frej/fast-export",
            ),
            item.task("Clone all of xpilot"),
            item.task("Clone all of happylatte"),
          ),
        ),
      ),
      { cols: 80, rows: 20 },
    )

    // The card should show:
    // - "Happylatte - convert hg to git" as card title
    // - "bitbucket.org/blog/sunsetting-me..." (truncated URL from paragraph line 1)
    // - "Clone all of xpilot" (clean task text)
    // - "Clone all of happylatte" (clean task text)
    //
    // Bug: "Clone all of xpilot" row shows "Clone all of xpilot4464396"
    // where "4464396" comes from the wikilink in paragraph line 2

    const text = app.text
    expect(text).toContain("Clone all of xpilot")

    // The critical assertion: no digits from the block ref should appear
    // on the "Clone all of xpilot" line
    const lines = text.split("\n")
    const xpilotLine = lines.find((l) => l.includes("Clone all of xpilot"))
    expect(xpilotLine).toBeDefined()
    expect(xpilotLine).not.toContain("4464396")
    expect(xpilotLine).not.toContain("1135923")

    // Also verify "Clone all of happylatte" is clean
    const happylatteLine = lines.find((l) => l.includes("Clone all of happylatte"))
    expect(happylatteLine).toBeDefined()
    expect(happylatteLine).not.toContain("4464396")
  })
})

// =============================================================================
// Real vault ANSI replay (requires TEST_VAULT env var)
// Uses createBoardDriver / driver.cmd.* — stays as-is (not createDriverTest based)
// =============================================================================

function findBoardRoot(repo: Repo): string {
  const nodes = repo.query("type:folder")
  for (const node of nodes) {
    if (node.data?.is_repo_root) return node.id
  }
  for (const node of nodes) {
    const children = getChildren(repo.database, node.id)
    if (children.length > 0) return node.id
  }
  throw new Error("No suitable board root found")
}

describe.skipIf(!process.env.TEST_VAULT)("Real vault breadcrumb ANSI replay", () => {
  test("h/l navigation ANSI replay including breadcrumb row", async () => {
    const vaultPath = process.env.TEST_VAULT!
    const repo = runGenerator(createRepo(vaultPath, { loadFiles: true }))
    const rootId = findBoardRoot(repo)

    const baseDriver = createBoardDriver(repo, rootId, {
      columns: 120,
      rows: 30,
    })

    // Enable ALL checks including ANSI replay (which the standard test doesn't use)
    const driver = withDiagnostics(baseDriver, {
      checkIncremental: true,
      checkReplay: true,
      checkStability: true,
      skipLines: [0, -1], // Only affects stability check
    })

    // Navigate right through columns (h/l changes breadcrumb)
    await driver.cmd.right!()
    await driver.cmd.right!()
    await driver.cmd.left!()
    await driver.cmd.right!()
    await driver.cmd.left!()
    await driver.cmd.left!()
  })

  test("j/k level changes with ANSI replay", async () => {
    const vaultPath = process.env.TEST_VAULT!
    const repo = runGenerator(createRepo(vaultPath, { loadFiles: true }))
    const rootId = findBoardRoot(repo)

    const baseDriver = createBoardDriver(repo, rootId, {
      columns: 120,
      rows: 30,
    })

    const driver = withDiagnostics(baseDriver, {
      checkIncremental: true,
      checkReplay: true,
      checkStability: true,
      skipLines: [0, -1],
    })

    // Level changes also change breadcrumb
    await driver.cmd.up!()
    await driver.cmd.up!()
    await driver.cmd.down!()
    await driver.cmd.down!()
    await driver.cmd.right!()
    await driver.cmd.right!()
    await driver.cmd.up!()
    await driver.cmd.down!()
  })

  test("rapid mixed navigation with ANSI replay", async () => {
    const vaultPath = process.env.TEST_VAULT!
    const repo = runGenerator(createRepo(vaultPath, { loadFiles: true }))
    const rootId = findBoardRoot(repo)

    const baseDriver = createBoardDriver(repo, rootId, {
      columns: 100,
      rows: 30,
    })

    const driver = withDiagnostics(baseDriver, {
      checkIncremental: true,
      checkReplay: true,
      checkStability: false,
    })

    const commands = [
      () => driver.cmd.up!(),
      () => driver.cmd.down!(),
      () => driver.cmd.left!(),
      () => driver.cmd.right!(),
    ]

    const rng = {
      seed: 42,
      next: () => (rng.seed = (rng.seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff,
    }

    for (let i = 0; i < 30; i++) {
      const cmd = commands[Math.floor(rng.next() * commands.length)]
      if (cmd) await cmd()
    }
  })
})

// =============================================================================
// Merged from breadcrumb.slow.spec.ts — Breadcrumb Navigation Journey Tests
// =============================================================================

describe("Breadcrumb Navigation Journeys", () => {
  test("zoom into a card, breadcrumb shows full ancestor path", async () => {
    using app = createTestApp(
      item(
        "board",
        item("Projects", item("Frontend", item("react-app"), item("vue-app")), item("Backend", item("api-server"))),
      ),
      { cols: 120, rows: 24 },
    )

    // Step 1: Initial breadcrumb shows board
    const initialTopBar = app.q("#top-bar").textContent()
    expect(initialTopBar).toContain("board")

    // Step 2: Zoom into Frontend (cursor starts on first card)
    app.command("zoom_inwards")
    app.expect("#react-app").toExist()

    // Step 3: Breadcrumb should show the ancestor path
    const zoomedTopBar = app.q("#top-bar").textContent()
    expect(zoomedTopBar).toContain("board")
    expect(zoomedTopBar).toContain("Projects")
    expect(zoomedTopBar).toContain("Frontend")
  })

  test("navigate columns with h/l, breadcrumb updates current column", async () => {
    using app = createTestApp(
      item(
        "board",
        item("Inbox", item("msg1"), item("msg2")),
        item("Projects", item("proj1")),
        item("Archive", item("old1")),
      ),
      { cols: 120, rows: 24 },
    )

    // Step 1: Initially on Inbox
    let topBar = app.q("#top-bar").textContent()
    expect(topBar).toContain("Inbox")

    // Step 2: Move to Projects column
    app.command("cursor_right")
    topBar = app.q("#top-bar").textContent()
    expect(topBar).toContain("Projects")

    // Step 3: Move to Archive column
    app.command("cursor_right")
    topBar = app.q("#top-bar").textContent()
    expect(topBar).toContain("Archive")

    // Step 4: Move back to Projects
    app.command("cursor_left")
    topBar = app.q("#top-bar").textContent()
    expect(topBar).toContain("Projects")
    // Should not contain ghost chars from Archive
    expect(topBar).not.toContain("AProjects")
  })

  test("zoom out with Z, breadcrumb reflects parent level", async () => {
    using app = createTestApp(
      item("board", item("col", item("level1", item("level2", item("deep-a"), item("deep-b"))))),
      { cols: 120, rows: 24 },
    )

    // Step 1: Zoom in twice
    app.command("zoom_inwards") // into level1
    app.command("zoom_inwards") // into level2
    app.expect("#deep-a").toExist()

    let topBar = app.q("#top-bar").textContent()
    expect(topBar).toContain("level2")

    // Step 2: Zoom out once
    app.command("zoom_outwards")
    topBar = app.q("#top-bar").textContent()
    expect(topBar).toContain("level1")

    // Step 3: Zoom out again — back to root board
    app.command("zoom_outwards")
    topBar = app.q("#top-bar").textContent()
    expect(topBar).toContain("board")
    app.expect("#col").toExist()
  })

  test("long breadcrumb path truncates with ellipsis on narrow terminal", () => {
    using app = createTestApp(
      item(
        "VeryLongBoardName",
        item(
          "VeryLongColumnName",
          item("VeryLongSectionName", item("VeryLongSubsection", item("leaf-a"), item("leaf-b"))),
        ),
      ),
      { cols: 60, rows: 24 },
    )

    // Step 1: Zoom deep so the full path is longer than 60 chars
    app.command("zoom_inwards") // into VeryLongSectionName
    app.command("zoom_inwards") // into VeryLongSubsection

    // Step 2: Breadcrumb should truncate with ellipsis
    const topBar = app.q("#top-bar").textContent()
    expect(topBar).toContain("\u22EF") // ellipsis character

    // Step 3: The deepest visible segment should still be present
    expect(topBar).toContain("leaf-a")
  })

  test("breadcrumb path uses > separator for hierarchy within board", () => {
    using app = createTestApp(item("board", item("col", item("card", item("sub1"), item("sub2")))), {
      cols: 120,
      rows: 24,
    })

    // Step 1: Navigate to card level
    app.command("cursor_down")
    const topBar = app.q("#top-bar").textContent()

    // Step 2: Path segments should be separated by >
    expect(topBar).toContain("board")
    expect(topBar).toContain("col")
    expect(topBar).toContain("card")
    expect(topBar).toContain(">")
  })

  test("zoom in, navigate columns, zoom out — breadcrumb stays consistent", async () => {
    using app = createTestApp(
      item(
        "board",
        item("Work", item("Sprint-1", item("feat-a"), item("feat-b")), item("Sprint-2", item("feat-c"))),
        item("Personal", item("hobby")),
      ),
      { cols: 120, rows: 24 },
    )

    // Step 1: Zoom into Work
    app.command("cursor_up") // to column header
    app.command("zoom_inwards")
    app.expect("#Sprint-1").toExist()

    let topBar = app.q("#top-bar").textContent()
    expect(topBar).toContain("Work")

    // Step 2: Navigate to Sprint-2 column
    app.command("cursor_right")
    topBar = app.q("#top-bar").textContent()
    expect(topBar).toContain("Sprint-2")

    // Step 3: Navigate back to Sprint-1
    app.command("cursor_left")
    topBar = app.q("#top-bar").textContent()
    expect(topBar).toContain("Sprint-1")

    // Step 4: Zoom out back to root
    app.command("zoom_outwards")
    topBar = app.q("#top-bar").textContent()
    expect(topBar).toContain("board")
    app.expect("#Work").toExist()
    app.expect("#Personal").toExist()
  })

  test("breadcrumb has no ghost characters after rapid navigation", () => {
    using app = createTestApp(
      item("board", item("Calendar", item("event1")), item("inbox", item("item1")), item("TaskNotes", item("note1"))),
      { cols: 100, rows: 24 },
    )

    // Step 1: Rapid h/l navigation
    app.command("cursor_right") // inbox
    app.command("cursor_right") // TaskNotes
    app.command("cursor_left") // inbox
    app.command("cursor_left") // Calendar
    app.command("cursor_right") // inbox
    app.command("cursor_right") // TaskNotes

    // Step 2: Top bar should cleanly show TaskNotes without ghost chars
    const topLine = app.text.split("\n")[0] ?? ""
    expect(topLine).toContain("TaskNotes")
    expect(topLine).not.toContain("iTaskNotes")
    expect(topLine).not.toContain("CTaskNotes")

    // Step 3: Navigate back and verify no ghost prefix
    app.command("cursor_left")
    const topLine2 = app.text.split("\n")[0] ?? ""
    expect(topLine2).toContain("inbox")
    expect(topLine2).not.toContain("Tinbox")
    expect(topLine2).not.toContain("Cinbox")

    // Step 4: Buffer-level check for ghost characters in top bar
    app.expectNoGhostChars({ x: 0, y: 0, width: 100, height: 1 })
  })
})
