/**
 * cursor-startup — process-harness regression test for the bug where the
 * hardware cursor parks in the side-panel quota line instead of the
 * command region after the very first frame.
 *
 * History: this assertion was originally wanted in
 * `tests/visual/queue-cursor.test.tsx` but was dropped because the in-process
 * termless harness resolves silvery's `nonTTYMode` to "line-by-line" — the
 * scheduler then suppresses the cursor-positioning ANSI (scheduler.ts:568)
 * and xterm.js never sees the move. The process harness fixes that: the
 * subprocess sees a real PTY (`process.stdout.isTTY === true`), silvery
 * picks the TTY scheduler path, and the cursor ANSI lands at the command
 * region just like in production.
 *
 * Tracking bead: km-silvercode.cursor-startup-position (P1)
 *
 * Note: this test is `.slow.` because spawning a fresh `bun` process and
 * waiting for the App to settle takes ~1-2 seconds — we don't want it in
 * the fast path. The default vitest project picks up `.test.tsx` only.
 */

import { describe, expect, test } from "vitest"
import { spawnSilvercode } from "../process-harness/index.ts"

const COLS = 120
const ROWS = 40

describe("silvercode startup cursor (process harness)", () => {
  test("welcome screen mounts and renders the product title", async () => {
    await using harness = await spawnSilvercode({ cols: COLS, rows: ROWS })
    await harness.waitFor("Silver Code for Claude Code", { timeoutMs: 15_000 })
    expect(harness.screen).toContainText("Silver Code for Claude Code")
    expect(harness.alive).toBe(true)
  }, 30_000)

  test("hardware cursor lands at the command prompt, not the side panel", async () => {
    await using harness = await spawnSilvercode({ cols: COLS, rows: ROWS })

    // Wait for the welcome card AND a side-panel-stable signal so we know
    // both regions have rendered. The bug manifests once both regions
    // exist — if we sample too early we miss the side-panel write that
    // parks the cursor.
    await harness.waitFor("Silver Code for Claude Code", { timeoutMs: 15_000 })
    await harness.waitForStable({ stableMs: 400, timeoutMs: 15_000 })

    const cursor = harness.term.getCursor()

    // termless CursorState uses (x = column, y = row), 0-indexed. The buggy
    // state parks the cursor at the bottom-right of the screen (last cell
    // written by the side panel's quota / status lines). Healthy state
    // parks at the command prompt — column ~8, row ~36 in 120x40.
    //
    // We use a tolerant shape: row in the bottom 40% AND column in the
    // left 70%. Both must be true. Either alone could pass false-positive
    // for adjacent layout regions. xterm's "wrap pending" state can put
    // x at exactly COLS (e.g. 120) — accept that as the bug.

    // Sanity: cursor at most one past the right edge (xterm pending-wrap),
    // and y is on-screen.
    expect(cursor.y).toBeGreaterThanOrEqual(0)
    expect(cursor.y).toBeLessThan(ROWS)
    expect(cursor.x).toBeGreaterThanOrEqual(0)
    expect(cursor.x).toBeLessThanOrEqual(COLS)

    const expectedMaxX = Math.floor(COLS * 0.7) // 84 in 120-wide
    const expectedMinY = Math.floor(ROWS * 0.6) // 24 in 40-tall

    const inCommandRegion = cursor.x < expectedMaxX && cursor.y >= expectedMinY

    expect(
      inCommandRegion,
      `Cursor at (${cursor.x}, ${cursor.y}) is NOT in the command region. ` +
        `Expected x < ${expectedMaxX} AND y >= ${expectedMinY}. ` +
        `This is the cursor-startup bug (km-silvercode.cursor-startup-position): ` +
        `the hardware cursor parks in the side panel / status area on first frame ` +
        `instead of at the "> " prompt. After the fix lands, cursor should be at ` +
        `roughly (8, ${ROWS - 3}) — right of the prompt in the bottom command box.\n` +
        `--- screen ---\n${harness.screen.getText()}\n--- end screen ---`,
    ).toBe(true)
  }, 30_000)
})
