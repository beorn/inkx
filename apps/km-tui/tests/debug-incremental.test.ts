import { test } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import { writeFileSync } from "fs"

function hasTextInBorder(text: string): boolean {
  const lines = text.split("\n")
  for (const line of lines) {
    const m = line.matchAll(/[╰╭]([^╯╮]+)[╯╮]/g)
    for (const match of m) {
      if (/[a-zA-Z0-9]/.test(match[1]!)) return true
    }
  }
  return false
}

test("compare incremental vs full rendering after cursor-right", () => {
  const makeTree = () =>
    item(
      "board",
      item(
        "col1",
        item("AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH IIII JJJJ KKKK LLLL"),
        item("example.com/path/to/some/resource/that/is/quite/long"),
        item("Short task 1"),
        item("Another medium-length task description here"),
      ),
      item(
        "col2",
        item("Task in col2"),
        item("Second task in col2 with more detail"),
      ),
    )

  // Test with incremental=true (default)
  const { board: incBoard } = testEnv(makeTree, {
    columns: 80,
    rows: 24,
    incremental: true,
  })
  const incInitial = incBoard.screenshot()
  incBoard.press("l")
  const incAfterRight = incBoard.screenshot()

  // Test with incremental=false
  const { board: fullBoard } = testEnv(makeTree, {
    columns: 80,
    rows: 24,
    incremental: false,
  })
  const fullInitial = fullBoard.screenshot()
  fullBoard.press("l")
  const fullAfterRight = fullBoard.screenshot()

  writeFileSync("/tmp/debug-inc-initial.txt", incInitial)
  writeFileSync("/tmp/debug-inc-right.txt", incAfterRight)
  writeFileSync("/tmp/debug-full-initial.txt", fullInitial)
  writeFileSync("/tmp/debug-full-right.txt", fullAfterRight)

  const incBug = hasTextInBorder(incAfterRight)
  const fullBug = hasTextInBorder(fullAfterRight)

  if (incBug !== fullBug) {
    throw new Error(
      `Incremental: ${incBug ? "HAS BUG" : "clean"}, Full: ${fullBug ? "HAS BUG" : "clean"}`,
    )
  }
  if (incBug) {
    throw new Error("Both incremental and full have the bug")
  }
})
