/**
 * Regression tests for emoji rendering garble.
 *
 * Root cause: replayAnsiWithStyles in output-phase.ts had a ZWJ combining bug.
 * Characters after ZWJ (U+200D) — like ♂ (U+2642) in 🏃‍♂️ — were not consumed
 * as part of the grapheme cluster, splitting the emoji across multiple columns
 * and causing progressive cursor drift in the virtual terminal replay.
 *
 * These tests verify that INKX_STRICT (which includes INKX_STRICT_OUTPUT)
 * catches no mismatches when rendering emoji content.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

beforeEach(() => {
  process.env.INKX_STRICT = "1"
})
afterEach(() => {
  delete process.env.INKX_STRICT
})

describe("emoji content garble reproduction", () => {
  test("cards with flag emoji + navigation", () => {
    const nodes = item(
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
    const { board } = testEnv(() => nodes, { cols: 120, rows: 30 })

    // Navigate through emoji columns
    for (const key of ["l", "l", "j", "j", "h", "j", "k", "l", "h", "h"]) {
      board.press(key)
    }
  })

  test("mixed emoji and ASCII — navigation doesn't garble", () => {
    const nodes = item(
      "board",
      item(
        "#routine",
        item("07:30 Morning routine 🏃‍♂️"),
        item("08:00 Breakfast ☕"),
        item("09:00 Work start 💻"),
        item("12:00 Lunch 🍽️"),
        item("17:00 Exercise 🏋️‍♂️"),
      ),
      item("Harmon from Modo called", item("Follow up on proposal"), item("Send contract 📄")),
      item("Calendar", item("10:00 Standup"), item("14:00 1:1 with @bjørn-st"), item("15:30 Demo prep")),
    )
    const { board } = testEnv(() => nodes, { cols: 100, rows: 25 })

    // Navigate — INKX_STRICT checks buffer + output on each press
    for (const key of ["l", "l", "j", "j", "j", "h", "h", "k", "k", "l", "j"]) {
      board.press(key)
    }
  })

  test("wide chars with extensive navigation", () => {
    const nodes = item(
      "board",
      item(
        "Tasks",
        item("Buy groceries 🛒"),
        item("Call dentist ☎️"),
        item("Book flights ✈️"),
        item("Return package 📦"),
        item("Fix bike 🔧"),
        item("Water plants 🌱"),
      ),
      item("Goals", item("Learn Japanese 🇯🇵"), item("Run marathon 🏃"), item("Read 50 books 📚")),
    )
    const { board } = testEnv(() => nodes, { cols: 80, rows: 20 })

    // Navigate extensively — INKX_STRICT catches any mismatch
    const sequence = ["j", "j", "j", "l", "j", "j", "h", "k", "k", "l", "l", "j", "j", "j", "k", "h", "j", "j"]
    for (const key of sequence) {
      board.press(key)
    }
  })
})
