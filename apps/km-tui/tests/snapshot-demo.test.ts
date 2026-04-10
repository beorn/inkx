/**
 * Snapshot demo — exercises TestApp.expectSnapshot() / expectScreenMatches().
 *
 * Both APIs work on headless and termless backends. On headless, snapshots
 * capture normalized stripped text. On termless, they delegate to
 * @termless/test toMatchTerminalSnapshot which emits a numbered grid + header.
 *
 * These tests don't test km behavior — they test the snapshot assertion
 * plumbing in helpers/test-app.ts. Golden files land in
 * apps/km-tui/tests/__snapshots__/snapshot-demo.test.ts.snap.
 */
import { describe, test } from "vitest"
import { createTestApp, realisticBoard } from "./helpers/test-app.ts"

describe("TestApp snapshot assertions", () => {
  test("captures initial board screen as default snapshot", () => {
    using app = createTestApp(realisticBoard(), { cols: 80, rows: 20 })
    app.expectSnapshot()
  })

  test("captures named snapshots after cursor navigation", () => {
    using app = createTestApp(realisticBoard(), { cols: 80, rows: 20 })
    app.expectScreenMatches("initial")
    app.press("j").press("j")
    app.expectScreenMatches("after-two-downs")
  })

  test("multiple expectSnapshot calls in one test produce numbered entries", () => {
    using app = createTestApp(realisticBoard(), { cols: 80, rows: 20 })
    app.expectSnapshot()
    app.press("l")
    app.expectSnapshot()
  })
})
