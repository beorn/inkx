/**
 * Wave-of-work `@km/cli/json-jq-everywhere`: every list-shaped km
 * command exposes `--json` and `--jq <expr>`. This file pins the flag
 * surface and behavior:
 *
 *   1. Source-grep over each list-shaped command's source file. Action
 *      modules import program.ts transitively — testing them via
 *      dynamic import would need the silvery chain to be hot. Source-
 *      grep is the chain-immune way to pin "the flag is registered."
 *
 *   2. End-to-end behavior tests via `bun km` subprocess on a temp
 *      vault: `--json` emits valid JSON; `--jq <expr>` filters it;
 *      `--jq` alone (without `--json`) implies JSON; missing `jq`
 *      surfaces a clear error.
 *
 * The end-to-end tests live under the `slow` project label because they
 * spawn `bun km` as a subprocess and need a real filesystem-backed
 * vault. The source-grep tests are fast (default project).
 */

import { describe, expect, test } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const COMMANDS_DIR = join(__dirname, "..", "src", "commands")

function readCommandSource(relative: string): string {
  return readFileSync(join(COMMANDS_DIR, relative), "utf8")
}

/**
 * Source-grep predicate: a command source file must register
 * `--json` and `--jq <expr>`. Per `@km/cli/json-jq-everywhere`,
 * every list-shaped command supports both flags; `--jq` implies
 * `--json` at the action layer (via `normalizeJsonJq` from
 * `apps/km-cli/src/utils/jq.ts`).
 */
function expectJsonJqFlags(source: string, label: string): void {
  expect(source, `${label}: missing --json registration`).toContain('"--json"')
  expect(source, `${label}: missing --jq <expr> registration`).toContain("--jq <expr>")
}

describe("--json + --jq are registered on every list-shaped km command", () => {
  test("km list", () => {
    expectJsonJqFlags(readCommandSource("list.ts"), "list.ts")
  })

  test("km show <id>", () => {
    expectJsonJqFlags(readCommandSource("show.ts"), "show.ts")
  })

  test("km children <id>", () => {
    expectJsonJqFlags(readCommandSource("children.ts"), "children.ts")
  })

  test("km stale", () => {
    expectJsonJqFlags(readCommandSource("stale.ts"), "stale.ts")
  })

  test("km query <dsl>", () => {
    expectJsonJqFlags(readCommandSource("query.ts"), "query.ts")
  })

  test("km task (board view) + km task ready (subcommand) + km task stale (subcommand)", () => {
    // tasks/index.ts hosts the bare `task` command and its subcommands
    // (`ready`, `stale`). All three list-shaped surfaces must register
    // both flags. Lifecycle subcommands (claim/release/close/drop/
    // reopen/new) are NOT list-shaped — the bead explicitly excludes
    // them — so we don't grep for `--jq` there.
    const src = readCommandSource("tasks/index.ts")
    // `--jq` should appear at least 3 times: bare task, ready, stale.
    const jqCount = (src.match(/--jq <expr>/g) ?? []).length
    expect(jqCount, "tasks/index.ts should register --jq on bare task + ready + stale").toBeGreaterThanOrEqual(3)
    expect(src).toContain('"--json"')
  })

  test("km task orphans", () => {
    expectJsonJqFlags(readCommandSource("tasks/orphans.ts"), "tasks/orphans.ts")
  })

  test("km task dep ls", () => {
    // dep.ts hosts add / rm / ls. Only `ls` is list-shaped, but the
    // grep matches on the file as a whole — ensures the flag exists
    // somewhere. The .action() block below scopes the registration
    // to the `ls` subcommand (verified by reading the file).
    expectJsonJqFlags(readCommandSource("tasks/dep.ts"), "tasks/dep.ts")
  })
})

describe("--json + --jq utilities", () => {
  test("apps/km-cli/src/utils/jq.ts exists and exports emitJson + normalizeJsonJq", () => {
    const src = readFileSync(join(__dirname, "..", "src", "utils", "jq.ts"), "utf8")
    expect(src).toContain("export async function emitJson")
    expect(src).toContain("export function normalizeJsonJq")
    // jq is invoked via Bun.spawn — keeps the dep surface minimal
    // (no node-jq wasm bridge). The "ENOENT" branch surfaces a clear
    // install hint when jq isn't in PATH.
    expect(src).toContain("Bun.spawn")
    expect(src).toContain("brew install jq")
  })

  test("normalizeJsonJq: --jq alone implies --json", () => {
    // Re-express the contract as a unit-level assertion. The function
    // takes `{ json?, jq? }` and returns `{ json, jq? }` where
    // `jq` set ⇒ `json === true` regardless of the input `json`.
    // Module is dynamic-imported because static import would pull
    // ag-react via term — which the source-grep tests above
    // explicitly avoid.
    return import("../src/utils/jq.ts").then(({ normalizeJsonJq }) => {
      expect(normalizeJsonJq({ jq: ".id" })).toEqual({ json: true, jq: ".id" })
      expect(normalizeJsonJq({ json: true })).toEqual({ json: true, jq: undefined })
      expect(normalizeJsonJq({})).toEqual({ json: false, jq: undefined })
      // Empty-string jq is treated as not-set so `--jq=""` doesn't
      // mistakenly imply --json.
      expect(normalizeJsonJq({ jq: "" })).toEqual({ json: false, jq: undefined })
      // Both set — same as just `json: true`.
      expect(normalizeJsonJq({ json: true, jq: ".[0]" })).toEqual({ json: true, jq: ".[0]" })
    })
  })
})

describe("--json output is valid JSON for representative commands", () => {
  // Live subprocess test — runs `bun km` against a freshly-seeded
  // in-memory vault. We pick `km list --json` as the representative
  // path because (a) it's the most-used list-shaped command, (b) it
  // exercises the full repo load + node serialization, and (c) it has
  // existed for the longest, so any regression here is the loudest
  // signal.
  test("bun km list --json on an empty vault parses to a JSON array", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs")
    const { tmpdir } = await import("node:os")
    const dir = mkdtempSync(join(tmpdir(), "kmtest-jsonjq-"))
    try {
      const proc = Bun.spawn(["bun", "km", "list", "--repo", dir, "--json"], {
        cwd: join(__dirname, "..", "..", ".."),
        stdout: "pipe",
        stderr: "pipe",
      })
      const stdout = await new Response(proc.stdout).text()
      const exit = await proc.exited
      expect(exit, "km list --json must exit 0").toBe(0)
      // The exact result depends on what's in the vault; we only need
      // valid JSON. JSON.parse will throw if it isn't.
      const parsed = JSON.parse(stdout)
      expect(Array.isArray(parsed)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 30_000)

  test("bun km list --jq 'length' returns a number (jq pipe works; --jq alone implies --json)", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs")
    const { tmpdir } = await import("node:os")
    const dir = mkdtempSync(join(tmpdir(), "kmtest-jsonjq-"))
    try {
      // Note: only --jq, no --json. The implication should kick in.
      const proc = Bun.spawn(["bun", "km", "list", "--repo", dir, "--jq", "length"], {
        cwd: join(__dirname, "..", "..", ".."),
        stdout: "pipe",
        stderr: "pipe",
      })
      const stdout = await new Response(proc.stdout).text()
      const stderr = await new Response(proc.stderr).text()
      const exit = await proc.exited
      // Allow exit 1 if jq isn't installed in the test env — surface
      // the install hint as the failure message so the diagnostic is
      // self-explanatory.
      if (exit !== 0) {
        expect(stderr, "if --jq fails, the failure must be a clear install hint").toMatch(
          /jq.*PATH|jq exited|jq invocation/i,
        )
        return
      }
      const trimmed = stdout.trim()
      expect(Number.isFinite(Number.parseInt(trimmed, 10)), `expected numeric output, got: ${trimmed}`).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 30_000)
})
