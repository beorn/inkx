/**
 * Combinatorial curswantY navigation tests.
 *
 * Tests stickyY (cross-column Y-position matching) across a matrix of:
 * - Fixtures: board structures with varying column sizes, card heights, empty columns
 * - Environments: terminal dimensions that trigger vertical/horizontal culling
 * - Sequences: navigation patterns that exercise different code paths
 *
 * Fixtures mimic real vault characteristics: asymmetric columns (9 vs 2 vs 8),
 * cards with varying child counts (tall vs short), mixed empty/populated columns.
 */
import { item } from "./helpers/board-test.ts"
import { createTestApp, type TestApp } from "./helpers/test-app.ts"
import { describe, test, expect } from "vitest"

// =============================================================================
// Helpers
// =============================================================================

/** Generate N leaf items with prefix (e.g., items("A", 5) → A01..A05) */
function items(prefix: string, count: number): ReturnType<typeof item>[] {
  return Array.from({ length: count }, (_, i) => item(`${prefix}${String(i + 1).padStart(2, "0")}`))
}

/** Generate a card with N children (simulates tall cards like in real vaults) */
function tallCard(name: string, childCount: number): ReturnType<typeof item> {
  const children = Array.from({ length: childCount }, (_, i) => item(`${name}-sub${i + 1}`))
  return item(name, ...children)
}

/** Extract column prefix + card number from cursor text (e.g., "B03" → {prefix:"B", num:3}) */
function cursorCardNum(app: TestApp): {
  prefix: string
  num: number
} {
  const text = app.q("[data-cursor]").textContent()
  const match = text.match(/([A-Z])(\d+)/)
  if (!match) throw new Error(`Cannot parse cursor text: "${text}"`)
  return { prefix: match[1]!, num: parseInt(match[2]!, 10) }
}

/** Get cursor text content */
function cursorText(app: TestApp): string {
  return app.q("[data-cursor]").textContent()
}

// =============================================================================
// Fixtures — board structures that exercise different code paths
// =============================================================================

interface Fixture {
  name: string
  /** Card counts per column, or "empty" for 0 cards. Negative = tall card with N children. */
  build: () => ReturnType<typeof item>
  colCount: number
  /** Max cards in any column (for compatibility filter) */
  maxCards: number
  /** Whether fixture has empty columns */
  hasEmpty: boolean
  /** Whether fixture has tall first cards that may absorb nearby Y positions */
  hasTallFirstCards: boolean
}

const fixtures: Fixture[] = [
  {
    // Mimics real vault: ref(9), TaskNotes(2), archive(8)
    name: "vault-like",
    build: () =>
      item(
        "board",
        item(
          "Ref",
          tallCard("A01", 4), // tall card like "Health & Fitness"
          item("A02"),
          tallCard("A03", 3),
          item("A04"),
          item("A05"),
          tallCard("A06", 5), // tall card like "People"
          item("A07"),
          item("A08"),
          item("A09"),
        ),
        item(
          "Tasks",
          tallCard("B01", 6), // tall card like "Tasks"
          item("B02"),
        ),
        item(
          "Archive",
          item("C01"),
          item("C02"),
          item("C03"),
          tallCard("C04", 3),
          item("C05"),
          item("C06"),
          item("C07"),
          item("C08"),
        ),
      ),
    colCount: 3,
    maxCards: 9,
    hasEmpty: false,
    hasTallFirstCards: true,
  },
  {
    // Symmetric baseline — equal columns
    name: "symmetric",
    build: () =>
      item("board", item("ColA", ...items("A", 10)), item("ColB", ...items("B", 10)), item("ColC", ...items("C", 10))),
    colCount: 3,
    maxCards: 10,
    hasEmpty: false,
    hasTallFirstCards: false,
  },
  {
    // Extreme asymmetry — one huge column, one tiny
    name: "asymmetric",
    build: () =>
      item("board", item("ColA", ...items("A", 3)), item("ColB", ...items("B", 15)), item("ColC", ...items("C", 2))),
    colCount: 3,
    maxCards: 15,
    hasEmpty: false,
    hasTallFirstCards: false,
  },
  {
    // Empty middle column — tests header-level navigation and stickyY passthrough
    name: "empty-middle",
    build: () =>
      item(
        "board",
        item("ColA", ...items("A", 5)),
        item("ColB"), // empty
        item("ColC", ...items("C", 5)),
      ),
    colCount: 3,
    maxCards: 5,
    hasEmpty: true,
    hasTallFirstCards: false,
  },
  {
    // Mixed card heights — some tall, some short
    name: "mixed-heights",
    build: () =>
      item(
        "board",
        item(
          "ColA",
          tallCard("A01", 8), // very tall
          item("A02"),
          item("A03"),
        ),
        item("ColB", item("B01"), tallCard("B02", 4), item("B03"), tallCard("B04", 6), item("B05"), item("B06")),
        item("ColC", item("C01"), item("C02"), item("C03")),
      ),
    colCount: 3,
    maxCards: 6,
    hasEmpty: false,
    hasTallFirstCards: true,
  },
  {
    // Many columns — triggers horizontal scroll at small widths
    name: "many-columns",
    build: () =>
      item(
        "board",
        item("C1", ...items("A", 8)),
        item("C2", ...items("B", 8)),
        item("C3", ...items("C", 8)),
        item("C4", ...items("D", 8)),
        item("C5", ...items("E", 8)),
        item("C6", ...items("F", 8)),
      ),
    colCount: 6,
    maxCards: 8,
    hasEmpty: false,
    hasTallFirstCards: false,
  },
  {
    // Culling stress — many cards force VirtualList unmount
    name: "culling-stress",
    build: () =>
      item(
        "board",
        item(
          "ColA",
          tallCard("A01", 12), // very tall first card
          ...Array.from({ length: 39 }, (_, i) => item(`A${String(i + 2).padStart(2, "0")}`)),
        ),
        item("ColB", ...items("B", 20)),
      ),
    colCount: 2,
    maxCards: 40,
    hasEmpty: false,
    hasTallFirstCards: true,
  },
]

// =============================================================================
// Environments — terminal dimensions that trigger different culling
// =============================================================================

interface Env {
  name: string
  cols: number
  rows: number
}

const envs: Env[] = [
  { name: "small", cols: 80, rows: 12 }, // vertical + horizontal culling
  { name: "wide", cols: 210, rows: 12 }, // vertical culling only
  { name: "tall", cols: 80, rows: 200 }, // horizontal culling only
  { name: "large", cols: 210, rows: 200 }, // no culling
]

// =============================================================================
// Navigation sequences
// =============================================================================

interface Sequence {
  name: string
  /** Keypresses to execute */
  keys: string[]
  /** Assertion to run after sequence */
  assert: (app: TestApp, fixture: Fixture) => void
  /** Compatibility filter */
  requires?: {
    minCards?: number
    minCols?: number
    hasEmpty?: boolean
    /** Minimum terminal columns — round-trip sequences need enough width
     *  to keep source column registered during cross-column navigation */
    minEnvCols?: number
    /** Skip fixtures with tall first cards (B01 absorbs stickyY from A02) */
    noTallFirstCards?: boolean
  }
}

const sequences: Sequence[] = [
  {
    name: "round-trip j4→l→h",
    keys: ["j", "j", "j", "j", "l", "h"],
    assert: (app) => {
      // Should return to a card in first column, not first card
      const cursor = cursorCardNum(app)
      expect(cursor.prefix).toBe("A")
      // Went down 4 (to card 5), should be near there (within ±3 of target)
      expect(cursor.num).toBeGreaterThanOrEqual(2)
      expect(cursor.num).toBeLessThanOrEqual(7)
    },
    // Needs wide terminal so source column stays registered during l→h
    requires: { minCards: 5, minEnvCols: 160 },
  },
  {
    name: "multi-hop j3→l→l→h→h",
    keys: ["j", "j", "j", "l", "l", "h", "h"],
    assert: (app) => {
      // Should return to first column near original position
      const cursor = cursorCardNum(app)
      expect(cursor.prefix).toBe("A")
      expect(cursor.num).toBeGreaterThanOrEqual(2)
      expect(cursor.num).toBeLessThanOrEqual(6)
    },
    // Needs wide terminal for round-trip
    requires: { minCards: 4, minCols: 3, minEnvCols: 160 },
  },
  {
    name: "single j→l: basic stickyY",
    keys: ["j", "l"],
    assert: (app) => {
      // After one j and one l, should land on a card in column B.
      // For fixtures with tall first cards, B01 may absorb the stickyY — that's correct.
      const text = cursorText(app)
      expect(text).toMatch(/B\d+/)
    },
    // Skip empty-column fixtures (l into empty column lands on header, not a card)
    requires: { minCards: 3, hasEmpty: false },
  },
  {
    name: "single j→l: not first card (equal heights)",
    keys: ["j", "l"],
    assert: (app) => {
      // With equal-height cards, after 1 j we're at A02, so should match B02
      const text = cursorText(app)
      expect(text).not.toContain("B01")
    },
    // Only valid for fixtures without tall first cards
    requires: { minCards: 3, noTallFirstCards: true },
  },
  {
    name: "deep-scroll j25→l→h",
    keys: [...Array.from({ length: 25 }, () => "j"), "l", "h"],
    assert: (app) => {
      // Should return to a deeply scrolled card, not card 1
      const cursor = cursorCardNum(app)
      expect(cursor.prefix).toBe("A")
      expect(cursor.num).toBeGreaterThanOrEqual(20)
    },
    requires: { minCards: 30, minEnvCols: 160 },
  },
  {
    name: "vertical-clear j3→l→j3→l",
    keys: ["j", "j", "j", "l", "j", "j", "j", "l"],
    assert: (app, _fixture) => {
      // After l, j resets stickyY. Second l should use the new position.
      // We end up in the third column (if available) or stay in second.
      const text = cursorText(app)
      const match = text.match(/([A-Z])(\d+)/)
      if (match) {
        const num = parseInt(match[2]!, 10)
        // Allow card >= 2 since target column may have fewer cards than source
        expect(num).toBeGreaterThanOrEqual(2)
      }
    },
    requires: { minCards: 7, minCols: 3 },
  },
  {
    name: "horizontal-scroll j3→l×4→h×4",
    keys: ["j", "j", "j", "l", "l", "l", "l", "h", "h", "h", "h"],
    assert: (app) => {
      // Should return to first column near original position
      const cursor = cursorCardNum(app)
      expect(cursor.prefix).toBe("A")
      expect(cursor.num).toBeGreaterThanOrEqual(2)
      expect(cursor.num).toBeLessThanOrEqual(6)
    },
    // Needs wide terminal for round-trip across 4+ columns
    requires: { minCards: 4, minCols: 4, minEnvCols: 160 },
  },
]

// =============================================================================
// Compatibility filter
// =============================================================================

function isCompatible(fixture: Fixture, env: Env, seq: Sequence): boolean {
  const req = seq.requires
  if (!req) return true
  if (req.minCards && fixture.maxCards < req.minCards) return false
  if (req.minCols && fixture.colCount < req.minCols) return false
  if (req.hasEmpty === true && !fixture.hasEmpty) return false
  if (req.hasEmpty === false && fixture.hasEmpty) return false
  if (req.minEnvCols && env.cols < req.minEnvCols) return false
  if (req.noTallFirstCards && fixture.hasTallFirstCards) return false
  return true
}

// =============================================================================
// Combinatorial matrix
// =============================================================================

describe("curswantY combinatorial", () => {
  for (const fixture of fixtures) {
    for (const env of envs) {
      for (const seq of sequences) {
        if (!isCompatible(fixture, env, seq)) continue

        test(`[${fixture.name}] [${env.name}] ${seq.name}`, () => {
          using app = createTestApp(fixture.build(), {
            rows: env.rows,
            cols: env.cols,
          })

          // Verify we start at first card
          const startText = cursorText(app)
          expect(startText).toBeTruthy()

          // Execute sequence
          for (const key of seq.keys) {
            app.press(key)
          }

          // Run assertion
          seq.assert(app, fixture)
        }, 30_000) // Culling-stress + deep-scroll (25 presses) at large terminal can take >5s
      }
    }
  }
})

// =============================================================================
// Boundary tests
// =============================================================================

describe("curswantY boundaries", () => {
  test("h at leftmost column: goes to column header, no crash", () => {
    using app = createTestApp(item("board", item("ColA", ...items("A", 5)), item("ColB", ...items("B", 5))), {
      rows: 24,
      cols: 80,
    })

    app.command("cursor_down")
    app.command("cursor_down") // go to A03
    app.command("cursor_left") // goes to column header (not boundary)
    app.expect("#ColA[data-cursor]").toExist()
    // h again is boundary — stays at column header
    app.command("cursor_left")
    app.expect("#ColA[data-cursor]").toExist()
  })

  test("l at rightmost column: no crash, cursor stays", () => {
    using app = createTestApp(item("board", item("ColA", ...items("A", 5)), item("ColB", ...items("B", 5))), {
      rows: 24,
      cols: 80,
    })

    app.command("cursor_down")
    app.command("cursor_down") // go to A03
    app.command("cursor_right") // go to ColB
    app.command("cursor_right") // already at rightmost
    const cursor = cursorCardNum(app)
    expect(cursor.prefix).toBe("B")
  })

  test("h/l at board level: no movement", () => {
    using app = createTestApp(item("board", item("ColA", ...items("A", 3)), item("ColB", ...items("B", 3))), {
      rows: 24,
      cols: 80,
    })

    // Go up to board level
    app.command("cursor_up")
    app.command("cursor_up")
    const boardCursor = app.q("[data-cursor]")
    expect(boardCursor.textContent()).toContain("board")

    // l at board level → cursor stays on board
    app.command("cursor_right")
    expect(app.q("[data-cursor]").textContent()).toContain("board")

    // h at board level → cursor stays on board
    app.command("cursor_left")
    expect(app.q("[data-cursor]").textContent()).toContain("board")
  })

  test("l into empty column lands on header, l again continues", () => {
    using app = createTestApp(
      item("board", item("ColA", ...items("A", 5)), item("Empty"), item("ColC", ...items("C", 5))),
      { rows: 24, cols: 120 },
    )

    app.command("cursor_down")
    app.command("cursor_down") // A03
    app.command("cursor_right") // → Empty column header
    expect(cursorText(app)).toContain("Empty")
    app.command("cursor_right") // → ColC, should use stickyY from A03
    const cursor = cursorText(app)
    expect(cursor).not.toContain("Empty")
    expect(cursor).not.toContain("ColC")
    // Should land near C03 (matching A03's position)
    expect(cursor).toMatch(/C0[23]/)
  })

  test("target column shorter than source: clamp to last card", () => {
    using app = createTestApp(item("board", item("ColA", ...items("A", 10)), item("ColB", ...items("B", 3))), {
      rows: 24,
      cols: 80,
    })

    // Navigate to A08 (near bottom of long column)
    for (let i = 0; i < 7; i++) app.command("cursor_down")
    expect(cursorCardNum(app)).toEqual({ prefix: "A", num: 8 })

    // l → ColB which only has 3 cards — should clamp to last card
    app.command("cursor_right")
    const cursor = cursorCardNum(app)
    expect(cursor.prefix).toBe("B")
    expect(cursor.num).toBeLessThanOrEqual(3)
  })
})

// =============================================================================
// Dynamic mutation tests
// =============================================================================

describe("curswantY with mutations", () => {
  test("insert card in target column after navigation: no crash", () => {
    using app = createTestApp(item("board", item("ColA", ...items("A", 5)), item("ColB", ...items("B", 5))), {
      rows: 24,
      cols: 80,
    })

    // Navigate to A03
    app.command("cursor_down")
    app.command("cursor_down")
    expect(cursorCardNum(app)).toEqual({ prefix: "A", num: 3 })

    // Insert a card in ColB via repo API
    app.repo.addNode("ColB", { type: "p", item: {}, content: "B-new" })

    // l should still work — no crash
    app.command("cursor_right")
    const text = cursorText(app)
    expect(text).toBeTruthy()
  })

  test("delete card in source column then navigate: no crash", () => {
    using app = createTestApp(item("board", item("ColA", ...items("A", 5)), item("ColB", ...items("B", 5))), {
      rows: 24,
      cols: 80,
    })

    // Navigate to A03
    app.command("cursor_down")
    app.command("cursor_down")
    expect(cursorCardNum(app)).toEqual({ prefix: "A", num: 3 })

    // Move right
    app.command("cursor_right")

    // Delete a card from source column (not the one we came from)
    app.repo.deleteNode("A05")

    // Navigate back — should not crash
    app.command("cursor_left")
    const text = cursorText(app)
    expect(text).toBeTruthy()
  })
})
