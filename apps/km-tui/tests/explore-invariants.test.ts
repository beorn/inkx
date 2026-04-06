/**
 * Tests for the explore invariant library — these validate the *checkers*
 * themselves, not the TUI. Each invariant has a passing case and a failing
 * case; the runner is tested against an in-memory snapshot function and a
 * temporary vault directory.
 *
 * See: apps/km-tui/src/explore/invariants.ts, runner.ts
 * Bead: km-tui.explore-automation
 */

import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  allInvariants,
  alwaysInvariants,
  breadcrumbMatchesCursor,
  cursorOnVisibleNode,
  navOnlyInvariants,
  noInternalIds,
  noNaN,
  noObjectObject,
  noTypeError,
  runAll,
  vaultUnchangedByNav,
  type ExploreState,
} from "../src/explore/invariants.ts"
import { createExploreRunner, hashVault, withInvariants } from "../src/explore/runner.ts"

// ---------------------------------------------------------------------------
// Helper: build an ExploreState with sensible defaults
// ---------------------------------------------------------------------------

function mkState(overrides: Partial<ExploreState> = {}): ExploreState {
  return {
    vaultPath: "/tmp/fake",
    vaultMd5: new Map(),
    rendered: "BOARD\nTodo\n  Buy milk\n  Walk dog\nDone\n",
    cursor: { nodeId: null },
    ...overrides,
  }
}

// ===========================================================================
// no-internal-ids
// ===========================================================================

describe("noInternalIds", () => {
  test("passes when rendered has no leaked IDs", () => {
    expect(noInternalIds.check(mkState())).toBeNull()
  })

  test("passes on pure-digit parenthesised numbers", () => {
    // "(12345678)" has no letters — should not trigger
    expect(noInternalIds.check(mkState({ rendered: "Task (12345678)" }))).toBeNull()
  })

  test("fails on 8-char alphanum ID in parens", () => {
    const v = noInternalIds.check(mkState({ rendered: "Task (XWJE24KP) next" }))
    expect(v).not.toBeNull()
    expect(v!.invariant).toBe("no-internal-ids")
    expect(v!.severity).toBe("P1")
    expect(v!.details).toContain("(XWJE24KP)")
  })

  test("reports count when multiple IDs leak", () => {
    const rendered = "A (ABCDEF12) B (ABCDEF34) C (ABCDEF56) D (ABCDEF78)"
    const v = noInternalIds.check(mkState({ rendered }))
    expect(v).not.toBeNull()
    expect(v!.details).toContain("4")
  })
})

// ===========================================================================
// no-object-object
// ===========================================================================

describe("noObjectObject", () => {
  test("passes on clean output", () => {
    expect(noObjectObject.check(mkState())).toBeNull()
  })

  test("fails on [object Object]", () => {
    const v = noObjectObject.check(mkState({ rendered: "Task: [object Object]" }))
    expect(v).not.toBeNull()
    expect(v!.invariant).toBe("no-object-object")
  })
})

// ===========================================================================
// no-nan
// ===========================================================================

describe("noNaN", () => {
  test("passes on clean output", () => {
    expect(noNaN.check(mkState())).toBeNull()
  })

  test("passes on words containing 'nan' but not 'NaN'", () => {
    expect(noNaN.check(mkState({ rendered: "Banana, Canana, nanana" }))).toBeNull()
  })

  test("fails on literal NaN with word boundaries", () => {
    const v = noNaN.check(mkState({ rendered: "Progress: NaN%" }))
    expect(v).not.toBeNull()
    expect(v!.invariant).toBe("no-nan")
  })
})

// ===========================================================================
// no-typeerror
// ===========================================================================

describe("noTypeError", () => {
  test("passes on clean output", () => {
    expect(noTypeError.check(mkState())).toBeNull()
  })

  test("fails on TypeError in rendered output", () => {
    const v = noTypeError.check(mkState({ rendered: "TypeError: cannot read property 'foo' of undefined" }))
    expect(v).not.toBeNull()
    expect(v!.severity).toBe("P0")
  })
})

// ===========================================================================
// vault-unchanged-by-nav
// ===========================================================================

describe("vaultUnchangedByNav", () => {
  test("passes when md5 maps are equal", () => {
    const md5 = new Map([
      ["a.md", "hash1"],
      ["b.md", "hash2"],
    ])
    const before = mkState({ vaultMd5: md5 })
    const after = mkState({ vaultMd5: new Map(md5) })
    expect(vaultUnchangedByNav.check(after, before)).toBeNull()
  })

  test("skips check without a before state", () => {
    expect(vaultUnchangedByNav.check(mkState())).toBeNull()
  })

  test("fails when a file was modified", () => {
    const before = mkState({ vaultMd5: new Map([["a.md", "hash1"]]) })
    const after = mkState({ vaultMd5: new Map([["a.md", "hash1-changed"]]) })
    const v = vaultUnchangedByNav.check(after, before)
    expect(v).not.toBeNull()
    expect(v!.details).toContain("a.md")
    expect(v!.details).toContain("modified")
  })

  test("fails when a file was deleted", () => {
    const before = mkState({ vaultMd5: new Map([["a.md", "hash1"]]) })
    const after = mkState({ vaultMd5: new Map() })
    const v = vaultUnchangedByNav.check(after, before)
    expect(v).not.toBeNull()
    expect(v!.details).toContain("deleted")
  })

  test("fails when a file was created", () => {
    const before = mkState({ vaultMd5: new Map() })
    const after = mkState({ vaultMd5: new Map([["new.md", "hash"]]) })
    const v = vaultUnchangedByNav.check(after, before)
    expect(v).not.toBeNull()
    expect(v!.details).toContain("created")
  })
})

// ===========================================================================
// cursor-on-visible-node
// ===========================================================================

describe("cursorOnVisibleNode", () => {
  test("skipped when cursor.nodeId is null", () => {
    expect(cursorOnVisibleNode.check(mkState({ cursor: { nodeId: null } }))).toBeNull()
  })

  test("skipped when visibleNodeIds is not provided", () => {
    expect(cursorOnVisibleNode.check(mkState({ cursor: { nodeId: "n1" } }))).toBeNull()
  })

  test("passes when cursor nodeId is among visible", () => {
    expect(
      cursorOnVisibleNode.check(mkState({ cursor: { nodeId: "n1", visibleNodeIds: new Set(["n1", "n2"]) } })),
    ).toBeNull()
  })

  test("fails when cursor nodeId is not visible", () => {
    const v = cursorOnVisibleNode.check(mkState({ cursor: { nodeId: "ghost", visibleNodeIds: new Set(["n1", "n2"]) } }))
    expect(v).not.toBeNull()
    expect(v!.details).toContain("ghost")
  })
})

// ===========================================================================
// breadcrumb-matches-cursor
// ===========================================================================

describe("breadcrumbMatchesCursor", () => {
  test("skipped when path is empty", () => {
    expect(breadcrumbMatchesCursor.check(mkState({ cursor: { nodeId: null, path: [] } }))).toBeNull()
  })

  test("passes when breadcrumb contains all path segments in order", () => {
    expect(
      breadcrumbMatchesCursor.check(
        mkState({
          rendered: "Board > Todo > Buy milk\n---\ncontent",
          cursor: { nodeId: "n1", path: ["Board", "Todo", "Buy milk"] },
        }),
      ),
    ).toBeNull()
  })

  test("fails when a path segment is missing from the breadcrumb", () => {
    const v = breadcrumbMatchesCursor.check(
      mkState({
        rendered: "Board > Done\n---",
        cursor: { nodeId: "n1", path: ["Board", "Todo", "Buy milk"] },
      }),
    )
    expect(v).not.toBeNull()
    expect(v!.details).toContain("Todo")
  })

  test("fails when segments are out of order", () => {
    const v = breadcrumbMatchesCursor.check(
      mkState({
        rendered: "Buy milk > Todo > Board",
        cursor: { nodeId: "n1", path: ["Board", "Todo", "Buy milk"] },
      }),
    )
    expect(v).not.toBeNull()
  })
})

// ===========================================================================
// runAll
// ===========================================================================

describe("runAll", () => {
  test("returns empty array when everything passes", () => {
    const violations = runAll(mkState(), allInvariants)
    expect(violations).toEqual([])
  })

  test("collects multiple violations in one pass", () => {
    const state = mkState({
      rendered: "Task (XWJE24KP)\nValue: [object Object]\nProgress: NaN%",
    })
    const violations = runAll(state, alwaysInvariants)
    const names = violations.map((v) => v.invariant).sort()
    expect(names).toContain("no-internal-ids")
    expect(names).toContain("no-object-object")
    expect(names).toContain("no-nan")
  })
})

// ===========================================================================
// hashVault (integration with real tmp directory)
// ===========================================================================

describe("hashVault", () => {
  let dir: string
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "km-explore-hash-"))
    writeFileSync(join(dir, "a.md"), "hello")
    writeFileSync(join(dir, "b.md"), "world")
    writeFileSync(join(dir, "ignore.txt"), "not md")
    mkdirSync(join(dir, ".km"))
    writeFileSync(join(dir, ".km", "state.db"), "binary")
    mkdirSync(join(dir, "sub"))
    writeFileSync(join(dir, "sub", "c.md"), "nested")
  })
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test("hashes only markdown files, skips .km and non-md", () => {
    const map = hashVault(dir)
    const keys = [...map.keys()].sort()
    expect(keys).toEqual(["a.md", "b.md", join("sub", "c.md")])
  })

  test("md5 changes when file content changes", () => {
    const before = hashVault(dir)
    writeFileSync(join(dir, "a.md"), "hello (modified)")
    const after = hashVault(dir)
    expect(before.get("a.md")).not.toBe(after.get("a.md"))
    // Unmodified file stays the same
    expect(before.get("b.md")).toBe(after.get("b.md"))
  })
})

// ===========================================================================
// createExploreRunner
// ===========================================================================

describe("createExploreRunner", () => {
  test("runs alwaysInvariants + navInvariants on non-mutation", async () => {
    // A synthetic snapshot that swaps between two states: before (clean) and after (corrupted).
    const before: ExploreState = mkState({ vaultMd5: new Map([["a.md", "h1"]]) })
    const after: ExploreState = mkState({
      rendered: "Task (XWJE24KP) next",
      vaultMd5: new Map([["a.md", "h1-CHANGED"]]),
    })
    let calls = 0
    const runner = createExploreRunner({
      vaultPath: "/tmp/fake",
      async snapshot() {
        calls++
        return calls === 1 ? before : after
      },
    })

    const result = await runner.run(async () => 42, { isMutation: false, label: "j" })
    expect(result.result).toBe(42)
    const names = result.violations.map((v) => v.invariant).sort()
    expect(names).toContain("no-internal-ids")
    expect(names).toContain("vault-unchanged-by-nav")
  })

  test("skips navOnlyInvariants when isMutation is true", async () => {
    const before: ExploreState = mkState({ vaultMd5: new Map([["a.md", "h1"]]) })
    const after: ExploreState = mkState({ vaultMd5: new Map([["a.md", "h2"]]) })
    let calls = 0
    const runner = createExploreRunner({
      vaultPath: "/tmp/fake",
      async snapshot() {
        calls++
        return calls === 1 ? before : after
      },
    })

    const result = await runner.run(async () => "ok", { isMutation: true, label: "Enter" })
    expect(result.violations.map((v) => v.invariant)).not.toContain("vault-unchanged-by-nav")
  })

  test("onViolation is called for each violation", async () => {
    const after: ExploreState = mkState({
      rendered: "Value: [object Object]\nMore: NaN",
    })
    const seen: string[] = []
    const runner = createExploreRunner({
      vaultPath: "/tmp/fake",
      async snapshot() {
        return after
      },
      onViolation(v, label) {
        seen.push(`${label}:${v.invariant}`)
      },
    })

    await runner.run(async () => undefined, { isMutation: true, label: "k" })
    expect(seen.sort()).toEqual(["k:no-nan", "k:no-object-object"])
  })
})

// ===========================================================================
// withInvariants (one-shot)
// ===========================================================================

describe("withInvariants", () => {
  test("runs nav invariants on non-mutation", async () => {
    const before = mkState({ vaultMd5: new Map([["a.md", "h1"]]) })
    const after = mkState({ vaultMd5: new Map([["a.md", "h2"]]) })
    const { violations, result } = await withInvariants(
      before,
      async () => "done",
      async () => after,
      false,
    )
    expect(result).toBe("done")
    expect(violations.map((v) => v.invariant)).toContain("vault-unchanged-by-nav")
  })

  test("skips nav invariants on mutation", async () => {
    const before = mkState({ vaultMd5: new Map([["a.md", "h1"]]) })
    const after = mkState({ vaultMd5: new Map([["a.md", "h2"]]) })
    const { violations } = await withInvariants(
      before,
      async () => "done",
      async () => after,
      true,
    )
    expect(violations.map((v) => v.invariant)).not.toContain("vault-unchanged-by-nav")
  })
})

// ===========================================================================
// navOnlyInvariants content sanity
// ===========================================================================

describe("invariant lists", () => {
  test("navOnlyInvariants contains vault-unchanged-by-nav", () => {
    expect(navOnlyInvariants.map((i) => i.name)).toContain("vault-unchanged-by-nav")
  })
  test("alwaysInvariants does NOT contain vault-unchanged-by-nav", () => {
    expect(alwaysInvariants.map((i) => i.name)).not.toContain("vault-unchanged-by-nav")
  })
  test("allInvariants contains both sets", () => {
    const names = allInvariants.map((i) => i.name)
    expect(names).toContain("no-internal-ids")
    expect(names).toContain("vault-unchanged-by-nav")
  })
})
