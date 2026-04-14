/**
 * Regression test for km-tui.detail-view-bg-conflict
 *
 * Pressing 'D' (detail view) on a card containing a +project wikilink
 * caused a chalk bg=brightWhite conflict with silvery's buffer bg.
 *
 * The bug appeared when DetailView rendered a card whose content
 * had inline references like `[[+taxes]] — reply to @Shubam` — the
 * inline-rendering path emitted a chalk-style ANSI bg sequence
 * (`\u001b[107m`) that clashed with silvery's buffer-bg model.
 *
 * Repro: bun km view ~/Bear/Vault → @agent column → press D
 *
 * Test strategy: render a board containing a representative card
 * (broken wikilink + project + mention), open the detail pane,
 * and verify no "Background conflict" warning is emitted by the
 * silvery render pipeline.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { setBgConflictMode, clearBgConflictWarnings } from "@silvery/ag-term/pipeline"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

describe("DetailView bg conflict regression", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Use 'warn' mode + a console.warn spy: a 'throw' would only catch the
    // FIRST conflict per render (subsequent ones swallowed by the early
    // exit), and would also abort the render before downstream cells get a
    // chance to surface their own conflicts. Warn mode collects every
    // distinct conflict into the spy.
    setBgConflictMode("warn")
    clearBgConflictWarnings()
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
    errorSpy.mockRestore()
    setBgConflictMode("throw")
  })

  /** Aggregate any "[silvery] Background conflict" messages from spies. */
  function bgConflicts(): string[] {
    const out: string[] = []
    for (const calls of [warnSpy.mock.calls, errorSpy.mock.calls]) {
      for (const call of calls) {
        const msg = (call as unknown[]).map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")
        if (msg.includes("Background conflict")) out.push(msg)
      }
    }
    return out
  }

  test("opening detail pane on a body block with +project wikilink does not emit bg conflict", () => {
    // A card whose content matches the structure that triggered the bug:
    //   body block paragraph → contains broken [[+wiki]] reference + @mention
    // Body blocks now use marginLeft/Right=1 + outline (decoration phase) which
    // is what made the bg conflict observable when DetailView re-renders.
    using app = createTestApp(
      item(
        "board",
        item(
          "@agent",
          item.p("· projects/+Taxes"),
          item("[[+taxes]] @office — reply to @Shubam @WalshKing about Q1 RBC"),
          item("Account Data Pipeline Phase 1 — RBC CA exemplar"),
        ),
      ),
      { cols: 120, rows: 30 },
    )

    // Open the detail pane (the path that crashed in the bug report).
    app.press("D")

    // Detail pane should be visible
    app.expect("#main-detail").toExist()

    // No bg conflicts produced by the detail pane render.
    const conflicts = bgConflicts()
    expect(conflicts, conflicts.join("\n")).toEqual([])
  })

  test("navigating cards inside the detail pane does not emit bg conflict", () => {
    // Multi-card scenario — moving the cursor through body blocks while
    // detail view is open re-renders the detail pane on every step.
    using app = createTestApp(
      item(
        "board",
        item(
          "@agent",
          item.p("· projects/+Taxes"),
          item.p("· projects/+km/design"),
          item("[[+taxes]] @office — reply to @Shubam"),
          item("Update [[repo-model-and-sigils]] — remove PENDING area"),
          item("Sweep frontmatter — strip_redundant_frontmatter.py"),
        ),
      ),
      { cols: 120, rows: 30 },
    )

    app.press("D") // open detail view
    app.press("j") // move cursor — re-renders detail
    app.press("j")
    app.press("j")
    app.press("k")

    const conflicts = bgConflicts()
    expect(conflicts, conflicts.join("\n")).toEqual([])
  })

  // Real-vault repro — only runs if the user's @agent.md exists on this
  // machine. Synthetic fixtures didn't trigger the original bug because it
  // depended on the exact mix of frontmatter, headings, body blocks, and
  // wikilink resolution patterns in the live file. The vault path is opt-in
  // via TEST_VAULT or defaults to ~/Bear/Vault.
  const vaultPath = process.env.TEST_VAULT ?? join(homedir(), "Bear", "Vault")
  const agentPath = join(vaultPath, "@agent.md")
  const hasAgentFile = existsSync(agentPath)

  test.skipIf(!hasAgentFile)("real @agent.md content survives detail-pane open", () => {
    const md = readFileSync(agentPath, "utf-8")
    using app = createTestApp.fromMarkdown(md, { cols: 120, rows: 30 })

    // Walk through every visible card with detail view OPEN — re-renders
    // detail on every step. Earlier I tried D-only, but the bug requires
    // cursor to be on the body block when the detail pane re-renders.
    app.press("D")
    for (let i = 0; i < 20; i++) {
      app.press("j")
    }
    for (let i = 0; i < 10; i++) {
      app.press("k")
    }

    const conflicts = bgConflicts()
    expect(conflicts, conflicts.join("\n")).toEqual([])
  })
})
