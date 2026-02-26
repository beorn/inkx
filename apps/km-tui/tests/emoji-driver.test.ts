/**
 * Test emoji rendering using createBoardDriver to bypass testEnv harness.
 * Verifies that the garble issue isn't just a testEnv comparison artifact.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { createBoardDriver } from "../src/driver.ts"
import { item } from "./helpers/board-test.ts"

beforeEach(() => {
  process.env.INKX_STRICT = "1"
})
afterEach(() => {
  delete process.env.INKX_STRICT
})

describe("emoji rendering via driver", () => {
  test("flag emoji navigation does not garble", async () => {
    const nodes = item.root(
      "board",
      item(
        "🇨🇦 Canada Tasks",
        item("🏠 Fix roof"),
        item("👨🏻‍💻 Code review"),
        item("🔸 Priority item"),
        item("📱 Mobile app"),
      ),
      item("🇺🇸 US Tasks", item("💼 Business meeting"), item("📊 Q4 Report"), item("🎯 Sprint goal")),
      item("Regular Column", item("Plain task A"), item("Plain task B")),
    )
    const { createFakeRepo } = await import("@km/storage")
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board", {
      columns: 120,
      rows: 30,
      incremental: true,
    })

    // Navigate — INKX_STRICT checks buffer + output on each press
    for (const key of ["l", "l", "j", "j", "h", "j", "k", "l", "h", "h"]) {
      await driver.press(key)
    }
    expect(true).toBe(true)
  })

  test("mixed emoji and ASCII", async () => {
    const nodes = item.root(
      "board",
      item("#routine", item("07:30 Morning routine 🏃‍♂️"), item("08:00 Breakfast ☕"), item("09:00 Work start 💻")),
      item("Calendar", item("10:00 Standup"), item("14:00 1:1 with @bjørn")),
    )
    const { createFakeRepo } = await import("@km/storage")
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board", {
      columns: 100,
      rows: 25,
      incremental: true,
    })

    for (const key of ["l", "j", "j", "h", "k", "l", "j"]) {
      await driver.press(key)
    }
    expect(true).toBe(true)
  })
})
