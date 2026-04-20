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

describeWhenVault("km-tui.column-top-disappears: real-vault subprocess ▼N blank-gap bug", () => {
  test(
    "REAL VAULT 200×120 — col rendering @next shows no ~30-row blank gap above ▼N",
    () => {
      if (!vaultPath) throw new Error("vault path resolution failed")

      // Use the bearly tty capture tool to run `bun km view <vault>` at
      // 200×120 and return the rendered terminal text. This is the
      // highest-fidelity repro — it exercises the full pipeline (storage,
      // rules, lens, layout, render, output).
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
          "30000",
          "--text",
        ],
        {
          cwd: process.cwd(),
          encoding: "utf-8",
          timeout: 60_000,
        },
      )

      if (result.status !== 0) {
        throw new Error(`tty capture failed (status=${result.status}): ${result.stderr || result.stdout}`)
      }

      const output = result.stdout
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
    },
    90_000, // 90s timeout — subprocess startup + vault parse
  )
})
