/**
 * Markdown file column layout tests (termless PTY).
 *
 * Root cause: deferred parsing (parseOneFile, insertFileNodes) didn't re-parent
 * child nodes when patching the file node ID to match the stub. Children were
 * inserted with the parser-generated ID as parent_id, making them orphans.
 */

import { describe, test, expect } from "vitest"
import { mkdirSync, writeFileSync } from "fs"
import { createTerminalFixture } from "@termless/test"
import "@termless/test/matchers"

const KM_CWD = "/Users/beorn/Code/pim/km"

function createVault(files: Record<string, string>): string {
  const dir = `/tmp/km-md-columns-${Date.now()}`
  mkdirSync(dir, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(`${dir}/${name}`, content)
  }
  return dir
}

describe("md file columns (termless)", { timeout: 30000 }, () => {
  test("zooming into md file shows H2 sections as horizontal columns", async () => {
    const vault = createVault({
      "project.md": "# Project\n\n## Todo\n\n- [ ] Task A\n- [ ] Task B\n\n## Done\n\n- [x] Task C\n",
      "notes.md": "# Notes\n\n## Ideas\n\n- Idea 1\n",
    })

    const term = createTerminalFixture({ cols: 120, rows: 30 })
    await term.spawn(["bun", "km", "view", vault], { cwd: KM_CWD })
    await expect(term.screen).toContainText("Task A", { timeout: 15000 }) // board rendered + background parse complete

    // Navigate to column header (k k j), settle, then zoom (z)
    term.press("k")
    term.press("k")
    term.press("j")
    await term.waitForStable(300, 3000)
    term.press("z")
    await term.waitForStable(500, 5000)

    const todoPos = term.find("Todo")
    const donePos = term.find("Done")
    const screenText = term.screen.getText()

    expect(todoPos, `"Todo" not found.\n${screenText.slice(0, 600)}`).not.toBeNull()
    expect(donePos, `"Done" not found.\n${screenText.slice(0, 600)}`).not.toBeNull()
    expect(
      todoPos!.col !== donePos!.col,
      `Sections should be horizontal columns (different X), got same:\n` +
        `Todo(${todoPos!.row},${todoPos!.col}) Done(${donePos!.row},${donePos!.col})\n${screenText.slice(0, 600)}`,
    ).toBe(true)
  })
})
