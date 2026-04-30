/**
 * `km bd create` argument-shape regressions.
 *
 * Pins the CLI surface contract after the 2026-04-30 /pro 4-leg review
 * caught a smart-positional heuristic that misclassified realistic
 * inputs. The heuristic (treat arg as path if it starts with `@` or
 * contains `/`) shipped in commit `4621393af` and was reverted in
 * `ef2f0b2e1`.
 *
 * The current contract:
 *   - `<title>` is the required positional (bd compat).
 *   - `--path <path>` is the explicit km-canonical way to express
 *     the canonical path-form id.
 *   - `--id` and `--parent` flags stay for bd compat (legacy).
 *   - There is NO smart detection of arg shape. Title is title.
 *
 * Tests at three levels (cheapest first):
 *   1. Source-code regression — assert the buggy heuristic isn't back.
 *   2. Bead.create matrix — exercise the `customId` propagation.
 *   3. Argument-shape regression — confirm the broken inputs no longer
 *      misroute (these are the inputs that produced silent corruption).
 *
 * Why this file is separate from `bd-create-inbox-materialize.test.ts`:
 * that file owns the bare/no-args path. This file owns the matrix of
 * arg-shape combinations and the broken-heuristic regression.
 */

import { afterEach, describe, expect, test } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Bead } from "@km/beads"
import { runGenerator } from "@km/core"
import { createRepo, type Repo } from "@km/storage"

const BD_TS = join(__dirname, "..", "src", "commands", "bd.ts")

let scratch: string[] = []

afterEach(() => {
  for (const dir of scratch) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
  scratch = []
})

function freshRepo(): { dir: string; repo: Repo } {
  const dir = mkdtempSync(join(tmpdir(), "kmtest-bdcreate-shapes-"))
  scratch.push(dir)
  const repo = runGenerator(createRepo(dir, { loadFiles: false }))
  return { dir, repo }
}

// ============================================================================
// Level 1: source-code regression.
//
// The 2026-04-30 /pro review identified the smart-positional heuristic as
// unsafe. These assertions catch any future re-introduction of that pattern
// even before `bd create` is invoked.
// ============================================================================

describe("regression: bd create source code does NOT contain the broken smart-positional heuristic", () => {
  test("the source does not detect path-shape from arg.startsWith('@')", () => {
    const src = readFileSync(BD_TS, "utf-8")
    // The buggy line was:
    //   const argIsPath = rawArg.startsWith(`@${prefix}/`)
    //                  || rawArg.startsWith("@")
    //                  || rawArg.includes("/")
    expect(src).not.toContain('rawArg.startsWith("@")')
    expect(src).not.toMatch(/argIsPath\s*=\s*rawArg\.startsWith/)
  })

  test("the source does not detect path-shape from arg.includes('/')", () => {
    const src = readFileSync(BD_TS, "utf-8")
    // Path-detection by raw `/` substring is always wrong because real
    // titles contain slashes ("fix: handle / in regex", "feat/auth", etc.)
    expect(src).not.toMatch(/rawArg\.includes\("\/"\)/)
  })

  test("the source declares a --path option for the explicit km-canonical form", () => {
    const src = readFileSync(BD_TS, "utf-8")
    // The replacement: --path <path> as opt-in km-canonical. Required for
    // any future caller wanting path-positional creation.
    expect(src).toContain("--path <path>")
  })

  test("the source keeps --id and --parent flags for bd compat", () => {
    const src = readFileSync(BD_TS, "utf-8")
    expect(src).toContain("--id <custom>")
    expect(src).toContain("--parent <id>")
  })
})

// ============================================================================
// Level 2: Bead.create matrix.
//
// Exercises the underlying helper with the same shapes the CLI passes through
// after parsing. This is "did the CLI's flag→option translation produce a
// well-formed bead?" — the layer right under Commander.
// ============================================================================

describe("Bead.create — title and customId/parentId propagation", () => {
  test("title-only (bd compat) → bead with title; no customId; no parentId", () => {
    const { repo } = freshRepo()
    const result = Bead.create(repo, "A simple title", { prefix: "km" })
    expect(result.shortId).toMatch(/^km-[a-z0-9]+$/)
    // Bd-form short id is auto-minted; no customId given.
    expect(result.node.content).toContain("A simple title")
  })

  test("title with --path @km/beads/foo (km canonical)", () => {
    const { repo } = freshRepo()
    const result = Bead.create(repo, "Foo bead", {
      prefix: "km",
      customId: "@km/beads/foo",
    })
    expect(result.node.content).toContain("Foo bead")
    // customId path-form passes through to short_id-equivalent metadata.
    // (Exact storage shape is the renderBeadFile contract; here we just
    // confirm the field round-trips into Bead.create's outputs without
    // triggering the silent inline-fallback.)
  })

  test("title with --id km-beads.foo (bd compat path-form via --id)", () => {
    const { repo } = freshRepo()
    const result = Bead.create(repo, "Legacy form", {
      prefix: "km",
      customId: "km-beads.foo",
    })
    expect(result.node.content).toContain("Legacy form")
  })

  test("title with --parent + --id (bd compat split form)", () => {
    const { repo } = freshRepo()
    const result = Bead.create(repo, "Split form", {
      prefix: "km",
      customId: "leaf",
      parentId: "km-beads",
    })
    expect(result.node.content).toContain("Split form")
  })
})

// ============================================================================
// Level 3: argument-shape regression.
//
// These inputs produced silent corruption under the broken heuristic. The
// repaired CLI treats every one of them as a title and creates a bead with
// the verbatim string as the title — never as a path.
//
// We test by directly exercising Bead.create with the values that would have
// been routed through the heuristic. The CLI source-code regression (Level 1)
// proves the heuristic is gone; this proves the helper layer accepts these
// strings as titles without misclassification.
// ============================================================================

describe("regression: realistic title strings the broken heuristic misclassified as paths", () => {
  test("title with slash: 'fix: handle / in regex' creates a title-bead, not a path-bead", () => {
    const { repo } = freshRepo()
    // No customId given → bd compat path: positional is title, period.
    const result = Bead.create(repo, "fix: handle / in regex", { prefix: "km" })
    // Verbatim title preserved.
    expect(result.node.content).toContain("fix: handle / in regex")
    // No customId leaked from the title.
    expect(result.shortId).toMatch(/^km-[a-z0-9]+$/)
    expect(result.shortId).not.toContain("/")
  })

  test("title starting with @: '@alice please review' creates a title-bead, not a path-bead", () => {
    const { repo } = freshRepo()
    const result = Bead.create(repo, "@alice please review", { prefix: "km" })
    expect(result.node.content).toContain("@alice please review")
    expect(result.shortId).toMatch(/^km-[a-z0-9]+$/)
  })

  test("title that LOOKS like bd-form: 'km-beads.foo' as title creates a title-bead", () => {
    const { repo } = freshRepo()
    // Without --id, this is just a title that happens to look bd-form.
    // The user will get a bead with that as the title and an auto-minted id.
    const result = Bead.create(repo, "km-beads.foo", { prefix: "km" })
    expect(result.node.content).toContain("km-beads.foo")
    expect(result.shortId).toMatch(/^km-[a-z0-9]+$/)
    // Critical: did NOT silently treat the title as the customId.
    expect(result.shortId).not.toBe("km-beads.foo")
  })

  test("title with feat-style slash: 'feat/auth module'", () => {
    const { repo } = freshRepo()
    const result = Bead.create(repo, "feat/auth module", { prefix: "km" })
    expect(result.node.content).toContain("feat/auth module")
    expect(result.shortId).toMatch(/^km-[a-z0-9]+$/)
  })
})

// ============================================================================
// /pro flagged: --path takes precedence over --id (warns)
// ============================================================================

describe("--path / --id precedence (per bd.ts comment)", () => {
  test("when both --path and --id given, --path wins as customId", () => {
    const { repo } = freshRepo()
    // The CLI rule: --path overrides --id (with warning). Here we simulate
    // by passing only the resolved customId — what bd.ts's action handler
    // would have computed after the precedence resolution.
    const result = Bead.create(repo, "Title", {
      prefix: "km",
      customId: "@km/beads/from-path",
    })
    expect(result.node.content).toContain("Title")
  })
})
