/**
 * Test: Selected cursor renders all text as black-on-yellow
 *
 * When a node/card is selected (yellow background), all text should render
 * as black foreground — colored sigils, code spans, date badges, etc. must
 * NOT retain their original foreground colors on the yellow background.
 */
import { describe, it, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"
import { stripAnsi } from "inkx"

/**
 * Find the card content line for a selected card and extract the content
 * between border characters, trimming trailing border ANSI codes.
 *
 * Selected cards use yellow background (48;5;3 in 256-color mode).
 */
function findSelectedCardContent(ansi: string, text: string): string | undefined {
  const lines = ansi.split("\n")
  for (const line of lines) {
    const plain = stripAnsi(line)
    if (!plain.includes(text)) continue
    // Selected card has yellow background (48;5;3)
    if (!line.includes("48;5;3")) continue

    // Extract content between border chars │...│
    const firstBorder = line.indexOf("\u2502")
    const lastBorder = line.lastIndexOf("\u2502")
    if (firstBorder >= 0 && lastBorder > firstBorder) {
      let content = line.slice(firstBorder + 1, lastBorder)
      // Trim trailing ANSI code that belongs to the border character
      content = content.replace(/\x1b\[[\d;:]+m$/, "")
      return content
    }
  }
  return undefined
}

/**
 * Check if ANSI string has any non-black foreground color.
 * "Black" means 256-color 0, basic 30, or RGB 0;0;0.
 * Ignores background codes, resets, and formatting attributes.
 */
function hasNonBlackForeground(ansi: string): boolean {
  const sgrRegex = /\x1b\[([\d;:]+)m/g
  let match
  while ((match = sgrRegex.exec(ansi)) !== null) {
    const parts = match[1]!.split(";")
    for (let i = 0; i < parts.length; i++) {
      const code = Number.parseInt(parts[i]!, 10)
      // Extended foreground: 38;5;N
      if (code === 38 && parts[i + 1] === "5") {
        const colorNum = Number.parseInt(parts[i + 2] ?? "", 10)
        if (colorNum !== 0) return true
        i += 2
        continue
      }
      // Extended foreground: 38;2;R;G;B
      if (code === 38 && parts[i + 1] === "2") {
        const r = Number.parseInt(parts[i + 2] ?? "0", 10)
        const g = Number.parseInt(parts[i + 3] ?? "0", 10)
        const b = Number.parseInt(parts[i + 4] ?? "0", 10)
        if (r !== 0 || g !== 0 || b !== 0) return true
        i += 4
        continue
      }
      // Skip background: 48;5;N or 48;2;R;G;B
      if (code === 48) {
        if (parts[i + 1] === "5") { i += 2; continue }
        if (parts[i + 1] === "2") { i += 4; continue }
        continue
      }
      // Standard foreground: 31-37 (not 30=black)
      if (code >= 31 && code <= 37) return true
      // Bright foreground: 90-97
      if (code >= 90 && code <= 97) return true
    }
  }
  return false
}

describe("cursor color override", () => {
  it("selected node with inline code renders without colored foreground", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.task("Fix the `config` bug")),
        ),
      { columns: 60, rows: 20 },
    )

    const ansi = board._result.ansi
    expect(board.screenshot()).toContain("Fix the config bug")

    const content = findSelectedCardContent(ansi, "Fix the config bug")
    expect(content).toBeDefined()

    // Selected content should have only black foreground (no cyan from backtick code)
    expect(hasNonBlackForeground(content!)).toBe(false)
  })

  it("selected node with priority date badge renders without colored foreground", () => {
    const nodes = item(
      "board",
      item("col1", item.task("Important task")),
    )
    const taskNode = nodes.find((n) => n.content === "Important task")!
    taskNode.priority = 1
    taskNode.due_date = "2025-01-01"

    const { board } = testEnv(() => nodes, { columns: 60, rows: 20 })

    const ansi = board._result.ansi
    expect(board.screenshot()).toContain("Important task")

    const content = findSelectedCardContent(ansi, "Important task")
    expect(content).toBeDefined()

    expect(hasNonBlackForeground(content!)).toBe(false)
  })

  it("unselected node retains colored foreground for inline code", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.task("First task"), item.task("Has `code` text")),
        ),
      { columns: 60, rows: 20 },
    )

    const ansi = board._result.ansi
    const lines = ansi.split("\n")

    // Find the unselected card (no yellow background 48;5;3)
    const codeLine = lines.find((line) => {
      const plain = stripAnsi(line)
      return plain.includes("Has code text") && !line.includes("48;5;3")
    })
    expect(codeLine).toBeDefined()

    // Unselected card SHOULD have non-black foreground (cyan for `code`)
    expect(hasNonBlackForeground(codeLine!)).toBe(true)
  })

  it("after navigation, newly selected node loses foreground colors", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.task("Plain task"), item.task("Has `styled` content")),
        ),
      { columns: 60, rows: 20 },
    )

    board.press("j")

    const ansi = board._result.ansi
    const content = findSelectedCardContent(ansi, "Has styled content")
    expect(content).toBeDefined()

    expect(hasNonBlackForeground(content!)).toBe(false)
  })
})
