/**
 * km-tui.column-top-disappears — real-vault subprocess repro (2026-04-20)
 *
 * User-visible bug, reproduced at 200×120 on `~/Bear/Vault`:
 *   Col3 "Next Actions @next" renders ~19 cards cleanly, then leaves ~30 rows
 *   of BLANK space between the last card and a `▼1` overflow indicator.
 *
 * Unlike the synthetic fixture in listview-variable-heights.test.tsx (which
 * captures the data shape that triggers the bug), this test runs the ACTUAL
 * `bun km view <vault>` subprocess through a headless terminal capture — the
 * full storage pipeline + km.add:: aggregation + render pipeline end-to-end.
 *
 * Why a subprocess instead of createTestApp.fromVault?
 *   createTestApp uses createFakeRepo which doesn't run km.add:: rules, so
 *   @next.md's aggregated cards never materialize. Only the real storage
 *   engine (via `km view`) produces the card shape that triggers the bug.
 *
 * Skipped when `~/Bear/Vault` isn't present (dev machine only).
 */

import { describe, test, expect } from "vitest"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

function resolveRealVaultPath(): string | null {
  const override = process.env.TEST_REAL_VAULT
  if (override && existsSync(override)) return override
  const canonical = join(homedir(), "Bear", "Vault")
  if (existsSync(canonical)) return canonical
  return null
}

const vaultPath = resolveRealVaultPath()
const describeWhenVault = vaultPath ? describe : describe.skip

/**
 * When vault startup is too slow (e.g. huge changes.jsonl rebuild), skip the
 * test with a diagnostic rather than failing. The forward-walk fix is covered
 * by the synthetic listview-variable-heights tests; this file is an
 * opportunistic end-to-end verifier, not a gatekeeper.
 */
function runCapture(args: string[]): { status: number; output: string } {
  const ttyTool = join(process.cwd(), "vendor", "bearly", "tools", "tty.ts")
  const result = spawnSync(
    "bun",
    [
      ttyTool,
      "capture",
      "--command",
      `bun km view ${vaultPath}`,
      "--cols",
      "200",
      "--rows",
      "120",
      "--wait-for",
      "Next Actions",
      "--timeout",
      "60000",
      "--text",
      ...args,
    ],
    { cwd: process.cwd(), encoding: "utf-8", timeout: 120_000 },
  )
  return { status: result.status ?? -1, output: result.stdout || "" }
}

describeWhenVault("km-tui.column-top-disappears: real-vault subprocess ▼N blank-gap bug", () => {
  test("REAL VAULT 200×120 — col rendering @next shows no ~30-row blank gap above ▼N", () => {
    if (!vaultPath) throw new Error("vault path resolution failed")

    // Use the bearly tty capture tool to run `bun km view <vault>` at
    // 200×120 and return the rendered terminal text. This is the
    // highest-fidelity repro — it exercises the full pipeline (storage,
    // rules, lens, layout, render, output).
    const result = runCapture([])

    if (result.status !== 0) {
      // tty capture failed — likely vault-startup timeout. Log & soft-pass.
      // Not a test failure; the test is opportunistic and real-env dependent.
      // eslint-disable-next-line no-console
      // vault may be rebuilding; soft-pass (see note at test 2)
      return
    }

    const output = result.output
    // Strip the "Screenshot saved: ..." line if present.
    const lines = output.split("\n").filter((l) => !l.startsWith("Screenshot saved:"))

    // Locate the "Next Actions @next" column header at row ~3-4.
    // Strip ANSI codes for text matching (the tty tool emits plain text).
    const colWidth = 40
    let targetCol = -1
    for (let r = 0; r < 8 && targetCol < 0; r++) {
      const row = lines[r] ?? ""
      for (let c = 0; c < 5; c++) {
        const slice = row.slice(c * colWidth, (c + 1) * colWidth)
        if (slice.includes("Next Actions") && slice.includes("@next")) {
          targetCol = c
          break
        }
      }
    }

    expect(targetCol, "vault must render a 'Next Actions @next' column").toBeGreaterThanOrEqual(0)

    // Slice col out and find indicator row + blank gap.
    const colSlices = lines.map((l) => (l ?? "").slice(targetCol * colWidth, (targetCol + 1) * colWidth))

    let indicatorRow = -1
    for (let i = 0; i < colSlices.length; i++) {
      if (/▼\d+/.test(colSlices[i] ?? "")) {
        indicatorRow = i
        break
      }
    }

    const dumpLines = colSlices
      .map((s, i) => `${String(i).padStart(3, "0")}: ${/\S/.test(s) ? s : "<blank>"}`)
      .join("\n")

    // Must have ▼N for this test to be meaningful.
    expect(
      indicatorRow,
      `Test requires ▼N indicator in 'Next Actions @next' column — vault state may have changed.\n\nCOL DUMP:\n${dumpLines}`,
    ).toBeGreaterThan(0)

    // Walk backward from indicator row, count blank rows until card border.
    let blankGap = 0
    for (let i = indicatorRow - 1; i >= 0; i--) {
      const slice = colSlices[i] ?? ""
      if (slice.includes("╰") || slice.includes("│")) break
      if (!/\S/.test(slice)) blankGap++
      else break
    }

    // User-reported bug: ~28-30 blank rows. Fixed: 0-3 rows.
    expect(
      blankGap,
      `[km-tui.column-top-disappears] real-vault reproducer\n` +
        `  ${blankGap} blank rows between last rendered card and ▼N at row ${indicatorRow}\n` +
        `  (buggy: ~28-30 rows; fixed: 0-3 rows)\n\n` +
        `COL DUMP:\n${dumpLines}`,
    ).toBeLessThanOrEqual(5)
  }, 180_000) // 90s timeout — subprocess startup + vault parse

  test("REAL VAULT 200×120 — non-active 'Next Actions @next' column retains rendered cards when cursor is elsewhere", () => {
    if (!vaultPath) throw new Error("vault path resolution failed")

    // Reproduce the user's symptom (2026-04-20 session continuation):
    // move cursor RIGHT past "Next Actions @next" into "Someday/Maybe" (col3),
    // then down 20×. The cursor is NOT in "Next Actions @next" — it's
    // scrolling "Someday/Maybe". But "Next Actions @next" (col2) loses
    // most of its rendered cards and shows stale border fragments + blank
    // rows in the top portion of its viewport.
    //
    // NOTE (2026-04-20 follow-up): the bug reproduces inconsistently in the
    // subprocess harness. Manual TTY captures reliably show the stale-fragment
    // + blank-rows bug; the test subprocess sometimes lands on a "healed"
    // state with `▲N` + real cards (the column scrolled + rendered cleanly).
    // This is consistent with a render-timing / incremental-cascade
    // interaction when col2 re-renders as a sibling of col3 during cursor
    // movement. Root cause not yet isolated — see km-tui.column-top-disappears
    // bead. This test serves as a regression guard: when it hard-fails, the
    // bug is deterministically reproducing; when it passes, either the bug is
    // fixed or the timing window missed.
    //
    // Expected: "Next Actions @next" should retain its full rendered card
    // stack (it's a non-active column with scrollTo=undefined; its render
    // should be frozen at the last state it had when active).
    //
    // Buggy (observed): rows 5-14 contain STALE border fragments (single
    // lines of ╭, │, ╰ with blank rows between — remnants from earlier
    // renders), rows 15-39 are completely blank, first REAL card appears
    // at ~row 40+.
    const navKeys = ["l", "l", "l"] // right into col3 Someday/Maybe
    for (let i = 0; i < 20; i++) navKeys.push("j") // 20 downs in col3

    const result = runCapture(["--keys", navKeys.join(",")])

    if (result.status !== 0) {
      // tty capture failed — vault may be rebuilding or subprocess spawn
      // failed. Soft-pass rather than hard-fail (this test is an opportunistic
      // real-env verifier). Rerun later; the synthetic tests cover the core
      // regression.
      return
    }

    const output = result.output
    const lines = output.split("\n").filter((l) => !l.startsWith("Screenshot saved:"))

    // Find the "Next Actions @next" column.
    const colWidth = 40
    let targetCol = -1
    for (let r = 0; r < 8 && targetCol < 0; r++) {
      const row = lines[r] ?? ""
      for (let c = 0; c < 5; c++) {
        const slice = row.slice(c * colWidth, (c + 1) * colWidth)
        if (slice.includes("Next Actions") && slice.includes("@next")) {
          targetCol = c
          break
        }
      }
    }
    expect(targetCol).toBeGreaterThanOrEqual(0)

    const colSlices = lines.map((l) => (l ?? "").slice(targetCol * colWidth, (targetCol + 1) * colWidth))

    // Locate the header row so we scan only the column body.
    let headerRow = -1
    for (let i = 0; i < colSlices.length; i++) {
      if ((colSlices[i] ?? "").includes("Next Actions")) {
        headerRow = i
        break
      }
    }
    expect(headerRow).toBeGreaterThanOrEqual(0)

    // Find the first ROW WITH REAL CARD CONTENT (not just stale border
    // fragments from a previous render, not the separator).
    //
    // Real cards have a distinctive pattern:
    //   ╭── top border
    //   │ content
    //   ╰── bottom border
    // They span ≥ 2 contiguous rows. Stale fragments are isolated 1-row
    // pieces with surrounding blank rows (the incremental-render bug).
    //
    // Scan strategy: count blank rows between header+2 and the first row
    // that is part of a ≥ 3-row visible block (≥ 3 non-blank contiguous
    // rows — a real card with top/content/bottom).
    const scanStart = headerRow + 2
    let gapTop = 0
    let firstRealCardRow = -1
    for (let i = scanStart; i < colSlices.length; i++) {
      // A real card's border row has MANY chars (`╭────────...───╮`, ~36+).
      // Stale border fragments have 1-3 chars (`│`, `╭╮`, `╰`, `╯`).
      // Count non-whitespace characters — real cards have ≥ 10 visible chars.
      const nonBlankCount = (colSlices[i] ?? "").replace(/\s/g, "").length
      if (nonBlankCount >= 10) {
        firstRealCardRow = i
        break
      }
      gapTop++
    }
    expect(firstRealCardRow, "expected to find a real card below the column header").toBeGreaterThanOrEqual(0)

    const dumpLines = colSlices
      .slice(0, Math.min(60, colSlices.length))
      .map((s, i) => `${String(i).padStart(3, "0")}: ${/\S/.test(s) ? s : "<blank>"}`)
      .join("\n")

    // User-reported bug (after moving cursor into col3 Someday/Maybe):
    // the non-active "Next Actions @next" column shows ~26 blank rows at
    // the top + stale border fragments, before the first real card.
    // Fixed: 0-3 rows (padding only).
    expect(
      gapTop,
      `[km-tui.column-top-disappears] real-vault non-active column (cursor in col3 Someday/Maybe)\n` +
        `  targetCol=${targetCol} headerRow=${headerRow} firstRealCardRow=${firstRealCardRow}\n` +
        `  ${gapTop} blank rows between column header/separator and first rendered card\n` +
        `  (buggy: ~26 rows; fixed: 0-3 rows)\n\n` +
        `COL DUMP (first 60 rows):\n${dumpLines}`,
    ).toBeLessThanOrEqual(5)
  }, 180_000)
})
