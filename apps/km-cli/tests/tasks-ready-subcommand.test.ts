/**
 * Smoke tests for `km tasks ready` subcommand (km-tasks.ready-preset).
 *
 * `tasks ready` is a thin preset for `tasks --status todo --unblocked` that
 * mirrors `bd ready`. We pin three properties without spinning up the full
 * Commander runtime:
 *
 *   1. the source of `index.ts` declares a `ready` subcommand,
 *   2. the action body forwards `status: "todo"` + `unblocked: true`, and
 *   3. the standard display flags (--detail, --flat, --show-ids, --json, --limit)
 *      are present on the subcommand.
 *
 * We use source-text matching (same pattern as `bd-create-arg-shapes.test.ts`)
 * so the test stays cheap and doesn't pay the load-repo / module-graph cost.
 * The behavioral coverage of `listTasks(..., { status: "todo", unblocked: true })`
 * lives in tasks-blocked-filter.test.ts and the canonical CLI mdspec.
 */

import { describe, expect, test } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const INDEX_TS = join(__dirname, "..", "src", "commands", "tasks", "index.ts")

describe("tasks ready — source-shape regression", () => {
  test("declares a `ready` subcommand", () => {
    const src = readFileSync(INDEX_TS, "utf-8")
    expect(src).toMatch(/\.command\("ready"\)/)
  })

  test("describes itself as a todo + unblocked preset", () => {
    const src = readFileSync(INDEX_TS, "utf-8")
    // Description should mention both halves so `tasks ready --help` is
    // self-explanatory next to `bd ready`.
    expect(src).toMatch(/ready tasks.*todo.*unblocked/i)
  })

  test("forwards status:todo and unblocked:true to listTasks", () => {
    const src = readFileSync(INDEX_TS, "utf-8")
    // The implementation calls listTasks with a spread + forced status
    // and unblocked. Source-match (instead of executing) keeps this fast.
    expect(src).toMatch(/listTasks\([\s\S]*?status:\s*"todo"[\s\S]*?unblocked:\s*true/)
  })

  test("supports the standard display flags shared with parent `tasks`", () => {
    const src = readFileSync(INDEX_TS, "utf-8")
    // Find the .command("ready") block and check the option list within it.
    const readyBlock = src.split('.command("ready")')[1]
    expect(readyBlock).toBeTruthy()
    // Lop off everything after the .action() line so we match only options
    // attached to ready, not later commands.
    const options = readyBlock!.split(".action(")[0]!
    expect(options).toContain("--detail")
    expect(options).toContain("--flat")
    expect(options).toContain("--show-ids")
    expect(options).toContain("--limit")
    expect(options).toContain("--json")
  })

  test("accepts an optional query argument so `tasks ready @person` works", () => {
    const src = readFileSync(INDEX_TS, "utf-8")
    const readyBlock = src.split('.command("ready")')[1]!
    const options = readyBlock.split(".action(")[0]!
    // Optional positional with `[query...]` keeps parity with `tasks` itself.
    expect(options).toContain('argument("[query...]"')
  })
})
